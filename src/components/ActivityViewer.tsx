import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import {
  exportActivityLogsAsCSV,
  exportActivityLogsAsJSON,
  getActionDescription,
  getActionColor,
  ActivityLog,
  ActivityAction,
} from '../sheets/activity';
import { Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ActivityViewer() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    successful: 0,
    failed: 0,
    byUser: {} as Record<string, number>,
    byAction: {} as Record<string, number>,
    bySheet: {} as Record<string, number>,
  });

  // Filters
  const [userFilter, setUserFilter] = useState('');
  const [sheetFilter, setSheetFilter] = useState('');
  const [actionFilter, setActionFilter] = useState<ActivityAction | ''>('');
  const [statusFilter, setStatusFilter] = useState<'success' | 'failed' | ''>('');

  const PAGE_SIZE = 50;

  useEffect(() => {
    fetchLogs();
  }, [page, userFilter, sheetFilter, actionFilter, statusFilter]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userFilter) params.append('userEmail', userFilter);
      if (sheetFilter) params.append('entityType', sheetFilter);
      if (actionFilter) params.append('action', actionFilter);
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', String(PAGE_SIZE));
      params.append('offset', String((page - 1) * PAGE_SIZE));

      const res = await fetch(`/api/activity-logs?${params.toString()}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalCount(data.totalCount);
      } else {
        toast.error('Failed to fetch activity logs');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error fetching activity logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/activity-logs/stats?days=7', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFilterChange = (setter: Function, val: any) => {
    setter(val);
    setPage(1);
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const params = new URLSearchParams();
      if (userFilter) params.append('userEmail', userFilter);
      if (sheetFilter) params.append('entityType', sheetFilter);
      if (actionFilter) params.append('action', actionFilter);
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', String(totalCount || 5000));

      const res = await fetch(`/api/activity-logs?${params.toString()}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (format === 'csv') {
          exportActivityLogsAsCSV(data.logs);
        } else {
          exportActivityLogsAsJSON(data.logs);
        }
        toast.success(`Successfully exported ${data.logs.length} entries`);
      } else {
        toast.error('Failed to export logs');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to export logs');
    }
  };

  const handleCleanup = async () => {
    if (
      window.confirm(
        'This will delete activity logs older than 90 days. Continue?'
      )
    ) {
      setLoading(true);
      try {
        const res = await fetch('/api/activity-logs/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: 90 }),
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          toast.success(data.message || 'Audit logs cleaned up');
          setPage(1);
          fetchLogs();
          fetchStats();
        } else {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || 'Failed to cleanup old logs');
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to cleanup logs');
      } finally {
        setLoading(false);
      }
    }
  };

  const sheets = ['clients', 'workflow_status', 'surveys', 'quotations', 'installations', 'subsidies', 'payments', 'documents', 'users', 'auth', 'backup_r2'];
  const actions: ActivityAction[] = ['CREATE', 'UPDATE', 'DELETE', 'VIEW', 'EXPORT', 'DOWNLOAD', 'FAILURE', 'LOGIN', 'RESTORE_R2'];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Activity Audit Trail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="p-3 bg-blue-50 rounded">
              <p className="text-xs text-gray-600">Total Activities (7d)</p>
              <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
            </div>
            <div className="p-3 bg-green-50 rounded">
              <p className="text-xs text-gray-600">Successful (7d)</p>
              <p className="text-2xl font-bold text-green-600">{stats.successful}</p>
            </div>
            <div className="p-3 bg-red-50 rounded">
              <p className="text-xs text-gray-600">Failed (7d)</p>
              <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
            </div>
            <div className="p-3 bg-purple-50 rounded">
              <p className="text-xs text-gray-600">Active Users (7d)</p>
              <p className="text-2xl font-bold text-purple-600">{Object.keys(stats.byUser).length}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mt-4">
            <Input
              placeholder="Filter by user email"
              value={userFilter}
              onChange={e => handleFilterChange(setUserFilter, e.target.value)}
              className="text-sm bg-white"
            />
            <Select
              value={sheetFilter}
              onChange={e => handleFilterChange(setSheetFilter, e.target.value)}
              options={[
                { label: '— Any Sheet —', value: '' },
                ...sheets.map(s => ({ label: s, value: s })),
              ]}
              className="bg-white"
            />
            <Select
              value={actionFilter}
              onChange={e => handleFilterChange(setActionFilter, e.target.value as ActivityAction | '')}
              options={[
                { label: '— Any Action —', value: '' },
                ...actions.map(a => ({ label: getActionDescription(a), value: a })),
              ]}
              className="bg-white"
            />
            <Select
              value={statusFilter}
              onChange={e => handleFilterChange(setStatusFilter, e.target.value as 'success' | 'failed' | '')}
              options={[
                { label: '— Any Status —', value: '' },
                { label: 'Success', value: 'success' },
                { label: 'Failed', value: 'failed' },
              ]}
              className="bg-white"
            />
          </div>

          {/* Export Buttons */}
          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport('json')}
              className="gap-1 bg-white hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport('csv')}
              className="gap-1 bg-white hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCleanup}
              disabled={loading}
              className="gap-1 text-blue-700 hover:text-blue-800 ml-auto bg-white hover:bg-gray-50"
            >
              <Trash2 className="w-4 h-4" />
              Cleanup
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-xs font-semibold text-gray-600 uppercase">
                  <th className="px-4 py-3 text-left">Timestamp</th>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left">Sheet/Entity</th>
                  <th className="px-4 py-3 text-left">Record</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      Loading activity logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No activity logs found
                    </td>
                  </tr>
                ) : (
                  logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-900 font-medium">{log.userEmail}</td>
                      <td className="px-4 py-3">
                        <Badge className={getActionColor(log.action)}>
                          {getActionDescription(log.action)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{log.sheet}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={log.recordName || log.recordId}>
                        {log.recordName || log.recordId}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            log.status === 'success' ? 'success' : 'danger'
                          }
                        >
                          {log.status === 'success' ? '✓' : '✗'}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm text-gray-700">
              <div>
                Showing <span className="font-semibold">{((page - 1) * PAGE_SIZE) + 1}</span> to{' '}
                <span className="font-semibold">{Math.min(page * PAGE_SIZE, totalCount)}</span> of{' '}
                <span className="font-semibold">{totalCount}</span> entries
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="bg-white hover:bg-gray-50"
                >
                  Previous
                </Button>
                <div className="flex items-center px-2 text-xs font-medium text-gray-500">
                  Page {page} of {Math.ceil(totalCount / PAGE_SIZE)}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(p => Math.min(Math.ceil(totalCount / PAGE_SIZE), p + 1))}
                  disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
                  className="bg-white hover:bg-gray-50"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
