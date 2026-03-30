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

const server = serve<WebSocketData>({
  routes: {
    "/": index,
  },

  async fetch(req, server) {
    const url = new URL(req.url);
    const path = url.pathname;

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

    if (path === "/logo.svg") {
      return new Response(await Bun.file("./src/logo.svg").bytes(), {
        headers: { "Content-Type": "image/svg+xml" },
      });
    }

    if (path === "/api/agents") {
      return Response.json(Array.from(agents.values()).map(a => a.state));
    }

    if (path === "/download/agent") {
      return new Response(await Bun.file("./media-devices.tar.gz").bytes(), {
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

console.log(`🚀 Hub Server running at ${server.url}`);
