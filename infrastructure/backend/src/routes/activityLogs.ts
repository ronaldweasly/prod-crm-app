import { Router, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { insertRow } from '../db/localStore.js';

export const activityLogsRouter = Router();

// GET /api/activity-logs
activityLogsRouter.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { userEmail, action, entityType, status, limit = 50, offset = 0 } = req.query;

    const conditions: string[] = [];
    const values: any[] = [];

    if (userEmail) {
      conditions.push(`a.user_email ILIKE $${conditions.length + 1}`);
      values.push(`%${userEmail}%`);
    }

    if (action) {
      conditions.push(`a.action = $${conditions.length + 1}`);
      values.push(action);
    }

    if (entityType) {
      conditions.push(`a.entity_type = $${conditions.length + 1}`);
      values.push(entityType);
    }

    if (status) {
      if (status === 'success') {
        conditions.push(`(a.details->>'status' IS NULL OR a.details->>'status' = 'success') AND a.action != 'FAILURE'`);
      } else if (status === 'failed') {
        conditions.push(`(a.details->>'status' = 'failed' OR a.action = 'FAILURE')`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get count
    const countSql = `SELECT COUNT(*) FROM activity_log a ${whereClause}`;
    const countRes = await query(countSql, values);
    const totalCount = parseInt(countRes.rows[0].count, 10);

    // Get rows with client join
    const limitVal = Math.min(10000, parseInt(limit as string, 10));
    const offsetVal = parseInt(offset as string, 10);
    const selectSql = `
      SELECT a.*, c.name as client_name 
      FROM activity_log a
      LEFT JOIN clients c ON a.entity_id = c.id
      ${whereClause} 
      ORDER BY a.created_at DESC 
      LIMIT $${conditions.length + 1} OFFSET $${conditions.length + 2}
    `;
    const rowsRes = await query(selectSql, [...values, limitVal, offsetVal]);

    // Map rows to ActivityLog interface
    const logs = rowsRes.rows.map(row => {
      const detailsObj = typeof row.details === 'string' ? JSON.parse(row.details) : (row.details || {});
      const logStatus = (row.action === 'FAILURE' || detailsObj.status === 'failed') ? 'failed' : 'success';
      
      let recordName = row.client_name || detailsObj.recordName || detailsObj.name || detailsObj.created_email || detailsObj.deleted_email || detailsObj.updated_email || '';
      
      if (!recordName && row.entity_id) {
        recordName = row.entity_id;
      }

      return {
        id: row.id,
        timestamp: row.created_at,
        userId: row.user_email,
        userEmail: row.user_email || 'system',
        action: row.action,
        sheet: row.entity_type,
        recordId: row.entity_id || '',
        recordName: recordName,
        changes: detailsObj.changes || undefined,
        status: logStatus,
        errorMessage: detailsObj.errorMessage || detailsObj.error || undefined,
        ipAddress: row.ip_address || undefined,
        userAgent: detailsObj.userAgent || undefined,
        details: detailsObj.details || undefined,
      };
    });

    res.json({ logs, totalCount });
  } catch (err) {
    console.error('Error fetching activity logs:', err);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// GET /api/activity-logs/stats
activityLogsRouter.get('/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string, 10) || 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const sql = `
      SELECT 
        action, 
        entity_type, 
        user_email, 
        details->>'status' as details_status
      FROM activity_log 
      WHERE created_at >= $1
    `;
    const resRows = await query(sql, [cutoffDate]);

    let total = 0;
    let successful = 0;
    let failed = 0;
    const byAction: Record<string, number> = {};
    const bySheet: Record<string, number> = {};
    const byUser: Record<string, number> = {};

    for (const row of resRows.rows) {
      total++;
      
      const act = row.action;
      byAction[act] = (byAction[act] || 0) + 1;
      
      const sheet = row.entity_type;
      bySheet[sheet] = (bySheet[sheet] || 0) + 1;

      const user = row.user_email || 'system';
      byUser[user] = (byUser[user] || 0) + 1;

      const isFailed = (act === 'FAILURE' || row.details_status === 'failed');
      if (isFailed) {
        failed++;
      } else {
        successful++;
      }
    }

    res.json({
      total,
      successful,
      failed,
      byAction,
      bySheet,
      byUser,
    });
  } catch (err) {
    console.error('Error fetching activity log stats:', err);
    res.status(500).json({ error: 'Failed to fetch activity log stats' });
  }
});

// POST /api/activity-logs
activityLogsRouter.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { action, sheet, recordId, recordName, changes, status, errorMessage, details } = req.body;
    
    const detailsObj: Record<string, any> = {
      recordName,
      changes,
      status,
      errorMessage,
      userAgent: req.headers['user-agent'],
      details
    };

    const row = await insertRow('activity_log', {
      user_email: req.user?.email || 'system',
      action,
      entity_type: sheet || 'system',
      entity_id: recordId || null,
      details: detailsObj,
      ip_address: req.ip || null,
    });

    res.status(201).json(row);
  } catch (err) {
    console.error('Error creating activity log:', err);
    res.status(500).json({ error: 'Failed to create activity log' });
  }
});

// POST /api/activity-logs/cleanup
activityLogsRouter.post('/cleanup', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role !== 'Admin') {
    res.status(403).json({ error: 'Only admins can clean up activity logs' });
    return;
  }

  try {
    const days = parseInt(req.body.days as string, 10) || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const deleteRes = await query(
      'DELETE FROM activity_log WHERE created_at < $1 RETURNING id',
      [cutoffDate]
    );

    res.json({ message: `Cleaned up activity logs older than ${days} days`, deletedCount: deleteRes.rowCount || 0 });
  } catch (err) {
    console.error('Error cleaning up activity logs:', err);
    res.status(500).json({ error: 'Failed to clean up activity logs' });
  }
});
