import { hostname } from "node:os";
import { spawn } from "bun";

const HUB_URL = process.env.HUB_URL || "ws://localhost:3000"; 
const agentId = hostname();
const WS_URL = `${HUB_URL}/ws/agent/${agentId}`;

console.log(`Connecting to Hub at ${WS_URL}...`);
let socket = new WebSocket(WS_URL);

// Function to get current volume
async function getVolume(): Promise<string> {
  try {
    const proc = Bun.spawn(["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"]);
    const output = await new Response(proc.stdout).text();
    // Output format: "Volume: 0.50" or "Volume: 0.50 [MUTED]"
    const match = output.match(/Volume:\s+([\d.]+)/);
    if (match && match[1]) {
      return (parseFloat(match[1]) * 100).toFixed(0);
    }
    return "50";
  } catch (err) {
    return "50";
  }
}

async function updateVolumeState() {
  const vol = await getVolume();
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ volume: vol }));
  }
}

socket.onopen = async () => {
  console.log("Connected to Hub!");
  updateVolumeState();
};

socket.onclose = () => {
  console.log("Disconnected from Hub. Exiting.");
  process.exit(1);
};

// 1. Listen for commands FROM the Hub
socket.onmessage = async (event) => {
  try {
    const { action, value } = JSON.parse(event.data);
    
    switch (action) {
      case "play-pause":
        Bun.spawn(["playerctl", "play-pause"]);
        break;
      case "play":
        Bun.spawn(["playerctl", "play"]);
        break;
      case "pause":
        Bun.spawn(["playerctl", "pause"]);
        break;
      case "next":
        Bun.spawn(["playerctl", "next"]);
        break;
      case "previous":
        Bun.spawn(["playerctl", "previous"]);
        break;
      case "volume":
        if (value !== undefined) {
           Bun.spawn(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", `${value}%`]);
           setTimeout(updateVolumeState, 200);
        }
        break;
      case "volume-up":
        Bun.spawn(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "5%+"]);
        setTimeout(updateVolumeState, 200);
        break;
      case "volume-down":
        Bun.spawn(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "5%-"]);
        setTimeout(updateVolumeState, 200);
        break;
    }
  } catch (err) {
    console.error("Error processing message:", err);
  }
};

// 2. Push status TO the Hub (using playerctl's monitor mode)
const monitor = Bun.spawn(["playerctl", "metadata", "--format", '{"status": "{{status}}", "title": "{{title}}"}', "--follow"], {
  stdout: "pipe",
});

// Read the stdout stream and pipe it to the WebSocket
(async () => {
  const reader = monitor.stdout.getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += new TextDecoder().decode(value);
    
    // Split on newlines as playerctl outputs one JSON object per line
    const lines = buffer.split('\n');
    buffer = lines.pop() || ""; // Keep the last incomplete line
    
    for (const line of lines) {
      if (line.trim() && socket.readyState === WebSocket.OPEN) {
        socket.send(line);
      }
    }
  }
})();