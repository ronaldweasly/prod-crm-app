-- =============================================================================
-- SolarCRM - Database Initialization Script
-- =============================================================================
-- This runs automatically when the PostgreSQL container starts for the first time.
-- It's used by docker-compose via the volume mount:
--   ./postgres/init:/docker-entrypoint-initdb.d:ro
--
-- WHY separate from migration script:
-- The migration script (backend/src/db/migrate.ts) is the main schema management
-- tool. This init script just sets up the extension so the migration works.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";