import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSheetData } from '../sheets/api';
import { SHEET_NAMES } from '../sheets/config';
import { ClientRow, WorkflowStatusRow, UserRow } from '../sheets/types';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { SlideOver } from '../ui/SlideOver';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { MultiStepClientForm } from '../components/MultiStepClientForm';

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSlideOpen, setIsSlideOpen] = useState(false);
  const [salesUsers, setSalesUsers] = useState<{ label: string, value: string }[]>([]);
  const [search, setSearch] = useState('');

  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [allClients, workflow, allUsers] = await Promise.all([
        getSheetData<ClientRow>(SHEET_NAMES.CLIENTS),
        getSheetData<WorkflowStatusRow>(SHEET_NAMES.WORKFLOW_STATUS),
        getSheetData<UserRow>(SHEET_NAMES.USERS)
      ]);

      const workflowMap = new Map();
      workflow.forEach(w => {
        workflowMap.set(w['Client ID'], w.Stage);
      });

      const merged = allClients.map(c => ({
        ...c,
        Stage: workflowMap.get(c.ID) || 'Lead'
      }));

      setClients(merged.reverse());

      const assignees = allUsers
        .filter(u => u.Active === 'TRUE' && (u.Role === 'Sales Team' || u.Role === 'Admin'))
        .map(u => ({ label: u.Name || u.Email, value: u.Email }));

      setSalesUsers(assignees);
    } catch (error) {
      toast.error('Failed to load clients');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Open slide if ?add=1 present in URL (only open on mount / fresh navigation, never close reactively)
  useEffect(() => {
    if (searchParams.get('add')) setIsSlideOpen(true);
    // Deliberately NOT setting isSlideOpen(false) here — closing is handled by onClose/onSuccess
    // so that clearing searchParams doesn't unmount the form mid-flight.
  }, [searchParams]);

  const filteredClients = clients.filter(c =>
    c.Name.toLowerCase().includes(search.toLowerCase()) ||
    c.Phone.includes(search) ||
    c.Stage.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* Sticky header on mobile */}
      <div className="sticky top-0 z-10 bg-slate-50 -mx-3 px-3 sm:-mx-4 sm:px-4 md:static md:mx-0 md:px-0 md:bg-transparent pb-2 sm:pb-0">
        <h1 className="text-xl font-bold text-slate-900 mb-3 hidden sm:block">Clients Pipeline</h1>
        <div className="flex gap-2 items-center">
          <input
            type="search"
            placeholder="🔍 Search clients, phone, stage..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white
                       text-sm placeholder-slate-400 focus:outline-none focus:ring-2
                       focus:ring-blue-500 focus:border-transparent"
          />
          <Button onClick={() => { setIsSlideOpen(true); setSearchParams({ add: '1' }); }} className="whitespace-nowrap shrink-0 h-10 sm:h-auto">
            <span className="hidden sm:inline">+ New Lead</span>
            <span className="sm:hidden text-lg leading-none">+</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Mobile: Card view */}
          <div className="md:hidden space-y-2 p-3">
            {loading ? (
              Array(5).fill(0).map((_, i) => (
                <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))
            ) : filteredClients.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-4xl mb-2">🔍</p>
                <p className="font-semibold">No clients found</p>
              </div>
            ) : (
              filteredClients.map((client, i) => (
                <div
                  key={i}
                  className="border border-slate-200 rounded-xl p-4 bg-white active:bg-blue-50
                             cursor-pointer transition-colors touch-manipulation"
                  onClick={() => navigate(`/clients/${client.ID}`)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 truncate">{client.Name}</p>
                      <p className="text-xs text-slate-500 font-mono">{client.ID}</p>
                    </div>
                    <Badge variant={
                      client.Stage === 'Project Closed' ? 'success' :
                        client.Stage.includes('Installation') ? 'warning' : 'default'
                    }>
                      {client.Stage}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="text-slate-600"><span className="font-medium">Phone:</span> {client.Phone}</p>
                    <p className="text-slate-600"><span className="font-medium">System:</span> {client['System Size (kW)']}kW</p>
                    <p className="text-slate-500 truncate"><span className="font-medium">Address:</span> {client.Address}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop: Table view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-bold border-b border-slate-100">
                <tr>
                  <th className="px-4 md:px-6 py-3">Client ID</th>
                  <th className="px-4 md:px-6 py-3">Name</th>
                  <th className="px-4 md:px-6 py-3">Contact</th>
                  <th className="px-4 md:px-6 py-3">System</th>
                  <th className="px-4 md:px-6 py-3">Stage</th>
                  <th className="px-4 md:px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 bg-white text-xs">
                {loading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 md:px-6 py-4"><Skeleton className="h-4 w-16" /></td>
                      <td className="px-4 md:px-6 py-4"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 md:px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 md:px-6 py-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 md:px-6 py-4"><Skeleton className="h-6 w-24 rounded-full" /></td>
                      <td className="px-4 md:px-6 py-4 text-right"><Skeleton className="h-4 w-10 ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 md:px-6 py-12 text-center text-slate-500">
                      No clients found.
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((client, i) => (
                    <tr
                      key={i}
                      className="hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-50"
                      onClick={() => navigate(`/clients/${client.ID}`)}
                    >
                      <td className="px-4 md:px-6 py-4 font-mono text-[10px] text-slate-500">{client.ID}</td>
                      <td className="px-4 md:px-6 py-4 font-semibold text-slate-800">{client.Name}</td>
                      <td className="px-4 md:px-6 py-4 text-slate-600">
                        <div className="font-medium">{client.Phone}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{client.Address}</div>
                      </td>
                      <td className="px-4 md:px-6 py-4 text-slate-600">
                        {client['System Size (kW)']}kW
                      </td>
                      <td className="px-4 md:px-6 py-4">
                        <Badge variant={
                          client.Stage === 'Project Closed' ? 'success' :
                            client.Stage.includes('Installation') ? 'warning' : 'default'}
                        >
                          {client.Stage}
                        </Badge>
                      </td>
                      <td className="px-4 md:px-6 py-4 text-right font-medium text-blue-700">
                        Details
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <SlideOver isOpen={isSlideOpen} onClose={() => { setIsSlideOpen(false); setSearchParams({}, { replace: true }); }} title="New Lead">
        <MultiStepClientForm
          salesUsers={salesUsers}
          user={user}
          onSuccess={() => {
            setIsSlideOpen(false);
            setSearchParams({}, { replace: true });
            loadData(true);
          }}
        />
      </SlideOver>
    </div>
  );
}
