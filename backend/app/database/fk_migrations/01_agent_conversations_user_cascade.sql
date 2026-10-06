-- +up
-- Wave 3B-01: agent_conversations.user_id -> users.id ON DELETE CASCADE.
-- The old auto-named constraint is dropped by the runner (discovered at
-- runtime); this file only adds the explicitly-named replacement.
ALTER TABLE "agent_conversations"
ADD CONSTRAINT "fk_agent_conversations_user_id"
FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;

-- +down
-- Restore the original bare REFERENCES (auto-named by Postgres).
ALTER TABLE "agent_conversations"
DROP CONSTRAINT IF EXISTS "fk_agent_conversations_user_id";
ALTER TABLE "agent_conversations"
ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id");
