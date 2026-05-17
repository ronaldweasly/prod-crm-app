import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  getTable,
  getDb,
  insertRow,
  logActivity,
  mutateDb,
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

function normalizeClient(body: any) {
  return {
    id: body.id || uuidv4(),
    name: body.name || '',
    phone: body.phone || '',
    address: body.address || '',
    roof_type: body.roof_type || '',
    battery_type: body.battery_type || '',
    system_size_kw: numberOrNull(body.system_size_kw),
    created_date: body.created_date || new Date().toISOString().slice(0, 10),
    assigned_to: body.assigned_to || '',
  };
}

clientsRouter.get('/stats/dashboard', async (_req: Request, res: Response) => {
  try {
    const [clients, workflows, payments] = await Promise.all([
      getTable<any>('clients'),
      getTable<any>('workflow_status'),
      getTable<any>('payments'),
    ]);

    const stageMap = workflows.reduce<Record<string, number>>((acc, row) => {
      const stage = row.stage || 'Lead';
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {});

    const paymentSummary = payments.reduce(
      (acc, row) => {
        acc.total_revenue += Number(row.total_amount || 0);
        acc.collected += Number(row.paid_amount || 0);
        acc.pending += Number(row.pending_amount || 0);
        return acc;
      },
      { total_revenue: 0, collected: 0, pending: 0 }
    );

    res.json({
      totalClients: clients.length,
      stageDistribution: Object.entries(stageMap).map(([stage, count]) => ({ stage, count })),
      recentClients: clients
        .slice()
        .sort((a, b) => String(b.created_date || '').localeCompare(String(a.created_date || '')))
        .slice(0, 5),
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
    const clients = (await getTable<any>('clients')).sort((a, b) =>
      String(b.created_date || '').localeCompare(String(a.created_date || ''))
    );

    res.json({
      data: clients.slice(offset, offset + limit),
      pagination: {
        total: clients.length,
        limit,
        offset,
        hasMore: offset + limit < clients.length,
        pages: Math.ceil(clients.length / limit),
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
    const data = await getTable<any>(table as any);
    res.json(data);
  } catch (err) {
    console.error(`Error fetching relation ${table}:`, err);
    res.status(500).json({ error: `Failed to fetch relation ${table}` });
  }
});

clientsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const client = db.clients.find((row) => row.id === id);

    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json({
      client,
      workflow: db.workflow_status.find((row) => row.client_id === id) || null,
      survey: db.surveys.find((row) => row.client_id === id) || null,
      quotation: db.quotations.find((row) => row.client_id === id) || null,
      installation: db.installations.find((row) => row.client_id === id) || null,
      subsidy: db.subsidies.find((row) => row.client_id === id) || null,
      payment: db.payments.find((row) => row.client_id === id) || null,
      documents: db.documents.find((row) => row.client_id === id) || null,
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
    const deleted = await mutateDb((db) => {
      const clientExists = db.clients.some((row) => row.id === id);
      if (!clientExists) return false;

      db.clients = db.clients.filter((row) => row.id !== id);
      for (const table of relatedTables) {
        (db[table] as any[]) = (db[table] as any[]).filter((row) => row.client_id !== id);
      }
      return true;
    });

    if (!deleted) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    await logActivity({
      user_email: req.user?.email,
      action: 'DELETE',
      entity_type: 'client',
      entity_id: id,
      details: { cascading: true },
    });

    res.json({ message: 'Client deleted successfully', id });
  } catch (err) {
    console.error('Error deleting client:', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});
