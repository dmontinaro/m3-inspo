CREATE TYPE "public"."capture_kind" AS ENUM('hero', 'full', 'original');--> statement-breakpoint
CREATE TYPE "public"."capture_viewport" AS ENUM('desktop', 'mobile', 'upload');--> statement-breakpoint
CREATE TYPE "public"."reference_curation_status" AS ENUM('draft', 'approved', 'archived');--> statement-breakpoint
CREATE TYPE "public"."reference_source_kind" AS ENUM('url', 'image');--> statement-breakpoint
CREATE TABLE "reference_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_id" uuid NOT NULL,
	"viewport" "capture_viewport" NOT NULL,
	"kind" "capture_kind" NOT NULL,
	"asset_key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"variants" jsonb NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"source_kind" "reference_source_kind" NOT NULL,
	"source_url" text,
	"site_host" text,
	"attribution" text,
	"curation_status" "reference_curation_status" DEFAULT 'draft' NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"take_note" text,
	"avoid_note" text,
	"focus" text,
	"project" text,
	"search_document" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(take_note, '') || ' ' || coalesce(avoid_note, '') || ' ' || coalesce(focus, '') || ' ' || coalesce(project, '')), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "references_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "reference_captures" ADD CONSTRAINT "reference_captures_reference_id_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reference_captures_reference_idx" ON "reference_captures" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "references_search_idx" ON "references" USING gin ("search_document");--> statement-breakpoint
CREATE INDEX "references_created_idx" ON "references" USING btree ("created_at");