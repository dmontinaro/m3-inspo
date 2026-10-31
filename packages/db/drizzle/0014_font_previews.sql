ALTER TYPE "public"."import_job_kind" ADD VALUE 'font_preview';--> statement-breakpoint
CREATE TABLE "font_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"job_id" uuid,
	"image_key" text,
	"image_width" integer,
	"image_height" integer,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "font_previews_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "font_previews" ADD CONSTRAINT "font_previews_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;