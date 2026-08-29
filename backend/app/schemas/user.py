from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    display_name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=6, max_length=100)
    confirm_password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v):
        if not v.isalnum() and "_" not in v and "-" not in v:
            # allow alphanumeric + _ -
            import re
            if not re.match(r"^[a-zA-Z0-9_-]+$", v):
                raise ValueError("Username can only contain letters, numbers, _ and -")
        if len(v) < 3:
            raise ValueError("Username too short")
        return v.lower().strip()

    @field_validator("confirm_password")
    @classmethod
    def check_passwords(cls, v, info):
        # info.data contains previous fields
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Passwords do not match")
        return v

class UserLogin(BaseModel):
    identifier: str  # email or username
    password: str

class UserUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=100)
    about: Optional[str] = Field(None, max_length=500)
    avatar_url: Optional[str] = None

class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    about: Optional[str] = None
    is_online: bool = False
    last_seen: Optional[datetime] = None
    created_at: Optional[datetime] = None

class UserPrivate(UserPublic):
    email: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPrivate
