import { SHEET_NAMES, COLUMNS } from './config';
import { MOCK_DB, persistMockDb } from './mockData';
import { validateRowUpdate, logProtectionViolation, getProtectedColumns } from './protection';
import { Role } from './types';

// USE_MOCK is now driven by env variable.
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
const API_BASE = '/api';

if (USE_MOCK) {
  console.info('📋 Data Mode: MOCK — using built-in sample data.');
} else {
  console.info('⚡ Data Mode: LIVE — connected to PostgreSQL backend.');
}

// Map Sheet Names → Backend API endpoints
const TABLE_MAP: Record<string, string> = {
  [SHEET_NAMES.CLIENTS]: 'clients',
  [SHEET_NAMES.WORKFLOW_STATUS]: 'clients',
  [SHEET_NAMES.SURVEYS]: 'clients',
  [SHEET_NAMES.QUOTATIONS]: 'clients',
  [SHEET_NAMES.INSTALLATIONS]: 'clients',
  [SHEET_NAMES.SUBSIDIES]: 'clients',
  [SHEET_NAMES.PAYMENTS]: 'clients',
  [SHEET_NAMES.DOCUMENTS]: 'clients',
  [SHEET_NAMES.USERS]: 'users',
};

// Map Sheet Columns → DB Columns (in order)
const DB_COLUMNS: Record<string, string[]> = {
  [SHEET_NAMES.CLIENTS]: ['id', 'name', 'phone', 'address', 'roof_type', 'battery_type', 'system_size_kw', 'created_date', 'assigned_to'],
  [SHEET_NAMES.WORKFLOW_STATUS]: ['client_id', 'stage', 'updated_at', 'updated_by'],
  [SHEET_NAMES.SURVEYS]: ['client_id', 'survey_date', 'site_images', 'recommended_system_details', 'surveyor_name'],
  [SHEET_NAMES.QUOTATIONS]: ['client_id', 'quotation_pdf', 'amount', 'validity_date', 'approval_status'],
  [SHEET_NAMES.INSTALLATIONS]: ['client_id', 'team_members', 'progress_notes', 'completion_percentage', 'start_date', 'end_date'],
  [SHEET_NAMES.SUBSIDIES]: ['client_id', 'status', 'applied_date', 'approval_date', 'amount'],
  [SHEET_NAMES.PAYMENTS]: ['client_id', 'total_amount', 'paid_amount', 'pending_amount', 'due_date', 'payment_status'],
  [SHEET_NAMES.DOCUMENTS]: [
    'client_id',
    'aadhaar_link',
    'aadhaar_number',
    'electricity_bill_link',
    'bill_number',
    'pan_card_link',
    'bank_details',
    'additional_doc_1_link',
    'additional_doc_2_link',
    'additional_doc_3_link',
    'quotation_doc_link',
    'installation_photos_link',
    'subsidy_docs_link',
  ],
  [SHEET_NAMES.USERS]: ['email', 'role', 'name', 'active', 'password'],
};

// ─── Auto-backup trigger ────────────────────────────────────────────────────────
// Sends a non-blocking POST to /api/backup/auto after data mutations.
// Rate-limited server-side (max 1 per 5 min per user).

async function triggerAutoBackup(): Promise<void> {
  try {
    await apiFetch('/backup/auto', { method: 'POST' });
  } catch {
    // Auto-backup is best-effort — don't block the main operation
  }
}

// ─── Generic API helper ────────────────────────────────────────────────────────

async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `API Error: ${response.status}`);
  }

  return response.json();
}

// Date column normalization helpers
const DATE_COLUMNS = [
  'created_date',
  'survey_date',
  'validity_date',
  'start_date',
  'end_date',
  'applied_date',
  'approval_date',
  'due_date',
];

function convertDdMmYyyyToYyyyMmDd(val: string): string {
  if (!val) return '';
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return trimmed;
}

function convertYyyyMmDdToDdMmYyyy(val: string): string {
  if (!val) return '';
  const trimmed = val.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) return trimmed;
  return trimmed;
}

