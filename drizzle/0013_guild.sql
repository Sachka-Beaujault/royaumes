CREATE SCHEMA "guild";
--> statement-breakpoint
CREATE TABLE "guild"."messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild" text NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"posted_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "messages_guild_idx" ON "guild"."messages" USING btree ("guild","id");--> statement-breakpoint
CREATE INDEX "messages_author_idx" ON "guild"."messages" USING btree ("author_id","posted_at");--> statement-breakpoint
CREATE INDEX "messages_posted_at_idx" ON "guild"."messages" USING btree ("posted_at");