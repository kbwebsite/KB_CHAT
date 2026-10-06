-- +up
-- Wave 3C-06: communities.owner_id -> users.id ON DELETE SET NULL.
-- Nullable-first: the column must accept NULL before the constraint can
-- null it (verified models/community.py). Governance: ownerless community
-- stays visible for members; admin actions deny (frozen, not deleted).
ALTER TABLE "communities" ALTER COLUMN "owner_id" DROP NOT NULL;
ALTER TABLE "communities"
ADD CONSTRAINT "fk_communities_owner_id"
FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE SET NULL;

-- +down
-- Restore bare NOT NULL original. Fails closed if NULLs exist (rollback is
-- for pre-delete staging use; post-delete recovery is backup-only).
ALTER TABLE "communities"
DROP CONSTRAINT IF EXISTS "fk_communities_owner_id";
ALTER TABLE "communities"
ADD FOREIGN KEY ("owner_id") REFERENCES "users" ("id");
ALTER TABLE "communities" ALTER COLUMN "owner_id" SET NOT NULL;
