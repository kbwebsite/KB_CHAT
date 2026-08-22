# KB Chat — Connect. Chat. Share.

A fast, modern real-time messaging platform built with **FastAPI + React**. KB Chat provides secure 1-to-1 and group conversations, instant WebSocket messaging, typing indicators, presence, file sharing, and a polished responsive UI — without copying any proprietary branding.

![KB Chat](https://img.shields.io/badge/KB%20Chat-V1-violet?style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi)
![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react)
![WebSockets](https://img.shields.io/badge/WebSockets-Real--Time-blue?style=flat-square)

---

## Features

- **Auth**: Signup (name, username, email, password), Login (email/username), JWT, secure hashing, protected routes
- **Presence**: Online/offline + last seen via WebSocket manager (in-memory, not DB thrashing)
- **Real-time**: WebSocket (`/ws/chat`) with events `message.new`, `message.updated`, `message.deleted`, `typing.start/stop`, `presence.online/offline`, `reaction.*`, `message.read`
- **Messaging**: Text, image/file, reply, edit, delete (placeholder), reactions, pagination (cursor `before`), search
- **Statuses**: Sending → Sent → Delivered → Read (UI indicators)
- **Conversations**: 1-to-1 auto-dedup, Groups (owner/admin/member roles), unread counts, mark read/unread
- **Files**: Validated uploads (size, MIME, extension), path-traversal protection, stored outside code; image preview
- **Search**: Users (username/display_name), conversations, messages (keyword, per-conversation)
- **UI**: Light/Dark/System themes (CSS variables), responsive (desktop: sidebar+chat+details, mobile: list→chat), emoji picker, notifications (permission-gated), accessible controls

---

## Tech Stack

**Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router 6, Zustand, Lucide Icons, emoji-picker-react, date-fns, Axios  
**Backend**: Python 3.11, FastAPI, Pydantic, SQLAlchemy 2, Uvicorn, python-jose, passlib/bcrypt, aiofiles, python-multipart  
**Realtime**: WebSockets (FastAPI WebSockets + custom ConnectionManager)  
**DB**: PostgreSQL (prod) / SQLite (dev fallback, zero-config)  
**Auth**: JWT (HS256), bcrypt

---

## Folder Structure

```
KB-CHAT/
├── frontend/
│   ├── src/
│   │   ├── components/  # ConversationList, MessageList, Bubble, Composer, EmojiPicker, etc.
│   │   ├── pages/       # Landing, Login, Signup, Chat
│   │   ├── layouts/     # AppShell
│   │   ├── hooks/       # useDebounce
│   │   ├── services/    # api.ts, websocket.ts
│   │   ├── store/       # auth.ts, chat.ts, ui.ts (Zustand)
│   │   ├── types/       # TS interfaces
│   │   └── utils/       # format helpers
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/         # auth, users, conversations, messages, uploads
│   │   ├── auth/        # security, dependencies
│   │   ├── database/    # config, connection
│   │   ├── models/      # user, conversation, message
│   │   ├── schemas/     # pydantic schemas
│   │   ├── websocket/   # manager, chat
│   │   └── utils/       # helpers
│   ├── requirements.txt
│   └── .env.example
├── uploads/             # file storage (gitkept)
├── tests/               # pytest: api + websocket
├── docker-compose.yml
├── Dockerfile
└── README.md
```

---

## Quick Start (Local Dev, no Docker)

### Prerequisites
- Python 3.10+
- Node 18+
- (Optional) PostgreSQL — otherwise SQLite `kbchat.db` is used

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env   # or use provided .env
# edit .env if needed: JWT_SECRET, DATABASE_URL, CORS_ORIGINS

uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend → http://127.0.0.1:8000  
Health: http://127.0.0.1:8000/api/health  
Docs: http://127.0.0.1:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend → http://localhost:5173 (proxies `/api` and `/ws` to backend)

> **First run**: open http://localhost:5173, click **Get Started** → create two accounts in different browsers/incognito to test real-time messaging.

---

## Environment Variables

Create `backend/.env` (see `.env.example`):

```env
DATABASE_URL=sqlite:///./kbchat.db
# production: postgresql://user:pass@localhost:5432/kbchat
JWT_SECRET=change-this-to-a-strong-random-secret-at-least-32-chars
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE_MB=15
APP_ENV=development
HOST=127.0.0.1
PORT=8000
```

---

## Database Setup

- **SQLite (dev)**: no setup — `kbchat.db` auto-created on first run via `create_tables()` in `main.py`.
- **PostgreSQL**:
  ```bash
  createdb kbchat
  # set DATABASE_URL=postgresql://user:pass@localhost:5432/kbchat in .env
  python -c "from app.database.connection import create_tables; create_tables()"
  ```
- **Alembic** (optional migrations): `alembic init` already configured; generate with `alembic revision --autogenerate -m "init"`.

Tables: `users`, `conversations`, `conversation_members`, `messages`, `message_reactions`, `attachments` — with indexes on `username`, `conversation_id`, `sender_id`, `created_at`, `conversation membership`.

---

## Running Tests

```bash
cd backend
pytest ../tests -v
# or
python -m pytest ../tests/test_api.py -v
python -m pytest ../tests/test_websocket.py -v
```

Covers: registration, login, auth, user search, conversation creation, message creation, authz, deletion, group permissions, file validation, WS connect/typing/read.

### Two-User E2E Flow (manual or via test `test_user_search_and_conversation_flow`):

```
User A signs up → User B signs up → A searches B → A creates chat → A sends "Hello!" → Server stores → B receives instantly (WS) → B replies → A receives → Read status updates
```

---

## Docker (Optional)

```bash
docker-compose up --build
# frontend: http://localhost:5173
# backend:  http://localhost:8000
# postgres: localhost:5432 (user: kbchat / pass: kbchatpass)
```

Services: `frontend`, `backend`, `postgres`. Volumes persist `pgdata` and `uploads`.

---

## WebSocket Architecture

```
User A  →  WS (/ws/chat?token=JWT)  →  FastAPI  →  DB  →  ConnectionManager.broadcast_to_conversation(...)  →  User B WS
```

- **Manager** (`app/websocket/manager.py`): `user_id → Set[WebSocket]`, `online_users` in-memory, `broadcast_to_conversation`, `send_typing`, `broadcast_presence`. Handles multi-device (multiple sockets per user), cleanup.
- **Events** (JSON): `{ "type": "message.new", "payload": {...} }` — validated; unknown types → error.
- **Reconnect**: client exponential backoff (1s → 10s max), ping every 30s, `_open/_close` handlers re-sync via `fetchMessages`.

Auth: query param `token` → `decode_token` → `User`; close `1008` if invalid. Presence broadcast on connect/disconnect (offline sets `last_seen`).

---

## API Overview

**Auth**: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`  
**Users**: `GET /api/users/search?q=`, `GET /api/users/{username}`, `PATCH /api/users/me`, `GET /api/users/me/profile`  
**Conversations**: `GET /api/conversations[?search=]`, `POST /api/conversations`, `GET /api/conversations/{id}`, `DELETE /api/conversations/{id}`, `POST /api/conversations/{id}/read`, `POST /api/conversations/{id}/unread`, `PATCH /api/conversations/groups/{id}`, `POST /api/conversations/groups/{id}/members`, `DELETE /api/conversations/groups/{id}/members/{uid}`  
**Messages**: `GET /api/conversations/{id}/messages?before=&limit=&search=`, `POST /api/conversations/{id}/messages`, `PATCH /api/messages/{id}`, `DELETE /api/messages/{id}`, `POST /api/messages/{id}/reactions`, `DELETE /api/messages/{id}/reactions`, `GET /api/messages/search?q=&conversation_id=`  
**Uploads**: `POST /api/uploads`, `GET /api/uploads/file/{filename}`, `POST /api/uploads/avatar`  
**WS**: `WS /ws/chat?token=JWT`

All REST responses: `{ success: bool, data: ..., message: str|null }`.

---

## Security Notes

- Passwords: `bcrypt` via `passlib`; never stored plain.
- JWT: `HS256`, `JWT_SECRET` from env, expiry 24h; `HTTPBearer` dep; WS token validated.
- CORS: allowlist via `CORS_ORIGINS`.
- Validation: Pydantic for bodies, `validate_file` checks size/MIME/ext, `sanitize_filename` strips path, blocks `MZ` exe headers.
- AuthZ: `ConversationMember` check on every conversation/message route; only sender can edit/delete own messages.
- Rate limit: simple in-memory 30 req / 60s on `/api/auth`.
- Privacy: public search excludes emails; `UserPublic` only returns safe fields.
- Uploads stored in `uploads/` outside app code; served via `FileResponse` with MIME guess.
- In production: run behind HTTPS/WSS, use strong `JWT_SECRET`, set `APP_ENV=production`, consider Postgres + Redis for presence scaling.

---

## Troubleshooting

- **CORS error**: ensure `CORS_ORIGINS` includes `http://localhost:5173`.
- **WS 1008 close**: token expired or invalid — re-login.
- **SQLite “database is locked”**: avoid parallel writes; use Postgres for concurrency.
- **Upload 400**: check `MAX_UPLOAD_SIZE_MB` and allowed extensions in `helpers.py`.
- **Frontend proxy fails**: `vite.config.ts` proxies to `127.0.0.1:8000` — ensure backend is running before `npm run dev`.

---

## Known V1 Limitations

- No end-to-end encryption (architecture ready; needs signal/double-ratchet research).
- No push notifications (browser Notification only when granted, not background).
- No voice/video, stories, forwarding, broadcast channels.
- Single-server presence (in-memory); for multi-instance, replace with Redis.
- No message backup/export.

---

## Roadmap

- E2E encryption, voice/video calls, voice messages, multi-device sync, push (FCM/APNS), message forwarding, stories, moderation, stickers, desktop/mobile wrappers, S3/cloud storage.

---

## License

MIT — KB Chat is original work, not affiliated with WhatsApp. Do not use WhatsApp branding/assets.
