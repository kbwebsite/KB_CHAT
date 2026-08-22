from pydantic import BaseModel
from typing import Generic, TypeVar, Optional

T = TypeVar("T")

class ApiResponse(BaseModel):
    success: bool
    data: Optional[object] = None
    message: Optional[str] = None

def success_response(data=None, message=None):
    return {"success": True, "data": data, "message": message}

def error_response(message="Error", data=None):
    return {"success": False, "data": data, "message": message}
