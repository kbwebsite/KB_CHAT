export interface User {
  id: number;
  username: string;
  display_name: string;
  email?: string;
  avatar_url?: string | null;
  about?: string | null;
  is_online?: boolean;
  last_seen?: string | null;
  created_at?: string | null;
}

export interface ConversationMember {
  id: number;
  user_id: number;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  role: string;
  is_online?: boolean;
}

export interface LastMessage {
  id: number;
  content: string;
  sender_id?: number | null;
  sender_username?: string | null;
  created_at?: string | null;
  message_type: string;
}

export interface Conversation {
  id: number;
  is_group: boolean;
  title?: string | null;
  description?: string | null;
  avatar_url?: string | null;
  created_by?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  members: ConversationMember[];
  last_message?: LastMessage | null;
  unread_count: number;
  is_muted?: boolean;
  is_pinned?: boolean;
  is_archived?: boolean;
  is_favorite?: boolean;
  muted_until?: string | null;
}

export interface Attachment {
  id: number;
  filename: string;
  original_filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  url?: string;
}

export interface Reaction {
  id: number;
  user_id: number;
  username?: string | null;
  emoji: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id?: number | null;
  sender_username?: string | null;
  sender_display_name?: string | null;
  sender_avatar?: string | null;
  content?: string | null;
  message_type: string;
  reply_to_id?: number | null;
  reply_to_content?: string | null;
  is_deleted: boolean;
  is_edited: boolean;
  is_pinned?: boolean;
  pinned_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  attachments: Attachment[];
  reactions: Reaction[];
  status?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string | null;
}
