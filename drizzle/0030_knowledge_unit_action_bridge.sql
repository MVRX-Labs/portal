ALTER TABLE "account_actions" ADD COLUMN "knowledge_unit_id" text;--> statement-breakpoint
ALTER TABLE "account_actions" ADD CONSTRAINT "account_actions_knowledge_unit_id_knowledge_units_id_fk" FOREIGN KEY ("knowledge_unit_id") REFERENCES "public"."knowledge_units"("id") ON DELETE no action ON UPDATE no action;
