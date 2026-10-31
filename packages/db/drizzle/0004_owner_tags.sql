-- Owner tags replace the single `project` field: a project is now a tag. Existing projects move into `tags`.
-- Generated columns need immutable functions; `array_to_string` is only stable, though it never changes for text[].
CREATE FUNCTION "tags_to_text"(text[]) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT array_to_string($1, ' ') $$;--> statement-breakpoint
ALTER TABLE "references" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE "references" SET "tags" = ARRAY[left(regexp_replace(lower(btrim("project")), '\s+', ' ', 'g'), 40)] WHERE btrim(coalesce("project", '')) <> '';--> statement-breakpoint
ALTER TABLE "references" DROP COLUMN "search_document";--> statement-breakpoint
ALTER TABLE "references" DROP COLUMN "project";--> statement-breakpoint
ALTER TABLE "references" ADD COLUMN "search_document" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(take_note, '') || ' ' || coalesce(avoid_note, '') || ' ' || coalesce(focus, '') || ' ' || tags_to_text(tags)), 'B')) STORED;--> statement-breakpoint
CREATE INDEX "references_search_idx" ON "references" USING gin ("search_document");
