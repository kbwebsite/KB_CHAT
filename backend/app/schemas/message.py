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


class PollOption(BaseModel):
    text: str = Field(..., min_length=1, max_length=200)


class PollCreate(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)
    options: List[PollOption] = Field(..., min_length=2, max_length=10)
    allow_multiple: bool = False
    is_anonymous: bool = False
    expires_at: Optional[datetime] = None


class PollVoteCreate(BaseModel):
    option_indices: List[int] = Field(..., min_length=1)


class PollOptionOut(BaseModel):
    text: str
    votes: int
    percentage: float
    user_voted: bool = False


class PollOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question: str
    options: List[PollOptionOut]
    allow_multiple: bool
    is_anonymous: bool
    expires_at: Optional[datetime] = None
    total_votes: int
    user_vote: Optional[List[int]] = None


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
    status: str = "sent"
    poll: Optional[PollOut] = None
