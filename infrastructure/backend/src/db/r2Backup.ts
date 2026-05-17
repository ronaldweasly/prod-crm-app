// =============================================================================
// Hourly R2 Database Backup
// =============================================================================
// Uploads a gzipped snapshot of the entire local JSON database to Cloudflare R2
// every hour. Keeps the last 168 backups (7 days × 24 hours).
//
// Key path format: backups/db/YYYY-MM-DD/HH-mm.json.gz
// Latest snapshot is also stored at: backups/db/latest.json.gz
// =============================================================================

import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { gzipSync } from 'zlib';
import { getDb } from './localStore.js';

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
