-- +up
-- Wave 3B-03: broadcast_lists.owner_id -> users.id ON DELETE CASCADE.
ALTER TABLE "broadcast_lists"
ADD CONSTRAINT "fk_broadcast_lists_owner_id"
FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE CASCADE;

-- +down
ALTER TABLE "broadcast_lists"
DROP CONSTRAINT IF EXISTS "fk_broadcast_lists_owner_id";
ALTER TABLE "broadcast_lists"
ADD FOREIGN KEY ("owner_id") REFERENCES "users" ("id");
