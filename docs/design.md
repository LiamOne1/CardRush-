# Card Rush – Final Design Summary

This document captures the final shipped architecture for Card Rush, our multiplayer UNO variant with power cards. Every system described below is implemented in production.

## Product Goals
- Host up to six concurrent players with lobby codes, reconnect support, and host-governed starts.
- Provide a responsive, theme-consistent UI with contextual help (landing modal, Card Rush preview, rush alerts).
- Enforce all UNO mechanics plus Card Rush, Freeze, Color Rush (instant-win condition), and Swap Hands on the server.
- Keep the codebase approachable via a TypeScript monorepo and shared models.

## High-Level Architecture
- **Backend** – Node 20, Express, and Socket.IO. `UnoGame` encapsulates shuffling, draw stacking, frozen turns, power meters, and the Color Rush victory shortcut. The server also runs account auth/stat tracking for returning players.
- **Frontend** – React + Vite SPA with Tailwind styling. Socket provider + React context propagate state; UI covers landing/lobby/board/endgame phases with animations and SVG art for each power card.
- **Shared Types** – `packages/shared` exports card models, payloads, and enums so both sides compile against the exact same contracts.

## Deployment Model
- `npm run dev` for local dual-server development.
- Production bundles (`npm run build`) emit a single Express server that serves the static client and hosts the Socket.IO endpoint. Render deployments use `node packages/server/dist/index.js`.

## Gameplay Lifecycle
1. Host creates a lobby (short uppercase code); display name is persisted when authenticated.
2. Players join via code. Lobby panel shows stats, and the host launches once 2–6 seats fill.
3. Server builds the deck (with extra action-card duplicates), deals seven cards, and exposes the discard top/current color.
4. Loop per turn:
   - Server validates `playCard`, `drawCard`, `drawPowerCard`, and `playPowerCard`.
   - Draw penalties accumulate; Freeze increases `frozenForTurns`; Color Rush discards matching colors and can trigger an immediate win.
   - Power meter accrues points; once multiples of four are reached, the server forces draws before play continues.
   - Client presents wild color pickers, Card Rush preview modal, and target selectors when relevant.
5. Rush alerts broadcast when any player hits one card.
6. Round ends when a hand empties (via regular play or Color Rush). The server scores opponents, announces the winner, and resets the lobby for the next round.

## Core Modules
- `DeckFactory` – builds base and power decks (Fisher–Yates shuffle, increased action-card frequency).
- `UnoGame` – authoritative state machine plus helpers for pending hand syncs, rush alerts, and reconnection-safe data.
- `RoomService` – manages rooms, sockets, turn timers, auth bridging, and persistence of stats.
- `AuthService` – issues JWTs and records win/loss totals for signed-in players.

## Socket Contract
- **Client → Server**: `createRoom`, `joinRoom`, `startGame`, `playCard`, `drawCard`, `drawPowerCard`, `playPowerCard`, `leaveRoom`, `sendEmote`, `updateAuth`.
- **Server → Client**: `lobbyUpdate`, `stateUpdate`, `handUpdate`, `powerStateUpdate`, `gameStarted`, `gameEnded`, `rushAlert`, `error`, `playerIdentified`, `emotePlayed`.
- Public broadcasts never leak opponents’ hands; private updates are delivered per player.

## Data Models
- `Card`, `PowerCard`, `PlayerSummary`, `LobbyState`, `PublicGameState`, `PowerStatePayload`, and payloads for each socket event all live in `packages/shared`.
- Clients derive display-only helpers (e.g., power meter percentage) strictly from these payloads, preventing drift.

## Reliability & Testing
- Heartbeat/disconnect detection pauses sockets but preserves hands so players can rejoin mid-match.
- Deterministic server RNG ensures fairness; deck recycling logic prevents exhaustion.
- Automated unit coverage exists for deck factories and power logic; QA checklist (see README) validates multiplayer flows before releases.

Card Rush is feature-complete; future updates focus on seasonal art drops and live events rather than core mechanics.
