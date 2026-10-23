CREATE TABLE "guild"."open_runs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"guild" text NOT NULL,
	"day" text NOT NULL,
	"host_name" text NOT NULL,
	"hero_count" integer NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "open_runs_guild_day_idx" ON "guild"."open_runs" USING btree ("guild","day");