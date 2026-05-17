import { Router, Response } from 'express';
import { getDb, localDbInfo } from '../db/localStore.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res: Response) => {
  const checks: Record<string, any> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
  };

  try {
    const db = await getDb();
    checks.database = 'local-json-ok';
    checks.database_path = (await localDbInfo()).path;
    checks.tables = {
      clients: db.clients.length,
      users: db.users.length,
      backups: db.backup_snapshots.length,
    };
  } catch (err) {
    checks.database = 'error';
    checks.status = 'degraded';
  }

  res.status(checks.status === 'ok' ? 200 : 503).json(checks);
});
