FROM node:20-alpine

# Install python3 and build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies first (cache layer)
COPY backend/package.json ./backend/package.json
RUN cd backend && npm install --production

# Copy backend
COPY backend/ ./backend/

# Copy frontend (public files)
COPY public/ ./public/

# Create data and media directories
RUN mkdir -p /data /media

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
ENV MEDIA_DIR=/media

CMD ["node", "backend/server.js"]