// ─── Map DB snake_case row → sheet-style object ──────────────────────────────

function mapDbRowToSheet(sheetName: string, dbRow: any, rowIndex: number): any {
  const sheetKey = Object.keys(SHEET_NAMES).find(
    key => SHEET_NAMES[key as keyof typeof SHEET_NAMES] === sheetName
  );
  const sheetHeaders = sheetKey
    ? COLUMNS[sheetKey as keyof typeof COLUMNS]
    : [];
  const dbCols = DB_COLUMNS[sheetName] || [];

  const item: any = { _rowIndex: rowIndex };
  sheetHeaders.forEach((header: string, idx: number) => {
    const dbCol = dbCols[idx];
    let val = dbRow[dbCol];
    if (val === null || val === undefined) val = '';
    if (typeof val === 'boolean') val = val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') val = String(val);
    
    let strVal = String(val);
    if (DATE_COLUMNS.includes(dbCol) && strVal) {
      strVal = convertYyyyMmDdToDdMmYyyy(strVal);
    }
    
    item[header] = strVal;
  });
  return item;
}

function mapSheetToDbRow(sheetName: string, values: any[]): Record<string, any> {
  const dbCols = DB_COLUMNS[sheetName] || [];
  const obj: Record<string, any> = {};

  dbCols.forEach((col, i) => {
    let val = values[i];
    if (val === '' || val === undefined) {
      obj[col] = null;
      return;
    }
    if (['amount', 'total_amount', 'paid_amount', 'pending_amount', 'completion_percentage', 'system_size_kw'].includes(col)) {
      const num = Number(val);
      obj[col] = isNaN(num) ? null : num;
      return;
    }
    if (col === 'active') {
      obj[col] = val === 'TRUE' || val === true;
      return;
    }
    if (DATE_COLUMNS.includes(col) && typeof val === 'string') {
      obj[col] = convertDdMmYyyyToYyyyMmDd(val) || null;
      return;
    }
    obj[col] = val;
  });

  return obj;
}

export function setAccessToken(token: string) {
  // Not needed — auth is handled via httpOnly cookies
}

// ─── USERS: Separate handling since there's no dedicated users CRUD in backend ──

async function fetchUsersFromBackend(): Promise<any[]> {
  try {
    // Try to get users list from backend
    const data = await apiFetch<any[]>('/users', {
      method: 'GET',
    });
    return (data || []).map((u: any, i: number) => ({
      Email: u.email,
      Role: u.role,
      Name: u.name,
      Active: u.active !== false ? 'TRUE' : 'FALSE',
      _rowIndex: i,
    }));
  } catch (err) {
    console.warn('[API] Could not fetch users from backend, check auth status:', (err as Error).message);
    // Return an empty list — auth session provides the current user info
    return [];
  }
}

async function createUserOnBackend(values: any[]): Promise<void> {
  const [email, role, name, active, password] = values;
  if (!password) throw new Error('Password is required to create a user');

  await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name: name || email.split('@')[0], role: role || 'Sales Team' }),
  });
}

async function updateUserOnBackend(originalEmail: string, values: any[]): Promise<void> {
  const [email, role, name, active] = values;

  // The backend doesn't have a PUT /users endpoint yet
  // For now, simulate via auth register + log warning
  // In production, you'd add a PATCH /users endpoint
  console.warn('[API] User update not directly supported by backend. Please add via DB admin panel.');

  // Try PATCH if available
  try {
    await apiFetch('/users', {
      method: 'PATCH',
      body: JSON.stringify({ email: originalEmail, role, name, active: active === 'TRUE' }),
    });
  } catch {
    // Fallback: update via mock DB (local storage) for session persistence
    const updatedUsers = JSON.parse(localStorage.getItem('solar_crm_users_cache') || '[]');
    const idx = updatedUsers.findIndex((u: any) => u.email === originalEmail);
    if (idx >= 0) {
      updatedUsers[idx] = { ...updatedUsers[idx], role, name, active: active === 'TRUE' };
      localStorage.setItem('solar_crm_users_cache', JSON.stringify(updatedUsers));
    }
  }
}

