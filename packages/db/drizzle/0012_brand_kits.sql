CREATE TYPE "public"."brand_kit_status" AS ENUM('draft', 'approved', 'archived');--> statement-breakpoint
CREATE TABLE "brand_kit_references" (
	"brand_kit_id" uuid NOT NULL,
	"reference_id" uuid NOT NULL,
	CONSTRAINT "brand_kit_references_brand_kit_id_reference_id_pk" PRIMARY KEY("brand_kit_id","reference_id")
);
--> statement-breakpoint
CREATE TABLE "brand_kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"project" text,
	"status" "brand_kit_status" DEFAULT 'draft' NOT NULL,
	"color_scheme" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_kits_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "brand_kit_references" ADD CONSTRAINT "brand_kit_references_brand_kit_id_brand_kits_id_fk" FOREIGN KEY ("brand_kit_id") REFERENCES "public"."brand_kits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kit_references" ADD CONSTRAINT "brand_kit_references_reference_id_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_kit_references_reference_idx" ON "brand_kit_references" USING btree ("reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_kits_approved_project_idx" ON "brand_kits" USING btree ("project") WHERE "brand_kits"."status" = 'approved' and "brand_kits"."project" is not null;