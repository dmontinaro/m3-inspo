CREATE TYPE "public"."reference_device" AS ENUM('desktop', 'mobile');--> statement-breakpoint
ALTER TABLE "references" ADD COLUMN "device" "reference_device" DEFAULT 'desktop' NOT NULL;--> statement-breakpoint
-- Uploads in a phone screen's proportions become mobile, by the same rule as new
-- uploads (`deviceOfImage` in apps/web/src/lib/curation.ts).
UPDATE "references" SET "device" = 'mobile'
WHERE "source_kind" = 'image' AND EXISTS (
  SELECT 1 FROM "reference_captures" c
  WHERE c."reference_id" = "references"."id" AND c."viewport" = 'upload'
    AND c."width" <= 1320 AND c."height" BETWEEN c."width" * 1.6 AND c."width" * 2.4
);
