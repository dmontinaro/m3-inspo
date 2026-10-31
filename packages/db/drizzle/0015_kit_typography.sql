ALTER TABLE "brand_kits" ADD COLUMN "typography" jsonb;--> statement-breakpoint
ALTER TABLE "type_pairings" ADD COLUMN "origin_brand_kit_id" uuid;--> statement-breakpoint
ALTER TABLE "type_pairings" ADD CONSTRAINT "type_pairings_origin_brand_kit_id_brand_kits_id_fk" FOREIGN KEY ("origin_brand_kit_id") REFERENCES "public"."brand_kits"("id") ON DELETE set null ON UPDATE no action;