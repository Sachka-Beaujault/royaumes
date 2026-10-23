CREATE TABLE "guild"."ranking" (
	"guild" text NOT NULL,
	"day" text NOT NULL,
	"best_floors" integer NOT NULL,
	"runs" integer NOT NULL,
	CONSTRAINT "ranking_guild_day_pk" PRIMARY KEY("guild","day")
);
--> statement-breakpoint
ALTER TABLE "guild"."open_runs" ADD COLUMN "status" text DEFAULT 'lobby' NOT NULL;--> statement-breakpoint
CREATE INDEX "open_runs_day_idx" ON "guild"."open_runs" USING btree ("day");