import cors from "cors";
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData
} from "@codex-card/shared";
import { registerSocketHandlers } from "./socket/handlers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

const staticDir = path.resolve(__dirname, "../../client/dist");
app.use(express.static(staticDir));
app.get("*", (_req, res, next) => {
  if (res.headersSent) return next();
  res.sendFile(path.join(staticDir, "index.html"), (error) => {
    if (error) {
      next();
    }
  });
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: {
    origin: "*"
  }
});

registerSocketHandlers(io);

const PORT = Number(process.env.PORT ?? 4000);

httpServer.listen(PORT, () => {
  console.log(`UNO server listening on port ${PORT}`);
});
