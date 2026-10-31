CREATE TYPE "public"."type_pairing_origin" AS ENUM('manual', 'reference', 'brand_kit');--> statement-breakpoint
CREATE TABLE "type_pairings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"roles" jsonb NOT NULL,
	"note" text,
	"origin_kind" "type_pairing_origin" DEFAULT 'manual' NOT NULL,
	"origin_reference_id" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "type_pairings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "type_pairings" ADD CONSTRAINT "type_pairings_origin_reference_id_references_id_fk" FOREIGN KEY ("origin_reference_id") REFERENCES "public"."references"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "type_pairings_created_idx" ON "type_pairings" USING btree ("created_at");