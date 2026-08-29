from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

class MessageCreate(BaseModel):
    content: Optional[str] = Field(None, max_length=5000)
    message_type: str = Field(default="text")
    reply_to_id: Optional[int] = None
    attachment_ids: Optional[List[int]] = None

class MessageUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)

class ReactionCreate(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=10)

class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    original_filename: str
    file_path: str
    file_size: int
    mime_type: str

class ReactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    username: Optional[str] = None
    emoji: str

class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    sender_id: Optional[int] = None
    sender_username: Optional[str] = None
    sender_display_name: Optional[str] = None
    sender_avatar: Optional[str] = None
    content: Optional[str] = None
    message_type: str
    reply_to_id: Optional[int] = None
    reply_to_content: Optional[str] = None
    is_deleted: bool = False
    is_edited: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    attachments: List[AttachmentOut] = []
    reactions: List[ReactionOut] = []
    status: str = "sent"  # sending, sent, delivered, read
