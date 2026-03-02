# NeonSnake.io

Multiplayer snake game with:
- Vite + React frontend (`src/`)
- Node + WebSocket game server (`server.ts`)

## Important Vercel Note

Vercel can host the frontend, but it cannot host this project's raw WebSocket server (`ws`) as a long-lived multiplayer backend.  
Use Vercel for the site and host `server.ts` on a WebSocket-capable platform (Railway, Render, Fly.io, etc.), then set `VITE_WS_URL`.

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run local server + client together:
   ```bash
   npm run dev
   ```
3. Open:
   [http://localhost:3000](http://localhost:3000)

## Deploy Frontend To Vercel

1. Deploy:
   ```bash
   vercel --prod --yes
   ```
2. In Vercel project settings, add environment variable:
   - `VITE_WS_URL=wss://<your-public-multiplayer-backend>`
3. Redeploy:
   ```bash
   vercel --prod --yes
   ```

After this, anyone can access the public Vercel URL and join the same multiplayer world through your external WebSocket backend.
# NeonSnake
