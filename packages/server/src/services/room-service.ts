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
  ServerToClientEvents
} from "@code-card/shared";
import { UnoGame } from "../game/state.js";

interface RoomPlayer {
  id: string;
  name: string;
  socketId: string;
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

const MAX_PLAYERS = 4;
const MIN_PLAYERS_TO_START = 2;

export class RoomService {
  private rooms = new Map<RoomCode, Room>();

  constructor(private readonly io: Server<ClientToServerEvents, ServerToClientEvents>) {}

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

    const player = this.createPlayer(socket, name);
    room.players.push(player);

    socket.data.playerId = player.id;
    socket.data.roomCode = room.code;
    socket.data.name = name;
    await socket.join(room.code);

    this.emitLobby(room);
    callback(true);
  }

  handleStart(socket: UnoSocket) {
    const room = this.getRoomForSocket(socket);
    if (!room) return;

    if (room.hostId !== socket.id) {
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
        connected: true
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
      this.io.to(player.socketId).emit("gameStarted", publicState, { cards: hand });
      this.syncPowerState(room, player.id);
    }

    this.emitLobby(room);
    this.broadcastState(room);
  }

  handlePlayCard(socket: UnoSocket, payload: PlayCardPayload) {
    const room = this.getRoomForSocket(socket);
    if (!room || !room.game) return;

    try {
      const result = room.game.playCard(socket.id, payload.cardId, payload.chosenColor);
      const hand = room.game.getHand(socket.id);
      this.io.to(socket.id).emit("handUpdate", { cards: hand });

      const roomPlayer = room.players.find((p) => p.id === socket.id);
      if (roomPlayer) {
        roomPlayer.hand = hand;
        roomPlayer.hasCalledUno = hand.length === 1;
      }

      this.syncPowerState(room, socket.id);

      if (roomPlayer && hand.length === 1) {
        const payload: RushAlertPayload = { playerId: roomPlayer.id, playerName: roomPlayer.name };
        socket.broadcast.to(room.code).emit("rushAlert", payload);
      }

      this.syncDirtyHands(room, [socket.id]);

      if (result.winnerId) {
        this.finishGame(room);
      } else {
        this.broadcastState(room);
      }
    } catch (error) {
      this.emitError(socket, error instanceof Error ? error.message : "Unable to play card");
    }
  }

  handleDrawCard(socket: UnoSocket) {
    const room = this.getRoomForSocket(socket);
    if (!room || !room.game) return;

    try {
      room.game.draw(socket.id);
      const hand = room.game.getHand(socket.id);
      this.io.to(socket.id).emit("handUpdate", { cards: hand });

      const roomPlayer = room.players.find((p) => p.id === socket.id);
      if (roomPlayer) {
        roomPlayer.hand = hand;
        roomPlayer.hasCalledUno = false;
      }

      this.syncDirtyHands(room, [socket.id]);
      this.broadcastState(room);
    } catch (error) {
      this.emitError(socket, error instanceof Error ? error.message : "Unable to draw card");
    }
  }

  handleDrawPowerCard(socket: UnoSocket) {
    const room = this.getRoomForSocket(socket);
    if (!room || !room.game) return;

    try {
      room.game.drawPowerCard(socket.id);
      this.syncPowerState(room, socket.id);
      this.syncDirtyHands(room, [socket.id]);
      this.broadcastState(room);
    } catch (error) {
      this.emitError(socket, error instanceof Error ? error.message : "Unable to draw a power card");
    }
  }

  handlePlayPowerCard(socket: UnoSocket, payload: PlayPowerCardPayload) {
    const room = this.getRoomForSocket(socket);
    if (!room || !room.game) return;

    try {
      const result = room.game.playPowerCard(socket.id, payload);

      const actorHand = room.game.getHand(socket.id);
      this.io.to(socket.id).emit("handUpdate", { cards: actorHand });

      const roomPlayer = room.players.find((p) => p.id === socket.id);
      if (roomPlayer) {
        roomPlayer.hand = actorHand;
        roomPlayer.hasCalledUno = actorHand.length === 1;
      }

      this.syncPowerState(room, socket.id);

      const affectedIds = new Set(result.affectedPlayerIds);
      for (const playerId of affectedIds) {
        const hand = room.game.getHand(playerId);
        this.io.to(playerId).emit("handUpdate", { cards: hand });

        const affectedPlayer = room.players.find((p) => p.id === playerId);
        if (affectedPlayer) {
          affectedPlayer.hand = hand;
          affectedPlayer.hasCalledUno = hand.length === 1;
        }
      }

      this.syncDirtyHands(room, [socket.id, ...affectedIds]);

      const rushCandidates = new Set<string>();
      if (roomPlayer && roomPlayer.hand.length === 1) {
        rushCandidates.add(roomPlayer.id);
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

  leaveRoom(socket: UnoSocket) {
    const room = this.getRoomForSocket(socket);
    if (!room) {
      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;
      return;
    }

    room.players = room.players.filter((player) => player.id !== socket.id);
    socket.leave(room.code);

    if (room.players.length === 0) {
      this.rooms.delete(room.code);
    } else {
      if (room.hostId === socket.id) {
        room.hostId = room.players[0].id;
      }
      room.status = "waiting";
      room.game = undefined;
      for (const player of room.players) {
        player.hand = [];
        player.hasCalledUno = false;
        player.powerCards = [];
        player.powerPoints = 0;
        player.frozenForTurns = 0;
        this.io.to(player.id).emit("powerStateUpdate", { points: 0, cards: [], requiredDraws: 0 });
      }
      this.emitLobby(room);
    }

    socket.data.roomCode = undefined;
    socket.data.playerId = undefined;
  }

  handleDisconnect(socket: UnoSocket) {
    this.leaveRoom(socket);
  }

  private finishGame(room: Room) {
    const payload = room.game?.getWinnerPayload();
    if (payload) {
      this.io.to(room.code).emit("gameEnded", payload);
    }
    room.status = "waiting";
    room.game = undefined;
    for (const player of room.players) {
      player.hand = [];
      player.hasCalledUno = false;
      player.powerCards = [];
      player.powerPoints = 0;
      player.frozenForTurns = 0;
      this.io.to(player.id).emit("powerStateUpdate", { points: 0, cards: [], requiredDraws: 0 });
    }
    this.emitLobby(room);
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
    this.io.to(playerId).emit("powerStateUpdate", payload);
  }

  private syncDirtyHands(room: Room, excludeIds: string[] = []) {
    if (!room.game) return;
    const exclude = new Set(excludeIds);
    const dirtyIds = room.game.consumePendingHandSyncs();

    for (const playerId of dirtyIds) {
      if (exclude.has(playerId)) continue;
      const hand = room.game.getHand(playerId);
      this.io.to(playerId).emit("handUpdate", { cards: hand });

      const roomPlayer = room.players.find((player) => player.id === playerId);
      if (roomPlayer) {
        roomPlayer.hand = hand;
        roomPlayer.hasCalledUno = hand.length === 1;
      }
    }
  }

  private createPlayer(socket: UnoSocket, name: string): RoomPlayer {
    return {
      id: socket.id,
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
