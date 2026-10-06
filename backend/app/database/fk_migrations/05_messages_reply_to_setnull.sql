-- +up
-- Wave 3B-05: messages.reply_to_id -> messages.id ON DELETE SET NULL.
-- Column is already nullable (verified models/message.py:45); replies
-- survive parent deletion (matches the is_deleted placeholder UX).
ALTER TABLE "messages"
ADD CONSTRAINT "fk_messages_reply_to_id"
FOREIGN KEY ("reply_to_id") REFERENCES "messages" ("id") ON DELETE SET NULL;

-- +down
ALTER TABLE "messages"
DROP CONSTRAINT IF EXISTS "fk_messages_reply_to_id";
ALTER TABLE "messages"
ADD FOREIGN KEY ("reply_to_id") REFERENCES "messages" ("id");
