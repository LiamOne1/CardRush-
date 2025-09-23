import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData
} from "@codex-card/shared";
import { RoomService } from "../services/room-service.js";

type UnoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export const registerSocketHandlers = (io: UnoServer) => {
  const roomService = new RoomService(io);

  io.on("connection", (socket) => {
    console.log(`socket connected: ${socket.id}`);

    socket.on("createRoom", async (name, callback) => {
      await roomService.handleCreateRoom(socket, name, callback);
    });

    socket.on("joinRoom", async (payload, callback) => {
      await roomService.handleJoinRoom(socket, payload, callback);
    });

    socket.on("startGame", () => {
      roomService.handleStart(socket);
    });

    socket.on("playCard", (payload) => {
      roomService.handlePlayCard(socket, payload);
    });

    socket.on("drawCard", () => {
      roomService.handleDrawCard(socket);
    });

    socket.on("leaveRoom", () => {
      roomService.leaveRoom(socket);
    });

    socket.on("disconnect", (reason) => {
      console.log(`socket disconnected: ${socket.id} (${reason})`);
      roomService.handleDisconnect(socket);
    });
  });
};
