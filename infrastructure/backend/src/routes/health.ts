import { Router, Response } from 'express';
import { query } from '../db/pool.js';
import { localDbInfo } from '../db/localStore.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res: Response) => {
  const checks: Record<string, any> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
  };

  try {
    const [clientsRes, usersRes, backupsRes] = await Promise.all([
      query('SELECT COUNT(*) FROM clients'),
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM backup_snapshots'),
    ]);

    checks.database = 'postgres-ok';
    checks.database_path = (await localDbInfo()).path;
    checks.tables = {
      clients: parseInt(clientsRes.rows[0].count, 10),
      users: parseInt(usersRes.rows[0].count, 10),
      backups: parseInt(backupsRes.rows[0].count, 10),
    };
  } catch (err) {
    console.error('Health check database query error:', err);
    checks.database = 'error';
    checks.status = 'degraded';
  }

  res.status(checks.status === 'ok' ? 200 : 503).json(checks);
});
