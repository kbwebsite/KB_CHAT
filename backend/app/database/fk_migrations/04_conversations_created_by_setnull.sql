-- +up
-- Wave 3B-04: conversations.created_by -> users.id ON DELETE SET NULL.
-- Column is already nullable (verified models/conversation.py:25).
ALTER TABLE "conversations"
ADD CONSTRAINT "fk_conversations_created_by"
FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL;

-- +down
ALTER TABLE "conversations"
DROP CONSTRAINT IF EXISTS "fk_conversations_created_by";
ALTER TABLE "conversations"
ADD FOREIGN KEY ("created_by") REFERENCES "users" ("id");
