CREATE TYPE "public"."analysis_mode" AS ENUM('light', 'dark');--> statement-breakpoint
CREATE TABLE "reference_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"tokens" jsonb NOT NULL,
	"tech" text[] DEFAULT '{}' NOT NULL,
	"mode" "analysis_mode",
	"page_title" text,
	"generated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reference_analyses" ADD CONSTRAINT "reference_analyses_reference_id_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reference_analyses_version_idx" ON "reference_analyses" USING btree ("reference_id","version");