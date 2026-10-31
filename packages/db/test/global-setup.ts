/**
 * Vitest global setup: creates a fresh test database on the local Postgres
 * (compose.yaml, port 54330), runs the committed migrations against it and
 * drops it again after the run. Each run gets its own database, so parallel
 * runs from other worktrees do not interfere.
 *
 * Tests read the URL with `inject("databaseUrl")`.
 */

import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const serverUrl = process.env.TEST_DATABASE_SERVER_URL ?? "postgres://postgres:postgres@localhost:54330";
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export default async function setup(project: TestProject) {
  const databaseName = `inspo_test_${process.pid}`;
  const admin = postgres(`${serverUrl}/postgres`, { max: 1, onnotice: () => {} });

  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${databaseName}`);
  } catch (error) {
    await admin.end();
    throw new Error(
      `Test Postgres at ${serverUrl} is not reachable. Start it with \`docker compose up -d\`.`,
      { cause: error },
    );
  }

  const databaseUrl = `${serverUrl}/${databaseName}`;
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder });
  await client.end();

  project.provide("databaseUrl", databaseUrl);

  return async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await admin.end();
  };
}
