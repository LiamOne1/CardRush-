import { nanoid } from "nanoid";
import type { Server, Socket } from "socket.io";
import type {
  Card,
  ClientToServerEvents,
  ErrorPayload,
  LobbyState,
  PlayCardPayload,
  PlayPowerCardPayload,
  PowerCard,
  PowerStatePayload,
  RoomCode,
  RushAlertPayload,
  EmoteType,
  ServerToClientEvents
} from "@code-card/shared";
import { UnoGame } from "../game/state.js";
import type { AuthService } from "./auth-service.js";

interface RoomPlayer {
  id: string;
  userId: string | null;
  name: string;
  socketId: string | null;
  hand: Card[];
  hasCalledUno: boolean;
  connected: boolean;
  powerCards: PowerCard[];
  powerPoints: number;
  frozenForTurns: number;
}

interface Room {
  code: RoomCode;
  hostId: string;
  players: RoomPlayer[];
  status: "waiting" | "in-progress";
  createdAt: Date;
  game?: UnoGame;
}

type UnoSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const MAX_PLAYERS = 6;
const MIN_PLAYERS_TO_START = 2;
const VALID_EMOTES: readonly EmoteType[] = ["angry", "sad", "happy", "shocked", "poop"];
const TURN_TIMEOUT_MS = 60_000;

export class RoomService {
  private rooms = new Map<RoomCode, Room>();
  private turnTimers = new Map<RoomCode, NodeJS.Timeout>();

  constructor(private readonly io: Server<ClientToServerEvents, ServerToClientEvents>, private readonly authService: AuthService) {}

  async handleCreateRoom(socket: UnoSocket, name: string, callback: (roomCode: RoomCode) => void) {
    const sanitized = name.trim();
    if (!sanitized) {
      this.emitError(socket, "Display name is required");
      return;
    }

    this.leaveRoom(socket);

    const roomCode = this.generateRoomCode();
    const player = this.createPlayer(socket, sanitized);

    const room: Room = {
      code: roomCode,
      hostId: player.id,
      players: [player],
      status: "waiting",
      createdAt: new Date()
    };

    this.rooms.set(roomCode, room);

    socket.data.playerId = player.id;
    socket.data.roomCode = room.code;
    socket.data.name = sanitized;
    await socket.join(room.code);

    socket.emit("playerIdentified", player.id);
    this.emitLobby(room);
    callback(room.code);
  }

  async handleJoinRoom(
    socket: UnoSocket,
    payload: { roomCode: string; name: string },
    callback: (success: boolean, message?: string) => void
  ) {
    const name = payload.name.trim();
    const roomCode = payload.roomCode.trim().toUpperCase();

    if (!name || !roomCode) {
      callback(false, "Room code and name are required");
      return;
    }

    const room = this.rooms.get(roomCode as RoomCode);
    if (!room) {
      callback(false, "Room not found");
      return;
    }

    const rejoiningPlayer = room.players.find(
      (p) => p.name.toLowerCase() === name.toLowerCase() && !p.connected
    );

    if (!rejoiningPlayer) {
      if (room.status === "in-progress") {
        callback(false, "Game already in progress");
        return;
      }

      if (room.players.length >= MAX_PLAYERS) {
        callback(false, "Room is full");
        return;
      }

      if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        callback(false, "Display name already in use in this room");
        return;
      }
    }

    if (rejoiningPlayer) {
      rejoiningPlayer.socketId = socket.id;
      rejoiningPlayer.connected = true;

      socket.data.playerId = rejoiningPlayer.id;
      socket.data.roomCode = room.code;
      socket.data.name = name;
      await socket.join(room.code);

      socket.emit("playerIdentified", rejoiningPlayer.id);
      this.emitLobby(room);
      if (room.game) {
        const publicState = room.game.getPublicState(room.hostId);
        const hand = room.game.getHand(rejoiningPlayer.id);
        if (rejoiningPlayer.socketId) {
          this.io.to(rejoiningPlayer.socketId).emit("gameStarted", publicState, { cards: hand });
          this.io.to(rejoiningPlayer.socketId).emit("handUpdate", { cards: hand });
          this.syncPowerState(room, rejoiningPlayer.id);
        }
        this.broadcastState(room);
      }
      callback(true);
      return;
    }

    const player = this.createPlayer(socket, name);
    room.players.push(player);

    socket.data.playerId = player.id;
    socket.data.roomCode = room.code;
    socket.data.name = name;
    await socket.join(room.code);

