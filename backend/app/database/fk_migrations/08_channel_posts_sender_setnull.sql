-- +up
-- Wave 3C-08: channel_posts.sender_id -> users.id ON DELETE SET NULL.
-- Post content survives its author; sender display falls back to existing
-- anonymous rendering (already null-tolerant).
ALTER TABLE "channel_posts" ALTER COLUMN "sender_id" DROP NOT NULL;
ALTER TABLE "channel_posts"
ADD CONSTRAINT "fk_channel_posts_sender_id"
FOREIGN KEY ("sender_id") REFERENCES "users" ("id") ON DELETE SET NULL;

-- +down
ALTER TABLE "channel_posts"
DROP CONSTRAINT IF EXISTS "fk_channel_posts_sender_id";
ALTER TABLE "channel_posts"
ADD FOREIGN KEY ("sender_id") REFERENCES "users" ("id");
ALTER TABLE "channel_posts" ALTER COLUMN "sender_id" SET NOT NULL;
