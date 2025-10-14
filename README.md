# Card Rush UNO

Card Rush is a real-time, browser-based UNO experience built as a small TypeScript monorepo. A React + Vite client renders the UI, while an Express + Socket.IO server enforces the rules, power-card mechanics, and synchronized state for 2-4 players per lobby.

## Features
- Real-time multiplayer UNO with lobby codes and host-controlled start.
- Power Meter that unlocks special **Power Cards** (Card Rush, Freeze, Color Rush, Swap Hands).
- Shared TypeScript models (`packages/shared`) keeping client and server payloads aligned.
- Single build pipeline that compiles shared types, the Socket.IO server, and the Vite client.
- Production-ready deployment to Render - the server serves the built client bundle at the same origin as the API/WebSocket endpoint.

## Prerequisites
- Node.js 20 (LTS recommended)
- npm 9+

## Getting Started
```bash
npm install
npm run dev
```

`npm run dev` launches both services:
- API/WebSocket server on `http://localhost:4000`
- Vite dev server on `http://localhost:5173`

### Environment Configuration
- Development sockets default to `http://localhost:4000`. To override, set `VITE_SERVER_URL` in `packages/client/.env.development.local`.
- Production builds rely on the page origin. **Do not** commit `.env.local` files pointing at localhost - they will leak into the deployed bundle.
- Additional server configuration (for example, a custom `PORT`) can be provided via environment variables before running `npm --prefix packages/server run start`.

## Available Scripts
- `npm run dev` - run backend and frontend in watch mode.
- `npm run lint` - type-check all packages via TypeScript.
- `npm run build` - compile shared types, server bundle, and Vite client.
- `npm --prefix packages/server run start` - start the compiled Express/Socket.IO server after a build.

## Power Cards
Power points accrue as players complete actions. Every four points forces a draw from the power deck, unlocking one of the following abilities:

| Card | Effect |
| --- | --- |
| **Card Rush** | Every opponent draws two cards. |
| **Freeze** | Target opponent skips their next two turns. |
| **Color Rush** | Discard all cards of a chosen color from your hand; the cards are shuffled back into the deck. |
| **Swap Hands** | Exchange your hand with a selected opponent. |

The UI displays the Power Meter, pending power-card draws, and available power cards, all driven by Socket.IO updates.

## Playing Locally
1. Run `npm run dev`.
2. Visit `http://localhost:5173`, enter a display name, and click **Create Lobby**.
3. Share the code with friends; they join via **Join Lobby**.
4. When 2-4 players are ready, the host clicks **Start Game**.
5. Play cards, draw as needed, trigger power cards, and respond to wild color prompts. Rush alerts appear automatically when an opponent has one card.

Standard UNO rules (skip, reverse, draw stacking, wild selection) and the new power-card flow are enforced server-side.

## Project Layout
```
packages/
  client/   # React + Tailwind UI (Vite driven)
  server/   # Express + Socket.IO backend with authoritative UNO engine + power cards
  shared/   # Shared TypeScript types and constants for payload parity
docs/       # Design notes and generated documentation
```

Design notes and architecture rationale live in `docs/design.md`.

## Production Deployment (Render)
1. Connect the GitHub repo to Render and create a Node web service (branch `main`).
2. Build command: `npm install --production=false && npm run build`.
3. Start command: `node packages/server/dist/index.js`.
4. Environment variables: set `NODE_ENV=production` and (optionally) `NODE_VERSION=20.10.0`. The server uses Render's `PORT` automatically.
5. Health check path: `/api/health`.
6. Every push to `main` triggers an automatic build and deploy. Refresh the Render URL to see the latest changes.

## Manual Test Checklist
- [ ] Host creates lobby and receives a join code.
- [ ] Second player joins via code and appears in lobby list.
- [ ] Fifth player is rejected with "Room is full".
- [ ] Host cannot start with fewer than two players; can start with four.
- [ ] Turn indicator respects direction, skips, reverses, and frozen players.
- [ ] Draw Two / Wild Draw Four cards stack penalties correctly.
- [ ] Wild cards prompt for color selection; chosen color is enforced next turn.
- [ ] Power Meter increments; required power draws occur before play resumes.
- [ ] Each power card effect (Card Rush, Freeze, Color Rush, Swap Hands) behaves as described.
- [ ] Rush banner appears when an opponent has one card left.
- [ ] Game ends when a player empties their hand and scoreboard displays totals.
- [ ] Host/server restart (or brief disconnect) allows players to reconnect while room exists.

## Next Steps
- Persist rooms and state in Redis to survive restarts or multiple instances.
- Add automated tests for power-card mechanics and reconnection flows.
- Enhance animations, add sound cues, and improve mobile responsiveness.
- Explore spectator mode, in-lobby chat, and ranked matchmaking.