    socket.emit("playerIdentified", player.id);
    this.emitLobby(room);
    callback(true);
  }

  updatePlayerAccount(socket: UnoSocket, userId: string | null) {
    const room = this.getRoomForSocket(socket);
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!playerId) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;
    player.userId = userId;
    this.emitLobby(room);
  }

  handleStart(socket: UnoSocket) {
    const room = this.getRoomForSocket(socket);
    if (!room) return;

    if (room.hostId !== socket.data.playerId) {
      this.emitError(socket, "Only the host can start the game");
      return;
    }

    if (room.players.length < MIN_PLAYERS_TO_START) {
      this.emitError(socket, "Need at least two players to start");
      return;
    }

    const game = new UnoGame({
      roomCode: room.code,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        hand: [],
        hasCalledUno: false,
        connected: true,
        powerCards: [],
        powerPoints: 0,
        hasPlayedPowerCardThisTurn: false,
        isAwaitingPowerDraw: false,
        pendingSkipCount: null,
        frozenForTurns: 0
      }))
    });

    game.start();

    room.game = game;
    room.status = "in-progress";

    const publicState = game.getPublicState(room.hostId);

    for (const player of room.players) {
      const hand = game.getHand(player.id);
      player.hand = hand;
      player.powerCards = [];
      player.powerPoints = 0;
      player.frozenForTurns = 0;
      if (player.socketId) {
        this.io.to(player.socketId).emit("gameStarted", publicState, { cards: hand });
      }
      this.syncPowerState(room, player.id);
    }

    this.emitLobby(room);
    this.broadcastState(room);
    this.scheduleTurnTimer(room);
  }

  handlePlayCard(socket: UnoSocket, payload: PlayCardPayload) {
    const room = this.getRoomForSocket(socket);
    if (!room || !room.game) return;

    const playerId = socket.data.playerId;
    if (!playerId) return;

    try {
      const result = room.game.playCard(playerId, payload.cardId, payload.chosenColor);
      const hand = room.game.getHand(playerId);
      const roomPlayer = room.players.find((p) => p.id === playerId);
      if (roomPlayer?.socketId) {
        this.io.to(roomPlayer.socketId).emit("handUpdate", { cards: hand });
      }

      if (roomPlayer) {
        roomPlayer.hand = hand;
        roomPlayer.hasCalledUno = hand.length === 1;
      }

      this.syncPowerState(room, playerId);

      if (roomPlayer && hand.length === 1) {
        const payload: RushAlertPayload = { playerId: roomPlayer.id, playerName: roomPlayer.name };
        socket.broadcast.to(room.code).emit("rushAlert", payload);
      }

      this.syncDirtyHands(room, [playerId]);

      if (result.winnerId) {
        void this.finishGame(room);
      } else {
        this.broadcastState(room);
        this.scheduleTurnTimer(room);
      }
    } catch (error) {
      this.emitError(socket, error instanceof Error ? error.message : "Unable to play card");
    }
  }

  handleDrawCard(socket: UnoSocket) {
    const room = this.getRoomForSocket(socket);
    if (!room || !room.game) return;
    const playerId = socket.data.playerId;
    if (!playerId) return;

    try {
      room.game.draw(playerId);
      const hand = room.game.getHand(playerId);
      const roomPlayer = room.players.find((p) => p.id === playerId);
      if (roomPlayer?.socketId) {
        this.io.to(roomPlayer.socketId).emit("handUpdate", { cards: hand });
      }

      if (roomPlayer) {
        roomPlayer.hand = hand;
        roomPlayer.hasCalledUno = false;
      }

      this.syncDirtyHands(room, [playerId]);
      this.broadcastState(room);
      this.scheduleTurnTimer(room);
    } catch (error) {
      this.emitError(socket, error instanceof Error ? error.message : "Unable to draw card");
    }
  }

  handleDrawPowerCard(socket: UnoSocket) {
    const room = this.getRoomForSocket(socket);
    if (!room || !room.game) return;
    const playerId = socket.data.playerId;
    if (!playerId) return;

    try {
      room.game.drawPowerCard(playerId);
      this.syncPowerState(room, playerId);
      this.syncDirtyHands(room, [playerId]);
      this.broadcastState(room);
      this.scheduleTurnTimer(room);
    } catch (error) {
      this.emitError(socket, error instanceof Error ? error.message : "Unable to draw a power card");
    }
  }

  handlePlayPowerCard(socket: UnoSocket, payload: PlayPowerCardPayload) {
    const room = this.getRoomForSocket(socket);
    if (!room || !room.game) return;
    const playerId = socket.data.playerId;
    if (!playerId) return;

    try {
      const result = room.game.playPowerCard(playerId, payload);

      const actorHand = room.game.getHand(playerId);
      const actor = room.players.find((p) => p.id === playerId);
      if (actor?.socketId) {
        this.io.to(actor.socketId).emit("handUpdate", { cards: actorHand });
      }

      if (actor) {
        actor.hand = actorHand;
        actor.hasCalledUno = actorHand.length === 1;
      }

      this.syncPowerState(room, playerId);

      const affectedIds = new Set(result.affectedPlayerIds);
      for (const playerId of affectedIds) {
        const hand = room.game.getHand(playerId);
        const affectedPlayer = room.players.find((p) => p.id === playerId);
        if (affectedPlayer?.socketId) {
          this.io.to(affectedPlayer.socketId).emit("handUpdate", { cards: hand });
        }
        if (affectedPlayer) {
          affectedPlayer.hand = hand;
          affectedPlayer.hasCalledUno = hand.length === 1;
        }
      }

      this.syncDirtyHands(room, [playerId, ...affectedIds]);

      const rushCandidates = new Set<string>();
      if (actor && actor.hand.length === 1) {
        rushCandidates.add(actor.id);
      }
      for (const playerId of affectedIds) {
        const affectedPlayer = room.players.find((p) => p.id === playerId);
        if (affectedPlayer && affectedPlayer.hand.length === 1) {
          rushCandidates.add(affectedPlayer.id);
        }
      }

      for (const playerId of rushCandidates) {
        const target = room.players.find((p) => p.id === playerId);
        if (!target) continue;
        const alert: RushAlertPayload = { playerId: target.id, playerName: target.name };
        this.io.to(room.code).emit("rushAlert", alert);
      }

      this.broadcastState(room);
    } catch (error) {
      this.emitError(socket, error instanceof Error ? error.message : "Unable to play power card");
    }
  }

  handleSendEmote(socket: UnoSocket, emote: EmoteType) {
    const room = this.getRoomForSocket(socket);
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!playerId) return;

    if (!VALID_EMOTES.includes(emote)) {
      return;
    }

    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player || !player.connected) {
      return;
    }

    this.io.to(room.code).emit("emotePlayed", { playerId: player.id, emote });
  }

  leaveRoom(socket: UnoSocket) {
    const room = this.getRoomForSocket(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId) {
      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;
      socket.data.name = undefined;
      return;
    }

    const playerIndex = room.players.findIndex((player) => player.id === playerId);
    if (playerIndex === -1) {
      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;
      socket.data.name = undefined;
      return;
    }

    const [removedPlayer] = room.players.splice(playerIndex, 1);
    socket.leave(room.code);

    socket.data.roomCode = undefined;
    socket.data.playerId = undefined;
    socket.data.name = undefined;

    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      this.clearTurnTimer(room.code);
      return;
    }

    if (room.hostId === removedPlayer.id) {
      room.hostId = room.players[0].id;
    }

    if (room.status === "in-progress" && room.game) {
      const result = room.game.removePlayer(removedPlayer.id);
      if (result?.winnerId) {
        void this.finishGame(room);
        return;
      }
      this.emitLobby(room);
      this.broadcastState(room);
      this.scheduleTurnTimer(room);
      return;
    }

    this.emitLobby(room);
  }

  handleDisconnect(socket: UnoSocket) {
    const room = this.getRoomForSocket(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId) {
      return;
    }

    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return;
    }

    player.connected = false;
    player.socketId = null;
    socket.leave(room.code);

    if (room.status === "waiting" && room.hostId === player.id) {
      const replacement = room.players.find((p) => p.connected);
      if (replacement) {
        room.hostId = replacement.id;
      }
    }

    this.emitLobby(room);
  }

  private async finishGame(room: Room) {
    const payload = room.game?.getWinnerPayload();
    if (payload) {
      try {
        const outcomes = room.players
          .filter((player) => player.userId)
          .map((player) => ({
            userId: player.userId as string,
            didWin: player.id === payload.winnerId
          }));
        if (outcomes.length > 0) {
          await this.authService.recordGameOutcome(outcomes);
        }
      } catch (error) {
        console.error("Failed to record game outcome:", error);
      }
      this.io.to(room.code).emit("gameEnded", payload);
    }
    this.clearTurnTimer(room.code);
    room.status = "waiting";
    room.game = undefined;
    for (const player of room.players) {
      player.hand = [];
      player.hasCalledUno = false;
      player.powerCards = [];
        player.powerPoints = 0;
        player.frozenForTurns = 0;
        if (player.socketId) {
          this.io.to(player.socketId).emit("powerStateUpdate", { points: 0, cards: [], requiredDraws: 0 });
        }
    }
    this.emitLobby(room);
  }

  private scheduleTurnTimer(room: Room) {
    if (room.status !== "in-progress" || !room.game) {
      this.clearTurnTimer(room.code);
      return;
    }

    this.clearTurnTimer(room.code);
    const timer = setTimeout(() => this.handleTurnTimeout(room.code), TURN_TIMEOUT_MS);
    this.turnTimers.set(room.code, timer);
  }

  private clearTurnTimer(roomCode: RoomCode) {
    const existing = this.turnTimers.get(roomCode);
    if (existing) {
      clearTimeout(existing);
      this.turnTimers.delete(roomCode);
    }
  }

  private handleTurnTimeout(roomCode: RoomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== "in-progress" || !room.game) {
      this.clearTurnTimer(roomCode);
      return;
    }

    const currentPlayer = room.game.getCurrentPlayer();
    if (!currentPlayer) {
      this.scheduleTurnTimer(room);
      return;
    }

    try {
      if (currentPlayer.isAwaitingPowerDraw) {
        room.game.drawPowerCard(currentPlayer.id);
        this.syncPowerState(room, currentPlayer.id);
      } else {
        room.game.draw(currentPlayer.id);
      }

      const hand = room.game.getHand(currentPlayer.id);
      const roomPlayer = room.players.find((player) => player.id === currentPlayer.id);
      if (roomPlayer?.socketId) {
        this.io.to(roomPlayer.socketId).emit("handUpdate", { cards: hand });
      }
      if (roomPlayer) {
        roomPlayer.hand = hand;
        roomPlayer.hasCalledUno = false;
      }

      this.syncDirtyHands(room, [currentPlayer.id]);
      this.broadcastState(room);
    } catch (error) {
      console.error("Failed to auto-advance turn after timeout:", error);
    } finally {
      this.scheduleTurnTimer(room);
    }
  }

  private broadcastState(room: Room) {
    if (!room.game) return;
    const state = room.game.getPublicState(room.hostId);

    for (const summary of state.players) {
      const roomPlayer = room.players.find((player) => player.id === summary.id);
      if (roomPlayer) {
        roomPlayer.hasCalledUno = summary.hasCalledUno;
        roomPlayer.powerPoints = summary.powerPoints;
        roomPlayer.frozenForTurns = summary.frozenForTurns;
      }
    }

    this.io.to(room.code).emit("stateUpdate", state);
  }

  private syncPowerState(room: Room, playerId: string) {
    if (!room.game) return;
    const payload: PowerStatePayload = room.game.getPowerState(playerId);
    const roomPlayer = room.players.find((player) => player.id === playerId);
    if (roomPlayer) {
      roomPlayer.powerCards = payload.cards;
      roomPlayer.powerPoints = payload.points;
    }
    if (roomPlayer?.socketId) {
      this.io.to(roomPlayer.socketId).emit("powerStateUpdate", payload);
    }
  }

  private syncDirtyHands(room: Room, excludeIds: string[] = []) {
    if (!room.game) return;
    const exclude = new Set(excludeIds);
    const dirtyIds = room.game.consumePendingHandSyncs();

    for (const playerId of dirtyIds) {
      if (exclude.has(playerId)) continue;
      const hand = room.game.getHand(playerId);
      const roomPlayer = room.players.find((player) => player.id === playerId);
      if (roomPlayer?.socketId) {
        this.io.to(roomPlayer.socketId).emit("handUpdate", { cards: hand });
      }
      if (roomPlayer) {
        roomPlayer.hand = hand;
        roomPlayer.hasCalledUno = hand.length === 1;
      }
    }
  }

  private createPlayer(socket: UnoSocket, name: string): RoomPlayer {
    const playerId = nanoid(21);
    return {
      id: playerId,
      userId: socket.data.userId ?? null,
      name,
      socketId: socket.id,
      hand: [],
      hasCalledUno: false,
      connected: true,
      powerCards: [],
      powerPoints: 0,
      frozenForTurns: 0
    };
  }

  private getRoomForSocket(socket: UnoSocket) {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return null;
    return this.rooms.get(roomCode as RoomCode) ?? null;
  }

  private generateRoomCode(): RoomCode {
    let code: RoomCode;
    do {
      code = nanoid(6).toUpperCase();
    } while (this.rooms.has(code));
    return code;
  }

  private emitLobby(room: Room) {
    const lobby: LobbyState = {
      roomCode: room.code,
      hostId: room.hostId,
      status: room.status,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        isHost: player.id === room.hostId,
        cardCount: player.hand.length,
        hasCalledUno: player.hasCalledUno,
        powerCardCount: player.powerCards.length,
        powerPoints: player.powerPoints,
        frozenForTurns: player.frozenForTurns
      }))
    };

    this.io.to(room.code).emit("lobbyUpdate", lobby);
  }

  private emitError(socket: UnoSocket, message: string) {
    const payload: ErrorPayload = { message };
    socket.emit("error", payload);
  }
}
