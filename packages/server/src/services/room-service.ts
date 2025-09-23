import { nanoid } from "nanoid";
import type { Server, Socket } from "socket.io";
import type {
  Card,
  ClientToServerEvents,
  ErrorPayload,
  LobbyState,
  PlayCardPayload,
  RoomCode,
  RushAlertPayload,
  ServerToClientEvents
} from "@codex-card/shared";
import { UnoGame } from "../game/state.js";

interface RoomPlayer {
  id: string;
  name: string;
  socketId: string;
  hand: Card[];
  hasCalledUno: boolean;
  connected: boolean;
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
      this.io.to(player.socketId).emit("gameStarted", publicState, { cards: hand });
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

      if (roomPlayer && hand.length === 1) {
        const payload: RushAlertPayload = { playerId: roomPlayer.id, playerName: roomPlayer.name };
        socket.broadcast.to(room.code).emit("rushAlert", payload);
      }

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

      this.broadcastState(room);
    } catch (error) {
      this.emitError(socket, error instanceof Error ? error.message : "Unable to draw card");
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
    }
    this.emitLobby(room);
  }

  private broadcastState(room: Room) {
    if (!room.game) return;
    const state = room.game.getPublicState(room.hostId);
    this.io.to(room.code).emit("stateUpdate", state);
  }

  private createPlayer(socket: UnoSocket, name: string): RoomPlayer {
    return {
      id: socket.id,
      name,
      socketId: socket.id,
      hand: [],
      hasCalledUno: false,
      connected: true
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
        hasCalledUno: player.hasCalledUno
      }))
    };

    this.io.to(room.code).emit("lobbyUpdate", lobby);
  }

  private emitError(socket: UnoSocket, message: string) {
    const payload: ErrorPayload = { message };
    socket.emit("error", payload);
  }
}
