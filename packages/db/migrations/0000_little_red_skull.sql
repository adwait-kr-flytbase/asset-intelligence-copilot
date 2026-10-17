CREATE TABLE "assets" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_path" text NOT NULL,
	"source_line" integer,
	"source_pointer" text,
	"raw" jsonb NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"well_type" text NOT NULL,
	"area_id" text NOT NULL,
	"team_id" text NOT NULL,
	"in_charge_user_id" text NOT NULL,
	"lat" numeric NOT NULL,
	"lon" numeric NOT NULL,
	"installed_on" date NOT NULL,
	"recorded_status" text NOT NULL,
	CONSTRAINT "assets_namespace_id_pk" PRIMARY KEY("namespace","id"),
	CONSTRAINT "asset_location_ranges" CHECK ("assets"."lat" BETWEEN -90 AND 90 AND "assets"."lon" BETWEEN -180 AND 180),
	CONSTRAINT "asset_category" CHECK ("assets"."category" = 'oil_well'),
	CONSTRAINT "asset_recorded_status" CHECK ("assets"."recorded_status" IN ('active','down'))
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"asset_id" text NOT NULL,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"raw" jsonb NOT NULL,
	CONSTRAINT "equipment_namespace_id_pk" PRIMARY KEY("namespace","id")
);
--> statement-breakpoint
CREATE TABLE "fields" (
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_files" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"path" text NOT NULL,
	"content_hash" text NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "source_files_namespace_id_pk" PRIMARY KEY("namespace","id"),
	CONSTRAINT "source_version_path" UNIQUE("namespace","id","path")
);
--> statement-breakpoint
CREATE TABLE "context" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_path" text NOT NULL,
	"source_line" integer,
	"source_pointer" text,
	"raw" jsonb NOT NULL,
	"asset_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"author_id" text NOT NULL,
	"type" text NOT NULL,
	"inspection_id" text,
	"text" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	CONSTRAINT "context_namespace_id_pk" PRIMARY KEY("namespace","id"),
	CONSTRAINT "context_type" CHECK ("context"."type" IN ('operator_note','operator_feedback','correction')),
	CONSTRAINT "correction_has_target" CHECK (("context"."type" = 'correction') = ("context"."inspection_id" IS NOT NULL)),
	CONSTRAINT "context_validity_order" CHECK ("context"."valid_to" IS NULL OR "context"."valid_to" >= "context"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_path" text NOT NULL,
	"kind" text NOT NULL,
	"asset_id" text,
	"markdown" text NOT NULL,
	CONSTRAINT "documents_namespace_id_pk" PRIMARY KEY("namespace","id"),
	CONSTRAINT "document_asset_identity" UNIQUE("namespace","asset_id","id"),
	CONSTRAINT "document_kind_scope" CHECK (("documents"."kind" IN ('manual','sop') AND "documents"."asset_id" IS NULL) OR ("documents"."kind" = 'maintenance_report' AND "documents"."asset_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "maintenance_reports" (
	"namespace" text NOT NULL,
	"asset_id" text NOT NULL,
	"maintenance_id" text NOT NULL,
	"document_id" text NOT NULL,
	CONSTRAINT "maintenance_reports_namespace_maintenance_id_pk" PRIMARY KEY("namespace","maintenance_id")
);
--> statement-breakpoint
CREATE TABLE "well_type_manuals" (
	"namespace" text NOT NULL,
	"well_type" text NOT NULL,
	"document_id" text NOT NULL,
	CONSTRAINT "well_type_manuals_namespace_well_type_pk" PRIMARY KEY("namespace","well_type")
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_path" text NOT NULL,
	"source_line" integer,
	"source_pointer" text,
	"raw" jsonb NOT NULL,
	"name" text NOT NULL,
	"team_id" text NOT NULL,
	"lat" numeric NOT NULL,
	"lon" numeric NOT NULL,
	CONSTRAINT "areas_namespace_id_pk" PRIMARY KEY("namespace","id"),
	CONSTRAINT "area_team_identity" UNIQUE("namespace","id","team_id"),
	CONSTRAINT "area_location_ranges" CHECK ("areas"."lat" BETWEEN -90 AND 90 AND "areas"."lon" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "team_leads" (
	"namespace" text NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "team_leads_namespace_team_id_pk" PRIMARY KEY("namespace","team_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_path" text NOT NULL,
	"source_line" integer,
	"source_pointer" text,
	"raw" jsonb NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "teams_namespace_id_pk" PRIMARY KEY("namespace","id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_path" text NOT NULL,
	"source_line" integer,
	"source_pointer" text,
	"raw" jsonb NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"team_id" text NOT NULL,
	CONSTRAINT "users_namespace_id_pk" PRIMARY KEY("namespace","id")
);
--> statement-breakpoint
CREATE TABLE "well_types" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	CONSTRAINT "well_types_namespace_id_pk" PRIMARY KEY("namespace","id")
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_path" text NOT NULL,
	"source_line" integer,
	"source_pointer" text,
	"raw" jsonb NOT NULL,
	"asset_id" text NOT NULL,
	"inspected_at" timestamp with time zone NOT NULL,
	"inspector_id" text NOT NULL,
	"method" text NOT NULL,
	"ambient_temp_c" numeric NOT NULL,
	"wellhead_temp_c" numeric NOT NULL,
	"spill_detected" boolean NOT NULL,
	"spill_area_pct" numeric,
	"spill_volume_bbl" numeric,
	"evidence_images" text[] NOT NULL,
	"notes" text NOT NULL,
	CONSTRAINT "inspections_namespace_id_pk" PRIMARY KEY("namespace","id"),
	CONSTRAINT "inspection_asset_identity" UNIQUE("namespace","asset_id","id"),
	CONSTRAINT "inspection_method" CHECK ("inspections"."method" IN ('drone','manual')),
	CONSTRAINT "spill_fields_correspond" CHECK (("inspections"."spill_detected" AND "inspections"."spill_area_pct" IS NOT NULL AND "inspections"."spill_volume_bbl" IS NOT NULL) OR (NOT "inspections"."spill_detected" AND "inspections"."spill_area_pct" IS NULL AND "inspections"."spill_volume_bbl" IS NULL)),
	CONSTRAINT "spill_ranges" CHECK (("inspections"."spill_area_pct" IS NULL OR "inspections"."spill_area_pct" BETWEEN 0 AND 100) AND ("inspections"."spill_volume_bbl" IS NULL OR "inspections"."spill_volume_bbl" >= 0))
);
--> statement-breakpoint
CREATE TABLE "recorded_inspection_pointers" (
	"namespace" text NOT NULL,
	"asset_id" text NOT NULL,
	"inspection_id" text NOT NULL,
	CONSTRAINT "recorded_inspection_pointers_namespace_asset_id_pk" PRIMARY KEY("namespace","asset_id")
);
--> statement-breakpoint
CREATE TABLE "maintenance" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_path" text NOT NULL,
	"source_line" integer,
	"source_pointer" text,
	"raw" jsonb NOT NULL,
	"asset_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"equipment_kind" text NOT NULL,
	"issue" text NOT NULL,
	"action_taken" text NOT NULL,
	"technician_id" text NOT NULL,
	"contractor" text,
	"downtime_hours" numeric NOT NULL,
	"labor_usd" numeric NOT NULL,
	"parts_usd" numeric NOT NULL,
	"total_usd" numeric NOT NULL,
	"trigger_inspection_id" text,
	"report_file" text,
	CONSTRAINT "maintenance_namespace_id_pk" PRIMARY KEY("namespace","id"),
	CONSTRAINT "maintenance_asset_identity" UNIQUE("namespace","asset_id","id"),
	CONSTRAINT "job_type" CHECK ("maintenance"."type" IN ('scheduled','corrective')),
	CONSTRAINT "job_nonnegative" CHECK ("maintenance"."downtime_hours" >= 0 AND "maintenance"."labor_usd" >= 0 AND "maintenance"."parts_usd" >= 0 AND "maintenance"."total_usd" >= 0),
	CONSTRAINT "job_cost_sum" CHECK ("maintenance"."labor_usd" + "maintenance"."parts_usd" = "maintenance"."total_usd"),
	CONSTRAINT "job_order" CHECK ("maintenance"."completed_at" >= "maintenance"."started_at")
);
--> statement-breakpoint
CREATE TABLE "regulatory_events" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_path" text NOT NULL,
	"source_line" integer,
	"source_pointer" text,
	"raw" jsonb NOT NULL,
	"asset_id" text NOT NULL,
	"date" date NOT NULL,
	"agency" text NOT NULL,
	"type" text NOT NULL,
	"protocol_id" text NOT NULL,
	"inspection_id" text NOT NULL,
	"hours_to_report" numeric,
	"detail" text NOT NULL,
	"fine_usd" numeric NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "regulatory_events_namespace_id_pk" PRIMARY KEY("namespace","id"),
	CONSTRAINT "regulatory_status" CHECK ("regulatory_events"."status" IN ('open','closed')),
	CONSTRAINT "regulatory_type" CHECK ("regulatory_events"."type" IN ('spill_report_filed','notice_of_violation','site_inspection','nov_response_filed')),
	CONSTRAINT "reporting_hours_nonnegative" CHECK ("regulatory_events"."hours_to_report" IS NULL OR "regulatory_events"."hours_to_report" >= 0),
	CONSTRAINT "fine_nonnegative" CHECK ("regulatory_events"."fine_usd" >= 0)
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "source_assets_fk" FOREIGN KEY ("namespace","source_id","source_path") REFERENCES "public"."source_files"("namespace","id","path") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_type_fk" FOREIGN KEY ("namespace","well_type") REFERENCES "public"."well_types"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_area_team_fk" FOREIGN KEY ("namespace","area_id","team_id") REFERENCES "public"."areas"("namespace","id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_team_fk" FOREIGN KEY ("namespace","team_id") REFERENCES "public"."teams"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_fk" FOREIGN KEY ("namespace","in_charge_user_id") REFERENCES "public"."users"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_asset_fk" FOREIGN KEY ("namespace","asset_id") REFERENCES "public"."assets"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context" ADD CONSTRAINT "context_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context" ADD CONSTRAINT "source_context_fk" FOREIGN KEY ("namespace","source_id","source_path") REFERENCES "public"."source_files"("namespace","id","path") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context" ADD CONSTRAINT "context_asset_fk" FOREIGN KEY ("namespace","asset_id") REFERENCES "public"."assets"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context" ADD CONSTRAINT "context_author_fk" FOREIGN KEY ("namespace","author_id") REFERENCES "public"."users"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context" ADD CONSTRAINT "context_inspection_same_asset_fk" FOREIGN KEY ("namespace","asset_id","inspection_id") REFERENCES "public"."inspections"("namespace","asset_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "document_source_fk" FOREIGN KEY ("namespace","source_id","source_path") REFERENCES "public"."source_files"("namespace","id","path") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "document_asset_fk" FOREIGN KEY ("namespace","asset_id") REFERENCES "public"."assets"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_reports" ADD CONSTRAINT "report_job_same_asset_fk" FOREIGN KEY ("namespace","asset_id","maintenance_id") REFERENCES "public"."maintenance"("namespace","asset_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_reports" ADD CONSTRAINT "report_document_same_asset_fk" FOREIGN KEY ("namespace","asset_id","document_id") REFERENCES "public"."documents"("namespace","asset_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "well_type_manuals" ADD CONSTRAINT "manual_type_fk" FOREIGN KEY ("namespace","well_type") REFERENCES "public"."well_types"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "well_type_manuals" ADD CONSTRAINT "manual_document_fk" FOREIGN KEY ("namespace","document_id") REFERENCES "public"."documents"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "source_areas_fk" FOREIGN KEY ("namespace","source_id","source_path") REFERENCES "public"."source_files"("namespace","id","path") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_team_fk" FOREIGN KEY ("namespace","team_id") REFERENCES "public"."teams"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_leads" ADD CONSTRAINT "team_lead_team_fk" FOREIGN KEY ("namespace","team_id") REFERENCES "public"."teams"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_leads" ADD CONSTRAINT "team_lead_user_fk" FOREIGN KEY ("namespace","user_id") REFERENCES "public"."users"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "source_teams_fk" FOREIGN KEY ("namespace","source_id","source_path") REFERENCES "public"."source_files"("namespace","id","path") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "source_users_fk" FOREIGN KEY ("namespace","source_id","source_path") REFERENCES "public"."source_files"("namespace","id","path") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_team_fk" FOREIGN KEY ("namespace","team_id") REFERENCES "public"."teams"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "well_types" ADD CONSTRAINT "well_types_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "source_inspections_fk" FOREIGN KEY ("namespace","source_id","source_path") REFERENCES "public"."source_files"("namespace","id","path") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspection_asset_fk" FOREIGN KEY ("namespace","asset_id") REFERENCES "public"."assets"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspection_user_fk" FOREIGN KEY ("namespace","inspector_id") REFERENCES "public"."users"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorded_inspection_pointers" ADD CONSTRAINT "recorded_inspection_same_asset_fk" FOREIGN KEY ("namespace","asset_id","inspection_id") REFERENCES "public"."inspections"("namespace","asset_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance" ADD CONSTRAINT "maintenance_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance" ADD CONSTRAINT "source_maintenance_fk" FOREIGN KEY ("namespace","source_id","source_path") REFERENCES "public"."source_files"("namespace","id","path") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance" ADD CONSTRAINT "job_asset_fk" FOREIGN KEY ("namespace","asset_id") REFERENCES "public"."assets"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance" ADD CONSTRAINT "job_technician_fk" FOREIGN KEY ("namespace","technician_id") REFERENCES "public"."users"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance" ADD CONSTRAINT "job_inspection_same_asset_fk" FOREIGN KEY ("namespace","asset_id","trigger_inspection_id") REFERENCES "public"."inspections"("namespace","asset_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_events" ADD CONSTRAINT "regulatory_events_namespace_fields_id_fk" FOREIGN KEY ("namespace") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_events" ADD CONSTRAINT "source_regulatory_events_fk" FOREIGN KEY ("namespace","source_id","source_path") REFERENCES "public"."source_files"("namespace","id","path") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_events" ADD CONSTRAINT "regulator_inspection_same_asset_fk" FOREIGN KEY ("namespace","asset_id","inspection_id") REFERENCES "public"."inspections"("namespace","asset_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_by_area" ON "assets" USING btree ("namespace","area_id");--> statement-breakpoint
CREATE INDEX "context_asset_created" ON "context" USING btree ("namespace","asset_id","created_at");--> statement-breakpoint
CREATE INDEX "document_asset_kind" ON "documents" USING btree ("namespace","asset_id","kind");--> statement-breakpoint
CREATE INDEX "inspection_asset_date" ON "inspections" USING btree ("namespace","asset_id","inspected_at");--> statement-breakpoint
CREATE INDEX "job_asset_started" ON "maintenance" USING btree ("namespace","asset_id","started_at");--> statement-breakpoint
CREATE INDEX "regulatory_asset_date" ON "regulatory_events" USING btree ("namespace","asset_id","date");