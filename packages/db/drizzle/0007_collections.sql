CREATE TABLE "collection_references" (
	"collection_id" uuid NOT NULL,
	"reference_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "collection_references_collection_id_reference_id_pk" PRIMARY KEY("collection_id","reference_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"project" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "collection_references" ADD CONSTRAINT "collection_references_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_references" ADD CONSTRAINT "collection_references_reference_id_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_references_reference_idx" ON "collection_references" USING btree ("reference_id");