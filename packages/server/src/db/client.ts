import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import DatabaseConstructor from "better-sqlite3";
import { Kysely, sql } from "kysely";
import { PostgresDialect } from "kysely";
import { SqliteDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveSqlitePath = () => {
  const customPath = process.env.SQLITE_PATH;
  if (customPath) {
    return customPath;
  }
  return path.resolve(__dirname, "../../data/card-rush.db");
};

export const createDatabase = () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl:
        databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
          ? undefined
          : { rejectUnauthorized: false }
    });
    return new Kysely<Database>({
      dialect: new PostgresDialect({ pool })
    });
  }

  const sqlitePath = resolveSqlitePath();
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const sqliteDb = new DatabaseConstructor(sqlitePath);

  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqliteDb })
  });
};

export const initializeSchema = async (db: Kysely<Database>) => {
  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("id", "varchar(36)", (col) => col.primaryKey())
    .addColumn("email", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("password_hash", "varchar(255)", (col) => col.notNull())
    .addColumn("display_name", "varchar(120)", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createIndex("users_email_idx")
    .ifNotExists()
    .on("users")
    .column("email")
    .unique()
    .execute();

  await db.schema
    .createTable("user_stats")
    .ifNotExists()
    .addColumn("user_id", "varchar(36)", (col) => col.primaryKey().references("users.id").onDelete("cascade"))
    .addColumn("wins", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("losses", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("games_played", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
};
