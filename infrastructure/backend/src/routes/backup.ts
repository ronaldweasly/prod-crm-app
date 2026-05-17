import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb, localDbInfo, mutateDb } from '../db/localStore.js';
import { authenticate } from '../middleware/auth.js';
import { uploadBackupToR2 } from '../db/r2Backup.js';

export const backupRouter = Router();

const tablesToBackup = [
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

const lastAutoBackup = new Map<string, number>();

function buildSnapshot(db: any) {
  const snapshot: Record<string, any[]> = {};
  const table_counts: Record<string, number> = {};

  for (const table of tablesToBackup) {
    snapshot[table] = db[table].map((row: any) => ({ ...row }));
    table_counts[table] = snapshot[table].length;
  }

  return { snapshot, table_counts };
}

async function createSnapshot(label: string, created_by: string) {
  return mutateDb((db) => {
    const { snapshot, table_counts } = buildSnapshot(db);
    const row = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      label,
      snapshot_data: snapshot,
      table_counts,
      created_by,
    };
    db.backup_snapshots.unshift(row);
    db.backup_snapshots = db.backup_snapshots.slice(0, 200);
    return row;
  });
}

backupRouter.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    res.json(
      db.backup_snapshots.slice(0, 50).map((row) => ({
        id: row.id,
        created_at: row.created_at,
        label: row.label,
        table_counts: row.table_counts,
        created_by: row.created_by,
      }))
    );
  } catch (err) {
    console.error('Error listing backups:', err);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

backupRouter.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const label = req.body.label || `Backup ${new Date().toISOString().slice(0, 10)}`;
    const row = await createSnapshot(label, req.user?.email || 'system');
    res.status(201).json({
      id: row.id,
      created_at: row.created_at,
      label: row.label,
      table_counts: row.table_counts,
      created_by: row.created_by,
    });
  } catch (err) {
    console.error('Error creating backup:', err);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

backupRouter.post('/auto', authenticate, async (req: Request, res: Response) => {
  try {
    const userEmail = req.user?.email || 'system';
    const now = Date.now();
    const lastBackup = lastAutoBackup.get(userEmail) || 0;

    if (now - lastBackup < 5 * 60 * 1000) {
      res.json({ skipped: true, reason: 'Rate limited' });
      return;
    }

    lastAutoBackup.set(userEmail, now);
    const row = await createSnapshot(`Auto-backup ${new Date().toISOString()}`, userEmail);
    res.status(201).json({ id: row.id, label: row.label, table_counts: row.table_counts });
  } catch (err) {
    console.error('Error creating auto-backup:', err);
    res.status(500).json({ error: 'Failed to create auto-backup' });
  }
});

// ─── MANUAL R2 CLOUD BACKUP ────────────────────────────────────────────────
// Admin-only: trigger an immediate cloud backup to Cloudflare R2
backupRouter.post('/r2', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role !== 'Admin') {
    res.status(403).json({ error: 'Only admins can trigger cloud backups' });
    return;
  }
  try {
    await uploadBackupToR2();
    res.status(201).json({ message: 'Cloud backup uploaded to R2 successfully' });
  } catch (err) {
    console.error('Error triggering R2 backup:', err);
    res.status(500).json({ error: 'Failed to upload cloud backup' });
  }
});

backupRouter.get('/location', authenticate, async (_req: Request, res: Response) => {
  res.json(await localDbInfo());
});

backupRouter.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const backup = db.backup_snapshots.find((row) => row.id === req.params.id);
    if (!backup) {
      res.status(404).json({ error: 'Backup not found' });
      return;
    }
    res.json(backup);
  } catch (err) {
    console.error('Error fetching backup:', err);
    res.status(500).json({ error: 'Failed to fetch backup' });
  }
});

backupRouter.post('/:id/restore', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role !== 'Admin') {
    res.status(403).json({ error: 'Only admins can restore backups' });
    return;
  }

  try {
    const restored = await mutateDb((db) => {
      const backup = db.backup_snapshots.find((row) => row.id === req.params.id);
      if (!backup) return false;
      for (const table of tablesToBackup) {
        (db as any)[table] = (backup.snapshot_data[table] || []).map((row: any) => ({ ...row }));
      }
      db.activity_log.push({
        id: uuidv4(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_email: req.user?.email,
        action: 'RESTORE',
        entity_type: 'backup',
        entity_id: req.params.id,
        details: { label: backup.label },
      });
      return true;
    });

    if (!restored) {
      res.status(404).json({ error: 'Backup not found' });
      return;
    }

    res.json({ message: 'Database restored from backup', backupId: req.params.id });
  } catch (err) {
    console.error('Error restoring backup:', err);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

backupRouter.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const deleted = await mutateDb((db) => {
      const before = db.backup_snapshots.length;
      db.backup_snapshots = db.backup_snapshots.filter((row) => row.id !== req.params.id);
      return db.backup_snapshots.length !== before;
    });

    if (!deleted) {
      res.status(404).json({ error: 'Backup not found' });
      return;
    }

    res.json({ message: 'Backup deleted', id: req.params.id });
  } catch (err) {
    console.error('Error deleting backup:', err);
    res.status(500).json({ error: 'Failed to delete backup' });
  }
});
