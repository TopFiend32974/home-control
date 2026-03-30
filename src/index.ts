import { serve, type ServerWebSocket } from "bun";
import index from "./index.html";
import manifest from "./manifest.json";

type WebSocketData = {
  type: "agent" | "web";
  id?: string; // used for agents
};

type AgentState = {
  id: string;
  status: string;
  title: string;
  volume: string;
};

const LAN_ONLY = process.env.LAN_ONLY !== "false";
const HOST = process.env.HOST ?? process.env.HOST_IP ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 3000);
const TLS_ENABLED = process.env.TLS === "true";
const TLS_KEY_PATH = process.env.TLS_KEY_PATH ?? "./certs/home-control-key.pem";
const TLS_CERT_PATH = process.env.TLS_CERT_PATH ?? "./certs/home-control-cert.pem";

function normalizeIp(address: string): string {
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((p) => Number.parseInt(p, 10));
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;

  const a = octets[0] ?? -1;
  const b = octets[1] ?? -1;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function isPrivateIp(address: string): boolean {
  const ip = normalizeIp(address).toLowerCase();
  if (isPrivateIpv4(ip)) return true;
  if (ip === "::1") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // unique-local
  if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) {
    return true; // link-local fe80::/10
  }
  return false;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  return isPrivateIp(host);
}

function isAllowedClient(req: Request, server: ReturnType<typeof serve<WebSocketData>>): boolean {
  if (!LAN_ONLY) return true;

  const client = server.requestIP(req);
  if (client?.address && isPrivateIp(client.address)) {
    return true;
  }

  const hostname = new URL(req.url).hostname;
  return isPrivateHost(hostname);
}

async function loadTlsConfig() {
  if (!TLS_ENABLED) return undefined;

  const keyFile = Bun.file(TLS_KEY_PATH);
  const certFile = Bun.file(TLS_CERT_PATH);

  if (!(await keyFile.exists()) || !(await certFile.exists())) {
    throw new Error(
      `TLS is enabled but certificate files are missing. Expected key at '${TLS_KEY_PATH}' and cert at '${TLS_CERT_PATH}'.`
    );
  }

  return {
    key: await keyFile.text(),
    cert: await certFile.text(),
  };
}

// Store active agents and their state
const agents = new Map<string, { state: AgentState; ws: ServerWebSocket<WebSocketData> }>();
// Store active web connections
const webClients = new Set<ServerWebSocket<WebSocketData>>();

function broadcastState() {
  const stateList = Array.from(agents.values()).map(a => a.state);
  const msg = JSON.stringify({ type: "state", agents: stateList });
  for (const client of webClients) {
    client.send(msg);
  }
}

const tls = await loadTlsConfig();

