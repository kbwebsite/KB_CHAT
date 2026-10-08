# Kryzen — Connect. Chat. Share.

A fast, modern real-time messaging platform built with **FastAPI + React**. Kryzen provides secure 1-to-1 and group conversations, instant WebSocket messaging, typing indicators, presence, file sharing, voice/video calls, stories, polls, and a polished responsive UI.

![Kryzen](https://img.shields.io/badge/Kryzen-v1.1-violet?style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi)
![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react)
![WebSockets](https://img.shields.io/badge/WebSockets-Real--Time-blue?style=flat-square)
![Android](https://img.shields.io/badge/Android-APK-3DDC84?style=flat-square&logo=android)

Live: https://kb-chat-1.onrender.com · Android: [v1.0.0 APK](https://github.com/kbwebsite/KB_CHAT/releases/tag/v1.0.0)

---

## Features

- **Auth**: Signup (name, username, email, password), Login (email/username), Google OAuth, JWT, secure hashing, protected routes
- **Presence**: Online/offline + last seen via WebSocket manager (in-memory, not DB thrashing), with per-user visibility controls (everyone / contacts / nobody, enforced server-side)
- **Real-time**: WebSocket (`/ws/chat`) with events `message.new`, `message.updated`, `message.deleted`, `typing.start/stop`, `presence.online/offline`, `reaction.*`, `message.read`
- **Messaging**: Text, image/file, voice notes, reply, edit, delete (placeholder), reactions, view-once, disappearing messages, scheduled messages, pagination (cursor `before`), search
- **Statuses**: Sending → Sent → Delivered → Read (UI indicators), with read-receipt opt-out honored end to end
- **Conversations**: 1-to-1 auto-dedup, Groups (owner/admin/member roles), Channels, Communities, Broadcasts, unread counts, mark read/unread, pin/archive/mute/favorite
- **Calls**: Voice/video calls (WebRTC) with history
- **Extras**: Stories + highlights, polls, events, saved messages, statuses, stickers, AI chat + in-app agent, link previews, chat export
- **Files**: Validated uploads (size, MIME, extension), path-traversal protection, Cloudinary persistence in production; image preview
- **Search**: Users (username/display_name), conversations, messages (keyword, per-conversation)
- **Settings**: Sectioned store (appearance, notifications, privacy, chat) — every toggle functional: theme/accent/wallpaper, font size, message density, Do Not Disturb, sound/vibration, desktop notifications with previews, typing indicators, link previews, media auto-download, enter-to-send
- **Android**: Capacitor shell (`com.kryzen.chat`) with native push via FCM — signed APK distributed through GitHub Releases
- **UI**: Light/Dark/System themes (CSS variables), responsive (desktop: sidebar+chat+details, mobile: list→chat), emoji picker, notifications (permission-gated), accessible controls

---

## Tech Stack

**Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router 6, Zustand, Lucide Icons, emoji-picker-react, date-fns, Axios, Capacitor 8 (Android), Firebase (push/auth)
**Backend**: Python 3.11, FastAPI, Pydantic, SQLAlchemy 2, Uvicorn, python-jose, passlib/bcrypt, aiofiles, python-multipart
**Realtime**: WebSockets (FastAPI WebSockets + custom ConnectionManager)
**DB**: PostgreSQL (prod) / SQLite (dev fallback, zero-config)
**Auth**: JWT (HS256), bcrypt, Google OAuth, session auth

---

## Folder Structure

```
KB-CHAT/
├── frontend/
│   ├── src/
│   │   ├── components/  # ConversationList, MessageList, Bubble, Composer, EmojiPicker, Settings, etc.
│   │   ├── pages/       # Landing, Login, Signup, Chat, Settings
│   │   ├── layouts/     # AppShell
│   │   ├── hooks/       # useDebounce
│   │   ├── services/    # api.ts, websocket.ts
│   │   ├── store/       # auth.ts, chat.ts, settings.ts, ui.ts (Zustand)
│   │   ├── types/       # TS interfaces
│   │   └── utils/       # format helpers, push, wallpapers
│   ├── android/         # Capacitor Android shell (com.kryzen.chat)
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── capacitor.config.ts
│   └── package.json    # kryzen-frontend v1.1.0
├── backend/
│   ├── app/
│   │   ├── main.py     # Kryzen API (API schema v3.0.0)
│   │   ├── api/        # auth, users, conversations, messages, uploads, calls, polls, etc.
│   │   ├── auth/       # security, dependencies
│   │   ├── database/   # config, connection
│   │   ├── models/     # user, conversation, message, settings, etc.
│   │   ├── schemas/    # pydantic schemas
│   │   ├── websocket/  # manager, chat
│   │   └── utils/      # helpers, privacy
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
cp ../.env.example .env   # or use provided .env
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
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,https://kb-chat-1.onrender.com
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

Tables: `users`, `conversations`, `conversation_members`, `messages`, `message_reactions`, `attachments`, `user_settings`, `user_sessions`, `device_tokens` — with indexes on `username`, `conversation_id`, `sender_id`, `created_at`, `conversation membership`.

---

## Running Tests

```bash
cd backend
pytest ../tests -v
# or
python -m pytest ../tests/test_api.py -v
python -m pytest ../tests/test_websocket.py -v
```

Covers: registration, login, auth, user search, conversation creation, message creation, authz, deletion, group permissions, file validation, settings + privacy enforcement, read receipts, WS connect/typing/read.

### Two-User E2E Flow (manual or via test `test_user_search_and_conversation_flow`):

```
User A signs up → User B signs up → A searches B → A creates chat → A sends "Hello!" → Server stores → B receives instantly (WS) → B replies → A receives → Read status updates
```

---

## Android Build

```bash
cd frontend
npm run build
npx cap sync android
cd android
# Windows: gradlew.bat bundleRelease (AAB for Play) or assembleRelease (APK for direct distribution)
# Requires JDK 17/21 (JDK 26 breaks the Android toolchain) and local keystore.properties (gitignored)
```

- App ID: `com.kryzen.chat` (stable — never rename after release; it breaks updates, FCM, and `google-services.json`)
- Current: versionName `1.1`, versionCode `2`
- Releases are published as signed APKs on GitHub Releases (free distribution, Obtainium-compatible)

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
**Settings**: `GET /api/settings`, `PATCH /api/settings` (mute, previews, notifications, privacy, chat prefs)
**Calls / Polls / Stories / Events / Extras**: see `/docs` for the full route list
**WS**: `WS /ws/chat?token=JWT`

All REST responses: `{ success: bool, data: ..., message: str|null }`.

---

## Security Notes

- Passwords: `bcrypt` via `passlib`; never stored plain.
- JWT: `HS256`, `JWT_SECRET` from env, expiry 24h; `HTTPBearer` dep; WS token validated.
- CORS: allowlist via `CORS_ORIGINS`.
- Validation: Pydantic for bodies, `validate_file` checks size/MIME/ext, `sanitize_filename` strips path, blocks `MZ` exe headers.
- AuthZ: `ConversationMember` check on every conversation/message route; only sender can edit/delete own messages.
- Privacy: presence (online/last-seen) masked server-side per the target's visibility setting; read-receipt opt-out suppresses storing/broadcasting read cursors; public search excludes emails; `UserPublic` only returns safe fields.
- Rate limit: simple in-memory caps on `/api/auth`, `/api/conversations`, `/api/messages`, `/api/uploads` (writes only).
- Uploads stored in `uploads/` outside app code (Cloudinary in production); served via `FileResponse` with MIME guess.
- In production: run behind HTTPS/WSS, use strong `JWT_SECRET`, set `APP_ENV=production`, consider Postgres + Redis for presence scaling.

---

## Troubleshooting

- **CORS error**: ensure `CORS_ORIGINS` includes `http://localhost:5173` and the production URL.
- **WS 1008 close**: token expired or invalid — re-login.
- **SQLite “database is locked”**: avoid parallel writes; use Postgres for concurrency.
- **Upload 400**: check `MAX_UPLOAD_SIZE_MB` and allowed extensions in `helpers.py`.
- **Frontend proxy fails**: `vite.config.ts` proxies to `127.0.0.1:8000` — ensure backend is running before `npm run dev`.
- **Android build fails on JDK 26**: set `JAVA_HOME` to JDK 17/21 before running Gradle.

---

## Known V1 Limitations

- No end-to-end encryption on current message path (legacy sealed-message opener retained for old rows).
- No background push on web beyond FCM when configured; native push covers the APK.
- Single-server presence (in-memory); for multi-instance, replace with Redis.
- No message backup/export beyond per-conversation text export.

---

## Roadmap

- E2E encryption (signal/double-ratchet), push (FCM/APNS) hardening, message forwarding, moderation, desktop wrappers, S3/cloud storage expansion, Play Store listing.

---

## License

MIT — Kryzen is original work, not affiliated with WhatsApp. Do not use WhatsApp branding/assets.
