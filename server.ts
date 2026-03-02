import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import fs from "fs";
import crypto from "node:crypto";
import { 
  GameState, 
  Player, 
  Food, 
  PowerUp,
  PowerUpType,
  Point, 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  GRID_SIZE, 
  TICK_RATE, 
  INITIAL_SNAKE_LENGTH,
  SNAKE_SPEED,
  ServerMessage,
  ClientMessage
} from "./src/types";

const FOOD_COUNT = 150;
const POWER_UP_COUNT = 10;
const FOOD_MIN_DISTANCE_FROM_SNAKE = GRID_SIZE * 7;
const FOOD_MIN_DISTANCE_FROM_FOOD = GRID_SIZE * 2.2;
const POWERUP_MIN_DISTANCE_FROM_SNAKE = GRID_SIZE * 10;
const SPEED_BOOST_MS = 7000;
const GROWTH_TICKS_BOOST = 150;

async function startServer() {
  console.log(`Starting server in ${process.env.NODE_ENV || 'development'} mode`);
  const app = express();
  
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      mode: process.env.NODE_ENV || 'development',
      time: new Date().toISOString() 
    });
  });

  // Simple test route
  app.get("/test", (req, res) => {
    res.send("Server is alive and reachable!");
  });

  // Request logging and security headers
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    
    // Help with iframe and cross-site tracking issues
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    next();
  });
  
  const PORT = Number(process.env.PORT) || 3000;

  const gameState: GameState = {
    players: {},
    foods: [],
    powerUps: [],
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  };

  // Initialize food
  for (let i = 0; i < FOOD_COUNT; i++) {
    gameState.foods.push(spawnFood());
  }
  for (let i = 0; i < POWER_UP_COUNT; i++) {
    gameState.powerUps.push(spawnPowerUp());
  }

  function getDistanceSq(a: Point, b: Point): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function getLeastDenseCell(positions: Point[]): { cellX: number; cellY: number } {
    const cols = 10;
    const rows = 10;
    const cellWidth = GAME_WIDTH / cols;
    const cellHeight = GAME_HEIGHT / rows;
    const counts = new Array(cols * rows).fill(0);

    positions.forEach((pos) => {
      const x = Math.max(0, Math.min(cols - 1, Math.floor(pos.x / cellWidth)));
      const y = Math.max(0, Math.min(rows - 1, Math.floor(pos.y / cellHeight)));
      counts[y * cols + x] += 1;
    });

    const min = Math.min(...counts);
    const leastDense: number[] = [];
    counts.forEach((value, index) => {
      if (value === min) leastDense.push(index);
    });

    const selected = leastDense[Math.floor(Math.random() * leastDense.length)];
    return { cellX: selected % cols, cellY: Math.floor(selected / cols) };
  }

  function randomPointInCell(cellX: number, cellY: number): Point {
    const cols = 10;
    const rows = 10;
    const cellWidth = GAME_WIDTH / cols;
    const cellHeight = GAME_HEIGHT / rows;
    const xMin = cellX * cellWidth;
    const yMin = cellY * cellHeight;
    const x = xMin + Math.random() * cellWidth;
    const y = yMin + Math.random() * cellHeight;
    return {
      x: Math.floor(x / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2,
      y: Math.floor(y / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2,
    };
  }

  function isFarFromSnakes(position: Point, minDistance: number): boolean {
    const minDistanceSq = minDistance * minDistance;
    return Object.values(gameState.players).every((player) =>
      player.segments.every((segment) => getDistanceSq(segment, position) >= minDistanceSq)
    );
  }

  function isFarFromFoods(position: Point, minDistance: number): boolean {
    const minDistanceSq = minDistance * minDistance;
    return gameState.foods.every((food) => getDistanceSq(food.position, position) >= minDistanceSq);
  }

  function spawnFood(): Food {
    for (let attempt = 0; attempt < 40; attempt++) {
      const leastDenseCell = getLeastDenseCell(gameState.foods.map((food) => food.position));
      const point = randomPointInCell(leastDenseCell.cellX, leastDenseCell.cellY);
      if (
        isFarFromSnakes(point, FOOD_MIN_DISTANCE_FROM_SNAKE) &&
        isFarFromFoods(point, FOOD_MIN_DISTANCE_FROM_FOOD)
      ) {
        return {
          id: crypto.randomUUID(),
          position: point,
          velocity: { x: 0, y: 0 },
        };
      }
    }

    return {
      id: crypto.randomUUID(),
      position: {
        x: Math.floor(Math.random() * (GAME_WIDTH / GRID_SIZE)) * GRID_SIZE + GRID_SIZE / 2,
        y: Math.floor(Math.random() * (GAME_HEIGHT / GRID_SIZE)) * GRID_SIZE + GRID_SIZE / 2,
      },
      velocity: { x: 0, y: 0 },
    };
  }

  function spawnPowerUp(): PowerUp {
    const types: PowerUpType[] = ['speed', 'growth'];
    for (let attempt = 0; attempt < 40; attempt++) {
      const leastDenseCell = getLeastDenseCell(gameState.powerUps.map((powerUp) => powerUp.position));
      const point = randomPointInCell(leastDenseCell.cellX, leastDenseCell.cellY);
      if (isFarFromSnakes(point, POWERUP_MIN_DISTANCE_FROM_SNAKE)) {
        return {
          id: crypto.randomUUID(),
          type: types[Math.floor(Math.random() * types.length)],
          position: point,
        };
      }
    }

    return {
      id: crypto.randomUUID(),
      type: types[Math.floor(Math.random() * types.length)],
      position: {
        x: Math.floor(Math.random() * (GAME_WIDTH / GRID_SIZE)) * GRID_SIZE + GRID_SIZE / 2,
        y: Math.floor(Math.random() * (GAME_HEIGHT / GRID_SIZE)) * GRID_SIZE + GRID_SIZE / 2,
      },
    };
  }

  // Vite middleware for development
  const isProd = process.env.NODE_ENV === "production" || fs.existsSync(path.join(process.cwd(), "dist"));
  
  if (!isProd) {
    console.log("Initializing Vite middleware (Development Mode)...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Fallback for SPA in dev mode
    app.get("*", async (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
      try {
        const html = await fs.promises.readFile(path.join(process.cwd(), "index.html"), "utf-8");
        const transformedHtml = await vite.transformIndexHtml(req.url, html);
        res.status(200).set({ "Content-Type": "text/html" }).end(transformedHtml);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    console.log(`Serving static files from: ${distPath} (Production Mode)`);
    
    app.use(express.static(distPath));
    
    app.get("*", (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Build not found. Please run npm run build.");
      }
    });
  }

  const clients = new Map<string, WebSocket>();
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    const playerId = crypto.randomUUID();
    
    ws.on("message", (data) => {
      const message: ClientMessage = JSON.parse(data.toString());

      if (message.type === 'join') {
        const colors = ['#00f2ff', '#ff00ff', '#00ff00', '#ffff00', '#ff4d00', '#7b00ff'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        const startX = Math.floor(Math.random() * (GAME_WIDTH / GRID_SIZE - 10) + 5) * GRID_SIZE;
        const startY = Math.floor(Math.random() * (GAME_HEIGHT / GRID_SIZE - 10) + 5) * GRID_SIZE;

        const segments: Point[] = [];
        for (let i = 0; i < INITIAL_SNAKE_LENGTH; i++) {
          segments.push({ x: startX - i * GRID_SIZE, y: startY });
        }

        const player: Player = {
          id: playerId,
          name: message.name || "Player",
          color: color,
          segments: segments,
          direction: { x: Math.cos(0), y: Math.sin(0) },
          angle: 0,
          score: 0,
          isAlive: true,
          speedBoostUntil: 0,
          growthTicks: 0,
        };

        gameState.players[playerId] = player;
        clients.set(playerId, ws);

        const initMsg: ServerMessage = { type: 'init', state: gameState, playerId };
        ws.send(JSON.stringify(initMsg));
      }

      if (message.type === 'move') {
        const player = gameState.players[playerId];
        if (player && player.isAlive) {
          player.angle = message.angle;
          player.direction = {
            x: Math.cos(message.angle),
            y: Math.sin(message.angle)
          };
        }
      }
    });

    ws.on("close", () => {
      delete gameState.players[playerId];
      clients.delete(playerId);
    });
  });

  // Game Loop
  setInterval(() => {
    updateGameState();
    const updateMsg: ServerMessage = { type: 'update', state: gameState };
    const msgStr = JSON.stringify(updateMsg);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msgStr);
      }
    });
  }, TICK_RATE);

  function updateGameState() {
    Object.values(gameState.players).forEach(player => {
      if (!player.isAlive) return;

      const head = player.segments[0];
      const now = Date.now();
      const isSpeedBoosted = player.speedBoostUntil > now;
      const speed = SNAKE_SPEED * (isSpeedBoosted ? 1.45 : 1);
      
      const newHead = {
        x: (head.x + player.direction.x * speed + GAME_WIDTH) % GAME_WIDTH,
        y: (head.y + player.direction.y * speed + GAME_HEIGHT) % GAME_HEIGHT,
      };

      // Check other players collision (head to body)
      Object.values(gameState.players).forEach(other => {
        // Self collision check (skip first few segments)
        const segmentsToCheck = other.id === player.id ? player.segments.slice(10) : other.segments;
        
        for (const s of segmentsToCheck) {
          const dx = newHead.x - s.x;
          const dy = newHead.y - s.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < (GRID_SIZE * 0.8) * (GRID_SIZE * 0.8)) {
            player.isAlive = false;
            return;
          }
        }
      });

      if (!player.isAlive) return;

      player.segments.unshift(newHead);

      // Check food collision
      let ate = false;
      gameState.foods.forEach((food, index) => {
        const dx = newHead.x - food.position.x;
        const dy = newHead.y - food.position.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < GRID_SIZE * GRID_SIZE) {
          ate = true;
          player.score += 10;
          gameState.foods[index] = spawnFood();
        }
      });

      // Check power-up collision
      for (let i = gameState.powerUps.length - 1; i >= 0; i--) {
        const powerUp = gameState.powerUps[i];
        const dx = newHead.x - powerUp.position.x;
        const dy = newHead.y - powerUp.position.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < (GRID_SIZE * 1.3) * (GRID_SIZE * 1.3)) {
          if (powerUp.type === 'speed') {
            player.speedBoostUntil = now + SPEED_BOOST_MS;
          } else {
            player.growthTicks += GROWTH_TICKS_BOOST;
          }
          player.score += 25;
          gameState.powerUps[i] = spawnPowerUp();
        }
      }

      if (!ate) {
        if (player.growthTicks > 0) {
          player.growthTicks -= 1;
        } else {
          player.segments.pop();
        }
      }
    });
  }
}

startServer();
