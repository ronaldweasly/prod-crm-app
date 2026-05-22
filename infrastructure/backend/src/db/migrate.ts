// =============================================================================
// Database Migration Script
// =============================================================================
// Creates all tables matching the existing Supabase schema.
// Run with: npm run db:migrate
//
// WHY migrations: Version-controlled, repeatable database setup.
// This script is idempotent — safe to run multiple times.
// =============================================================================

import { pool } from './pool.js';

const MIGRATION_SQL = `
-- =============================================================================
-- SolarCRM Database Schema
-- =============================================================================
-- Matches the existing Supabase table structure from config.ts
-- All tables use snake_case column names
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    password    VARCHAR(255) NOT NULL,
    role        VARCHAR(50) NOT NULL DEFAULT 'Sales Team'
                CHECK (role IN ('Admin', 'Sales Team', 'Engineer', 'Accountant')),
    name        VARCHAR(255) NOT NULL,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CLIENTS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
    id              VARCHAR(20) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(20),
    address         TEXT,
    roof_type       VARCHAR(100),
    battery_type    VARCHAR(100),
    system_size_kw  DECIMAL(10,2),
    created_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    assigned_to     VARCHAR(255),
    assigned_to_field VARCHAR(255),
    payment_mode    VARCHAR(50) DEFAULT 'Loan' CHECK (payment_mode IN ('Loan', 'Cash', 'PDC (78)', 'PDC (30)', 'Advance')),
    dispute_status  VARCHAR(50) DEFAULT 'None' CHECK (dispute_status IN ('None', 'Resolving')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── WORKFLOW STATUS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_status (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id   VARCHAR(20) UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    stage       VARCHAR(100) NOT NULL DEFAULT 'Lead',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  VARCHAR(255)
);

-- ─── SURVEYS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS surveys (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id                   VARCHAR(20) UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    survey_date                 DATE,
    site_images                 TEXT,
    recommended_system_details  TEXT,
    surveyor_name               VARCHAR(255)
);

-- ─── QUOTATIONS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id       VARCHAR(20) UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    quotation_pdf   TEXT,
    amount          DECIMAL(12,2),
    validity_date   DATE,
    approval_status VARCHAR(50) DEFAULT 'Pending'
);

-- ─── INSTALLATIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS installations (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id               VARCHAR(20) UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    team_members            TEXT,
    progress_notes          TEXT,
    completion_percentage   INTEGER DEFAULT 0 CHECK (completion_percentage BETWEEN 0 AND 100),
    start_date              DATE,
    end_date                DATE
);

-- ─── SUBSIDIES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subsidies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id       VARCHAR(20) UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    status          VARCHAR(50) DEFAULT 'Not Applied',
    applied_date    DATE,
    approval_date   DATE,
    amount          DECIMAL(12,2)
);

-- ─── PAYMENTS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id       VARCHAR(20) UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    total_amount    DECIMAL(12,2),
    paid_amount     DECIMAL(12,2) DEFAULT 0,
    pending_amount  DECIMAL(12,2),
    due_date        DATE,
    payment_status  VARCHAR(50) DEFAULT 'Pending'
);

-- ─── DOCUMENTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id                   VARCHAR(20) UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    aadhaar_link                TEXT,
    aadhaar_number              VARCHAR(50),
    electricity_bill_link       TEXT,
    bill_number                 VARCHAR(50),
    pan_card_link               TEXT,
    bank_details                TEXT,
    additional_doc_1_link       TEXT,
    additional_doc_2_link       TEXT,
    additional_doc_3_link       TEXT,
    quotation_doc_link          TEXT,
    installation_photos_link    TEXT,
    subsidy_docs_link           TEXT
);

-- ─── SCHEMA UPGRADES (RUN ON COMPONENT STARTUP) ──────────────────────────────
-- In case the database was already created before, apply columns if they do not exist.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS battery_type VARCHAR(100);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS assigned_to_field VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Loan';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS dispute_status VARCHAR(50) DEFAULT 'None';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(50);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS bill_number VARCHAR(50);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS pan_card_link TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS bank_details TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS additional_doc_1_link TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS additional_doc_2_link TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS additional_doc_3_link TEXT;

-- ─── BACKUP SNAPSHOTS ───────────────────────────────────────────────────────
-- WHY: Stores full DB snapshots for rollback on data changes.
-- Auto-backup triggered via POST /api/backup/auto
CREATE TABLE IF NOT EXISTS backup_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label           VARCHAR(255) NOT NULL,
    snapshot_data   JSONB NOT NULL,
    table_counts    JSONB,
    created_by      VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_snapshots_created ON backup_snapshots(created_at);

-- ─── ACTIVITY LOG ───────────────────────────────────────────────────────────
-- WHY: Audit trail for compliance and debugging
CREATE TABLE IF NOT EXISTS activity_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email  VARCHAR(255),
    action      VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id   VARCHAR(255),
    details     JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INDEXES ────────────────────────────────────────────────────────────────
-- WHY: Speed up common queries (lookups by client_id, date ranges, search)
CREATE INDEX IF NOT EXISTS idx_clients_assigned_to ON clients(assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_assigned_to_field ON clients(assigned_to_field);
CREATE INDEX IF NOT EXISTS idx_clients_created_date ON clients(created_date);
CREATE INDEX IF NOT EXISTS idx_workflow_stage ON workflow_status(stage);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_email);

-- ─── UPDATED_AT TRIGGER ────────────────────────────────────────────────────
-- Automatically update the updated_at column on row changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['users', 'clients']) LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS set_updated_at ON %I;
            CREATE TRIGGER set_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', t, t);
    END LOOP;
END $$;

-- ─── DEFAULT ADMIN USER ────────────────────────────────────────────────────
-- Password: Admin@123 (bcrypt hash) — CHANGE THIS IMMEDIATELY after first login
-- This is a bootstrap user to get into the system.
INSERT INTO users (email, password, role, name, active)
VALUES (
    'admin@solarcrm.com',
    '$2a$12$qpVqjZjIPMq6uW0DX1dqUOyXJURfhBqjStTPtrGSr5mOb6oP4RkNa',
    'Admin',
    'System Admin',
    true
) ON CONFLICT (email) DO NOTHING;
`;

export async function runMigrations() {
  console.log('🔄 Running database migrations...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(MIGRATION_SQL);
    await client.query('COMMIT');
    console.log('✅ Database migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('migrate.ts') ||
  process.argv[1].endsWith('migrate.js') ||
  process.argv[1].includes('db/migrate')
);

if (isDirectRun) {
  runMigrations()
    .then(() => {
      console.log('Migration finished, closing pool.');
      return pool.end();
    })
    .catch((err) => {
      console.error('Unhandled migration error:', err);
      process.exit(1);
    });
}
