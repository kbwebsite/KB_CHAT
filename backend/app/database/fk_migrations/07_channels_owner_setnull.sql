-- +up
-- Wave 3C-07: channels.owner_id -> users.id ON DELETE SET NULL.
-- Ownerless channel stays readable for followers; owner-only post/edit/
-- delete deny (frozen, not deleted).
ALTER TABLE "channels" ALTER COLUMN "owner_id" DROP NOT NULL;
ALTER TABLE "channels"
ADD CONSTRAINT "fk_channels_owner_id"
FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE SET NULL;

-- +down
ALTER TABLE "channels"
DROP CONSTRAINT IF EXISTS "fk_channels_owner_id";
ALTER TABLE "channels"
ADD FOREIGN KEY ("owner_id") REFERENCES "users" ("id");
ALTER TABLE "channels" ALTER COLUMN "owner_id" SET NOT NULL;