// ─── MAIN EXPORTED FUNCTIONS ──────────────────────────────────────────────────

/**
 * Fetch all rows from a table (sheet), mapped back to Sheet-style headers.
 */
export async function getSheetData<T = any>(sheetName: string): Promise<T[]> {
  if (USE_MOCK) {
    const data = MOCK_DB[sheetName] || [];
    return JSON.parse(JSON.stringify(data)).map((item: any, i: number) => ({ ...item, _rowIndex: i }));
  }

  // Users: special handling
  if (sheetName === SHEET_NAMES.USERS) {
    return (await fetchUsersFromBackend()) as unknown as T[];
  }

  // Clients: fetch from backend
  if (sheetName === SHEET_NAMES.CLIENTS) {
    const result = await apiFetch<{ data: any[]; pagination: any }>('/clients?limit=9999');

    return (result.data || []).map((dbRow: any, i: number) =>
      mapDbRowToSheet(sheetName, dbRow, i)
    ) as unknown as T[];
  }

  // For client-related sheets, fetch from the backend /relations/:table endpoint
  const RELATED_TABLE_MAP: Record<string, string> = {
    [SHEET_NAMES.WORKFLOW_STATUS]: 'workflow_status',
    [SHEET_NAMES.SUBSIDIES]: 'subsidies',
    [SHEET_NAMES.PAYMENTS]: 'payments',
    [SHEET_NAMES.SURVEYS]: 'surveys',
    [SHEET_NAMES.QUOTATIONS]: 'quotations',
    [SHEET_NAMES.INSTALLATIONS]: 'installations',
    [SHEET_NAMES.DOCUMENTS]: 'documents',
  };
  const dbTable = RELATED_TABLE_MAP[sheetName];
  if (dbTable) {
    try {
      const result = await apiFetch<any[]>(`/clients/relations/${dbTable}`);
      return (result || []).map((dbRow: any, i: number) =>
        mapDbRowToSheet(sheetName, dbRow, i)
      ) as unknown as T[];
    } catch (err) {
      console.error(`[API] Failed to fetch ${sheetName}:`, (err as Error).message);
      return [];
    }
  }

  return [];
}

/**
 * Insert a new row.
 */
export async function appendRow(sheetName: string, values: any[]) {
  if (USE_MOCK) {
    if (!MOCK_DB[sheetName]) MOCK_DB[sheetName] = [];
    const sheetKey = Object.keys(SHEET_NAMES).find(key => SHEET_NAMES[key as keyof typeof SHEET_NAMES] === sheetName);
    const headers = sheetKey ? COLUMNS[sheetKey as keyof typeof COLUMNS] : [];
    const newObj: any = {};
    headers.forEach((h: string, i: number) => {
      newObj[h] = values[i] || '';
    });
    MOCK_DB[sheetName].push(newObj);
    persistMockDb(); // 💾 Save to localStorage
    return { status: 200 };
  }

  if (sheetName === SHEET_NAMES.USERS) {
    await createUserOnBackend(values);
    return { status: 200 };
  }

  if (sheetName === SHEET_NAMES.CLIENTS) {
    const dbObj = mapSheetToDbRow(sheetName, values);
    const result = await apiFetch('/clients', {
      method: 'POST',
      body: JSON.stringify(dbObj),
    });
    triggerAutoBackup(); // fire-and-forget
    return { status: 200, data: result };
  }

  if (SHEET_TO_ENDPOINT[sheetName]) {
    const clientId = values[0];
    if (!clientId) throw new Error(`Cannot append to ${sheetName}: missing Client ID`);
    await upsertClientRelation(clientId, sheetName, values);
    triggerAutoBackup();
    return { status: 200 };
  }

  throw new Error(`Cannot append to ${sheetName} via backend`);
}

