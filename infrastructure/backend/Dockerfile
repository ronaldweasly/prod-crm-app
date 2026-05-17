# =============================================================================
# SolarCRM Backend API - Production Dockerfile
# =============================================================================
# Multi-stage build:
# Stage 1: Install deps + compile TypeScript
# Stage 2: Production runtime with minimal footprint
#
# WHY Node.js backend: The existing app exposes Supabase credentials to the
# browser. This backend acts as a secure API gateway — it holds the DB
# credentials, enforces auth, and proxies all data operations.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and compile
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Production Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

# Security: Run as non-root user
RUN addgroup -g 1001 -S solarcrm && \
    adduser -S solarcrm -u 1001 -G solarcrm

WORKDIR /app

# Copy only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Own the app directory
RUN chown -R solarcrm:solarcrm /app

USER solarcrm

# Expose the API port (internal only — not published to host)
EXPOSE 4000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/api/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))" || exit 1

CMD ["node", "dist/server.js"]
