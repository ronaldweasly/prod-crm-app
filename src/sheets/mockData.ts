import { SHEET_NAMES } from './config';

// ─── Deterministic pseudo-random (seeded) ────────────────────────────────────
// Using a simple seeded random to keep mock data stable across page reloads.
function seededRandom(seed: number) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0xffffffff);
  };
}
const rng = seededRandom(42); // fixed seed — same data every time

function ri(min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function randomDate(start: Date, end: Date) {
  const t = start.getTime() + rng() * (end.getTime() - start.getTime());
  return new Date(t);
}

// ─── Reference data ───────────────────────────────────────────────────────────
const firstNames = ['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Ayaan','Krishna','Ishaan','Shaurya','Atharv','Advik','Pranav','Rian','Kabir','Rudra','Aryan','Dhruv','Siddharth','Diya','Pari','Anushka','Avni','Aadhya','Kriti','Myra','Ananya','Aaradhya','Kiara','Saanvi','Prisha','Riya','Aanya','Sara','Jiya','Tara','Kavya','Navya','Isha','Siya','Nitya','Anvi','Ahana'];
const lastNames  = ['Patel','Sharma','Singh','Deshmukh','Rao','Kumar','Reddy','Das','Chatterjee','Iyer','Menon','Nair','Bose','Gupta','Joshi','Kapoor','Kaur','Mehta','Mishra','Pandey','Saxena','Shah','Verma','Yadav','Trivedi','Agarwal','Chauhan','Dixit','Jain','Garg','Chopra','Malhotra','Sethi'];
const addresses  = ['M.G. Road','Link Road','Outer Ring Road','Park Street','FC Road','Kalyani Nagar','Indiranagar','Juhu','Bandra','Connaught Place','Vasant Kunj','Salt Lake','Gachibowli','Banjara Hills','Marina Beach','Anna Nagar'];
const stages     = ['Lead','Survey Scheduled','Survey Done','Quotation Sent','Quotation Approved','Installation Started','Installation Completed','Subsidy Applied','Subsidy Received','Project Closed'];
const roofTypes  = ['Flat','Sloped','Mixed'];
const sysSizes   = ['3','5','8','10','15','20'];

// ─── Fixed date anchors (relative to a fixed point in time) ──────────────────
const BASE_DATE   = new Date('2025-11-01T00:00:00Z');
const END_DATE    = new Date('2026-04-30T00:00:00Z');

// ─── LOCALSTORAGE PERSISTENCE ─────────────────────────────────────────────────
// Data persists across page refreshes by syncing to localStorage
const STORAGE_KEY = 'solarcrm_mock_db';

function loadFromStorage(): Record<string, any[]> | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('[MockDB] Failed to load from localStorage:', e);
  }
  return null;
}

function saveToStorage(db: Record<string, any[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    console.warn('[MockDB] Failed to save to localStorage:', e);
  }
}

// ─── Initial default users (always seeded) ───────────────────────────────────
const DEFAULT_USERS = [
  { Email: 'hfj1887@gmail.com',      Role: 'Admin',      Name: 'Himanshu Shukla', Active: 'TRUE' },
  { Email: 'admin@gmail.com',        Role: 'Admin',      Name: 'Admin User',      Active: 'TRUE' },
  { Email: 'admin@solar.com',        Role: 'Admin',      Name: 'John Doe',        Active: 'TRUE' },
  { Email: 'sales@solar.com',        Role: 'Sales Team', Name: 'Alice Sales',     Active: 'TRUE' },
  { Email: 'engineer@solar.com',     Role: 'Engineer',   Name: 'Bob Builder',     Active: 'TRUE' },
  { Email: 'accountant@solar.com',   Role: 'Accountant', Name: 'Cathy Coin',      Active: 'TRUE' },
];

// ─── Build the mock database with persistence ────────────────────────────────
function buildMockDb(): Record<string, any[]> {
  const stored = loadFromStorage();
  if (stored) {
    // Ensure default users are always present even if storage was cleared
    if (!stored[SHEET_NAMES.USERS] || stored[SHEET_NAMES.USERS].length === 0) {
      stored[SHEET_NAMES.USERS] = [...DEFAULT_USERS];
    }
    return stored;
  }

  // Fresh start — create initial structure
  const fresh: Record<string, any[]> = {
    [SHEET_NAMES.USERS]: [...DEFAULT_USERS],
    [SHEET_NAMES.CLIENTS]:          [],
    [SHEET_NAMES.WORKFLOW_STATUS]:  [],
    [SHEET_NAMES.SURVEYS]:          [],
    [SHEET_NAMES.QUOTATIONS]:       [],
    [SHEET_NAMES.INSTALLATIONS]:    [],
    [SHEET_NAMES.SUBSIDIES]:        [],
    [SHEET_NAMES.PAYMENTS]:         [],
    [SHEET_NAMES.DOCUMENTS]:        [],
  };

  saveToStorage(fresh);
  return fresh;
}

// Export the persistent mock database
export const MOCK_DB: Record<string, any[]> = buildMockDb();

/**
 * Persist any mutations to MOCK_DB back to localStorage.
 * Must be called after every mutation (append, update, delete).
 */
export function persistMockDb(): void {
  saveToStorage(MOCK_DB);
}

/**
 * Reset all mock data (clears localStorage + reloads defaults).
 * Useful for testing or when user explicitly requests a reset.
 */
export function resetMockDb(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[MockDB] Failed to clear localStorage:', e);
  }

  // Reset in-memory arrays
  MOCK_DB[SHEET_NAMES.USERS] = [...DEFAULT_USERS];
  MOCK_DB[SHEET_NAMES.CLIENTS] = [];
  MOCK_DB[SHEET_NAMES.WORKFLOW_STATUS] = [];
  MOCK_DB[SHEET_NAMES.SURVEYS] = [];
  MOCK_DB[SHEET_NAMES.QUOTATIONS] = [];
  MOCK_DB[SHEET_NAMES.INSTALLATIONS] = [];
  MOCK_DB[SHEET_NAMES.SUBSIDIES] = [];
  MOCK_DB[SHEET_NAMES.PAYMENTS] = [];
  MOCK_DB[SHEET_NAMES.DOCUMENTS] = [];

  // Persist the reset state
  persistMockDb();
  console.info('[MockDB] Reset complete');
}