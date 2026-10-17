ALTER TABLE "assets" DROP CONSTRAINT "asset_recorded_status";--> statement-breakpoint
ALTER TABLE "context" DROP CONSTRAINT "context_type";--> statement-breakpoint
ALTER TABLE "context" DROP CONSTRAINT "correction_has_target";--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_area_team_fk";
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_area_fk" FOREIGN KEY ("namespace","area_id") REFERENCES "public"."areas"("namespace","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "asset_recorded_status" CHECK ("assets"."recorded_status" IN ('active','down','plugged'));--> statement-breakpoint
ALTER TABLE "context" ADD CONSTRAINT "context_type" CHECK ("context"."type" IN ('operator_note','operator_feedback','correction','data_correction'));--> statement-breakpoint
ALTER TABLE "context" ADD CONSTRAINT "correction_has_target" CHECK (("context"."type" IN ('correction','data_correction')) = ("context"."inspection_id" IS NOT NULL));