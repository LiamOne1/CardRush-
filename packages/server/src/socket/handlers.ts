import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData
} from "@code-card/shared";
import { AuthService } from "../services/auth-service.js";
import { RoomService } from "../services/room-service.js";

type UnoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export const registerSocketHandlers = (io: UnoServer, authService: AuthService) => {
  const roomService = new RoomService(io, authService);

  io.on("connection", (socket) => {
    console.log(`socket connected: ${socket.id}`);

    const authToken = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : null;
    if (authToken) {
      const userId = authService.verifyToken(authToken);
      if (userId) {
        socket.data.userId = userId;
        roomService.updatePlayerAccount(socket, userId);
      }
    }

    socket.on("updateAuth", (payload) => {
      const token = payload?.token ?? null;
      if (!token) {
        socket.data.userId = undefined;
        roomService.updatePlayerAccount(socket, null);
        return;
      }
      const userId = authService.verifyToken(token);
      if (!userId) {
        socket.emit("error", { message: "Invalid authentication token" });
        return;
      }
      socket.data.userId = userId;
      roomService.updatePlayerAccount(socket, userId);
    });

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

    socket.on("drawPowerCard", () => {
      roomService.handleDrawPowerCard(socket);
    });

    socket.on("playPowerCard", (payload) => {
      roomService.handlePlayPowerCard(socket, payload);
    });

    socket.on("sendEmote", (emote) => {
      roomService.handleSendEmote(socket, emote);
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
