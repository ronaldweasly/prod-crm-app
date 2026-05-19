// =============================================================================
// Database Connection Pool
// =============================================================================
// Uses pg Pool for connection pooling.
// WHY pooling: Reuses database connections instead of creating a new one per
// request. Critical for performance — connecting to PostgreSQL takes ~50ms,
// reusing a pooled connection takes <1ms.
// =============================================================================

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load root .env first, then local backend .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

const { Pool } = pg;

// Parse NUMERIC (OID 1700) as float
pg.types.setTypeParser(1700, (val) => parseFloat(val));
// Keep DATE (OID 1082) as a string YYYY-MM-DD
pg.types.setTypeParser(1082, (val) => val);
// Keep TIMESTAMPTZ (OID 1184) as string
pg.types.setTypeParser(1184, (val) => val);
// Keep TIMESTAMP (OID 1114) as string
pg.types.setTypeParser(1114, (val) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Pool sizing for 4GB VPS with 1-50 users
  max: 20,                    // Max connections in pool
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Fail fast if can't connect in 5s
  // SSL: disabled for internal Docker network communication
  ssl: false,
});

// Log pool errors (don't crash the server)
pool.on('error', (err) => {
  console.error('❌ Unexpected database pool error:', err);
});

/**
 * Test database connectivity with automatic retry. Called during server startup.
 */
export async function testConnection(retries = 5, delay = 2000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT NOW() as current_time, current_database() as db');
        console.log(`🗄️  Connected to PostgreSQL: ${result.rows[0].db} at ${result.rows[0].current_time}`);
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  Database connection attempt ${i + 1}/${retries} failed: ${msg}. Retrying in ${delay}ms...`);
      if (i === retries - 1) {
        throw new Error(`Could not connect to PostgreSQL after ${retries} attempts: ${msg}`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Helper: Execute a parameterized query
 */
export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  // Log slow queries (>500ms) for debugging
  if (duration > 500) {
    console.warn(`⚠️  Slow query (${duration}ms):`, text.substring(0, 100));
  }

  return result;
}
