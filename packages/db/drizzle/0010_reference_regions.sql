CREATE TABLE "reference_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_id" uuid NOT NULL,
	"capture_id" uuid NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"component_type" text NOT NULL,
	"note" text,
	"crop_key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reference_regions" ADD CONSTRAINT "reference_regions_reference_id_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_regions" ADD CONSTRAINT "reference_regions_capture_id_reference_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."reference_captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reference_regions_reference_idx" ON "reference_regions" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "reference_regions_capture_idx" ON "reference_regions" USING btree ("capture_id");