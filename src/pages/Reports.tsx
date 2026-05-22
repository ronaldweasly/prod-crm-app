import React, { useState, useEffect } from 'react';
import { getSheetData } from '../sheets/api';
import { SHEET_NAMES } from '../sheets/config';
import { ClientRow, WorkflowStatusRow, SubsidyRow, PaymentRow } from '../sheets/types';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FileUp, FileDown, FileText } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Skeleton } from '../ui/Skeleton';

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [reportData, setReportData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});

  const loadReport = async () => {
    try {
      setLoading(true);
      const [clients, workflow, payments, subsidies] = await Promise.all([
        getSheetData<ClientRow>(SHEET_NAMES.CLIENTS),
        getSheetData<WorkflowStatusRow>(SHEET_NAMES.WORKFLOW_STATUS),
        getSheetData<PaymentRow>(SHEET_NAMES.PAYMENTS),
        getSheetData<SubsidyRow>(SHEET_NAMES.SUBSIDIES),
      ]);

      let filteredClients = clients;

      if (dateRange.start && dateRange.end) {
        // Simple string comparison or date parsing. Format is DD/MM/YYYY
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        
        filteredClients = clients.filter(c => {
          if (!c['Created Date']) return false;
          const [d, m, y] = c['Created Date'].split('/');
          const cDate = new Date(`${y}-${m}-${d}`);
          return cDate >= start && cDate <= end;
        });
      }

      const clientIds = new Set(filteredClients.map(c => c.ID));

      const filteredPayments = payments.filter(p => clientIds.has(p['Client ID']));
      const filteredSubsidies = subsidies.filter(s => clientIds.has(s['Client ID']));
      const filteredWorkflow = workflow.filter(w => clientIds.has(w['Client ID']));

      const closedProjects = new Set(filteredWorkflow.filter(w => w.Stage === '13. FILE / CASE CLOSED').map(w => w['Client ID'])).size;
      const subsidiesReceived = filteredSubsidies.filter(s => s.Status === 'Received').length;
      
      const totalRevenue = filteredPayments.reduce((acc, p) => acc + (parseFloat(p['Paid Amount (₹)']) || 0), 0);
      const pendingRevenue = filteredPayments.reduce((acc, p) => acc + (parseFloat(p['Pending Amount (₹)']) || 0), 0);

      setSummary({
        clientsAdded: filteredClients.length,
        projectsCompleted: closedProjects,
        subsidiesReceived,
        totalRevenueCollected: totalRevenue,
        pendingPayments: pendingRevenue
      });

      const tableData = filteredClients.map(c => {
        const p = filteredPayments.find(p => p['Client ID'] === c.ID);
        const cw = filteredWorkflow.filter(w => w['Client ID'] === c.ID).reverse()[0];
        return {
          'Client Name': c.Name,
          'Added On': c['Created Date'],
          'Current Stage': cw?.Stage || 'Lead',
          'Paid (₹)': p?.['Paid Amount (₹)'] || '0',
          'Pending (₹)': p?.['Pending Amount (₹)'] || '0',
        };
      });

      setReportData(tableData);

    } catch (error) {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [dateRange]); // Note: automatically reruns when dates change

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, "DoctorElectric_Report.xlsx");
  };

  const exportCSV = () => {
    const ws = XLSX.utils.json_to_sheet(reportData);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "DoctorElectric_Report.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("DOCTOR ELECTRIC CRM Report", 14, 15);
    
    // Summary
    doc.setFontSize(10);
    doc.text(`Clients Added: ${summary.clientsAdded}`, 14, 25);
    doc.text(`Projects Completed: ${summary.projectsCompleted}`, 14, 30);
    doc.text(`Total Revenue Collected: ₹${summary.totalRevenueCollected}`, 14, 35);
    doc.text(`Pending Payments: ₹${summary.pendingPayments}`, 14, 40);

    const tableColumn = ["Client Name", "Added On", "Current Stage", "Paid (₹)", "Pending (₹)"];
    const tableRows = reportData.map(row => [
      row['Client Name'],
      row['Added On'],
      row['Current Stage'],
      row['Paid (₹)'],
      row['Pending (₹)']
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 50,
    });

    doc.save("DoctorElectric_Report.pdf");
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">System Reports</h1>
        <div className="flex flex-wrap gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel}><FileUp className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2"/> Excel</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2"/> CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2"/> PDF</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-6">
          <div className="flex flex-col gap-3 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input 
                label="Start Date" 
                type="date" 
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))}
              />
              <Input 
                label="End Date" 
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))}
              />
            </div>
            <Button onClick={loadReport} variant="secondary" className="w-full sm:w-auto">Filter</Button>
          </div>

          {loading ? (
             <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4 mb-8">
               {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-20 sm:h-24" />)}
             </div>
          ) : (
             <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 mb-8">
               <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-100">
                 <p className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">Clients Added</p>
                 <p className="text-lg sm:text-2xl font-bold text-gray-900">{summary.clientsAdded}</p>
               </div>
               <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-100">
                 <p className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">Projects Done</p>
                 <p className="text-lg sm:text-2xl font-bold text-gray-900">{summary.projectsCompleted}</p>
               </div>
               <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-100">
                 <p className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">Subsidies Rx</p>
                 <p className="text-lg sm:text-2xl font-bold text-gray-900">{summary.subsidiesReceived}</p>
               </div>
               <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-100">
                 <p className="text-[10px] sm:text-xs font-medium text-green-800 mb-1">Collected</p>
                 <p className="text-sm sm:text-xl font-bold text-green-900 truncate">₹{(summary.totalRevenueCollected || 0)?.toLocaleString('en-IN')}</p>
               </div>
               <div className="bg-red-50 p-3 sm:p-4 rounded-lg border border-red-100">
                 <p className="text-[10px] sm:text-xs font-medium text-red-800 mb-1">Pending</p>
                 <p className="text-sm sm:text-xl font-bold text-red-900 truncate">₹{(summary.pendingPayments || 0)?.toLocaleString('en-IN')}</p>
               </div>
             </div>
          )}

          {/* Mobile: Card view */}
          <div className="md:hidden space-y-3">
            {loading ? (
              Array(5).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))
            ) : reportData.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No data for selected period</div>
            ) : (
              reportData.map((row, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                  <p className="font-medium text-gray-900 mb-2">{row['Client Name']}</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Added On</p>
                      <p className="font-medium text-gray-700">{row['Added On']}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Stage</p>
                      <p className="font-medium text-gray-700 truncate">{row['Current Stage']}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Paid</p>
                      <p className="font-medium text-green-600">₹{row['Paid (₹)']}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Pending</p>
                      <p className="font-medium text-red-600">₹{row['Pending (₹)']}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop: Table view */}
          <div className="hidden md:block border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 uppercase font-semibold text-xs border-b border-gray-200">
                  <tr>
                    <th className="px-4 md:px-6 py-4">Client Name</th>
                    <th className="px-4 md:px-6 py-4">Added On</th>
                    <th className="px-4 md:px-6 py-4">Current Stage</th>
                    <th className="px-4 md:px-6 py-4">Paid (₹)</th>
                    <th className="px-4 md:px-6 py-4">Pending (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                   {loading ? (
                     <tr><td colSpan={5} className="p-4"><Skeleton className="h-40 w-full"/></td></tr>
                   ) : reportData.length === 0 ? (
                     <tr><td colSpan={5} className="p-8 text-center text-gray-500">No data for selected period</td></tr>
                   ) : (
                     reportData.map((row, i) => (
                       <tr key={i} className="hover:bg-gray-50">
                         <td className="px-4 md:px-6 py-4 font-medium">{row['Client Name']}</td>
                         <td className="px-4 md:px-6 py-4">{row['Added On']}</td>
                         <td className="px-4 md:px-6 py-4">{row['Current Stage']}</td>
                         <td className="px-4 md:px-6 py-4 text-green-600 font-medium">₹{row['Paid (₹)']}</td>
                         <td className="px-4 md:px-6 py-4 text-red-600 font-medium">₹{row['Pending (₹)']}</td>
                       </tr>
                     ))
                   )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