/**
 * Update an existing row.
 */
export async function updateRow(sheetName: string, rowIndex: number, values: any[]) {
  if (USE_MOCK) {
    if (!MOCK_DB[sheetName] || !MOCK_DB[sheetName][rowIndex]) return { status: 404 };
    const sheetKey = Object.keys(SHEET_NAMES).find(key => SHEET_NAMES[key as keyof typeof SHEET_NAMES] === sheetName);
    const headers = sheetKey ? COLUMNS[sheetKey as keyof typeof COLUMNS] : [];
    const updatedObj: any = { ...MOCK_DB[sheetName][rowIndex] };
    headers.forEach((h: string, i: number) => {
      updatedObj[h] = values[i] || '';
    });
    MOCK_DB[sheetName][rowIndex] = updatedObj;
    persistMockDb(); // 💾 Save to localStorage
    return { status: 200 };
  }

  if (sheetName === SHEET_NAMES.USERS) {
    // Get the user's email to identify them — it's the first column
    const email = values[0];
    await updateUserOnBackend(email, values);
    return { status: 200 };
  }

  if (sheetName === SHEET_NAMES.CLIENTS) {
    const dbObj = mapSheetToDbRow(sheetName, values);
    const id = dbObj.id;
    if (!id) throw new Error('Cannot update client: missing ID');
    await apiFetch(`/clients/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(dbObj),
    });
    triggerAutoBackup(); // fire-and-forget
    return { status: 200 };
  }

  if (SHEET_TO_ENDPOINT[sheetName]) {
    const clientId = values[0];
    if (!clientId) throw new Error(`Cannot update ${sheetName}: missing Client ID`);
    await upsertClientRelation(clientId, sheetName, values);
    triggerAutoBackup();
    return { status: 200 };
  }

  throw new Error(`Cannot update ${sheetName} via backend`);
}

export async function findRowsByColumn<T = any>(sheetName: string, columnName: string, value: string): Promise<T[]> {
  const allData = await getSheetData<T>(sheetName);
  return allData.filter((item: any) => item[columnName] === value);
}

/**
 * Protected API functions that enforce sheet protection rules
 */
export async function updateRowProtected(
  sheetName: string,
  rowIndex: number,
  values: any[],
  userEmail?: string,
  userRole?: Role
) {
  const sheetKey = Object.keys(SHEET_NAMES).find(key => SHEET_NAMES[key as keyof typeof SHEET_NAMES] === sheetName);
  const headers = sheetKey ? COLUMNS[sheetKey as keyof typeof COLUMNS] : [];

  const updates: Record<string, any> = {};
  headers.forEach((h: string, i: number) => {
    if (values[i] !== undefined) {
      updates[h] = values[i];
    }
  });

  const validation = validateRowUpdate(sheetName, updates, userRole);
  if (!validation.valid) {
    const error = validation.errors.join('; ');
    if (userEmail) {
      logProtectionViolation(userEmail, sheetName, headers.join(','), values, userRole);
    }
    throw new Error(`Update denied: ${error}`);
  }

  return updateRow(sheetName, rowIndex, values);
}

export async function appendRowProtected(
  sheetName: string,
  values: any[],
  userEmail?: string,
  userRole?: Role
) {
  const protectedColumns = getProtectedColumns(sheetName);
  if (protectedColumns.length > 0 && userRole && userRole !== 'Admin') {
    if (sheetName === 'Users' || sheetName === 'WORKFLOW_STATUS') {
      throw new Error('You do not have permission to add entries to this sheet');
    }
  }

  return appendRow(sheetName, values);
}

// ─── CLIENT-RELATED OPERATIONS ────────────────────────────────────────────────

/**
 * Fetch a single client with all related data from the backend
 */
export async function getClientWithRelated(clientId: string): Promise<{
  client: any;
  workflow: any;
  survey: any;
  quotation: any;
  installation: any;
  subsidy: any;
  payment: any;
  documents: any;
} | null> {
  if (USE_MOCK) {
    // For mock mode, gather from mock DB
    const clients = MOCK_DB[SHEET_NAMES.CLIENTS] || [];
    const client = clients.find((c: any) => c['ID'] === clientId || c['id'] === clientId);
    if (!client) return null;

    const findFirst = (sheet: string, col: string) => {
      const rows = MOCK_DB[sheet] || [];
      return rows.find((r: any) => r[col] === clientId) || null;
    };

    return {
      client: mapDbRowToSheet(SHEET_NAMES.CLIENTS, client, 0),
      workflow: findFirst(SHEET_NAMES.WORKFLOW_STATUS, 'Client ID'),
      survey: findFirst(SHEET_NAMES.SURVEYS, 'Client ID'),
      quotation: findFirst(SHEET_NAMES.QUOTATIONS, 'Client ID'),
      installation: findFirst(SHEET_NAMES.INSTALLATIONS, 'Client ID'),
      subsidy: findFirst(SHEET_NAMES.SUBSIDIES, 'Client ID'),
      payment: findFirst(SHEET_NAMES.PAYMENTS, 'Client ID'),
      documents: findFirst(SHEET_NAMES.DOCUMENTS, 'Client ID'),
    };
  }

  try {
    const data = await apiFetch<{
      client: any;
      workflow: any;
      survey: any;
      quotation: any;
      installation: any;
      subsidy: any;
      payment: any;
      documents: any;
    }>(`/clients/${encodeURIComponent(clientId)}`);

    if (!data.client) return null;

    // Map each entity to sheet-style format
    const mapEntity = (entity: any, sheetName: string, idx: number = 0) =>
      entity ? mapDbRowToSheet(sheetName, entity, idx) : null;

    return {
      client: mapEntity(data.client, SHEET_NAMES.CLIENTS, 0),
      workflow: mapEntity(data.workflow, SHEET_NAMES.WORKFLOW_STATUS, 0),
      survey: mapEntity(data.survey, SHEET_NAMES.SURVEYS, 0),
      quotation: mapEntity(data.quotation, SHEET_NAMES.QUOTATIONS, 0),
      installation: mapEntity(data.installation, SHEET_NAMES.INSTALLATIONS, 0),
      subsidy: mapEntity(data.subsidy, SHEET_NAMES.SUBSIDIES, 0),
      payment: mapEntity(data.payment, SHEET_NAMES.PAYMENTS, 0),
      documents: mapEntity(data.documents, SHEET_NAMES.DOCUMENTS, 0),
    };
  } catch (err: any) {
    console.error('[API] Failed to fetch client with related data:', err.message);
    return null;
  }
}

/**
 * Upsert related data for a client (survey, quotation, installation, etc.)
 * Maps sheet names to backend endpoint segments
 */
const SHEET_TO_ENDPOINT: Record<string, string> = {
  [SHEET_NAMES.WORKFLOW_STATUS]: 'workflow',
  [SHEET_NAMES.SURVEYS]: 'surveys',
  [SHEET_NAMES.QUOTATIONS]: 'quotations',
  [SHEET_NAMES.INSTALLATIONS]: 'installations',
  [SHEET_NAMES.SUBSIDIES]: 'subsidies',
  [SHEET_NAMES.PAYMENTS]: 'payments',
  [SHEET_NAMES.DOCUMENTS]: 'documents',
};

export async function upsertClientRelation(
  clientId: string,
  sheetName: string,
  values: any[]
): Promise<any> {
  if (USE_MOCK) {
    // Upsert into mock DB
    if (!MOCK_DB[sheetName]) MOCK_DB[sheetName] = [];
    const sheetKey = Object.keys(SHEET_NAMES).find(key => SHEET_NAMES[key as keyof typeof SHEET_NAMES] === sheetName);
    const headers = sheetKey ? COLUMNS[sheetKey as keyof typeof COLUMNS] : [];

    const existingIdx = MOCK_DB[sheetName].findIndex((r: any) => r['Client ID'] === clientId);
    const newObj: any = { 'Client ID': clientId };
    headers.forEach((h: string, i: number) => {
      newObj[h] = values[i] || '';
    });

    if (existingIdx >= 0) {
      MOCK_DB[sheetName][existingIdx] = newObj;
    } else {
      MOCK_DB[sheetName].push(newObj);
    }
    persistMockDb(); // 💾 Save to localStorage
    return { status: 200 };
  }

  const endpoint = SHEET_TO_ENDPOINT[sheetName];
  if (!endpoint) throw new Error(`Unknown relation sheet: ${sheetName}`);

  // Build body from values using DB column names
  const dbCols = DB_COLUMNS[sheetName] || [];
  const body: Record<string, any> = {};
  dbCols.forEach((col, i) => {
    if (col === 'client_id') return; // Don't include client_id in body
    let val = values[i];
    if (val !== '' && val !== undefined && val !== null) {
      if (['amount', 'total_amount', 'paid_amount', 'pending_amount', 'completion_percentage'].includes(col)) {
        body[col] = Number(val);
      } else if (col === 'active') {
        body[col] = val === 'TRUE' || val === true;
      } else {
        body[col] = val;
      }
    }
  });

  const result = await apiFetch(`/clients/${encodeURIComponent(clientId)}/${endpoint}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

  return result;
}

/**
 * Delete a client and all related records across tables.
 */
export async function deleteClientCompletely(clientId: string) {
  if (!clientId) throw new Error('Client ID is required');

  if (USE_MOCK) {
    const deleteByClientIdSheets = [
      SHEET_NAMES.WORKFLOW_STATUS,
      SHEET_NAMES.SURVEYS,
      SHEET_NAMES.QUOTATIONS,
      SHEET_NAMES.INSTALLATIONS,
      SHEET_NAMES.SUBSIDIES,
      SHEET_NAMES.PAYMENTS,
      SHEET_NAMES.DOCUMENTS,
    ];

    deleteByClientIdSheets.forEach((sheet) => {
      if (!MOCK_DB[sheet]) return;
      MOCK_DB[sheet] = MOCK_DB[sheet].filter((row: any) => row['Client ID'] !== clientId);
    });

    if (MOCK_DB[SHEET_NAMES.CLIENTS]) {
      MOCK_DB[SHEET_NAMES.CLIENTS] = MOCK_DB[SHEET_NAMES.CLIENTS].filter((row: any) => row.ID !== clientId);
    }

    persistMockDb(); // 💾 Save to localStorage
    return { status: 200 };
  }

  await apiFetch(`/clients/${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
  });

  triggerAutoBackup(); // fire-and-forget
  return { status: 200 };
}

/**
 * Delete a user by email
 */
export async function deleteUser(email: string): Promise<{ status: number }> {
  if (USE_MOCK) {
    if (MOCK_DB[SHEET_NAMES.USERS]) {
      MOCK_DB[SHEET_NAMES.USERS] = MOCK_DB[SHEET_NAMES.USERS].filter(
        (u: any) => u.Email?.toLowerCase() !== email.toLowerCase()
      );
      persistMockDb();
    }
    return { status: 200 };
  }

  await apiFetch(`/users/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });
  return { status: 200 };
}

/**
 * Fetch dashboard stats from backend
 */
export async function getDashboardStats(): Promise<any> {
  if (USE_MOCK) {
    return {
      totalClients: (MOCK_DB[SHEET_NAMES.CLIENTS] || []).length,
      stageDistribution: [],
      recentClients: [],
      paymentSummary: { total_revenue: 0, collected: 0, pending: 0 },
    };
  }

  try {
    return await apiFetch('/clients/stats/dashboard');
  } catch (err: any) {
    console.warn('[API] Could not fetch dashboard stats:', err.message);
    return {
      totalClients: 0,
      stageDistribution: [],
      recentClients: [],
      paymentSummary: { total_revenue: 0, collected: 0, pending: 0 },
    };
  }
}
