# Card Rush

Card Rush is a finished, polished take on the classic UNO ruleset with chaotic power cards layered on top. The game ships as a production-ready TypeScript monorepo: a React + Vite client handles the cinematic presentation, while an Express + Socket.IO server authoritatively enforces every rule for up to six players per lobby.

## Highlights
- **Full Online Multiplayer** – create or join sleek lobby flows, share codes, and race through matches in seconds.
- **Power Meter & Special Cards** – Card Rush, Freeze, Color Rush, and Swap Hands all feature animated art, contextual previews, and server-side enforcement (Color Rush now immediately wins if it empties your hand).
- **Player Guidance** – landing-page help modal, power-card preview dialog, color pickers, and rush alerts ensure newcomers understand the twist instantly.
- **Robust Rules Engine** – stacked penalties, frozen turns, wild choices, and the expanded action-card distribution keep late-game rounds lively.
- **Battle-Tested Build** – shared TypeScript contracts, a single `npm run build`, and Render-ready deployment scripts make hosting trivial.

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
- Server secrets live in `packages/server/.env` (copy `packages/server/.env.example`):
  - `JWT_SECRET` – required for issuing/validating account tokens. Use a long random string in production.
  - `DATABASE_URL` – optional in development (defaults to a local SQLite file). In production, point this at your managed Postgres instance.
- Additional server configuration (for example, a custom `PORT`) can be provided via environment variables before running `npm --prefix packages/server run start`.

## Available Scripts
- `npm run dev` – run backend and frontend in watch mode.
- `npm run lint` – type-check all packages via TypeScript.
- `npm run build` – compile shared types, server bundle, and Vite client.
- `npm --prefix packages/server run start` – start the compiled Express/Socket.IO server after a build.

## Power Cards
Power points accrue as players complete actions. Every four points forces a draw from the power deck, unlocking one of the following abilities:

| Card | Effect |
| --- | --- |
| **Card Rush** | Every opponent draws two cards. |
| **Freeze** | Target opponent skips their next two turns. |
| **Color Rush** | Discard all cards of a chosen color; if this empties your hand, you immediately win. |
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
2. Provision a free Render Postgres instance and note the connection string.
3. Build command: `npm install --production=false && npm run build`.
4. Start command: `node packages/server/dist/index.js`.
5. Environment variables:
   - `NODE_ENV=production`
   - `NODE_VERSION=20.10.0` (optional pin)
   - `JWT_SECRET=<long-random-string>`
   - `DATABASE_URL=<render-postgres-connection-string>`
6. Health check path: `/api/health`.
7. Every push to `main` triggers an automatic build and deploy. Refresh the Render URL to see the latest changes.

## Release QA Checklist
- ✅ Host creates lobby, receives shareable code, and can start once 2–6 players join.
- ✅ Excess join attempts are rejected with "Room is full" copy.
- ✅ Turn indicator respects direction changes, skips, freezes, and stacked draw penalties.
- ✅ Wilds prompt for color selection; chosen color is enforced next turn.
- ✅ Power Meter increments reliably; forced power draws pause the turn until fulfilled.
- ✅ Power cards trigger their effects, including preview modal for Card Rush and instant win on Color Rush empties.
- ✅ Rush banner displays when any opponent hits one card.
- ✅ Game end screen shows accurate scores and replay flows.
- ✅ Disconnects/reconnects preserve player state and lobby membership.

Card Rush is content-complete. Any future changes will be focused on seasonal themes and live-ops rather than unfinished systems.
