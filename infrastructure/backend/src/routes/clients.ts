import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/pool.js';
import {
  insertRow,
  logActivity,
  updateById,
  upsertByClientId,
} from '../db/localStore.js';
import { authorize } from '../middleware/auth.js';

export const clientsRouter = Router();

const relatedTables = [
  'workflow_status',
  'surveys',
  'quotations',
  'installations',
  'subsidies',
  'payments',
  'documents',
] as const;

const writableColumns: Record<string, string[]> = {
  surveys: ['survey_date', 'site_images', 'recommended_system_details', 'surveyor_name'],
  quotations: ['quotation_pdf', 'amount', 'validity_date', 'approval_status'],
  installations: ['team_members', 'progress_notes', 'completion_percentage', 'start_date', 'end_date'],
  subsidies: ['status', 'applied_date', 'approval_date', 'amount'],
  payments: ['total_amount', 'paid_amount', 'pending_amount', 'due_date', 'payment_status'],
  documents: [
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
};

function pickBody(body: any, columns: string[]) {
  return columns.reduce<Record<string, any>>((acc, column) => {
    if (body[column] !== undefined) acc[column] = body[column];
    return acc;
  }, {});
}

function numberOrNull(value: any) {
  if (value === '' || value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function parseDateToYyyyMmDd(val: any): string | null {
  if (!val) return null;
  const str = String(val).trim();
  // Check if YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  // Check if DD/MM/YYYY
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [, d, m, y] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function normalizeClient(body: any) {
  return {
    id: body.id || uuidv4(),
    name: body.name || '',
    phone: body.phone || '',
    address: body.address || '',
    roof_type: body.roof_type || '',
    battery_type: body.battery_type || '',
    system_size_kw: numberOrNull(body.system_size_kw),
    created_date: parseDateToYyyyMmDd(body.created_date) || new Date().toISOString().slice(0, 10),
    assigned_to: body.assigned_to || '',
  };
}

clientsRouter.get('/stats/dashboard', async (_req: Request, res: Response) => {
  try {
    const [clientsCountRes, stagesRes, recentClientsRes, paymentsRes] = await Promise.all([
      query('SELECT COUNT(*) FROM clients'),
      query('SELECT stage, COUNT(*) as count FROM workflow_status GROUP BY stage'),
      query('SELECT * FROM clients ORDER BY created_date DESC, created_at DESC LIMIT 5'),
      query('SELECT COALESCE(SUM(total_amount), 0) as total_revenue, COALESCE(SUM(paid_amount), 0) as collected, COALESCE(SUM(pending_amount), 0) as pending FROM payments'),
    ]);

    const totalClients = parseInt(clientsCountRes.rows[0].count, 10);
    const stageDistribution = stagesRes.rows.map((row: any) => ({
      stage: row.stage || 'Lead',
      count: parseInt(row.count, 10),
    }));

    const paymentSummary = {
      total_revenue: parseFloat(paymentsRes.rows[0].total_revenue),
      collected: parseFloat(paymentsRes.rows[0].collected),
      pending: parseFloat(paymentsRes.rows[0].pending),
    };

    res.json({
      totalClients,
      stageDistribution,
      recentClients: recentClientsRes.rows,
      paymentSummary,
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

clientsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 9999);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const countRes = await query('SELECT COUNT(*) FROM clients');
    const total = parseInt(countRes.rows[0].count, 10);

    const clientsRes = await query(
      'SELECT * FROM clients ORDER BY created_date DESC, created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    res.json({
      data: clientsRes.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Error fetching clients:', err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

clientsRouter.get('/relations/:table', authorize('Admin', 'Sales Team', 'Engineer', 'Accountant', 'Manager'), async (req: Request, res: Response) => {
  const { table } = req.params;
  try {
    if (!relatedTables.includes(table as any)) {
      res.status(400).json({ error: 'Invalid table' });
      return;
    }
    const result = await query(`SELECT * FROM ${table}`);
    res.json(result.rows);
  } catch (err) {
    console.error(`Error fetching relation ${table}:`, err);
    res.status(500).json({ error: `Failed to fetch relation ${table}` });
  }
});

clientsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [
      clientRes,
      workflowRes,
      surveyRes,
      quotationRes,
      installationRes,
      subsidyRes,
      paymentRes,
      documentsRes
    ] = await Promise.all([
      query('SELECT * FROM clients WHERE id = $1', [id]),
      query('SELECT * FROM workflow_status WHERE client_id = $1', [id]),
      query('SELECT * FROM surveys WHERE client_id = $1', [id]),
      query('SELECT * FROM quotations WHERE client_id = $1', [id]),
      query('SELECT * FROM installations WHERE client_id = $1', [id]),
      query('SELECT * FROM subsidies WHERE client_id = $1', [id]),
      query('SELECT * FROM payments WHERE client_id = $1', [id]),
      query('SELECT * FROM documents WHERE client_id = $1', [id]),
    ]);

    const client = clientRes.rows[0];
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json({
      client,
      workflow: workflowRes.rows[0] || null,
      survey: surveyRes.rows[0] || null,
      quotation: quotationRes.rows[0] || null,
      installation: installationRes.rows[0] || null,
      subsidy: subsidyRes.rows[0] || null,
      payment: paymentRes.rows[0] || null,
      documents: documentsRes.rows[0] || null,
    });
  } catch (err) {
    console.error('Error fetching client:', err);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

clientsRouter.post('/', authorize('Admin', 'Sales Team'), async (req: Request, res: Response) => {
  try {
    const client = await insertRow('clients', normalizeClient(req.body));

    await upsertByClientId('workflow_status', client.id, {
      stage: req.body.stage || 'Lead',
      updated_at: new Date().toISOString(),
      updated_by: req.user?.email || '',
    });

    await logActivity({
      user_email: req.user?.email,
      action: 'CREATE',
      entity_type: 'client',
      entity_id: client.id,
      details: { name: client.name },
    });

    res.status(201).json(client);
  } catch (err) {
    console.error('Error creating client:', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

clientsRouter.put('/:id', authorize('Admin', 'Sales Team'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const patch = pickBody(req.body, ['name', 'phone', 'address', 'roof_type', 'battery_type', 'system_size_kw', 'assigned_to']);
    if ('system_size_kw' in patch) patch.system_size_kw = numberOrNull(patch.system_size_kw);

    const client = await updateById('clients', id, patch);
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    await logActivity({
      user_email: req.user?.email,
      action: 'UPDATE',
      entity_type: 'client',
      entity_id: id,
      details: { name: client.name },
    });

    res.json(client);
  } catch (err) {
    console.error('Error updating client:', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

clientsRouter.put('/:id/workflow', authorize('Admin', 'Engineer', 'Sales Team'), async (req: Request, res: Response) => {
  try {
    const row = await upsertByClientId('workflow_status', req.params.id, {
      stage: req.body.stage || 'Lead',
      updated_at: new Date().toISOString(),
      updated_by: req.user?.email || '',
    });

    await logActivity({
      user_email: req.user?.email,
      action: 'UPDATE',
      entity_type: 'workflow',
      entity_id: req.params.id,
      details: { stage: row.stage },
    });

    res.json(row);
  } catch (err) {
    console.error('Error updating workflow:', err);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

const upsertConfigs = {
  surveys: { roles: ['Admin', 'Engineer', 'Sales Team'] },
  quotations: { roles: ['Admin', 'Engineer'] },
  installations: { roles: ['Admin', 'Engineer'] },
  subsidies: { roles: ['Admin', 'Accountant'] },
  payments: { roles: ['Admin', 'Accountant'] },
  documents: { roles: ['Admin', 'Engineer', 'Sales Team'] },
} as const;

for (const [table, config] of Object.entries(upsertConfigs)) {
  clientsRouter.put(
    `/:id/${table}`,
    authorize(...config.roles),
    async (req: Request, res: Response) => {
      try {
        const body = pickBody(req.body, writableColumns[table]);
        for (const column of ['amount', 'total_amount', 'paid_amount', 'pending_amount', 'completion_percentage']) {
          if (column in body) body[column] = numberOrNull(body[column]);
        }
        for (const column of ['survey_date', 'validity_date', 'start_date', 'end_date', 'applied_date', 'approval_date', 'due_date']) {
          if (column in body) body[column] = parseDateToYyyyMmDd(body[column]);
        }
        const row = await upsertByClientId(table as any, req.params.id, body);
        res.json(row);
      } catch (err) {
        console.error(`Error upserting ${table}:`, err);
        res.status(500).json({ error: `Failed to update ${table}` });
      }
    }
  );
}

clientsRouter.delete('/:id', authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Fetch client name first before deleting to preserve it in logs
    const clientRes = await query('SELECT name FROM clients WHERE id = $1', [id]);
    const clientName = clientRes.rows[0]?.name || '';

    // Direct database DELETE. Cascade triggers automatic child table cleanups.
    const deleteRes = await query('DELETE FROM clients WHERE id = $1 RETURNING id', [id]);
    const deleted = deleteRes.rowCount && deleteRes.rowCount > 0;

    if (!deleted) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    await logActivity({
      user_email: req.user?.email,
      action: 'DELETE',
      entity_type: 'client',
      entity_id: id,
      details: { name: clientName, cascading: true },
    });

    res.json({ message: 'Client deleted successfully', id });
  } catch (err) {
    console.error('Error deleting client:', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});
