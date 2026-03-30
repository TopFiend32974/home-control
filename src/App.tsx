import { useEffect, useState, useRef } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2, MonitorSpeaker, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import "./index.css";

type AgentState = {
  id: string;
  status: string;
  title: string;
  volume: string;
};

export function App() {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Add dark mode by default to body
    document.documentElement.classList.add("dark");
    
    // Determine WebSocket URL dynamically based on current host
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/web`;

    const connect = () => {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "state" && Array.isArray(data.agents)) {
            setAgents(data.agents);
          }
        } catch (err) {
          console.error("Failed to parse message", err);
        }
      };

      socket.onclose = () => {
        setConnected(false);
        // Try to reconnect in 2 seconds
        setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const sendCommand = (target: string, action: string, value?: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ target, action, value }));
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col pt-12 p-4 sm:p-8 bg-zinc-950 text-zinc-50 overflow-hidden font-sans">
      {/* Cool animated background glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none animate-pulse-slow"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/20 blur-[120px] pointer-events-none animate-pulse-slow-delayed"></div>

      <div className="max-w-5xl mx-auto w-full relative z-10 flex flex-col gap-8">
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-md bg-zinc-900/40 p-6 rounded-3xl border border-zinc-800/50 shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-linear-to-br from-indigo-500 to-cyan-500 rounded-2xl shadow-lg shadow-cyan-500/20">
              <MonitorSpeaker className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-zinc-100 to-zinc-400">
                Media Control Center
              </h1>
              <p className="text-zinc-400 text-sm mt-1 font-medium">Manage cross-machine audio & video</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <a 
              href="/download/agent" 
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800 transition-colors text-zinc-300 text-sm font-semibold"
              title="Download Agent for Other Machines"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
              Agent Package (.tar.gz)
            </a>

            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/60 border border-zinc-800">
              <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'}`}></div>
              <span className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                {connected ? "Hub Online" : "Reconnecting"}
              </span>
            </div>
          </div>
        </header>

        <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.length === 0 ? (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-500 space-y-4 bg-zinc-900/20 rounded-3xl border border-zinc-800/50 backdrop-blur-sm dashed">
              <Loader2 className="w-10 h-10 animate-spin text-zinc-600" />
              <p className="text-lg font-medium">Waiting for agents to connect...</p>
            </div>
          ) : (
            agents.map((agent) => {
              const playing = agent.status.toLowerCase() === "playing";
              return (
                <Card key={agent.id} className="bg-zinc-900/40 border-zinc-800/50 backdrop-blur-xl overflow-hidden shadow-2xl transition-all duration-300 hover:shadow-cyan-500/10 hover:border-zinc-700/50 rounded-3xl group">
                  <div className={`h-1.5 w-full bg-linear-to-r ${playing ? 'from-cyan-400 to-indigo-500' : 'from-zinc-700 to-zinc-800'}`}></div>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-xl font-bold flex items-center justify-between text-zinc-100">
                      <span className="truncate">{agent.id}</span>
                      <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full tracking-widest ${playing ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-zinc-800 text-zinc-400'}`}>
                        {agent.status}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-6">
                    <div className="min-h-16 flex items-center">
                      <p className={`line-clamp-2 md:line-clamp-3 text-sm font-medium ${playing ? 'text-zinc-200' : 'text-zinc-500 italic'}`}>
                        {agent.title || 'No media metadata available'}
                      </p>
                    </div>

                    <div className="flex flex-col gap-4 mt-auto">
                      <div className="flex items-center justify-center gap-3 bg-zinc-950/50 p-3 rounded-2xl border border-zinc-800/50">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => sendCommand(agent.id, "previous")}
                          className="hover:bg-zinc-800 hover:text-cyan-400 transition-colors text-zinc-400 rounded-xl"
                        >
                          <SkipBack className="w-5 h-5 fill-current" />
                        </Button>
                        <Button 
                          size="icon" 
                          onClick={() => sendCommand(agent.id, "play-pause")}
                          className={`w-12 h-12 rounded-full transition-all duration-300 shadow-lg ${playing ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20' : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/20 text-white'}`}
                        >
                          {playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => sendCommand(agent.id, "next")}
                          className="hover:bg-zinc-800 hover:text-cyan-400 transition-colors text-zinc-400 rounded-xl"
                        >
                          <SkipForward className="w-5 h-5 fill-current" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-4 bg-zinc-950/30 p-3 rounded-2xl border border-zinc-800/30 pr-4">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg shrink-0" 
                          onClick={() => sendCommand(agent.id, "volume-down")}
                        >
                          <Volume2 className="w-4 h-4 opacity-70" />
                        </Button>
                        <div className="flex-1 w-full h-2 bg-zinc-800 rounded-full overflow-hidden relative cursor-pointer"
                             onClick={(e) => {
                               const rect = e.currentTarget.getBoundingClientRect();
                               const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                               sendCommand(agent.id, "volume", Math.round(percent).toString());
                             }}>
                          <div 
                            className="absolute top-0 left-0 h-full bg-linear-to-r from-cyan-500 to-indigo-500 transition-all shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                            style={{ width: `${agent.volume}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-zinc-400 opacity-70 w-8 text-right shrink-0">{agent.volume}%</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg shrink-0" 
                          onClick={() => sendCommand(agent.id, "volume-up")}
                        >
                          <Volume2 className="w-5 h-5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
