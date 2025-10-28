import cors from "cors";
import dotenv from "dotenv";
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
} from "@code-card/shared";
import { createDatabase, initializeSchema } from "./db/client.js";
import { createAuthRouter } from "./routes/auth.js";
import { registerSocketHandlers } from "./socket/handlers.js";
import { AuthService } from "./services/auth-service.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const start = async () => {
  const db = createDatabase();
  await initializeSchema(db);

  const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-me";
  if (!process.env.JWT_SECRET) {
    console.warn("[auth] JWT_SECRET not set, using a development fallback. Set JWT_SECRET in production.");
  }

  const authService = new AuthService(db, jwtSecret);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api/auth", createAuthRouter(authService));

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

  registerSocketHandlers(io, authService);

  const PORT = Number(process.env.PORT ?? 4000);

  httpServer.listen(PORT, () => {
    console.log(`UNO server listening on port ${PORT}`);
  });
};

start().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
