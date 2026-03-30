# bun-react-tailwind-shadcn-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## HTTPS on home network only

Use these env vars:

- `TLS=true` to enable HTTPS
- `TLS_KEY_PATH` and `TLS_CERT_PATH` to point at your cert files
- `TLS_DAYS` optional cert validity duration (default `825`)
- `TLS_SAN` optional SAN override (default `IP:<HOST_IP>,DNS:localhost`)
- `LAN_ONLY=true` (default) to reject non-private client IPs
- `HOST` or `HOST_IP` to bind the server IP

Example `.env`:

```bash
HOST_IP=192.168.0.158
PORT=3000
LAN_ONLY=true
TLS=true
TLS_KEY_PATH=./certs/home-control-key.pem
TLS_CERT_PATH=./certs/home-control-cert.pem
TLS_DAYS=825
```

Install prerequisites (Fedora):

```bash
sudo dnf install mkcert nss-tools
```

Generate cert/key from `.env` (recommended, via `mkcert`):

```bash
bun run cert
```

This will:

- install `mkcert` local CA in your machine trust store
- generate server cert/key at `TLS_CERT_PATH` and `TLS_KEY_PATH`
- export CA cert to `./certs/mkcert-rootCA.pem` for phone/browser trust

If `mkcert` is unavailable, fallback:

```bash
bun run cert:selfsigned
```

Start server:

```bash
bun run dev
```

On your phone, trust that certificate authority/cert as needed, then open:

`https://192.168.0.158:3000`

If the phone still says "Not secure", HTTPS is active but the cert is untrusted. You must trust the generated certificate on the phone:

- iOS: install `certs/mkcert-rootCA.pem`, then enable full trust in Settings > General > About > Certificate Trust Settings.
- Android: install `certs/mkcert-rootCA.pem` as a CA certificate in security settings, then reopen the site.
- Firefox may still warn if it is not using system trust for user-installed CAs.

To verify env vars are loaded, check startup logs for `Runtime config` and confirm:

- `host` matches `HOST`/`HOST_IP`
- `port` matches `PORT`
- `tlsEnabled` is `true`
- `tlsKeyPath` and `tlsCertPath` point to existing files

## Agent setup (no Bun required)

The downloadable `media-devices.tar.gz` now includes a compiled `agent` binary so target PCs do not need Bun installed.

On each target machine:

```bash
tar -xzf media-devices.tar.gz
cd media-devices
cp .env.example .env
# edit .env with your hub HOST_IP/PORT/TLS values
sudo ./agent-ctl.sh install
sudo ./agent-ctl.sh logs
```

Notes:

- If your hub uses HTTPS (`TLS=true`), agent-ctl will use `wss://...`.
- For self-signed/internal certs, keep `HUB_INSECURE_TLS=true` in `.env` (or trust your local CA on that machine).
