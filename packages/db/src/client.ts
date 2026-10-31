/**
 * Postgres client (postgres-js + Drizzle). Used by the web app for reads
 * and writes. The capture worker never connects directly; it talks to the
 * web app's worker API instead.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export type Database = ReturnType<typeof getDb>;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  _db = drizzle(postgres(url), { schema });
  return _db;
}

export { schema };
