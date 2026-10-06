-- +up
-- Wave 3B-02: agent_messages.conversation_id -> agent_conversations.id
-- ON DELETE CASCADE (aligns DDL with the existing ORM delete-orphan).
ALTER TABLE "agent_messages"
ADD CONSTRAINT "fk_agent_messages_conversation_id"
FOREIGN KEY ("conversation_id") REFERENCES "agent_conversations" ("id") ON DELETE CASCADE;

-- +down
ALTER TABLE "agent_messages"
DROP CONSTRAINT IF EXISTS "fk_agent_messages_conversation_id";
ALTER TABLE "agent_messages"
ADD FOREIGN KEY ("conversation_id") REFERENCES "agent_conversations" ("id");
