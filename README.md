<div align="center">

# NeonSnake.io
### Real-time Multiplayer Snake Arena

Fast, competitive, neon-styled multiplayer snake game with live leaderboard, power-ups, mobile joystick controls, and smooth Slither-style movement.

[Play Live](https://your-vercel-url.vercel.app) • [Backend Health](https://neonsnake-production.up.railway.app/api/health)

</div>

---

## Features

- Real-time multiplayer over WebSockets
- Smooth mouse aiming (Slither-style head steering)
- Mobile transparent joystick controls
- Dynamic camera with smart zoom-out when players join
- Collectible power-ups:
  - `Speed Boost` (temporary movement boost)
  - `Growth Boost` (temporary length gain)
- Procedural neon arena visuals
- Live leaderboard + score tracking
- Sound effects for movement, food/power-up collection, and game over
- Improved food spawning (even distribution, avoids snake proximity)

---

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Node.js + Express + `ws` WebSocket server
- **Deployment:**
  - **Vercel** for frontend
  - **Railway** for persistent multiplayer backend

---

## Architecture

- Browser loads frontend from **Vercel**
- Frontend connects to backend using:
  - `VITE_WS_URL=wss://neonsnake-production.up.railway.app`
- Backend on **Railway** runs the game loop and broadcasts state to all players

---

## Local Development

