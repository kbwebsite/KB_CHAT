FROM python:3.11-slim as backend
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY uploads/ ./uploads/
WORKDIR /app/backend
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM node:20-alpine as frontend
WORKDIR /app
COPY frontend/package.json frontend/vite.config.ts frontend/tailwind.config.js frontend/postcss.config.js frontend/tsconfig.json frontend/tsconfig.node.json ./
COPY frontend/src ./src
COPY frontend/index.html ./
RUN npm install && npm run build
