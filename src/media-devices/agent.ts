const HUB_URL = "ws://192.168.1.50:5050"; // Your Bun Hub IP
const socket = new WebSocket(HUB_URL);

// 1. Listen for commands FROM the Hub
socket.onmessage = (event) => {
  const { action, value } = JSON.parse(event.data);
  
  if (action === "play-pause") {
    Bun.spawn(["playerctl", "play-pause"]);
  } else if (action === "volume") {
    Bun.spawn(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", `${value}%`]);
  }
};

// 2. Push status TO the Hub (using playerctl's monitor mode)
const monitor = Bun.spawn(["playerctl", "metadata", "--format", '{"status": "{{status}}", "title": "{{title}}"}', "--follow"], {
  stdout: "pipe",
});

// Read the stdout stream and pipe it to the WebSocket
(async () => {
  const reader = monitor.stdout.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    socket.send(new TextDecoder().decode(value));
  }
})();