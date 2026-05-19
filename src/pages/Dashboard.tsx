import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '../ui/Card';
import { getSheetData } from '../sheets/api';
import { SHEET_NAMES } from '../sheets/config';
import { WorkflowStatusRow, ClientRow, SubsidyRow, PaymentRow } from '../sheets/types';
import { Users, Loader2, Wrench, IndianRupee, FileText, CheckCircle2, X, ArrowRight, TrendingUp, Info, Calendar, Flag, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, PieChart, Pie, Cell, Legend } from 'recharts';
import { cn } from '../utils/cn';

// Logo blue palette (used across pipeline charts and stage chips)
const COLORS = ['#0b5fff', '#0753d1', '#1e3a8a', '#3b82f6', '#60a5fa', '#93c5fd', '#0ea5e9', '#0369a1'];

// (Removed local dummy data - using live data source)

export default function Dashboard() {
  const [showAnalytics, setShowAnalytics] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // SOURCE OF TRUTH: The URL metric param
  const selectedMetric = searchParams.get('metric');

  useEffect(() => {
    async function fetchData() {
      try {
        const [workflow, subsidies, payments, clients] = await Promise.all([
          getSheetData<WorkflowStatusRow>(SHEET_NAMES.WORKFLOW_STATUS),
          getSheetData<SubsidyRow>(SHEET_NAMES.SUBSIDIES),
          getSheetData<PaymentRow>(SHEET_NAMES.PAYMENTS),
          getSheetData<ClientRow>(SHEET_NAMES.CLIENTS)
        ]);

        const clientMap = new Map(clients.map(c => [c.ID, c.Name]));
        const currentStages = new Map<string, WorkflowStatusRow>();
        
        [...workflow].sort((a, b) => new Date(a['Updated At']).getTime() - new Date(b['Updated At']).getTime()).forEach(w => {
           currentStages.set(w['Client ID'], w);
        });

        const activeCurrentStages = Array.from(currentStages.values());

        const metrics = {
          totalLeads: clients.length,
          ongoingInstallations: activeCurrentStages.filter(w => w.Stage === 'Installation Started' || w.Stage === 'Installation Completed').length,
          pendingPayments: payments.filter(p => parseFloat(p['Pending Amount (₹)']) > 0).length,
          subsidiesInProgress: subsidies.filter(s => (s.Status as string) !== 'Received' && (s.Status as string) !== 'Rejected').length,
          completedProjects: activeCurrentStages.filter(w => w.Stage === 'Project Closed').length,
        };

        const recentActivity = [...workflow]
          .sort((a, b) => new Date(b['Updated At']).getTime() - new Date(a['Updated At']).getTime())
          .slice(0, 5)
          .map(w => ({
            ...w,
            ClientName: clientMap.get(w['Client ID']) || 'Unknown'
          }));

        const stages = [
          'Lead', 'Survey Scheduled', 'Survey Done', 'Quotation Sent', 
          'Quotation Approved', 'Installation Started', 'Installation Completed', 
          'Subsidy Applied', 'Subsidy Received', 'Project Closed'
        ];
        
        const pipelineData = stages.map(stage => ({
          name: stage,
          count: activeCurrentStages.filter(w => w.Stage === stage).length
        }));

        let liveUpdates = [];
        try {
          const res = await fetch('/api/activity-logs?limit=4');
          if (res.ok) {
            const result = await res.json();
            liveUpdates = result.logs || [];
          }
        } catch (e) {
          console.error("Failed to fetch live updates", e);
        }

        setData({ metrics, recentActivity, pipelineData, workflow: activeCurrentStages, subsidies, payments, clients, clientMap, liveUpdates });
      } catch (err) {
        console.error("Dashboard data load error", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // DERIVED STATE: Calculate details based on the URL parameter
  const { detailData, detailChartData } = useMemo(() => {
    if (!data || !selectedMetric) return { detailData: [], detailChartData: [] };

    let details: any[] = [];
    let chart: any[] = [];

    switch(selectedMetric) {
      case 'totalLeads':
        const stageCounts: Record<string, number> = {};
        data.workflow.forEach((w: any) => { stageCounts[w.Stage] = (stageCounts[w.Stage] || 0) + 1; });
        chart = Object.entries(stageCounts).map(([name, value]) => ({ name, value }));
        details = data.clients.slice(0, 10).map((c: ClientRow) => ({
          id: c.ID,
          name: c.Name,
          value: data.workflow.find((w: any) => w['Client ID'] === c.ID)?.Stage || 'Lead',
        }));
        break;

      case 'ongoingInstallations':
        const progressCounts: Record<string, number> = { 'In Progress': 0, 'Almost Done': 0 };
        data.workflow
          .filter((w: WorkflowStatusRow) => w.Stage === 'Installation Started' || w.Stage === 'Installation Completed')
          .forEach((w: any) => {
             if (w.Stage === 'Installation Started') progressCounts['In Progress']++;
             else progressCounts['Almost Done']++;
          });
        chart = Object.entries(progressCounts).map(([name, value]) => ({ name, value }));
        details = data.workflow
          .filter((w: WorkflowStatusRow) => w.Stage === 'Installation Started' || w.Stage === 'Installation Completed')
          .slice(0, 10)
          .map((w: WorkflowStatusRow) => ({
            id: w['Client ID'],
            name: data.clientMap.get(w['Client ID']) || 'Unknown',
            value: w.Stage,
          }));
        break;

      case 'pendingPayments':
        const topPayments = data.payments
          .filter((p: PaymentRow) => parseFloat(p['Pending Amount (₹)']) > 0)
          .sort((a: any, b: any) => parseFloat(b['Pending Amount (₹)']) - parseFloat(a['Pending Amount (₹)']))
          .slice(0, 10);
        details = topPayments.map((p: PaymentRow) => ({
          id: p['Client ID'],
          name: data.clientMap.get(p['Client ID']) || 'Unknown',
          value: `₹${parseFloat(p['Pending Amount (₹)']).toLocaleString()}`,
          pending: parseFloat(p['Pending Amount (₹)']),
          paid: parseFloat(p['Paid Amount (₹)'])
        }));
        chart = details.map(d => ({ name: d.name.split(' ')[0], pending: d.pending, paid: d.paid }));
        break;

      case 'subsidiesInProgress':
        const subStatus: Record<string, number> = { 'Not Applied': 0, 'Applied': 0, 'Under Review': 0, 'Received': 0, 'Rejected': 0 };
        const subsidyMap = new Map(data.subsidies.map((s: any) => [s['Client ID'], s.Status]));
        data.clients.forEach((c: any) => {
          const status = (subsidyMap.get(c.ID) as string) || 'Not Applied';
          subStatus[status] = (subStatus[status] || 0) + 1;
        });
        chart = Object.entries(subStatus).map(([name, value]) => ({ name, value }));
        details = data.clients.slice(0, 10).map((c: any) => ({
          id: c.ID,
          name: c.Name,
          value: subsidyMap.get(c.ID) || 'Not Applied',
        }));
        break;

      case 'completedProjects':
        const monthly: Record<string, number> = {};
        data.workflow
          .filter((w: WorkflowStatusRow) => w.Stage === 'Project Closed')
          .forEach((w: any) => {
            const date = new Date(w['Updated At']);
            const month = date.toLocaleString('default', { month: 'short' });
            monthly[month] = (monthly[month] || 0) + 1;
          });
        chart = Object.entries(monthly).map(([name, value]) => ({ name, value }));
        details = data.workflow
          .filter((w: WorkflowStatusRow) => w.Stage === 'Project Closed')
          .slice(0, 10)
          .map((w: WorkflowStatusRow) => ({
            id: w['Client ID'],
            name: data.clientMap.get(w['Client ID']) || 'Unknown',
            value: new Date(w['Updated At']).toLocaleDateString(),
          }));
        break;
    }

    return { detailData: details, detailChartData: chart };
  }, [data, selectedMetric]);

  // Handle clicking a card: Updates URL only
  const handleMetricClick = (metric: string) => {
    if (selectedMetric === metric) {
      setSearchParams({}, { replace: false });
    } else {
      setSearchParams({ metric }, { replace: false });
    }
  };

  // Auto-scroll when a metric is selected (especially on back navigation)
  useEffect(() => {
    if (selectedMetric && detailRef.current) {
      setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [selectedMetric]);

  const renderDetailSection = () => {
    if (!selectedMetric) return null;

    const titles: Record<string, string> = {
      totalLeads: 'Lead Status Breakdown',
      ongoingInstallations: 'Active Project Status',
      pendingPayments: 'Financial Health (Pending vs Paid)',
      subsidiesInProgress: 'Subsidy Pipeline (Who is Subsidized?)',
      completedProjects: 'Successful Project Completions'
    };



    return (
      <div ref={detailRef} className="scroll-mt-6">
        <Card className="animate-in fade-in slide-in-from-top-4 duration-500 border-blue-200 shadow-xl overflow-hidden ring-1 ring-blue-500/10">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-blue-50 to-white">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-700 rounded-lg shadow-sm">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 leading-tight text-sm sm:text-base truncate max-w-[180px] sm:max-w-none">{titles[selectedMetric]}</h3>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-0.5">Detailed Analysis</p>
              </div>
            </div>
            <button 
              onClick={() => setSearchParams({}, { replace: false })}
              className="p-1.5 hover:bg-slate-100 rounded-full transition-all hover:rotate-90"
            >
              <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
            </button>
          </div>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              
              <div className="p-3 sm:p-5 border-b lg:border-b-0 lg:border-r border-slate-100 bg-slate-50/30">
                <h4 className="text-xs sm:text-sm font-bold text-slate-600 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                  Distribution
                </h4>

                {/* ── ongoingInstallations: 2-slice donut with center stat ── */}
                {selectedMetric === 'ongoingInstallations' && (() => {
                  const total = detailChartData.reduce((s: number, d: any) => s + d.value, 0);
                  return (
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-[160px] sm:h-[190px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={detailChartData} cx="50%" cy="50%"
                              innerRadius="55%" outerRadius="78%"
                              paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                              {detailChartData.map((_: any, i: number) => (
                                <Cell key={i} fill={['#0b5fff','#60a5fa'][i % 2]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Inline legend — no chart legend */}
                      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                        {detailChartData.map((d: any, i: number) => (
                          <span key={i} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: ['#0b5fff','#60a5fa'][i % 2] }} />
                            {d.name} <span className="font-black text-slate-900">{d.value}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* ── subsidiesInProgress: horizontal bar — 5 categories ── */}
                {selectedMetric === 'subsidiesInProgress' && (() => {
                  const subsColors: Record<string,string> = {
                    'Not Applied': '#94a3b8', 'Applied': '#0b5fff',
                    'Under Review': '#60a5fa', 'Received': '#0753d1', 'Rejected': '#ef4444'
                  };
                  const total = detailChartData.reduce((s: number, d: any) => s + d.value, 0) || 1;
                  return (
                    <div className="space-y-2.5 pt-1">
                      {detailChartData.filter((d: any) => d.value > 0).map((d: any, i: number) => {
                        const color = subsColors[d.name] || COLORS[i % COLORS.length];
                        const pct = Math.round((d.value / total) * 100);
                        return (
                          <div key={i}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-semibold text-slate-700">{d.name}</span>
                              <span className="font-black text-slate-900">{d.value} <span className="font-normal text-slate-400">({pct}%)</span></span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${pct}%`, background: color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* ── totalLeads: horizontal bar chart — 10 stages, pie would be unreadable ── */}
                {selectedMetric === 'totalLeads' && (
                  <div className="h-[200px] sm:h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={detailChartData} layout="vertical"
                        margin={{ top: 0, right: 28, left: 85, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" axisLine={false} tickLine={false} fontSize={9} tick={{ fill: '#94a3b8' }} />
                        <YAxis type="category" dataKey="name" axisLine={false} tickLine={false}
                          fontSize={9} tick={{ fill: '#64748b', fontWeight: 500 }} width={80} />
                        <Tooltip cursor={{ fill: '#f0f9ff' }}
                          contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 12 }} />
                        <Bar dataKey="value" name="Clients" radius={[0, 5, 5, 0]} barSize={10}>
                          {detailChartData.map((_: any, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                          <LabelList dataKey="value" position="right" fontSize={9} fontWeight={700} fill="#64748b" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ── pendingPayments: grouped bar (paid vs pending per client) ── */}
                {selectedMetric === 'pendingPayments' && (
                  <div className="h-[200px] sm:h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={detailChartData} margin={{ top: 5, right: 10, left: -10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={9}
                          angle={-35} textAnchor="end" tick={{ fill: '#64748b' }} interval={0} />
                        <YAxis axisLine={false} tickLine={false} fontSize={9} tick={{ fill: '#94a3b8' }}
                          tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                        <Tooltip cursor={{ fill: '#f0f9ff' }}
                          contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 12 }}
                          formatter={(v: any) => [`₹${Number(v).toLocaleString('en-IN')}`, '']} />
                        <Bar dataKey="paid" name="Paid" fill={COLORS[0]} radius={[4,4,0,0]} barSize={10} />
                        <Bar dataKey="pending" name="Pending" fill="#ef4444" radius={[4,4,0,0]} barSize={10} />
                      </BarChart>
                    </ResponsiveContainer>
                    {/* Compact legend */}
                    <div className="flex justify-center gap-4 mt-1">
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-600">
                        <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Paid
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-600">
                        <span className="w-2.5 h-2.5 rounded bg-red-400 inline-block" /> Pending
                      </span>
                    </div>
                  </div>
                )}

                {/* ── completedProjects: vertical bar by month ── */}
                {selectedMetric === 'completedProjects' && (
                  <div className="h-[200px] sm:h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={detailChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} fontSize={9} tick={{ fill: '#94a3b8' }} allowDecimals={false} />
                        <Tooltip cursor={{ fill: '#f0f9ff' }}
                          contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 12 }} />
                        <Bar dataKey="value" name="Completed" fill={COLORS[0]} radius={[6,6,0,0]} barSize={28}>
                          <LabelList dataKey="value" position="top" fontSize={11} fontWeight={700} fill={COLORS[0]} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>


              <div className="p-0 flex flex-col h-full">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    Client Breakdown
                  </h4>
                </div>
                
                {/* (Stage Details moved below to a full-width card) */}
                <div className="flex-1 overflow-y-auto max-h-[300px]">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50 sticky top-0 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                      <tr>
                        <th className="px-6 py-3">Client Name</th>
                        <th className="px-6 py-3">Status / Value</th>
                        <th className="px-6 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailData.map((item, i) => (
                        <tr 
                          key={i} 
                          className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                          onClick={() => navigate(`/clients/${item.id}`)}
                        >
                          <td className="px-6 py-3">
                            <p className="font-bold text-slate-800">{item.name}</p>
                            <p className="text-[10px] text-slate-400">ID: {item.id}</p>
                          </td>
                          <td className="px-6 py-3">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                              item.value === 'Received' || item.value === 'Project Closed' ? "bg-green-100 text-green-700" :
                              item.value === 'Under Review' || item.value === 'Applied' ? "bg-amber-100 text-amber-700" :
                              item.value === 'Not Applied' ? "bg-slate-100 text-slate-500" :
                              "bg-blue-100 text-blue-700"
                            )}>
                              {item.value}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <button className="text-blue-700 hover:text-blue-900 font-bold flex items-center justify-end gap-1 ml-auto group-hover:translate-x-1 transition-transform">
                              Details <ArrowRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    );
  }

  if (!data) return <div className="text-slate-600 font-medium p-8 text-center bg-white rounded-xl shadow-sm border border-slate-100">Failed to load data.</div>;

  const { metrics, recentActivity, pipelineData, liveUpdates } = data;
  const maxPipelineCount = Math.max(...pipelineData.map((p: any) => p.count), 1);

  // Additional small chart data
  const weeklyLeads = (() => {
    const now = Date.now();
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const key = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      days[key] = 0;
    }
    data.clients.forEach((c: any) => {
      let dateVal: Date;
      if (c.created_date) {
        dateVal = new Date(c.created_date);
      } else if (c.created_at) {
        dateVal = new Date(c.created_at);
      } else {
        return;
      }
      const t = dateVal.getTime();
      if (!isNaN(t) && now - t <= 7 * 24 * 60 * 60 * 1000) {
        const key = dateVal.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        if (days[key] !== undefined) days[key]++;
      }
    });
    return Object.entries(days).map(([name, value]) => ({ name, value }));
  })();

  const projectAnalytics = (() => {
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const now = new Date();
    
    // Start of the week (Sunday)
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - now.getDay());
    sunday.setHours(0, 0, 0, 0);

    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);

    data.workflow.forEach((w: any) => {
      const date = new Date(w['Updated At']);
      if (!isNaN(date.getTime()) && date >= sunday && date <= saturday) {
        const dayIndex = date.getDay(); // 0 = Sunday, ..., 6 = Saturday
        counts[dayIndex]++;
      }
    });

    const maxCount = Math.max(...counts, 1);
    const todayIndex = now.getDay();
    const hasAnyCount = counts.some(c => c > 0);

    return days.map((d, i) => {
      const count = counts[i];
      const height = hasAnyCount ? Math.round((count / maxCount) * 64) + 10 : 10;
      const isAccent = hasAnyCount ? (count === maxCount) : (i === todayIndex);
      return {
        day: d,
        count,
        height,
        isAccent,
      };
    });
  })();

  const subsidyBreakdown = (() => {
    const map = new Map<string, number>();
    data.subsidies.forEach((s: any) => {
      const k = s.Status || 'Not Applied';
      map.set(k, (map.get(k) || 0) + 1);
    });
    // include Not Applied from clients
    const appliedIds = new Set(data.subsidies.map((s: any) => s['Client ID']));
    const notAppliedCount = data.clients.filter((c: any) => !appliedIds.has(c.ID)).length;
    map.set('Not Applied', (map.get('Not Applied') || 0) + notAppliedCount);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  })();

  const topPendingPayments = (() => {
    const list = data.payments
      .filter((p: PaymentRow) => parseFloat(p['Pending Amount (₹)']) > 0)
      .sort((a: any, b: any) => parseFloat(b['Pending Amount (₹)']) - parseFloat(a['Pending Amount (₹)']))
      .slice(0, 5)
      .map((p: any) => ({ name: data.clientMap.get(p['Client ID']) || p['Client ID'], value: parseFloat(p['Pending Amount (₹)']) }));
    return list;
  })();

  return (
    <div className="space-y-4 md:space-y-8 animate-in fade-in duration-700">
      
      {/* Removed Business Intelligence header per request */}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        <MetricCard title="Total Leads" value={metrics.totalLeads} icon={<Users className="w-5 h-5 sm:w-6 sm:h-6" />} colorWrapper="bg-blue-700 text-white" onClick={() => handleMetricClick('totalLeads')} isActive={selectedMetric === 'totalLeads'} />
        <MetricCard title="Active Projects" value={metrics.ongoingInstallations} icon={<Wrench className="w-5 h-5 sm:w-6 sm:h-6" />} colorWrapper="bg-indigo-600 text-white" onClick={() => handleMetricClick('ongoingInstallations')} isActive={selectedMetric === 'ongoingInstallations'} />
        <MetricCard title="Awaiting Payment" value={metrics.pendingPayments} icon={<IndianRupee className="w-5 h-5 sm:w-6 sm:h-6" />} colorWrapper="bg-rose-600 text-white" onClick={() => handleMetricClick('pendingPayments')} isActive={selectedMetric === 'pendingPayments'} />
        <MetricCard title="Subsidies" value={metrics.subsidiesInProgress} icon={<FileText className="w-5 h-5 sm:w-6 sm:h-6" />} colorWrapper="bg-amber-500 text-white" onClick={() => handleMetricClick('subsidiesInProgress')} isActive={selectedMetric === 'subsidiesInProgress'} />
        <MetricCard title="Completed" value={metrics.completedProjects} icon={<CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />} colorWrapper="bg-emerald-600 text-white" onClick={() => handleMetricClick('completedProjects')} isActive={selectedMetric === 'completedProjects'} />
      </div>

      {renderDetailSection()}

      <div className="grid grid-cols-1 gap-4 md:gap-8 lg:grid-cols-3">
        <Card className="col-span-1 lg:col-span-2 shadow-md border-slate-100 overflow-hidden rounded-2xl">
          <div className="px-6 py-5 border-b border-slate-50 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">Pipeline Snapshot</h3>
                <p className="text-xs text-slate-500 mt-1">Real-time overview of your project pipeline</p>
              </div>
              <div className="flex items-center gap-3 mt-3 sm:mt-0">
                <button onClick={() => setShowAnalytics(true)} className="text-[11px] font-semibold bg-white border border-slate-100 px-3 py-1 rounded-full shadow-sm">Analytics</button>
                <button onClick={() => navigate('/clients?add=1')} style={{ backgroundColor: COLORS[0] }} className="text-[11px] font-semibold text-white px-3 py-1.5 rounded-full shadow-sm">+ Add Lead</button>
              </div>
            </div>

          <CardContent className="p-4 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Left: Large KPI */}
              <div className="col-span-1 md:col-span-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl p-6 pl-16 md:pl-20 bg-gradient-to-br from-sky-900 to-sky-700 text-white shadow-lg flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-3 left-4 sm:top-4 sm:left-6 w-8 sm:w-12 h-8 sm:h-12 rounded-lg bg-white/12 flex items-center justify-center">
                      <Users className="w-5 sm:w-6 h-5 sm:h-6 text-white/90" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold opacity-95">Total Projects</p>
                      <p className="text-2xl sm:text-3xl md:text-5xl font-extrabold mt-2 leading-tight">{metrics.totalLeads}</p>
                    </div>
                    <div className="text-xs opacity-90 mt-3 flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="opacity-90"><path d="M5 12l5 5L20 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Increased from last month
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="rounded-xl p-3 bg-white border border-slate-100 shadow-sm flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Flag className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Ended Projects</p>
                        <div className="text-xl font-extrabold text-slate-900 mt-1">{metrics.completedProjects}</div>
                      </div>
                    </div>
                    <div className="rounded-xl p-3 bg-white border border-slate-100 shadow-sm flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
                        <Wrench className="w-5 h-5 text-sky-600" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Running Projects</p>
                        <div className="text-xl font-extrabold text-slate-900 mt-1">{metrics.ongoingInstallations}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Project analytics pills */}
                <div className="mt-5 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-700 mb-3">Project Analytics</p>
                  <div className="flex items-end gap-3 h-28">
                    {projectAnalytics.map((item, i) => {
                      return (
                        <div key={i} className="flex flex-col items-center gap-2 w-10" title={`${item.count} updates`}>
                          <div className={`w-full rounded-full transition-all`} style={{height: `${item.height}px`, background: item.isAccent ? COLORS[0] : '#f1f5f9', boxShadow: item.isAccent ? '0 6px 18px rgba(11,95,255,0.18)' : 'none'}} />
                          <div className="text-[11px] text-slate-500">{item.day}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Small charts row */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-white border border-slate-100 p-3 shadow-sm">
                    <p className="text-xs text-slate-500">Leads (7d)</p>
                    <div className="h-16 mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyLeads} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis hide domain={[0, 'dataMax']} />
                          <Bar dataKey="value" fill={COLORS[0]} barSize={8} radius={4} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white border border-slate-100 p-3 shadow-sm">
                    <p className="text-xs text-slate-500">Top Pending (₹)</p>
                    <div className="h-16 mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topPendingPayments} margin={{ top: 0, right: 0, left: -8, bottom: 0 }}>
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                          <YAxis hide domain={[0, 'dataMax']} />
                          <Bar dataKey="value" fill="#ef4444" barSize={8} radius={4} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Progress + reminders */}
              <div className="col-span-1 flex flex-col gap-4">
                <div className="rounded-xl p-4 bg-white border border-slate-100 shadow-sm flex flex-col items-center justify-center">
                  <p className="text-xs text-slate-500">Project Leads</p>
                  <div className="relative mt-3 flex flex-col items-center">
                    <div className="text-3xl sm:text-4xl font-extrabold text-slate-900">{metrics.totalLeads}</div>
                    <div className="text-[11px] text-slate-400">Total leads</div>
                    <div className="mt-3 w-full grid grid-cols-2 gap-2">
                      <div className="text-center">
                        <div className="text-xs text-slate-500">Active Projects</div>
                        <div className="text-lg font-bold text-slate-900">{metrics.ongoingInstallations}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-500">Completed</div>
                        <div className="text-lg font-bold text-slate-900">{metrics.completedProjects}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl p-4 bg-white border border-slate-100 shadow-sm relative">
                  <p className="text-sm font-semibold text-slate-700 mb-2">Subsidy Breakdown</p>
                  <div className="h-36 flex items-center justify-center relative">
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={subsidyBreakdown} dataKey="value" nameKey="name" innerRadius={34} outerRadius={56} paddingAngle={4}>
                          {subsidyBreakdown.map((s: any, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 6px 18px rgba(0,0,0,0.08)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="flex flex-col items-center">
                        <div className="text-2xl font-extrabold text-slate-800">{data.subsidies.length}</div>
                        <div className="text-xs text-slate-400">Total Subsidy</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl p-4 bg-white border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">Live Updates</p>
                    <div className="text-[11px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-semibold">Live</div>
                  </div>
                  <div className="mt-3 space-y-3">
                    {liveUpdates && liveUpdates.length > 0 ? (
                      liveUpdates.map((log: any, i: number) => {
                        const date = new Date(log.timestamp);
                        const timeStr = isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const actionColors: Record<string, string> = {
                          CREATE: 'text-blue-600 bg-blue-50',
                          UPDATE: 'text-amber-600 bg-amber-50',
                          DELETE: 'text-rose-600 bg-rose-50',
                          LOGIN: 'text-emerald-600 bg-emerald-50',
                        };
                        const colorClass = actionColors[log.action] || 'text-slate-600 bg-slate-50';
                        return (
                          <div key={i} className="flex items-start gap-2.5 text-xs text-slate-600 border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0 ${colorClass}`}>
                              {log.action}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="font-bold text-slate-800 block truncate">{log.recordName || log.sheet || 'System'}</span>
                              <span className="text-slate-400 text-[10px] block mt-0.5">by {log.userEmail.split('@')[0]} at {timeStr}</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-6 bg-slate-50 rounded-lg text-center">
                        <div className="flex items-center justify-center gap-3">
                          <Zap className="w-6 h-6 text-emerald-500" />
                        </div>
                        <p className="text-sm text-slate-600 mt-3">No updates yet</p>
                        <p className="text-xs text-slate-400 mt-1">Pipeline updates will appear here in real time.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 shadow-sm border-slate-100">
          <div className="px-6 py-5 border-b border-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Recent Updates</h3>
            <button onClick={() => navigate('/clients')} className="text-[10px] font-bold text-blue-700 hover:bg-blue-50 px-3 py-1 rounded-full border border-blue-100">VIEW ALL</button>
          </div>
          <CardContent className="p-6">
            <div className="space-y-5">
              {recentActivity.map((activity: any, i: number) => (
                <div key={i} className="flex gap-4 items-start cursor-pointer group" onClick={() => navigate(`/clients/${activity['Client ID']}`)}>
                  <div className="w-3 h-3 rounded-full bg-blue-700 shadow-sm ring-4 ring-blue-50 shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-700 transition-colors">{activity.ClientName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Moved to <span className="font-bold text-blue-700">{activity.Stage}</span></p>
                    <p className="text-[10px] text-slate-400 mt-1">{new Date(activity['Updated At']).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Stage Details — full width horizontal cards */}
      <Card className="shadow-sm border-slate-100">
        <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800">Stage Details</h3>
            <p className="text-xs text-slate-500">Real-time overview of your project pipeline</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-md border border-slate-100">All Stages</button>
            <button className="text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-md border border-slate-100">↻</button>
          </div>
        </div>
        <CardContent className="p-4">
          <div className="overflow-x-auto -mx-4 px-4 snap-x snap-mandatory touch-pan-x">
            <div className="flex gap-4 min-w-max">
              {pipelineData.map((row: any, i: number) => {
                const items = data.workflow.filter((w: any) => w.Stage === row.name);
                const count = items.length;
                const now = Date.now();
                const avgDays = items.length ? Math.round(items.reduce((s: number, w: any) => s + ((now - new Date(w['Updated At']).getTime()) / (1000*60*60*24)), 0) / items.length) : 0;
                const newThisMonth = items.filter((w: any) => (now - new Date(w['Updated At']).getTime()) <= 30*24*60*60*1000).length;
                const color = COLORS[i % COLORS.length];
                const IconMap: Record<string, any> = {
                  'Lead': Users,
                  'Survey Scheduled': Calendar,
                  'Survey Done': CheckCircle2,
                  'Quotation Sent': ArrowRight,
                  'Quotation Approved': CheckCircle2,
                  'Installation Started': Wrench,
                  'Installation Completed': CheckCircle2,
                  'Subsidy Applied': FileText,
                  'Subsidy Received': FileText,
                  'Project Closed': Flag,
                };
                const StageIcon = IconMap[row.name] || Users;
                return (
                  <div key={row.name} className="w-40 sm:w-48 bg-white border border-slate-100 rounded-2xl p-3 sm:p-4 text-center flex-shrink-0 snap-start">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 sm:w-9 h-8 sm:h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}1A` }}>
                        <StageIcon className="w-3 sm:w-4 h-3 sm:h-4" style={{ color }} />
                      </div>
                      <div className="text-sm font-semibold text-slate-700">{row.name}</div>
                      <div className="mt-2 text-[12px] text-slate-500">Avg time</div>
                      <div className="text-sm font-bold text-slate-900">{avgDays} d</div>
                      <div className="mt-2 text-[12px] text-slate-500">New (30d)</div>
                      <div className="text-sm font-bold text-slate-900">{newThisMonth}</div>
                      <div className="mt-3 text-2xl font-extrabold text-slate-900">{count}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Analytics Modal */}
      {showAnalytics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAnalytics(false)} />
          <div className="relative w-[92%] max-w-3xl mx-auto">
            <Card className="rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-800">Analytics</h3>
                  <p className="text-xs text-slate-500">Quick overview</p>
                </div>
                <div>
                  <button onClick={() => setShowAnalytics(false)} className="p-2 rounded-md text-slate-500 hover:bg-slate-50">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">Leads (7d)</p>
                    <div className="h-28">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyLeads} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis hide domain={[0, 'dataMax']} />
                          <Bar dataKey="value" fill={COLORS[0]} barSize={8} radius={4} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">Pipeline Breakdown</p>
                    <div className="h-28">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={detailChartData} dataKey="value" innerRadius={30} outerRadius={50} paddingAngle={4}>
                            {detailChartData.map((d: any, i: number) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon, colorWrapper, onClick, isActive }: {
  title: string; value: number | string; icon: React.ReactNode;
  colorWrapper: string; onClick: () => void; isActive: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-2 sm:gap-3 p-3 sm:p-4 md:p-5',
        'rounded-xl sm:rounded-2xl border transition-all text-center relative overflow-hidden',
        'active:scale-95 touch-manipulation',
        isActive
          ? 'bg-white border-blue-600 shadow-lg scale-[1.02]'
          : 'bg-white border-slate-100 hover:border-blue-200 hover:shadow-md'
      )}
    >
      {isActive && <div className="absolute top-0 left-0 w-full h-1 sm:h-1.5 bg-blue-600" />}
      <div className={cn(
        'w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-md transition-all',
        colorWrapper
      )}>
        {icon}
      </div>
      <div className="space-y-0.5">
        <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">{title}</p>
        <p className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums leading-tight">{value}</p>
      </div>
    </button>
  );
}
