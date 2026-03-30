import { $ } from "bun";
import { dirname } from "node:path";

const hostIp = process.env.HOST_IP?.trim();
if (!hostIp) {
  throw new Error("HOST_IP is required in .env to generate a certificate.");
}

const keyPath = process.env.TLS_KEY_PATH ?? "./certs/home-control-key.pem";
const certPath = process.env.TLS_CERT_PATH ?? "./certs/home-control-cert.pem";
const days = Number(process.env.TLS_DAYS ?? 825);
const san = process.env.TLS_SAN ?? `IP:${hostIp},DNS:localhost`;

await $`mkdir -p ${dirname(keyPath)}`;
await $`mkdir -p ${dirname(certPath)}`;

const subject = `/CN=${hostIp}`;
const addExtSan = `subjectAltName=${san}`;
const addExtBasic = "basicConstraints=critical,CA:FALSE";
const addExtKeyUsage = "keyUsage=critical,digitalSignature,keyEncipherment";
const addExtEku = "extendedKeyUsage=serverAuth";

console.log(`Generating certificate for ${hostIp}`);
console.log(`Key: ${keyPath}`);
console.log(`Cert: ${certPath}`);
console.log(`SAN: ${san}`);
console.log("Profile: CA:FALSE, serverAuth");

await $`openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days ${days} -keyout ${keyPath} -out ${certPath} -subj ${subject} -addext ${addExtSan} -addext ${addExtBasic} -addext ${addExtKeyUsage} -addext ${addExtEku}`;

console.log("Certificate generated.");
