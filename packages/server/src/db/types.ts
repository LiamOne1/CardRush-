import type { ColumnType } from "kysely";

export interface UsersTable {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface UserStatsTable {
  user_id: string;
  wins: number;
  losses: number;
  games_played: number;
  updated_at: ColumnType<Date, string | undefined, never>;
}

export interface Database {
  users: UsersTable;
  user_stats: UserStatsTable;
}
