import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../services/auth-service.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(2).max(50)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const extractToken = (header?: string) => {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
};

export const createAuthRouter = (authService: AuthService) => {
  const router = Router();

  router.post("/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid registration payload" });
    }

    try {
      const user = await authService.registerUser(parsed.data);
      const token = authService.issueToken(user.id);
      res.json({ token, user });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to register";
      const status = message.includes("Email already in use") ? 409 : 500;
      res.status(status).json({ error: message });
    }
  });

  router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid login payload" });
    }

    try {
      const user = await authService.authenticateUser(parsed.data);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const token = authService.issueToken(user.id);
      res.json({ token, user });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to login";
      res.status(500).json({ error: message });
    }
  });

  router.get("/me", async (req, res) => {
    const token = extractToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: "Missing token" });
    }
    const userId = authService.verifyToken(token);
    if (!userId) {
      return res.status(401).json({ error: "Invalid token" });
    }

    try {
      const user = await authService.getProfile(userId);
      res.json({ user });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to fetch profile";
      res.status(404).json({ error: message });
    }
  });

  return router;
};
