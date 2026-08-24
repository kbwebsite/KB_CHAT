# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend + serve frontend
FROM python:3.11-slim AS backend
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-build /app/dist ./frontend/dist

# Create uploads directory (do NOT COPY from host - it overwrites persistent data)
# Uploads should be stored on a persistent volume mount at /app/backend/uploads
RUN mkdir -p /app/backend/uploads

WORKDIR /app/backend

# Render injects PORT; default 8000 for local
ENV PORT=8000
EXPOSE 8000

# Use shell form so $PORT is expanded by Render
CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"
