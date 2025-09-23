# Distributed UNO Game Design

## Goals
- Support 2-4 players per game room with host-controlled start.
- Enforce standard UNO rules including action and wild cards.
- Real-time synchronized gameplay over the network with minimal latency.
- Clean, responsive browser UI with join-by-code flow.
- Minimize external dependencies so the project is easy to run for classmates.

## High-Level Architecture
- **Backend**: Node.js with Express for REST endpoints and Socket.IO for real-time events. Encapsulate UNO rules in pure TypeScript modules, exposing commands (play, draw, choose color, call UNO) validated server-side.
- **Frontend**: React (Vite) single-page app connecting via Socket.IO client. State managed with React Query + context to mirror server events. TailwindCSS for rapid styling while keeping the UI clean.
- **Data Sharing**: Lightweight shared TypeScript types under `packages/shared` to keep payload contracts consistent across client and server.

## Deployment Model
- Host runs both server and client locally (`npm run dev`). For production, server can serve the built client assets, keeping a single process.

## Game Lifecycle
1. Host hits "Create Game"; server creates room id (short alphanumeric) and becomes owner.
2. Players join via room code. Lobby shows connected players; host starts once 2-4 players ready.
3. Server shuffles deck, deals 7 cards each, reveals first discard (ensuring it is not wild draw four).
4. Gameplay loop:
   - Server tracks `currentPlayerIndex`, `currentDirection`, `pendingDrawCount`, and `currentColor`.
   - Players emit actions; server validates and updates state, broadcasts diffs.
   - Draw penalties (Draw Two/Four) accumulate until satisfied.
   - Reverse flips direction; Skip advances two positions; Wilds require color selection.
5. RUSH alert: when a player has one card remaining, server auto-flags them and broadcasts a `rushAlert` notification to opponents.
6. Round ends when a player empties hand. Server calculates scores (sum of opponents' cards) and announces winner.

## Core Modules
- `DeckFactory`: builds and shuffles deck using Fisher-Yates.
- `GameState`: immutable representation of a room; methods return new state with audit trail.
- `GameService`: orchestrates rooms, players, event emission, persistence.
- `SocketHandlers`: maps socket events to game commands, ensuring authorization (only current player issues turn sensitive commands).

## Communication Protocol (Socket Events)
- Client -> Server: `createRoom`, `joinRoom`, `startGame`, `playCard`, `drawCard`, `chooseColor`, `leaveRoom`.
- Server -> Client: `lobbyUpdate`, `gameStarted`, `stateUpdate` (public data), `handUpdate` (private), `error`, `gameEnded`, `rushAlert`.
- Public state excludes opponents' hands (only counts) and top discard details. Private hand updates sent individually.

## Data Models (Shared Types)
- `Card`: `{ id, color: 'red'|'yellow'|'green'|'blue'|'wild', value: '0'-'9'|'skip'|'reverse'|'draw2'|'wild'|'wild4' }`.
- `PlayerSummary`: `{ id, name, isHost, cardCount, hasCalledUno }`.
- `LobbyState`: `{ roomCode, players: PlayerSummary[], hostId }`.
- `GameSnapshot`: `{ roomCode, currentPlayerId, direction, discardTop, currentColor, drawStack, players: PlayerSummary[] }`.

## Error Handling & Resilience
- Heartbeat/ping to detect disconnects; if player disconnects mid-game, server keeps hand for a grace period before bot drop.
- Validation returns descriptive errors; client surfaces toast notifications.
- Use server-side deterministic randomness (seed optional) for reproducibility.

## Testing Strategy
- Unit test UNO rules (deck generation, valid move checking, action effects) via Jest.
- Integration tests for socket flow using Socket.IO test harness.
- Manual end-to-end test: two browser tabs connecting locally.

## Future Enhancements
- Spectator mode and chat.
- Persistent matches with Redis adapter for horizontal scaling.
- Authentication for user identities beyond display name.
- Mobile-friendly layout improvements and animations.
