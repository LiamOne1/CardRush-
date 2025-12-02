import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Kysely, sql } from "kysely";
import { nanoid } from "nanoid";
import type { Database } from "../db/types.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  stats: {
    wins: number;
    losses: number;
    gamesPlayed: number;
  };
}

interface RegistrationPayload {
  email: string;
  password: string;
  displayName: string;
}

interface LoginPayload {
  email: string;
  password: string;
}

interface GameOutcome {
  userId: string;
  didWin: boolean;
}

export class AuthService {
  constructor(private readonly db: Kysely<Database>, private readonly jwtSecret: string) {}

  async registerUser(payload: RegistrationPayload): Promise<AuthenticatedUser> {
    const email = payload.email.trim().toLowerCase();
    const displayName = payload.displayName.trim();
    if (displayName.length === 0) {
      throw new Error("Display name is required");
    }
    if (displayName.length > 20) {
      throw new Error("Display name must be 20 characters or fewer");
    }
    const existing = await this.db
      .selectFrom("users")
      .select("id")
      .where("email", "=", email)
      .executeTakeFirst();

    if (existing) {
      throw new Error("Email already in use");
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const userId = nanoid(21);

    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("users")
        .values({
          id: userId,
          email,
          password_hash: passwordHash,
          display_name: displayName
        })
        .executeTakeFirst();

      await trx
        .insertInto("user_stats")
        .values({
          user_id: userId,
          wins: 0,
          losses: 0,
          games_played: 0,
          updated_at: new Date().toISOString()
        })
        .executeTakeFirst();
    });

    return this.getProfile(userId);
  }

  async authenticateUser(payload: LoginPayload): Promise<AuthenticatedUser | null> {
    const email = payload.email.trim().toLowerCase();
    const user = await this.db
      .selectFrom("users")
      .select(["id", "password_hash"])
      .where("email", "=", email)
      .executeTakeFirst();

    if (!user) {
      return null;
    }

    const isValid = await bcrypt.compare(payload.password, user.password_hash);
    if (!isValid) {
      return null;
    }

    return this.getProfile(user.id);
  }

  issueToken(userId: string) {
    return jwt.sign({ sub: userId }, this.jwtSecret, { expiresIn: "30d" });
  }

  verifyToken(token: string): string | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { sub: string };
      return decoded.sub ?? null;
    } catch {
      return null;
    }
  }

  async getProfile(userId: string): Promise<AuthenticatedUser> {
    const row = await this.db
      .selectFrom("users")
      .leftJoin("user_stats", "user_stats.user_id", "users.id")
      .select([
        "users.id as id",
        "users.email as email",
        "users.display_name as displayName",
        "users.created_at as createdAt",
        "user_stats.wins as wins",
        "user_stats.losses as losses",
        "user_stats.games_played as gamesPlayed"
      ])
      .where("users.id", "=", userId)
      .executeTakeFirst();

    if (!row) {
      throw new Error("User not found");
    }

    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      stats: {
        wins: row.wins ?? 0,
        losses: row.losses ?? 0,
        gamesPlayed: row.gamesPlayed ?? 0
      }
    };
  }

  async recordGameOutcome(outcomes: GameOutcome[]) {
    if (outcomes.length === 0) {
      return;
    }

    await this.db.transaction().execute(async (trx) => {
      for (const outcome of outcomes) {
        const winsIncrement = outcome.didWin ? 1 : 0;
        const lossesIncrement = outcome.didWin ? 0 : 1;

        await trx
          .insertInto("user_stats")
          .values({
            user_id: outcome.userId,
            wins: winsIncrement,
            losses: lossesIncrement,
            games_played: 1,
            updated_at: new Date().toISOString()
          })
          .onConflict((oc) =>
            oc.column("user_id").doUpdateSet((eb) => ({
              wins: sql`${eb.ref("user_stats.wins")} + ${winsIncrement}`,
              losses: sql`${eb.ref("user_stats.losses")} + ${lossesIncrement}`,
              games_played: sql`${eb.ref("user_stats.games_played")} + 1`,
              updated_at: sql`CURRENT_TIMESTAMP`
            }))
          )
          .executeTakeFirst();
      }
    });
  }
}
