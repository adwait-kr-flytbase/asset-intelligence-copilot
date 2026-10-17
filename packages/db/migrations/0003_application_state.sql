CREATE TABLE "application_conversations" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_conversations_namespace_id_pk" PRIMARY KEY("namespace","id"),
	CONSTRAINT "app_conversation_owner" UNIQUE("namespace","id","owner_id"),
	CONSTRAINT "app_conversation_revision" CHECK ("application_conversations"."revision">=0)
);
--> statement-breakpoint
CREATE TABLE "application_messages" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"owner_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"run_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"role" text NOT NULL,
	"message" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_messages_namespace_id_pk" PRIMARY KEY("namespace","id"),
	CONSTRAINT "app_message_order" UNIQUE("namespace","conversation_id","sequence"),
	CONSTRAINT "app_message_role" CHECK ("application_messages"."role" IN ('user','assistant')),
	CONSTRAINT "app_message_sequence" CHECK ("application_messages"."sequence">=0)
);
--> statement-breakpoint
CREATE TABLE "application_results" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"owner_id" text NOT NULL,
	"run_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_results_namespace_id_pk" PRIMARY KEY("namespace","id"),
	CONSTRAINT "app_result_run" UNIQUE("namespace","run_id")
);
--> statement-breakpoint
CREATE TABLE "application_runs" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"owner_id" text NOT NULL,
	"conversation_id" text,
	"view_id" text,
	"view_revision" integer,
	"request_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"error_code" text,
	"cancel_requested_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_runs_namespace_id_pk" PRIMARY KEY("namespace","id"),
	CONSTRAINT "app_run_owner" UNIQUE("namespace","id","owner_id"),
	CONSTRAINT "app_run_conversation_identity" UNIQUE("namespace","id","owner_id","conversation_id"),
	CONSTRAINT "app_run_request" UNIQUE("namespace","owner_id","request_id"),
	CONSTRAINT "app_run_status" CHECK ("application_runs"."status" IN ('running','completed','failed','cancelled','interrupted')),
	CONSTRAINT "app_run_kind" CHECK ("application_runs"."kind" IN ('chat','read','saved-view')),
	CONSTRAINT "app_run_chat_scope" CHECK (("application_runs"."kind"='chat' AND "application_runs"."conversation_id" IS NOT NULL) OR ("application_runs"."kind"<>'chat' AND "application_runs"."conversation_id" IS NULL)),
	CONSTRAINT "app_run_saved_scope" CHECK (("application_runs"."kind"='saved-view' AND "application_runs"."view_id" IS NOT NULL) OR ("application_runs"."kind"<>'saved-view' AND "application_runs"."view_id" IS NULL)),
	CONSTRAINT "app_run_view_pair" CHECK (("application_runs"."view_id" IS NULL AND "application_runs"."view_revision" IS NULL) OR ("application_runs"."view_id" IS NOT NULL AND "application_runs"."view_revision" IS NOT NULL AND "application_runs"."view_revision">0))
);
--> statement-breakpoint
CREATE TABLE "application_saved_views" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"revision" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_saved_views_namespace_id_pk" PRIMARY KEY("namespace","id"),
	CONSTRAINT "app_view_owner" UNIQUE("namespace","id","owner_id"),
	CONSTRAINT "app_view_revision" CHECK ("application_saved_views"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "application_view_revisions" (
	"namespace" text NOT NULL,
	"view_id" text NOT NULL,
	"revision" integer NOT NULL,
	"owner_id" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_view_revisions_namespace_view_id_revision_pk" PRIMARY KEY("namespace","view_id","revision"),
	CONSTRAINT "app_view_revision_owner" UNIQUE("namespace","view_id","revision","owner_id"),
	CONSTRAINT "app_view_history_revision" CHECK ("application_view_revisions"."revision">0)
);
--> statement-breakpoint
ALTER TABLE "application_conversations" ADD CONSTRAINT "application_conversations_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_conversations" ADD CONSTRAINT "app_conversation_actor_fk" FOREIGN KEY ("namespace","owner_id") REFERENCES "public"."users"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_messages" ADD CONSTRAINT "application_messages_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_messages" ADD CONSTRAINT "app_message_conversation_fk" FOREIGN KEY ("namespace","conversation_id","owner_id") REFERENCES "public"."application_conversations"("namespace","id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_messages" ADD CONSTRAINT "app_message_run_fk" FOREIGN KEY ("namespace","run_id","owner_id","conversation_id") REFERENCES "public"."application_runs"("namespace","id","owner_id","conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_results" ADD CONSTRAINT "application_results_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_results" ADD CONSTRAINT "app_result_run_fk" FOREIGN KEY ("namespace","run_id","owner_id") REFERENCES "public"."application_runs"("namespace","id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_runs" ADD CONSTRAINT "application_runs_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_runs" ADD CONSTRAINT "app_run_actor_fk" FOREIGN KEY ("namespace","owner_id") REFERENCES "public"."users"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_runs" ADD CONSTRAINT "app_run_conversation_fk" FOREIGN KEY ("namespace","conversation_id","owner_id") REFERENCES "public"."application_conversations"("namespace","id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_runs" ADD CONSTRAINT "app_run_view_revision_fk" FOREIGN KEY ("namespace","view_id","view_revision","owner_id") REFERENCES "public"."application_view_revisions"("namespace","view_id","revision","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_saved_views" ADD CONSTRAINT "application_saved_views_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_saved_views" ADD CONSTRAINT "app_view_actor_fk" FOREIGN KEY ("namespace","owner_id") REFERENCES "public"."users"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_view_revisions" ADD CONSTRAINT "app_view_revision_fk" FOREIGN KEY ("namespace","view_id","owner_id") REFERENCES "public"."application_saved_views"("namespace","id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_conversation_list" ON "application_conversations" USING btree ("namespace","owner_id","created_at","id");--> statement-breakpoint
CREATE INDEX "app_result_list" ON "application_results" USING btree ("namespace","owner_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_one_running_turn" ON "application_runs" USING btree ("namespace","conversation_id") WHERE "application_runs"."status"='running' AND "application_runs"."conversation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "app_view_list" ON "application_saved_views" USING btree ("namespace","owner_id","created_at","id");