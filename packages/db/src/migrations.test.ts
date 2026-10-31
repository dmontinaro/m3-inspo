/**
 * Data-moving migrations, checked on a database of their own: migrated up to
 * the step before, filled with old-shaped rows, then migrated to the end.
 */

import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { expect, inject, it } from "vitest";
// Types for `inject("databaseUrl")`, declared next to the setup that provides it.
import type {} from "../test/global-setup";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

/** A copy of the migrations folder whose journal ends before migration `untilIdx`. */
async function migrationsBefore(untilIdx: number) {
  const folder = await mkdtemp(join(tmpdir(), "inspo-migrations-"));
  await cp(migrationsFolder, folder, { recursive: true });
  const journalPath = join(folder, "meta", "_journal.json");
  const journal: { entries: { idx: number }[] } = JSON.parse(await readFile(journalPath, "utf8"));
  journal.entries = journal.entries.filter((entry) => entry.idx < untilIdx);
  await writeFile(journalPath, JSON.stringify(journal));
  return folder;
}

it("0004 moves an existing project into the tags, searchable like the notes", async () => {
  const serverUrl = inject("databaseUrl").replace(/\/[^/]+$/, "");
  const databaseName = `inspo_migration_${process.pid}`;
  const admin = postgres(`${serverUrl}/postgres`, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${databaseName}`);
  const client = postgres(`${serverUrl}/${databaseName}`, { max: 1, onnotice: () => {} });
  const oldMigrations = await migrationsBefore(4);

  try {
    await migrate(drizzle(client), { migrationsFolder: oldMigrations });
    await client`
      insert into "references" (slug, title, source_kind, project)
      values ('with-project', 'A', 'image', '  Hai  Suite '), ('without', 'B', 'image', null), ('blank', 'C', 'image', ' ')
    `;

    await migrate(drizzle(client), { migrationsFolder });

    expect(await client`select slug, tags from "references" order by title`).toEqual([
      { slug: "with-project", tags: ["hai suite"] },
      { slug: "without", tags: [] },
      { slug: "blank", tags: [] },
    ]);
    const found = await client`select slug from "references" where search_document @@ to_tsquery('simple', 'suite:*')`;
    expect(found).toEqual([{ slug: "with-project" }]);
  } finally {
    await client.end();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await admin.end();
    await rm(oldMigrations, { recursive: true, force: true });
  }
});
