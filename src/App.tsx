import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  GameState, 
  Player,
  Point, 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  GRID_SIZE, 
  ServerMessage, 
  ClientMessage 
} from './types';
import { Trophy, Users, Zap, Skull } from 'lucide-react';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connError, setConnError] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [showRules, setShowRules] = useState(true);

  // Camera and Interpolation
  const lastStateRef = useRef<GameState | null>(null);
  const nextStateRef = useRef<GameState | null>(null);
  const lastUpdateTimestamp = useRef<number>(0);
  const cameraRef = useRef({ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, zoom: 1 });

  useEffect(() => {
    const inIframe = window.self !== window.top;
    console.log(`App running in ${inIframe ? 'iframe' : 'top-level window'}`);

    const configuredWsUrl = import.meta.env.VITE_WS_URL?.trim();
    const fallbackProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = configuredWsUrl || `${fallbackProtocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('Connected to server');
      setConnError(false);
    };

    ws.onmessage = (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      if (message.type === 'init') {
        setMyPlayerId(message.playerId);
        setGameState(message.state);
        nextStateRef.current = message.state;
      } else if (message.type === 'update') {
        lastStateRef.current = nextStateRef.current;
        nextStateRef.current = message.state;
        lastUpdateTimestamp.current = performance.now();
        setGameState(message.state);
      }
    };

    ws.onerror = () => {
      setConnError(true);
    };

    ws.onclose = () => {
      setConnError(true);
    };

    setSocket(ws);
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (myPlayerId && nextStateRef.current) {
      if (!nextStateRef.current.players[myPlayerId]?.isAlive) {
        setIsGameOver(true);
      }
    }
  }, [gameState, myPlayerId]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!socket || !isJoined || !canvasRef.current || !myPlayerId || !nextStateRef.current) return;
      
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      
      // Calculate mouse position relative to the camera-transformed world
      const mouseX = (e.clientX - rect.left);
      const mouseY = (e.clientY - rect.top);
      
      const worldMouseX = (mouseX - canvas.width / 2) / cameraRef.current.zoom + cameraRef.current.x;
      const worldMouseY = (mouseY - canvas.height / 2) / cameraRef.current.zoom + cameraRef.current.y;
      
      const player = nextStateRef.current.players[myPlayerId];
      if (!player || !player.segments[0]) return;
      
      const head = player.segments[0];
      const angle = Math.atan2(worldMouseY - head.y, worldMouseX - head.x);
      
      const msg: ClientMessage = { type: 'move', angle };
      socket.send(JSON.stringify(msg));
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [socket, isJoined, myPlayerId]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    
    const render = () => {
      animationFrameId = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const state = nextStateRef.current;
      if (!state) return;

      const myPlayer = myPlayerId ? state.players[myPlayerId] : null;
      
      // Update Camera
      if (myPlayer && myPlayer.isAlive && myPlayer.segments[0]) {
        const head = myPlayer.segments[0];
        
        // Target Camera Position
        const targetX = head.x;
        const targetY = head.y;
        
        // Smooth camera follow
        cameraRef.current.x += (targetX - cameraRef.current.x) * 0.1;
        cameraRef.current.y += (targetY - cameraRef.current.y) * 0.1;

        // Dynamic Zoom based on proximity to other players
        let minOtherDist = 1000;
        (Object.values(state.players) as Player[]).forEach(other => {
          if (other.id === myPlayerId || !other.isAlive) return;
          const dx = other.segments[0].x - head.x;
          const dy = other.segments[0].y - head.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minOtherDist) minOtherDist = dist;
        });

        const targetZoom = Math.max(0.4, Math.min(1.5, minOtherDist / 400));
        cameraRef.current.zoom += (targetZoom - cameraRef.current.zoom) * 0.05;
      }

      // Clear
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      
      // Apply Camera Transform
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(cameraRef.current.zoom, cameraRef.current.zoom);
      ctx.translate(-cameraRef.current.x, -cameraRef.current.y);

      // Draw Grid (Subtle neon grid)
      ctx.strokeStyle = 'rgba(0, 242, 255, 0.03)';
      ctx.lineWidth = 1;
      const gridSpacing = 80;
      const startX = Math.floor((cameraRef.current.x - canvas.width / cameraRef.current.zoom) / gridSpacing) * gridSpacing;
      const endX = Math.ceil((cameraRef.current.x + canvas.width / cameraRef.current.zoom) / gridSpacing) * gridSpacing;
      const startY = Math.floor((cameraRef.current.y - canvas.height / cameraRef.current.zoom) / gridSpacing) * gridSpacing;
      const endY = Math.ceil((cameraRef.current.y + canvas.height / cameraRef.current.zoom) / gridSpacing) * gridSpacing;

      for (let x = Math.max(0, startX); x <= Math.min(GAME_WIDTH, endX); x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, GAME_HEIGHT);
        ctx.stroke();
      }
      for (let y = Math.max(0, startY); y <= Math.min(GAME_HEIGHT, endY); y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(GAME_WIDTH, y);
        ctx.stroke();
      }

      // Draw boundary with neon glow
      const pulse = Math.sin(performance.now() / 200) * 5;
      ctx.strokeStyle = '#00f2ff';
      ctx.lineWidth = 8;
      ctx.shadowBlur = 20 + pulse;
      ctx.shadowColor = '#00f2ff';
      ctx.strokeRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.shadowBlur = 0;

      // Draw Food
      state.foods.forEach(food => {
        // Only draw food if it's within camera view (rough check)
        const dx = food.position.x - cameraRef.current.x;
        const dy = food.position.y - cameraRef.current.y;
        if (Math.abs(dx) > canvas.width / cameraRef.current.zoom && Math.abs(dy) > canvas.height / cameraRef.current.zoom) return;

        const foodPulse = Math.sin(performance.now() / 150 + parseInt(food.id, 36)) * 3;
        const colors = ['#00f2ff', '#ff00ff', '#00ff00', '#ffff00', '#ff4d00', '#7b00ff'];
        const foodColor = colors[Math.abs(parseInt(food.id, 36)) % colors.length];

        ctx.beginPath();
        ctx.arc(food.position.x, food.position.y, GRID_SIZE / 2.2 + foodPulse/2, 0, Math.PI * 2);
        ctx.fillStyle = foodColor;
        ctx.globalAlpha = 0.4;
        ctx.shadowBlur = 15 + foodPulse;
        ctx.shadowColor = foodColor;
        ctx.fill();
        
        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        ctx.arc(food.position.x, food.position.y, GRID_SIZE / 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Draw Players
      (Object.values(state.players) as Player[]).forEach(player => {
        if (!player.isAlive) return;

        const segments = player.segments;
        if (segments.length < 2) return;

        ctx.globalAlpha = 1.0;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Draw from tail to head
        for (let i = segments.length - 1; i >= 0; i--) {
          const curr = segments[i];
          const progress = i / segments.length;
          const radius = Math.max(4, (GRID_SIZE / 1.4) * (1 - progress * 0.4));
          
          const isPattern = i % 4 === 0 || i % 4 === 1;
          ctx.fillStyle = isPattern ? player.color : '#fff';
          if (!isPattern) ctx.globalAlpha = 0.9;
          
          ctx.shadowBlur = i === 0 ? 20 : 0;
          ctx.shadowColor = player.color;

          ctx.beginPath();
          ctx.arc(curr.x, curr.y, radius, 0, Math.PI * 2);
          ctx.fill();
          
          // 3D Highlight
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(curr.x - radius/3, curr.y - radius/3, radius/3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;

          if (i === 0) {
            // Detailed Head
            ctx.shadowBlur = 25;
            ctx.fillStyle = player.color;
            ctx.beginPath();
            ctx.arc(curr.x, curr.y, radius * 1.3, 0, Math.PI * 2);
            ctx.fill();

            // Eyes
            const angle = player.angle || 0;
            const eyeOffset = radius * 0.6;
            const eyeRadius = radius * 0.45;
            const pupilRadius = eyeRadius * 0.6;

            const eyeX1 = curr.x + Math.cos(angle - 0.5) * eyeOffset;
            const eyeY1 = curr.y + Math.sin(angle - 0.5) * eyeOffset;
            const eyeX2 = curr.x + Math.cos(angle + 0.5) * eyeOffset;
            const eyeY2 = curr.y + Math.sin(angle + 0.5) * eyeOffset;

            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(eyeX1, eyeY1, eyeRadius, 0, Math.PI * 2);
            ctx.arc(eyeX2, eyeY2, eyeRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(eyeX1 + Math.cos(angle) * 1.5, eyeY1 + Math.sin(angle) * 1.5, pupilRadius, 0, Math.PI * 2);
            ctx.arc(eyeX2 + Math.cos(angle) * 1.5, eyeY2 + Math.sin(angle) * 1.5, pupilRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.shadowBlur = 0;
      });

      // Draw Mouse Target
      if (isJoined && myPlayerId && state.players[myPlayerId]) {
        const player = state.players[myPlayerId];
        const head = player.segments[0];
        const angle = player.angle || 0;
        const dist = 60 / cameraRef.current.zoom;
        const tx = head.x + Math.cos(angle) * dist;
        const ty = head.y + Math.sin(angle) * dist;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2 / cameraRef.current.zoom;
        ctx.beginPath();
        ctx.arc(tx, ty, 8 / cameraRef.current.zoom, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(tx - 5 / cameraRef.current.zoom, ty);
        ctx.lineTo(tx + 5 / cameraRef.current.zoom, ty);
        ctx.moveTo(tx, ty - 5 / cameraRef.current.zoom);
        ctx.lineTo(tx, ty + 5 / cameraRef.current.zoom);
        ctx.stroke();
      }

      ctx.restore();
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isJoined, myPlayerId]);

  const handleJoin = () => {
    if (socket && playerName.trim()) {
      const msg: ClientMessage = { type: 'join', name: playerName };
      socket.send(JSON.stringify(msg));
      setIsJoined(true);
      setIsGameOver(false);
      setShowRules(false);
    }
  };

  const sortedPlayers = nextStateRef.current 
    ? (Object.values(nextStateRef.current.players) as Player[]).sort((a, b) => b.score - a.score)
    : [];

  return (
    <div className="fixed inset-0 bg-[#050505] text-white font-sans selection:bg-cyan-500/30 overflow-hidden flex flex-col">
      {/* Game Container */}
      <div ref={containerRef} className="relative flex-1 w-full h-full">
        <canvas 
          ref={canvasRef} 
          className="w-full h-full cursor-none"
          style={{ imageRendering: 'auto' }}
        />

        {/* UI Overlays */}
        <AnimatePresence>
          {isJoined && !isGameOver && (
            <>
              {/* Score Overlay */}
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-6 left-6 pointer-events-none"
              >
                <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                    <Zap className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Current Score</p>
                    <p className="text-2xl font-mono font-bold text-cyan-400">
                      {nextStateRef.current?.players[myPlayerId!]?.score || 0}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Roblox-style Leaderboard Overlay */}
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="absolute top-6 right-6 w-64 pointer-events-none"
              >
                <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2 text-white/60">
                      <Trophy className="w-4 h-4 text-yellow-500" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Leaderboard</span>
                    </div>
                    <div className="flex items-center gap-1 text-white/40">
                      <Users className="w-3 h-3" />
                      <span className="text-[10px] font-mono">{sortedPlayers.length}</span>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-[40vh] overflow-hidden">
                    {sortedPlayers.slice(0, 10).map((player, idx) => (
                      <div 
                        key={player.id}
                        className={`flex items-center justify-between p-2 rounded-lg transition-all ${
                          player.id === myPlayerId ? 'bg-cyan-500/20 border border-cyan-500/30' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[10px] font-mono font-bold w-4 ${idx < 3 ? 'text-yellow-500' : 'text-white/20'}`}>
                            {idx + 1}
                          </span>
                          <div 
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: player.color, boxShadow: `0 0 8px ${player.color}` }}
                          />
                          <span className={`text-xs font-medium truncate ${player.id === myPlayerId ? 'text-cyan-400' : 'text-white/80'}`}>
                            {player.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-white/40 ml-2">
                          {player.score}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </>
          )}

          {/* Rules & Join Screen */}
          {showRules && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center p-8 z-50"
            >
              <div className="max-w-2xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                <div className="space-y-8">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                        <Zap className="w-8 h-8 text-cyan-400" />
                      </div>
                      <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
                        NEONSNAKE.IO
                      </h1>
                    </div>
                    <p className="text-white/40 uppercase tracking-[0.3em] font-mono text-xs">Multiplayer Arena</p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-cyan-400">Game Rules</h3>
                      <div className="space-y-4">
                        {[
                          { id: '01', text: 'Use your mouse to guide your snake through the neon grid.' },
                          { id: '02', text: 'Collect glowing orbs to grow longer and climb the leaderboard.' },
                          { id: '03', text: 'Avoid hitting other snakes or your own body—it is fatal.' },
                          { id: '04', text: 'The arena is infinite (wraps around). Use it to your advantage.' }
                        ].map(rule => (
                          <div key={rule.id} className="flex gap-4 items-start">
                            <span className="font-mono text-cyan-500/50 text-xs mt-0.5">{rule.id}</span>
                            <p className="text-sm text-white/70 leading-relaxed">{rule.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 p-8 rounded-3xl space-y-6">
                  <div className="space-y-2 text-center">
                    <h2 className="text-2xl font-bold">Ready to Hunt?</h2>
                    <p className="text-white/40 text-sm">Enter your handle to join the arena.</p>
                  </div>
                  <div className="space-y-4">
                    {connError && (
                      <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-center">
                        <p className="text-red-400 text-xs font-bold uppercase tracking-widest mb-1">Connection Error</p>
                        <p className="text-white/60 text-[10px] leading-relaxed">
                          Safari/iOS users: Disable "Prevent Cross-Site Tracking" in Settings {'>'} Safari.
                        </p>
                      </div>
                    )}
                    <input 
                      type="text" 
                      placeholder="Player Name"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-cyan-500/50 transition-all text-center text-xl font-bold placeholder:text-white/10"
                    />
                    <div className="flex gap-4">
                      <button 
                        onClick={handleJoin}
                        className="flex-1 bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-black font-black py-4 rounded-2xl transition-all transform active:scale-95 shadow-[0_0_30px_rgba(6,182,212,0.3)] text-lg"
                      >
                        ENTER THE GRID
                      </button>
                      <button 
                        onClick={() => {
                          const url = window.location.origin;
                          navigator.clipboard.writeText(url);
                          alert('Game link copied to clipboard! Share it with your friends.');
                        }}
                        className="px-6 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl transition-all flex items-center justify-center"
                        title="Copy Game Link"
                      >
                        <Users className="w-6 h-6 text-white/60" />
                      </button>
                    </div>
                  </div>
                  <p className="text-center text-[10px] text-white/20 uppercase tracking-widest font-mono">
                    60FPS High Performance Mode Active
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Game Over Screen */}
          {isGameOver && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-red-500/20 backdrop-blur-md flex items-center justify-center z-40"
            >
              <div className="text-center space-y-8">
                <motion.div 
                  initial={{ scale: 0.5, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  className="w-24 h-24 bg-red-500/20 rounded-3xl flex items-center justify-center mx-auto border border-red-500/30 shadow-[0_0_50px_rgba(239,68,68,0.2)]"
                >
                  <Skull className="w-12 h-12 text-red-500" />
                </motion.div>
                <div className="space-y-2">
                  <h2 className="text-7xl font-black italic tracking-tighter text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.5)]">WASTED</h2>
                  <p className="text-white/60 font-mono uppercase tracking-[0.4em] text-xs">You were cut off or hit a wall</p>
                </div>
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-black/40 px-6 py-3 rounded-2xl border border-white/10">
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1">Final Score</p>
                    <p className="text-3xl font-mono font-bold text-white">{nextStateRef.current?.players[myPlayerId!]?.score || 0}</p>
                  </div>
                  <button 
                    onClick={handleJoin}
                    className="bg-white text-black font-black px-12 py-4 rounded-2xl hover:bg-white/90 transition-all transform active:scale-95 text-lg"
                  >
                    RETRY
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default App;
