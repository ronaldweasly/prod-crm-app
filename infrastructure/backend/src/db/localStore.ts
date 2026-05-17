import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();
const dataDir = process.env.LOCAL_DATA_DIR
  ? path.resolve(process.env.LOCAL_DATA_DIR)
  : path.resolve(__dirname, '../../data');
const dbPath = process.env.LOCAL_DB_PATH
  ? path.resolve(process.env.LOCAL_DB_PATH)
  : path.join(dataDir, 'solarcrm.local.json');

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

let dbCache: LocalDatabase | null = null;
let writeQueue = Promise.resolve();

function emptyDb(): LocalDatabase {
  return {
    users: [],
    clients: [],
    workflow_status: [],
    surveys: [],
    quotations: [],
    installations: [],
    subsidies: [],
    payments: [],
    documents: [],
    activity_log: [],
    backup_snapshots: [],
  };
}

function normalizeDb(input: Partial<LocalDatabase>): LocalDatabase {
  const db = emptyDb();
  for (const table of tables) {
    (db as any)[table] = Array.isArray((input as any)[table]) ? (input as any)[table] : [];
  }
  return db;
}

async function saveDb(db: LocalDatabase) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  writeQueue = writeQueue.then(() =>
    fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8')
  );
  await writeQueue;
}

async function seedAdmin(db: LocalDatabase) {
  if (db.users.length > 0) return;

  const now = new Date().toISOString();
  const email = (process.env.ADMIN_EMAIL || 'admin@solarcrm.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'admin12345';
  const name = process.env.ADMIN_NAME || 'Local Admin';
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

  db.users.push({
    id: uuidv4(),
    email,
    password: await bcrypt.hash(password, rounds),
    role: 'Admin',
    name,
    active: true,
    created_at: now,
    updated_at: now,
  });
}

export async function getDb(): Promise<LocalDatabase> {
  if (dbCache) return dbCache;

  try {
    const raw = await fs.readFile(dbPath, 'utf8');
    dbCache = normalizeDb(JSON.parse(raw));
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
    dbCache = emptyDb();
  }

  await seedAdmin(dbCache);
  await saveDb(dbCache);
  return dbCache;
}

export async function mutateDb<T>(mutator: (db: LocalDatabase) => T | Promise<T>): Promise<T> {
  const db = await getDb();
  const result = await mutator(db);
  await saveDb(db);
  return result;
}

export async function getTable<T = any>(table: TableName): Promise<T[]> {
  const db = await getDb();
  return (db[table] as T[]).map((row) => ({ ...row }));
}

export async function insertRow<T extends Record<string, any>>(table: TableName, row: T): Promise<T> {
  return mutateDb((db) => {
    const now = new Date().toISOString();
    const next = {
      id: row.id || uuidv4(),
      created_at: row.created_at || now,
      updated_at: row.updated_at || now,
      ...row,
    } as T;
    (db[table] as any[]).push(next);
    return { ...next };
  });
}

export async function updateById<T extends Record<string, any>>(
  table: TableName,
  id: string,
  patch: Record<string, any>
): Promise<T | null> {
  return mutateDb((db) => {
    const rows = db[table] as any[];
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) return null;
    rows[index] = { ...rows[index], ...patch, id, updated_at: new Date().toISOString() };
    return { ...rows[index] };
  });
}

export async function upsertByClientId<T extends Record<string, any>>(
  table: Exclude<TableName, 'users' | 'clients' | 'activity_log' | 'backup_snapshots'>,
  clientId: string,
  patch: Record<string, any>
): Promise<T> {
  return mutateDb((db) => {
    const now = new Date().toISOString();
    const rows = db[table] as any[];
    const index = rows.findIndex((row) => row.client_id === clientId);
    if (index >= 0) {
      rows[index] = { ...rows[index], ...patch, client_id: clientId, updated_at: now };
      return { ...rows[index] };
    }
    const next = { id: uuidv4(), client_id: clientId, ...patch, created_at: now, updated_at: now };
    rows.push(next);
    return { ...next };
  });
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
  await getDb();
  return { path: dbPath };
}
