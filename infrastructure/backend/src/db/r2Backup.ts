// =============================================================================
// Hourly R2 Database Backup
// =============================================================================
// Uploads a gzipped snapshot of the entire local JSON database to Cloudflare R2
// every hour. Keeps the last 168 backups (7 days × 24 hours).
//
// Key path format: backups/db/YYYY-MM-DD/HH-mm.json.gz
// Latest snapshot is also stored at: backups/db/latest.json.gz
// =============================================================================

import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { gzipSync, gunzipSync } from 'zlib';
import { getDb, mutateDb } from './localStore.js';
import { v4 as uuidv4 } from 'uuid';

const BACKUP_TABLES = [
  'clients',
  'workflow_status',
  'surveys',
  'quotations',
  'installations',
  'subsidies',
  'payments',
  'documents',
  'users',
] as const;

const BUCKET = process.env.R2_BUCKET_NAME || 'solarcrm-files';
const BACKUP_PREFIX = 'backups/db/';
const MAX_BACKUPS = 168; // 7 days × 24 hours

// R2 client (S3-compatible) — reuse same credentials as uploads
function createR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null; // R2 not configured — skip backups silently
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

let r2: S3Client | null = null;

/**
 * Upload the current database snapshot to R2.
 * Called by setInterval every hour.
 */
export async function uploadBackupToR2(): Promise<void> {
  if (!r2) {
    r2 = createR2Client();
    if (!r2) {
      console.log('[R2 Backup] Skipped — R2 credentials not configured.');
      return;
    }
  }

  try {
    const db = await getDb();
    const now = new Date();
    const dateFolder = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStamp = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;

    // Build a lean snapshot (exclude backup_snapshots to avoid recursive bloat)
    const snapshot: Record<string, any[]> = {};
    const tableCounts: Record<string, number> = {};
    for (const table of BACKUP_TABLES) {
      snapshot[table] = (db as any)[table] || [];
      tableCounts[table] = snapshot[table].length;
    }

    const payload = JSON.stringify({
      created_at: now.toISOString(),
      table_counts: tableCounts,
      data: snapshot,
    });

    // Gzip to save bandwidth and storage
    const compressed = gzipSync(Buffer.from(payload, 'utf-8'));

    const timestampedKey = `${BACKUP_PREFIX}${dateFolder}/${timeStamp}.json.gz`;
    const latestKey = `${BACKUP_PREFIX}latest.json.gz`;

    // Upload timestamped backup
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: timestampedKey,
      Body: compressed,
      ContentType: 'application/gzip',
      ContentEncoding: 'gzip',
      Metadata: {
        'backup-type': 'scheduled-hourly',
        'table-counts': JSON.stringify(tableCounts),
      },
    }));

    // Also upload as "latest" for quick restore
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: latestKey,
      Body: compressed,
      ContentType: 'application/gzip',
      ContentEncoding: 'gzip',
      Metadata: {
        'backup-type': 'latest',
        'original-key': timestampedKey,
        'table-counts': JSON.stringify(tableCounts),
      },
    }));

    const sizeMb = (compressed.length / (1024 * 1024)).toFixed(2);
    console.log(
      `[R2 Backup] ✓ Uploaded ${timestampedKey} (${sizeMb} MB) — ` +
      `${Object.entries(tableCounts).map(([t, c]) => `${t}:${c}`).join(', ')}`
    );

    // Prune old backups beyond MAX_BACKUPS
    await pruneOldBackups();
  } catch (err) {
    console.error('[R2 Backup] ✗ Failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Delete the oldest backups if total count exceeds MAX_BACKUPS.
 */
async function pruneOldBackups(): Promise<void> {
  if (!r2) return;

  try {
    // List all backup objects under the prefix
    const listResult = await r2.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: BACKUP_PREFIX,
      MaxKeys: 1000,
    }));

    const objects = (listResult.Contents || [])
      .filter(obj => obj.Key && obj.Key !== `${BACKUP_PREFIX}latest.json.gz`) // don't count "latest"
      .sort((a, b) => (a.LastModified?.getTime() || 0) - (b.LastModified?.getTime() || 0));

    if (objects.length <= MAX_BACKUPS) return;

    const toDelete = objects.slice(0, objects.length - MAX_BACKUPS);

    await r2.send(new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: {
        Objects: toDelete.map(obj => ({ Key: obj.Key! })),
        Quiet: true,
      },
    }));

    console.log(`[R2 Backup] Pruned ${toDelete.length} old backup(s)`);
  } catch (err) {
    console.error('[R2 Backup] Prune warning:', err instanceof Error ? err.message : err);
  }
}

