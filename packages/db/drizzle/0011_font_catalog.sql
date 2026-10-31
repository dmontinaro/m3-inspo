CREATE TYPE "public"."font_category" AS ENUM('serif', 'sans', 'mono', 'display', 'handwriting');--> statement-breakpoint
CREATE TABLE "font_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"family" text NOT NULL,
	"category" "font_category" NOT NULL,
	"weights" integer[] NOT NULL,
	"styles" text[] NOT NULL,
	"variable" boolean NOT NULL,
	"license" text NOT NULL,
	"google" boolean NOT NULL,
	"last_modified" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "font_catalog_family_idx" ON "font_catalog" USING btree (lower("family"));