const server = serve<WebSocketData>({
  hostname: HOST,
  port: PORT,
  tls,
  routes: {
    "/": index,
    "/download/agent": async () => {
      const archive = Bun.file("./media-devices.tar.gz");
      if (!(await archive.exists())) {
        return new Response("Agent package not found", { status: 404 });
      }

      return new Response(archive, {
        headers: {
          "Content-Type": "application/gzip",
          "Content-Disposition": 'attachment; filename="media-devices.tar.gz"',
        },
      });
    },
    "/download/agent/": async () => {
      const archive = Bun.file("./media-devices.tar.gz");
      if (!(await archive.exists())) {
        return new Response("Agent package not found", { status: 404 });
      }

      return new Response(archive, {
        headers: {
          "Content-Type": "application/gzip",
          "Content-Disposition": 'attachment; filename="media-devices.tar.gz"',
        },
      });
    },
    "/app-icon.svg": async () => {
      return new Response(await Bun.file("./src/app-icon.svg").bytes(), {
        headers: { "Content-Type": "image/svg+xml" },
      });
    },
  },

  async fetch(req, server) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (!isAllowedClient(req, server)) {
      return new Response("Forbidden: LAN-only mode is enabled", { status: 403 });
    }

    // Agent Websocket Upgrade
    if (path.startsWith("/ws/agent/")) {
      const id = path.split("/ws/agent/")[1] || "unknown";
      if (server.upgrade(req, { data: { type: "agent", id } })) {
        return;
      }
    }

    // Web App Websocket Upgrade
    if (path === "/ws/web") {
      if (server.upgrade(req, { data: { type: "web" } })) {
        return;
      }
    }

    // Static / API Routes
    if (path === "/manifest.json") return Response.json(manifest);
    
    if (path === "/sw.js") {
      return new Response(await Bun.file("./src/sw.js").bytes(), {
        headers: { "Content-Type": "application/javascript" },
      });
    }

    if (path === "/logo.svg" || path === "/app-icon.svg") {
      const iconPath = path === "/app-icon.svg" ? "./src/app-icon.svg" : "./src/logo.svg";
      return new Response(await Bun.file(iconPath).bytes(), {
        headers: { "Content-Type": "image/svg+xml" },
      });
    }

    if (path === "/api/agents") {
      return Response.json(Array.from(agents.values()).map(a => a.state));
    }

    if (path === "/download/agent" || path === "/download/agent/") {
      const archive = Bun.file("./media-devices.tar.gz");
      if (!(await archive.exists())) {
        return new Response("Agent package not found", { status: 404 });
      }

      return new Response(archive, {
        headers: {
          "Content-Type": "application/gzip",
          "Content-Disposition": 'attachment; filename="media-devices.tar.gz"',
        },
      });
    }

    // Serve frontend source files (e.g., frontend.tsx) – fallback for other files
    const file = Bun.file(`./src${path}`);
    if (await file.exists()) {
      return new Response(file);
    }

    // Catch-all for SPA
    return new Response(await Bun.file("./src/index.html").bytes(), { headers: { "Content-Type": "text/html" } });
  },

  websocket: {
    open(ws) {
      if (ws.data.type === "agent" && ws.data.id) {
        agents.set(ws.data.id, { 
          state: { id: ws.data.id, status: "Unknown", title: "No Media", volume: "50" }, 
          ws 
        });
        console.log(`Agent connected: ${ws.data.id}`);
        broadcastState();
      } else if (ws.data.type === "web") {
        webClients.add(ws);
        console.log("Web client connected");
        // Send immediate state on connect
        ws.send(JSON.stringify({ type: "state", agents: Array.from(agents.values()).map(a => a.state) }));
      }
    },
    message(ws, message) {
      if (ws.data.type === "agent" && ws.data.id) {
        // Parse state update from agent
        try {
          const update = JSON.parse(message as string);
          const current = agents.get(ws.data.id);
          if (current) {
            if (update.status !== undefined) current.state.status = update.status;
            if (update.title !== undefined) current.state.title = update.title;
            if (update.volume !== undefined) current.state.volume = update.volume;
            broadcastState();
          }
        } catch (e) {
          console.error("Agent message parse error:", e);
        }
      } else if (ws.data.type === "web") {
        // Forward command to the respective agent
        try {
          const cmd = JSON.parse(message as string);
          if (cmd.target && agents.has(cmd.target)) {
            agents.get(cmd.target)?.ws.send(JSON.stringify({
              action: cmd.action,
              value: cmd.value
            }));
          }
        } catch (e) {
          console.error("Web command parse error:", e);
        }
      }
    },
    close(ws) {
      if (ws.data.type === "agent" && ws.data.id) {
        agents.delete(ws.data.id);
        console.log(`Agent disconnected: ${ws.data.id}`);
        broadcastState();
      } else if (ws.data.type === "web") {
        webClients.delete(ws);
        console.log("Web client disconnected");
      }
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,
  },
});

const mode = tls ? "https" : "http";
console.log(
  "⚙️ Runtime config:",
  JSON.stringify(
    {
      host: HOST,
      port: PORT,
      lanOnly: LAN_ONLY,
      tlsEnabled: TLS_ENABLED,
      tlsKeyPath: TLS_KEY_PATH,
      tlsCertPath: TLS_CERT_PATH,
    },
    null,
    2
  )
);
console.log(`🚀 Hub Server running at ${server.url} (${mode}, lanOnly=${LAN_ONLY})`);
