import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { authRouter } from './routes/auth.js';
import { clientsRouter } from './routes/clients.js';
import { uploadsRouter } from './routes/uploads.js';
import { backupRouter } from './routes/backup.js';
import { healthRouter } from './routes/health.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authenticate } from './middleware/auth.js';
import { tracingMiddleware } from './middleware/tracing.js';
import { getDb, localDbInfo, mutateDb } from './db/localStore.js';
import { startR2BackupScheduler } from './db/r2Backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const corsOptions: cors.CorsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
};
app.use(cors(corsOptions));

app.use('/api/', rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again in 15 minutes.' },
}));

app.use(tracingMiddleware);
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  skip: (req) => req.url === '/api/health',
}));
app.set('trust proxy', 1);

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api', authRouter);
app.use('/api/clients', authenticate, clientsRouter);
app.use('/api/uploads', authenticate, uploadsRouter);
app.use('/api/backup', authenticate, backupRouter);

app.use('/api/*', notFoundHandler);
app.use(errorHandler);

async function createScheduledSnapshot() {
  try {
    await mutateDb((db) => {
      const snapshot: Record<string, any[]> = {};
      const table_counts: Record<string, number> = {};
      for (const table of ['clients', 'workflow_status', 'surveys', 'quotations', 'installations', 'subsidies', 'payments', 'documents', 'users']) {
        snapshot[table] = (db as any)[table].map((row: any) => ({ ...row }));
        table_counts[table] = snapshot[table].length;
      }
      db.backup_snapshots.unshift({
        id: randomUUID(),
        created_at: new Date().toISOString(),
        label: `Scheduled backup ${new Date().toISOString()}`,
        snapshot_data: snapshot,
        table_counts,
        created_by: 'system',
      });
      db.backup_snapshots = db.backup_snapshots.slice(0, 200);
    });
    console.log(`Auto-backup created at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('Auto-backup failed:', err instanceof Error ? err.message : err);
  }
}

async function startServer() {
  try {
    await getDb();
    const info = await localDbInfo();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`SolarCRM API running on port ${PORT}`);
      console.log(`Data file: ${info.path}`);
      console.log(`CORS origin: ${corsOptions.origin}`);
    });

    // Local snapshot every hour (kept in the JSON file)
    setInterval(createScheduledSnapshot, 60 * 60 * 1000);

    // R2 cloud backup every hour (gzipped to Cloudflare R2)
    startR2BackupScheduler();

    const shutdown = async (signal: string) => {
      console.log(`${signal} received. Closing HTTP server...`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
