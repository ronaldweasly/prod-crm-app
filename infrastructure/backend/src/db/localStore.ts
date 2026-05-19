import { pool, query } from './pool.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

export type TableName =
  | 'users'
  | 'clients'
  | 'workflow_status'
  | 'surveys'
  | 'quotations'
  | 'installations'
  | 'subsidies'
  | 'payments'
  | 'documents'
  | 'activity_log'
  | 'backup_snapshots';

export type Role = 'Admin' | 'Sales Team' | 'Engineer' | 'Accountant' | 'Manager';

export interface LocalUser {
  id: string;
  email: string;
  password: string;
  role: Role;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocalDatabase {
  users: LocalUser[];
  clients: any[];
  workflow_status: any[];
  surveys: any[];
  quotations: any[];
  installations: any[];
  subsidies: any[];
  payments: any[];
  documents: any[];
  activity_log: any[];
  backup_snapshots: any[];
}

const tables: TableName[] = [
  'users',
  'clients',
  'workflow_status',
  'surveys',
  'quotations',
  'installations',
  'subsidies',
  'payments',
  'documents',
  'activity_log',
  'backup_snapshots',
];

export async function getDb(): Promise<LocalDatabase> {
  const db: any = {};
  for (const table of tables) {
    const res = await query(`SELECT * FROM ${table}`);
    db[table] = res.rows;
  }
  return db as LocalDatabase;
}

export async function seedDefaultAdmin(): Promise<void> {
  const res = await query('SELECT COUNT(*) FROM users');
  const count = parseInt(res.rows[0].count, 10);
  if (count === 0) {
    const email = (process.env.ADMIN_EMAIL || 'admin@solarcrm.local').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'admin12345';
    const name = process.env.ADMIN_NAME || 'Local Admin';
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
    const hash = await bcrypt.hash(password, rounds);
    
    const userRow = {
      id: uuidv4(),
      email,
      password: hash,
      role: 'Admin' as Role,
      name,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    await insertRow('users', userRow);
    console.log('👤 Seeded default admin user');
  }
}

export async function mutateDb<T>(mutator: (db: LocalDatabase) => T | Promise<T>): Promise<T> {
  const db = await getDb();
  // Deep clone db to have a baseline
  const original = JSON.parse(JSON.stringify(db));
  
  // Run the mutator
  const result = await mutator(db);
  
  // Diff and apply changes
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    for (const table of tables) {
      const origRows = original[table] || [];
      const newRows = db[table] || [];
      
      const origMap: Map<any, any> = new Map(origRows.map((r: any) => [r.id || r.email || r.client_id, r]));
      const newMap: Map<any, any> = new Map(newRows.map((r: any) => [r.id || r.email || r.client_id, r]));
      
      // 1. Delete rows in original but not in new
      for (const [key, origRow] of origMap.entries()) {
        if (!newMap.has(key)) {
          if (origRow.id) {
            await client.query(`DELETE FROM ${table} WHERE id = $1`, [origRow.id]);
          } else if (origRow.client_id) {
            await client.query(`DELETE FROM ${table} WHERE client_id = $1`, [origRow.client_id]);
          } else if (origRow.email) {
            await client.query(`DELETE FROM ${table} WHERE email = $1`, [origRow.email]);
          }
        }
      }
      
      // 2. Insert new rows or update modified ones
      for (const [key, newRow] of newMap.entries()) {
        const origRow = origMap.get(key);
        if (!origRow) {
          // Insert
          const keys = Object.keys(newRow);
          const values = Object.values(newRow);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
          await client.query(sql, values);
        } else {
          // Check if modified
          if (JSON.stringify(origRow) !== JSON.stringify(newRow)) {
            // Update
            const keys = Object.keys(newRow).filter(k => k !== 'id' && k !== 'client_id' && k !== 'email');
            if (keys.length > 0) {
              const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
              const values = keys.map(k => newRow[k]);
              
              let sql = '';
              let filterVal = '';
              if (newRow.id) {
                sql = `UPDATE ${table} SET ${sets} WHERE id = $1`;
                filterVal = newRow.id;
              } else if (newRow.client_id) {
                sql = `UPDATE ${table} SET ${sets} WHERE client_id = $1`;
                filterVal = newRow.client_id;
              } else if (newRow.email) {
                sql = `UPDATE ${table} SET ${sets} WHERE email = $1`;
                filterVal = newRow.email;
              }
              
              if (sql) {
                await client.query(sql, [filterVal, ...values]);
              }
            }
          }
        }
      }
    }
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  
  return result;
}

export async function getTable<T = any>(table: TableName): Promise<T[]> {
  const res = await query(`SELECT * FROM ${table}`);
  return res.rows as T[];
}

export async function insertRow<T extends Record<string, any>>(table: TableName, row: T): Promise<T> {
  const keys = Object.keys(row);
  const values = Object.values(row);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  const res = await query(sql, values);
  return res.rows[0] as T;
}

export async function updateById<T extends Record<string, any>>(
  table: TableName,
  id: string,
  patch: Record<string, any>
): Promise<T | null> {
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    const res = await query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    return res.rows[0] || null;
  }
  const sets = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
  const sql = `UPDATE ${table} SET ${sets} WHERE id = $1 RETURNING *`;
  const res = await query(sql, [id, ...Object.values(patch)]);
  return res.rows[0] as T | null;
}

export async function upsertByClientId<T extends Record<string, any>>(
  table: Exclude<TableName, 'users' | 'clients' | 'activity_log' | 'backup_snapshots'>,
  clientId: string,
  patch: Record<string, any>
): Promise<T> {
  const keys = Object.keys(patch);
  
  // Ensure client_id is in keys
  if (!keys.includes('client_id')) {
    keys.push('client_id');
    patch = { ...patch, client_id: clientId };
  }
  
  const values = keys.map(k => patch[k]);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  
  const updateKeys = keys.filter(k => k !== 'client_id' && k !== 'id');
  let updateClause = '';
  if (updateKeys.length > 0) {
    updateClause = 'DO UPDATE SET ' + updateKeys.map(k => `${k} = EXCLUDED.${k}`).join(', ');
  } else {
    updateClause = 'DO NOTHING';
  }
  
  const sql = `
    INSERT INTO ${table} (${keys.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT (client_id)
    ${updateClause}
    RETURNING *
  `;
  
  const res = await query(sql, values);
  return res.rows[0] as T;
}

export async function logActivity(row: Record<string, any>) {
  await insertRow('activity_log', {
    user_email: row.user_email || 'system',
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id || null,
    details: row.details || null,
    ip_address: row.ip_address || null,
  });
}

export async function localDbInfo() {
  const dbName = pool.options.database || 'anticrm';
  return { path: `PostgreSQL Database: ${dbName}` };
}
