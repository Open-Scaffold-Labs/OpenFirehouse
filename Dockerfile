# syntax=docker/dockerfile:1.7
#
# OpenFirehouse Dockerfile — multi-stage build.
#
# Stage 1 (builder): installs all workspaces, builds the client into
#   client/dist via Vite, leaves the server source untouched.
# Stage 2 (runtime): production-only npm install at the workspace root,
#   copies the built client + server source, runs the Express server.
#
# The server already serves client/dist as static when present
# (see server/src/index.js ~line 170), so a single container hosts both.

# ─── Stage 1: builder ────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for all workspaces. Copying package.json files
# alone first gives Docker layer caching a chance to skip npm ci when
# only source changes.
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/

RUN npm ci --no-audit --no-fund

# Now copy the rest of the source and build the client.
COPY . .

# Vite production build → client/dist
RUN npm run build

# ─── Stage 2: runtime ────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Production needs a non-root user.
RUN addgroup -S openfirehouse && \
    adduser -S -G openfirehouse openfirehouse

WORKDIR /app

# Install production deps only. Same layer-caching trick as the builder.
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/

RUN npm ci --omit=dev --no-audit --no-fund && \
    npm cache clean --force

# Copy server source + the built client.
COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist
# vercel.json + readmes don't need to ship, but uploads dir if it exists does.
RUN mkdir -p ./server/uploads && \
    chown -R openfirehouse:openfirehouse /app

USER openfirehouse

ENV NODE_ENV=production \
    PORT=3005

EXPOSE 3005

# Healthcheck — the server exposes /health for this purpose (see
# server/src/index.js). The check fires before initDb() finishes seeding,
# which is intentional — we want the container to report healthy as soon
# as Express is accepting connections so platform schedulers don't kill
# it during the first-boot seed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3005/health || exit 1

CMD ["node", "server/src/index.js"]
