from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class ConversationCreate(BaseModel):
    participant_username: Optional[str] = None
    participant_id: Optional[int] = None
    is_group: bool = False
    title: Optional[str] = None
    description: Optional[str] = None
    member_ids: Optional[List[int]] = None  # for group
    member_usernames: Optional[List[str]] = None

class GroupUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    avatar_url: Optional[str] = None

class GroupMemberAdd(BaseModel):
    user_ids: Optional[List[int]] = None
    usernames: Optional[List[str]] = None

class ConversationMemberOut(BaseModel):
    id: int
    user_id: int
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    role: str
    is_online: bool = False

    class Config:
        from_attributes = True

class ConversationOut(BaseModel):
    id: int
    is_group: bool
    title: Optional[str] = None
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    members: List[ConversationMemberOut] = []
    last_message: Optional[dict] = None
    unread_count: int = 0

    class Config:
        from_attributes = True
