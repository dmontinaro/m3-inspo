ALTER TABLE "reference_analyses" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "reference_analyses" ADD COLUMN "tags" jsonb;--> statement-breakpoint
ALTER TABLE "reference_analyses" ADD COLUMN "macrostructure" text;--> statement-breakpoint
ALTER TABLE "reference_analyses" ADD COLUMN "description" jsonb;--> statement-breakpoint
ALTER TABLE "reference_analyses" ADD COLUMN "layout_summary" jsonb;