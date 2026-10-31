ALTER TYPE "public"."import_job_kind" ADD VALUE 'embedding';--> statement-breakpoint
CREATE TABLE "reference_embeddings" (
	"reference_id" uuid PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reference_embeddings" ADD CONSTRAINT "reference_embeddings_reference_id_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE cascade ON UPDATE no action;