/**
 * Start the hourly R2 backup scheduler.
 * Also runs an immediate backup on startup.
 */
export function startR2BackupScheduler(): void {
  const r2Test = createR2Client();
  if (!r2Test) {
    console.log('[R2 Backup] Scheduler disabled — R2 credentials not configured.');
    return;
  }
  r2 = r2Test;

  console.log('[R2 Backup] Scheduler started — backing up every hour to R2.');

  // Run immediately on startup (after a 10-second delay to let DB init finish)
  setTimeout(() => uploadBackupToR2(), 10_000);

  // Then every hour
  setInterval(() => uploadBackupToR2(), 60 * 60 * 1000);
}

export interface R2BackupInfo {
  key: string;
  lastModified: string;
  size: number;
  label: string;
}

export async function listR2Backups(): Promise<R2BackupInfo[]> {
  if (!r2) {
    r2 = createR2Client();
    if (!r2) return [];
  }

  const listResult = await r2.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: BACKUP_PREFIX,
    MaxKeys: 1000,
  }));

  const objects = listResult.Contents || [];
  return objects
    .filter(obj => obj.Key && obj.Key !== `${BACKUP_PREFIX}latest.json.gz`)
    .map(obj => {
      const key = obj.Key!;
      const parts = key.split('/');
      const datePart = parts[2] || '';
      const timePart = (parts[3] || '').replace('.json.gz', '').replace('-', ':');
      const label = `Cloud Backup (${datePart} ${timePart})`;

      return {
        key,
        lastModified: obj.LastModified ? obj.LastModified.toISOString() : new Date().toISOString(),
        size: obj.Size || 0,
        label,
      };
    })
    .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
}

export async function restoreFromR2Backup(key: string, userEmail: string): Promise<boolean> {
  if (!r2) {
    r2 = createR2Client();
    if (!r2) throw new Error('R2 not configured');
  }

  const response = await r2.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));

  if (!response.Body) {
    throw new Error('R2 backup file is empty');
  }

  const bytes = await response.Body.transformToByteArray();
  const decompressed = gunzipSync(Buffer.from(bytes));
  const backup = JSON.parse(decompressed.toString('utf-8'));

  if (!backup.data) {
    throw new Error('Invalid backup format in R2');
  }

  await mutateDb((db) => {
    for (const table of BACKUP_TABLES) {
      if (backup.data[table]) {
        (db as any)[table] = backup.data[table].map((row: any) => ({ ...row }));
      }
    }
    db.activity_log.push({
      id: uuidv4(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_email: userEmail,
      action: 'RESTORE_R2',
      entity_type: 'backup_r2',
      entity_id: key,
      details: { key },
    });
    return true;
  });

  return true;
}

export async function downloadR2Backup(key: string): Promise<string> {
  if (!r2) {
    r2 = createR2Client();
    if (!r2) throw new Error('R2 not configured');
  }

  const response = await r2.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));

  if (!response.Body) {
    throw new Error('R2 backup file is empty');
  }

  const bytes = await response.Body.transformToByteArray();
  const decompressed = gunzipSync(Buffer.from(bytes));
  return decompressed.toString('utf-8');
}
