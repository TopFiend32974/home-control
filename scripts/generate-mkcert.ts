import { $ } from "bun";
import { dirname, join } from "node:path";

const hostIp = process.env.HOST_IP?.trim();
if (!hostIp) {
  throw new Error("HOST_IP is required in .env to generate a certificate.");
}

const keyPath = process.env.TLS_KEY_PATH ?? "./certs/home-control-key.pem";
const certPath = process.env.TLS_CERT_PATH ?? "./certs/home-control-cert.pem";
const hosts = [hostIp, "localhost", "127.0.0.1", "::1"];

if (process.env.HOST?.trim()) {
  hosts.push(process.env.HOST.trim());
}

const uniqueHosts = Array.from(new Set(hosts));

let mkcertAvailable = false;
try {
  const mkcertCheck = Bun.spawnSync({
    cmd: ["mkcert", "-help"],
    stdout: "ignore",
    stderr: "ignore",
  });
  mkcertAvailable = mkcertCheck.exitCode === 0;
} catch {
  mkcertAvailable = false;
}

if (!mkcertAvailable) {
  throw new Error(
    "mkcert is not installed. Install it first (e.g. `sudo dnf install mkcert nss-tools`) and rerun `bun run cert`."
  );
}

await $`mkdir -p ${dirname(keyPath)}`;
await $`mkdir -p ${dirname(certPath)}`;

console.log("Installing mkcert local CA into system trust store...");
await $`mkcert -install`;

console.log(`Generating certificate for: ${uniqueHosts.join(", ")}`);
console.log(`Key: ${keyPath}`);
console.log(`Cert: ${certPath}`);

const mkcertGenerate = Bun.spawnSync({
  cmd: ["mkcert", "-key-file", keyPath, "-cert-file", certPath, ...uniqueHosts],
  stdout: "inherit",
  stderr: "inherit",
});

if (mkcertGenerate.exitCode !== 0) {
  throw new Error("mkcert failed to generate certificate files.");
}

const caroot = (await $`mkcert -CAROOT`.text()).trim();
const rootCaPath = join(caroot, "rootCA.pem");
const exportedRootCaPath = "./certs/mkcert-rootCA.pem";

await Bun.write(exportedRootCaPath, await Bun.file(rootCaPath).bytes());
console.log(`Exported mkcert root CA to ${exportedRootCaPath}`);
console.log("Install this CA on phones/browsers that do not trust your machine CA store.");
