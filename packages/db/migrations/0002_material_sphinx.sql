CREATE TABLE "document_embedding_chunks" (
	"namespace" text NOT NULL,
	"document_id" text NOT NULL,
	"source_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"text" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	CONSTRAINT "document_embedding_chunks_namespace_document_id_source_id_profile_id_chunk_index_pk" PRIMARY KEY("namespace","document_id","source_id","profile_id","chunk_index"),
	CONSTRAINT "embedding_chunk_offsets" CHECK ("document_embedding_chunks"."chunk_index" >= 0 AND "document_embedding_chunks"."start_offset" >= 0 AND "document_embedding_chunks"."end_offset" > "document_embedding_chunks"."start_offset" AND length("document_embedding_chunks"."text") > 0)
);
--> statement-breakpoint
CREATE TABLE "document_embeddings" (
	"namespace" text NOT NULL,
	"document_id" text NOT NULL,
	"source_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"chunk_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_embeddings_namespace_document_id_source_id_profile_id_pk" PRIMARY KEY("namespace","document_id","source_id","profile_id"),
	CONSTRAINT "embedding_chunk_count" CHECK ("document_embeddings"."chunk_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "embedding_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"chunker" text NOT NULL,
	CONSTRAINT "embedding_profile_dimensions" CHECK ("embedding_profiles"."dimensions" = 1536)
);
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "document_kind_scope";--> statement-breakpoint
ALTER TABLE "document_embedding_chunks" ADD CONSTRAINT "embedding_chunk_generation_fk" FOREIGN KEY ("namespace","document_id","source_id","profile_id") REFERENCES "public"."document_embeddings"("namespace","document_id","source_id","profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_profile_id_embedding_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."embedding_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "document_source_identity" UNIQUE("namespace","id","source_id");--> statement-breakpoint
ALTER TABLE "document_embeddings" ADD CONSTRAINT "embedding_document_version_fk" FOREIGN KEY ("namespace","document_id","source_id") REFERENCES "public"."documents"("namespace","id","source_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "document_kind_scope" CHECK (("documents"."kind" IN ('manual','sop') AND "documents"."asset_id" IS NULL) OR ("documents"."kind" = 'maintenance_report' AND "documents"."asset_id" IS NOT NULL) OR "documents"."kind" = 'reference');