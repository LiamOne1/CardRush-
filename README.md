# Codex UNO

Real-time, browser-based UNO built for distributed systems coursework. The app ships as a small monorepo with a TypeScript/Express/Socket.IO backend and a React + Vite frontend, allowing 2-4 friends to join a lobby by code and play according to classic rules.

## Prerequisites
- Node.js 18+ (Node 20 recommended)
- npm 9+

## Getting Started

```
npm install
npm run dev
```

`npm run dev` launches both services:
- API/WebSocket server on `http://localhost:4000`
- Vite dev server on `http://localhost:5173`

> The client defaults to `http://localhost:4000` for socket traffic. Override with `VITE_SERVER_URL` in an `.env` file under `packages/client` if you host elsewhere.

## Available Scripts

- `npm run dev` - concurrent dev servers (backend + frontend)
- `npm run lint` - TypeScript type-check for every package
- `npm run build` - compile shared types, backend, and frontend bundles
- `npm --prefix packages/server run start` - launch the compiled Express/Socket.IO server after a build

## Playing Locally
1. Run `npm run dev`.
2. Visit `http://localhost:5173`, choose a display name, and click **Create Lobby**.
3. Open another tab or browser, enter the same lobby code, and **Join Lobby**.
4. Once 2-4 players are connected, the host hits **Start Game**.
5. Players click cards to play, **Draw Card** when stuck, and the table shouts **RUSH!** automatically when someone is down to one card.

UNO rules enforced server-side include stacking draw cards, skip/reverse logic, wild color selection

## Project Layout

```
packages/
  client/   # React + Tailwind UI (Vite driven)
  server/   # Express + Socket.IO backend with authoritative UNO engine
  shared/   # Shared TypeScript types and constants for payload parity
```

Design notes and architecture rationale live in `docs/design.md`.

## Manual Test Checklist
- ? Host creates lobby and receives code
- ? Second player joins via code and appears in lobby list
- ? Host can start game only with =2 players, =4 players
- ? Turn indicator follows direction and skip/reverse effects
- ? Draw Two / Wild Draw Four stack and force subsequent player draws
- ? Wild cards prompt for color selection
- ? RUSH banner appears for opponents when a player has one card left
- ? Game concludes when a player empties their hand and scoreboard appears

## Next Steps
- Add persistence (Redis) to survive server restarts
- Enhance animations & add sound cues
- Introduce spectator mode and in-lobby chat
