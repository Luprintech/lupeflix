# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
RUN apk add --no-cache python3 make g++ ffmpeg
WORKDIR /app
COPY backend/package.json ./backend/package.json
RUN cd backend && npm install --production
COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./public
RUN mkdir -p /data /media
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
ENV MEDIA_DIR=/media
CMD ["node", "backend/server.js"]
