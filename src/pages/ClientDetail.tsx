import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSheetData, findRowsByColumn, appendRowProtected, updateRowProtected, deleteClientCompletely, getClientWithRelated } from '../sheets/api';
import { logDataModification } from '../sheets/activity';
import { SHEET_NAMES } from '../sheets/config';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { toast } from 'sonner';
import { validateUploadFile, generateUniqueFilename, addUploadRecord, formatFileSize } from '../utils/upload';
import { uploadFileToStorage } from '../sheets/storage';
import { FileText, Trash2, Camera, Paperclip } from 'lucide-react';
import ProposalGenerator from '../components/ProposalGenerator';

const STAGES = [
  'Lead',
  '1. REGISTRATION',
  '2. LOAN APPLIED',
  '3. LOAN APPROVED',
  '4. FIRST DISBURSAL',
  '5. MARGIN MONEY',
  '6. STRUCTURE INSTALLATION',
  '7. WIRING DONE',
  '8. NET METERING',
  '9. PORTAL UPDATE',
  '10. SUBSIDY CLAIM',
  '11. 30% FILE SENT TO BANK',
  '12. 30% RECEIVED',
  '13. FILE / CASE CLOSED'
];

const PHASES = [
  {
    title: 'Pre-requisites',
    stages: ['Lead', '1. REGISTRATION'],
  },
  {
    title: 'Loan Processing',
    stages: ['2. LOAN APPLIED', '3. LOAN APPROVED', '4. FIRST DISBURSAL', '5. MARGIN MONEY'],
  },
  {
    title: 'On-Site Execution',
    stages: ['6. STRUCTURE INSTALLATION', '7. WIRING DONE', '8. NET METERING'],
  },
  {
    title: 'Closure & Subsidy',
    stages: ['9. PORTAL UPDATE', '10. SUBSIDY CLAIM', '11. 30% FILE SENT TO BANK', '12. 30% RECEIVED', '13. FILE / CASE CLOSED'],
  },
];

const DocumentPreview = ({ url, label }: { url?: string; label?: string }) => {
  if (!url) return null;
  const urls = url.split(',').map(u => u.trim()).filter(Boolean);
  if (urls.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 mt-3">
      {urls.map((u, i) => {
        const isImage = /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u) || u.startsWith('data:image/');
        return (
          <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="block border border-slate-200 rounded-lg overflow-hidden hover:border-solar hover:shadow-md transition-all bg-white w-24 h-24 flex items-center justify-center relative group">
            {isImage ? (
              <img src={u} alt={label || 'Document'} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 group-hover:text-solar transition-colors">
                <FileText size={28} strokeWidth={1.5} />
                <span className="text-[9px] uppercase font-bold mt-1.5 px-1 truncate max-w-full text-center">{label || 'FILE'}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
              <span className="text-white text-xs font-medium tracking-wide">View</span>
            </div>
          </a>
        );
      })}
    </div>
  );
};

/**
 * UploadWithCamera — styled file picker + camera button (mobile/tablet only).
 * Replaces bare <input type="file"> elements throughout the detail page.
 */
const UploadWithCamera = ({
  onFileChange,
  accept = 'image/*,.pdf',
  multiple = false,
  disabled = false,
}: {
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}) => (
  <div className="flex gap-2 items-center">
    <label className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <Paperclip className="w-3.5 h-3.5 text-slate-500" />
      Choose File
      <input type="file" accept={accept} multiple={multiple} onChange={onFileChange} className="sr-only" disabled={disabled} />
    </label>
    <label className={`sm:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-300 bg-blue-50 text-xs font-medium text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <Camera className="w-3.5 h-3.5" />
      Camera
      <input type="file" accept="image/*" capture="environment" onChange={onFileChange} className="sr-only" disabled={disabled} />
    </label>
  </div>
);

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Overview');
  const [client, setClient] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  // Tab States
  const [survey, setSurvey] = useState<any>({});
  const [quotation, setQuotation] = useState<any>({});
  const [installation, setInstallation] = useState<any>({});
  const [subsidy, setSubsidy] = useState<any>({});
  const [payment, setPayment] = useState<any>({});
  const [documents, setDocuments] = useState<any>({});
  const [proposalOpen, setProposalOpen] = useState(false);

  const loadData = async (background = false) => {
    if (!id) return;
    try {
      if (!background) setLoading(true);

      const relatedData = await getClientWithRelated(id);

      if (!relatedData || !relatedData.client) {
        toast.error("Client not found");
        navigate('/clients');
        return;
      }
      
      setClient(relatedData.client);

      // Workflow status is stored as a single row in the backend currently
      const clientHistory = relatedData.workflow ? [relatedData.workflow] : [];
      setHistory(clientHistory);

      setSurvey(relatedData.survey || { _isNew: true });
      setQuotation(relatedData.quotation || { _isNew: true });
      setInstallation(relatedData.installation || { _isNew: true });
      setSubsidy(relatedData.subsidy || { _isNew: true });
      setPayment(relatedData.payment || { _isNew: true });
      setDocuments(relatedData.documents || { _isNew: true });

    } catch (err) {
      toast.error('Failed to load client details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, state: any, setState: any, fieldKey: string) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const toastId = toast.loading(`Uploading ${files.length} file(s)...`);
    try {
      const uploadedUrls: string[] = [];

      for (const file of files) {
        // Validate file
        const validation = validateUploadFile(file);
        if (!validation.valid) {
          toast.error(`File "${file.name}" failed: ${validation.errors[0]}`);
          continue;
        }

        if (!validation.sanitizedFile) {
          toast.error(`Failed to sanitize file "${file.name}"`);
          continue;
        }

        const sanitizedFile = validation.sanitizedFile;
        const uniqueName = generateUniqueFilename(file.name, id, fieldKey);

        // Upload to Storage (Cloudflare R2)
        const publicUrl = await uploadFileToStorage(sanitizedFile, `clients/${id}/${fieldKey}`);

        // Record the upload locally for tracking
        addUploadRecord({
          filename: uniqueName,
          originalFilename: file.name,
          clientId: id || 'unknown',
          documentType: fieldKey,
          fileSize: sanitizedFile.size,
          mimeType: sanitizedFile.type,
          uploadedBy: user?.email || 'unknown',
          uploadedAt: new Date().toISOString(),
          url: publicUrl,
          status: 'completed',
        });

        uploadedUrls.push(publicUrl);
      }

      if (uploadedUrls.length === 0) {
        toast.error('No files were successfully uploaded.', { id: toastId });
        return;
      }

      // Keep existing files and append the new ones (comma-separated string)
      const existingUrlsStr = state[fieldKey] || '';
      const existingUrls = existingUrlsStr.split(',').map((u: string) => u.trim()).filter(Boolean);
      const combinedUrls = [...existingUrls, ...uploadedUrls].join(', ');

      setState({ ...state, [fieldKey]: combinedUrls });
      toast.success(`Successfully uploaded ${uploadedUrls.length} file(s)!`, { id: toastId });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(`Upload failed: ${error.message || 'Unknown error'}`, { id: toastId });
    }
  };

  const handleStageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    let newStage = e.target.value;

    if (client?.['Dispute Status'] === 'Resolving') {
      toast.error('Workflow is paused due to an active dispute');
      return;
    }

    const isLoanMode = client?.['Payment Mode'] === 'Loan';
    if (!isLoanMode && currentStage === '1. REGISTRATION') {
      const targetIndex = STAGES.indexOf(newStage);
      if (targetIndex >= 2 && targetIndex <= 5) {
        newStage = '6. STRUCTURE INSTALLATION';
      }
    }

    try {
      const row = [id, newStage, new Date().toISOString(), user?.email || ''];
      await appendRowProtected(SHEET_NAMES.WORKFLOW_STATUS, row, user?.email, user?.role);
      logDataModification('UPDATE', SHEET_NAMES.WORKFLOW_STATUS, id!, user?.id || '', user?.email || '',
        [{ field: 'Stage', oldValue: currentStage, newValue: newStage }], client?.Name);
      toast.success(`Stage updated to ${newStage}`);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update stage');
    }
  };

  const handleDeleteClient = async () => {
    if (!isAdmin) return;
    if (!window.confirm(`Are you sure you want to permanently delete ${client?.Name}? This action cannot be undone and will remove all related records.`)) return;

    try {
      const toastId = toast.loading('Deleting client...');
      await deleteClientCompletely(id!);
      toast.success('Client deleted successfully', { id: toastId });
      navigate('/clients');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete client');
    }
  };

  const handleSaveTab = async (sheetName: string, state: any, setState: any, keys: string[]) => {
    try {
      if (!id) return;
      const rowData = [id, ...keys.map(k => state[k] || '')];

      if (state._isNew) {
        await appendRowProtected(sheetName, rowData, user?.email, user?.role);
        logDataModification('CREATE', sheetName, id, user?.id || '', user?.email || '', undefined, client?.Name);
        toast.success(`${sheetName} record saved`);
      } else {
        await updateRowProtected(sheetName, state._rowIndex, rowData, user?.email, user?.role);
        logDataModification('UPDATE', sheetName, id, user?.id || '', user?.email || '', undefined, client?.Name);
        toast.success(`${sheetName} updated`);
      }
      loadData(true);
    } catch (err: any) {
      toast.error(err.message || `Failed to save ${sheetName}`);
    }
  };

  const currentStage = history[0]?.Stage || 'Lead';

  // Role checks
  const isAdmin = user?.role === 'Admin' || !user?.role;
  const isEngineer = user?.role === 'Engineer';
  const isAccountant = user?.role === 'Accountant';
  const isSales = user?.role === 'Sales Team';

  const canManageDispute = isAdmin || user?.role === 'Manager';
  const canManagePayment = isAdmin || user?.role === 'Manager' || isSales;

  const isLoanMode = client?.['Payment Mode'] === 'Loan';

  const getStageStatus = (stage: string) => {
    const stageIndex = STAGES.indexOf(stage);
    const currentStageIndex = STAGES.indexOf(currentStage);

    // Check if this stage is skipped/N/A
    const isLoanStage = ['2. LOAN APPLIED', '3. LOAN APPROVED', '4. FIRST DISBURSAL', '5. MARGIN MONEY'].includes(stage);
    if (!isLoanMode && isLoanStage) {
      return 'skipped';
    }

    // Bypass checks for closure/subsidy
    const isClosureStage = ['9. PORTAL UPDATE', '10. SUBSIDY CLAIM', '11. 30% FILE SENT TO BANK', '12. 30% RECEIVED'].includes(stage);
    if (isClosureStage && currentStage === '13. FILE / CASE CLOSED') {
      const hasHistoryEntry = history.some(h => h.Stage === stage);
      if (!hasHistoryEntry) {
        return 'skipped';
      }
    }

    if (stage === currentStage) {
      return 'active';
    }

    if (currentStageIndex > stageIndex) {
      return 'completed';
    }

    return 'pending';
  };

  const stageOptions = STAGES.map(s => {
    const isLoanStage = ['2. LOAN APPLIED', '3. LOAN APPROVED', '4. FIRST DISBURSAL', '5. MARGIN MONEY'].includes(s);
    if (!isLoanMode && isLoanStage) {
      return { label: `${s} (Skipped, N/A)`, value: s, disabled: true };
    }
    return { label: s, value: s };
  });

  const handleUpdateClientField = async (field: 'Payment Mode' | 'Dispute Status', value: string) => {
    try {
      const updatedClient = {
        ...client,
        [field]: value
      };
      const rowData = [
        updatedClient.ID,
        updatedClient.Name,
        updatedClient.Phone,
        updatedClient.Address,
        updatedClient['Roof Type'],
        updatedClient['Battery Type'] || '',
        updatedClient['System Size (kW)'],
        updatedClient['Created Date'],
        updatedClient['Assigned To'] || '',
        updatedClient['Assigned To Field'] || '',
        updatedClient['Payment Mode'],
        updatedClient['Dispute Status'],
      ];

      await updateRowProtected(SHEET_NAMES.CLIENTS, client._rowIndex, rowData, user?.email, user?.role);
      toast.success(`${field} updated successfully`);

      // Auto-advance client's stage to 6 if changing to a non-loan mode and currently in stages 2-5
      if (field === 'Payment Mode' && value !== 'Loan') {
        const stageIndex = STAGES.indexOf(currentStage);
        if (stageIndex >= 2 && stageIndex <= 5) {
          const newStage = '6. STRUCTURE INSTALLATION';
          const workflowRow = [id, newStage, new Date().toISOString(), user?.email || ''];
          await appendRowProtected(SHEET_NAMES.WORKFLOW_STATUS, workflowRow, user?.email, user?.role);
          logDataModification('UPDATE', SHEET_NAMES.WORKFLOW_STATUS, id!, user?.id || '', user?.email || '',
            [{ field: 'Stage', oldValue: currentStage, newValue: newStage }], client?.Name);
          toast.success(`Workflow stage auto-advanced to ${newStage} (skipped Loan stages for non-Loan payment mode)`);
        }
      }

      loadData(true);
    } catch (err: any) {
      toast.error(err.message || `Failed to update ${field}`);
    }
  };

  const canEditSurvey = isAdmin || isEngineer;
  const canEditQuotation = isAdmin;
  const canEditInstallation = isAdmin || isEngineer;
  const canEditSubsidy = isAdmin;
  const canEditPayment = isAdmin || isAccountant;

  const tabs = [
    { name: 'Overview', show: true },
    { name: 'Survey', show: true },
    { name: 'Quotation', show: true },
    { name: 'Installation', show: true },
    { name: 'Subsidy', show: true },
    { name: 'Payment', show: true },
    { name: 'Documents', show: true },
  ].filter(t => t.show);

  if (loading) {
    return <div className="p-8"><Skeleton className="h-40 w-full mb-8"/><Skeleton className="h-64 w-full"/></div>;
  }

  return (
    <div className="space-y-6">
      {client?.['Dispute Status'] === 'Resolving' && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="text-sm font-bold text-red-800">Workflow Paused due to Active Dispute</h3>
              <p className="text-xs text-red-700 mt-0.5">A dispute ticket is currently open for this client. Stage transitions are locked until resolved.</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center flex-wrap gap-2 sm:gap-4">
          <Button variant="outline" onClick={() => navigate(-1)} className="px-2 sm:px-4">
            &larr; <span className="hidden sm:inline ml-1">Back</span>
          </Button>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight truncate max-w-[200px] sm:max-w-md">{client?.Name}</h1>
          <Badge variant={currentStage === '13. FILE / CASE CLOSED' ? 'success' : 'warning'}>{currentStage}</Badge>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 w-full md:w-auto">
          {(!isEngineer && !isAccountant) && (
            <div className="flex flex-col items-end gap-1 flex-1 md:flex-none">
              <div className="flex items-center gap-2 w-full">
                <span className="text-sm font-medium text-gray-500 hidden sm:inline whitespace-nowrap">Update Stage:</span>
                <Select
                  value={currentStage}
                  onChange={handleStageChange}
                  options={stageOptions}
                  className="w-full md:w-48"
                  disabled={client?.['Dispute Status'] === 'Resolving'}
                />
              </div>
              {client?.['Dispute Status'] === 'Resolving' && (
                <span className="text-[10px] text-red-600 font-semibold mt-0.5">⚠️ Workflow paused due to active dispute</span>
              )}
            </div>
          )}
          
          {isAdmin && (
            <Button 
              variant="outline" 
              onClick={handleDeleteClient}
              className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 flex-none px-3 sm:px-4"
              title="Delete Client"
            >
              <Trash2 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex border-b border-gray-200 overflow-x-auto pb-[1px]">
        {tabs.map((tab) => (
          <button
            key={tab.name}
            onClick={() => setActiveTab(tab.name)}
            className={`whitespace-nowrap px-6 py-3 border-b-2 font-medium text-sm transition-colors ${
              activeTab === tab.name
                ? 'border-solar text-solar'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          {activeTab === 'Overview' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Client Details</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-gray-500">Client ID</div><div className="font-medium text-gray-900">{client?.ID}</div>
                    <div className="text-gray-500">Phone</div><div className="font-medium text-gray-900">{client?.Phone}</div>
                    <div className="text-gray-500">Address</div><div className="font-medium text-gray-900">{client?.Address}</div>
                    <div className="text-gray-500">System Size</div><div className="font-medium text-gray-900">{client?.['System Size (kW)']} kW ({client?.['Roof Type']})</div>
                    <div className="text-gray-500">System Type</div><div className="font-medium text-gray-900">{client?.['Battery Type'] || 'Not set'}</div>
                    <div className="text-gray-500">Created Date</div><div className="font-medium text-gray-900">{client?.['Created Date']}</div>
                    <div className="text-gray-500">Assigned To (Backoffice)</div><div className="font-medium text-gray-900">{client?.['Assigned To'] || 'Unassigned'}</div>
                    <div className="text-gray-500">Assigned To (Field Team)</div><div className="font-medium text-gray-900">{client?.['Assigned To Field'] || 'Unassigned'}</div>
                    
                    <div className="text-gray-500 flex items-center">Payment Mode</div>
                    <div>
                      {canManagePayment ? (
                        <select
                          value={client?.['Payment Mode'] || 'Loan'}
                          onChange={(e) => handleUpdateClientField('Payment Mode', e.target.value)}
                          className="rounded-lg border-2 border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-blue-500 cursor-pointer shadow-sm"
                          disabled={client?.['Dispute Status'] === 'Resolving'}
                        >
                          <option value="Loan">Loan</option>
                          <option value="Cash">Cash</option>
                          <option value="PDC (78)">PDC (78)</option>
                          <option value="PDC (30)">PDC (30)</option>
                          <option value="Advance">Advance</option>
                        </select>
                      ) : (
                        <span className="font-medium text-gray-900">{client?.['Payment Mode'] || 'Loan'}</span>
                      )}
                    </div>

                    <div className="text-gray-500 flex items-center">Dispute Status</div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        client?.['Dispute Status'] === 'Resolving' 
                          ? 'bg-red-50 text-red-700 border-red-200 animate-pulse' 
                          : 'bg-green-50 text-green-700 border-green-200'
                      }`}>
                        {client?.['Dispute Status'] || 'None'}
                      </span>
                    </div>
                  </div>

                  {canManageDispute && (
                    <div className="border-t border-slate-100 pt-4 mt-2">
                      {client?.['Dispute Status'] === 'Resolving' ? (
                        <Button
                          variant="primary"
                          className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2 text-xs py-2.5 font-bold shadow-md rounded-xl"
                          onClick={() => {
                            if (window.confirm("Are you sure you want to resolve the active dispute ticket? This will resume the workflow progression.")) {
                              handleUpdateClientField('Dispute Status', 'None');
                            }
                          }}
                        >
                          ✓ Resolve Active Dispute
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 flex items-center justify-center gap-2 text-xs py-2.5 font-bold shadow-sm rounded-xl"
                          onClick={() => {
                            if (window.confirm("Are you sure you want to raise a dispute ticket? This will lock all stage updates and pause workflow progression.")) {
                              handleUpdateClientField('Dispute Status', 'Resolving');
                            }
                          }}
                        >
                          ⚠️ Raise Dispute Ticket
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                   <h3 className="text-lg font-semibold border-b pb-2">Workflow History</h3>
                   <div className="space-y-4">
                      {history.map((h, i) => (
                        <div key={i} className="flex border-l-2 border-solar ml-2 pl-4 py-1">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{h.Stage}</p>
                            <p className="text-xs text-gray-500">{new Date(h['Updated At']).toLocaleString()} by {h['Updated By']}</p>
                          </div>
                        </div>
                      ))}
                   </div>
                </div>
              </div>

              {/* Visual Pipeline Stepper */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/60 space-y-4 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚡</span>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Workflow Pipeline</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm flex items-center gap-1.5">
                      Mode: <strong className="text-slate-800 font-bold">{client?.['Payment Mode'] || 'Loan'}</strong>
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm ${
                      client?.['Dispute Status'] === 'Resolving'
                        ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                        : 'bg-green-50 text-green-700 border-green-200'
                    }`}>
                      DISPUTE: {client?.['Dispute Status'] === 'Resolving' ? 'RESOLVING' : 'NONE'}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {PHASES.map((phase) => (
                    <div key={phase.title} className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-sm flex flex-col gap-2.5">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-0.5">
                        <span className="text-xs font-bold text-slate-700">{phase.title}</span>
                      </div>
                      
                      <div className="space-y-1.5 flex-1">
                        {phase.stages.map((stage) => {
                          const status = getStageStatus(stage);
                          const displayLabel = stage.replace(/^\d+\.\s*/, '');
                          
                          let icon = null;
                          let classes = '';
                          
                          if (status === 'completed') {
                            icon = <span className="flex-shrink-0 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold shadow-sm">✓</span>;
                            classes = 'bg-emerald-50/30 border-emerald-100/60 text-emerald-800';
                          } else if (status === 'active') {
                            icon = <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold animate-pulse shadow-sm">●</span>;
                            classes = 'bg-blue-50/80 border-blue-200 text-blue-900 font-semibold ring-1 ring-blue-100 animate-pulse';
                          } else if (status === 'skipped') {
                            icon = <span className="flex-shrink-0 w-4 h-4 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center text-[8px] font-bold font-mono">N/A</span>;
                            classes = 'bg-slate-50/40 border-slate-200/40 border-dashed text-slate-400 opacity-80';
                          } else {
                            icon = <span className="flex-shrink-0 w-4 h-4 rounded-full bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center text-[10px] font-medium"></span>;
                            classes = 'bg-white border-slate-100/70 text-slate-500';
                          }

                          return (
                            <div 
                              key={stage} 
                              className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs leading-none transition-all ${classes}`}
                              title={stage}
                            >
                              {icon}
                              <span className="truncate flex-1 font-medium">{displayLabel}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Survey' && (
            <div className="space-y-4 max-w-2xl">
              <Input label="Survey Date" type="date" value={survey['Survey Date'] || ''} onChange={e => setSurvey({...survey, 'Survey Date': e.target.value})} disabled={!canEditSurvey} />
              <Input label="Surveyor Name" value={survey['Surveyor Name'] || ''} onChange={e => setSurvey({...survey, 'Surveyor Name': e.target.value})} disabled={!canEditSurvey} />
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Site Images (Drive Link)</label>
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                  {canEditSurvey && <UploadWithCamera accept="image/*" multiple onFileChange={(e) => handleFileUpload(e, survey, setSurvey, 'Site Images')} />}
                  <Input placeholder="Or paste Drive link" value={survey['Site Images'] || ''} onChange={e => setSurvey({...survey, 'Site Images': e.target.value})} disabled={!canEditSurvey} />
                </div>
                <DocumentPreview url={survey['Site Images']} label="Site Photo" />
              </div>
              <div className="w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">Recommended System Details</label>
                <textarea
                  className="w-full rounded-md border border-gray-300 p-2 text-sm focus:ring-2 focus:ring-solar outline-none min-h-[100px]"
                  value={survey['Recommended System Details'] || ''}
                  onChange={e => setSurvey({...survey, 'Recommended System Details': e.target.value})}
                  disabled={!canEditSurvey}
                />
              </div>
              {canEditSurvey && (
                <Button onClick={() => handleSaveTab(SHEET_NAMES.SURVEYS, survey, setSurvey, ['Survey Date', 'Site Images', 'Recommended System Details', 'Surveyor Name'])}>Save Survey Details</Button>
              )}
            </div>
          )}

          {activeTab === 'Quotation' && (
            <div className="space-y-4 max-w-2xl">
              <Input label="Amount (₹)" type="number" value={quotation['Amount (₹)'] || ''} onChange={e => setQuotation({...quotation, 'Amount (₹)': e.target.value})} disabled={!canEditQuotation} />
              <Input label="Validity Date" type="date" value={quotation['Validity Date'] || ''} onChange={e => setQuotation({...quotation, 'Validity Date': e.target.value})} disabled={!canEditQuotation} />
              <Select label="Approval Status" value={quotation['Approval Status'] || ''} onChange={e => setQuotation({...quotation, 'Approval Status': e.target.value})} options={[{label:'Pending',value:'Pending'},{label:'Approved',value:'Approved'},{label:'Rejected',value:'Rejected'}]} disabled={!canEditQuotation} />
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Quotation PDF</label>
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                  {canEditQuotation && <UploadWithCamera accept=".pdf,image/*" onFileChange={(e) => handleFileUpload(e, quotation, setQuotation, 'Quotation PDF')} />}
                  <Input placeholder="Or paste Drive link" value={quotation['Quotation PDF'] || documents['Quotation Doc Link'] || ''} onChange={e => setQuotation({...quotation, 'Quotation PDF': e.target.value})} disabled={!canEditQuotation} />
                </div>
                <DocumentPreview url={quotation['Quotation PDF'] || documents['Quotation Doc Link']} label="Quotation" />
              </div>
              {canEditQuotation && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => handleSaveTab(SHEET_NAMES.QUOTATIONS, quotation, setQuotation, ['Quotation PDF', 'Amount (₹)', 'Validity Date', 'Approval Status'])}>
                    Save Quotation
                  </Button>
                  <Button variant="outline" onClick={() => setProposalOpen(true)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Proposal
                  </Button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Installation' && (
            <div className="space-y-4 max-w-2xl">
              <Input label="Start Date" type="date" value={installation['Start Date'] || ''} onChange={e => setInstallation({...installation, 'Start Date': e.target.value})} disabled={!canEditInstallation} />
              <Input label="End Date" type="date" value={installation['End Date'] || ''} onChange={e => setInstallation({...installation, 'End Date': e.target.value})} disabled={!canEditInstallation}  />
              <Input label="Team Members (comma-separated)" value={installation['Team Members'] || ''} onChange={e => setInstallation({...installation, 'Team Members': e.target.value})} disabled={!canEditInstallation} />
              <div className="w-full">
                 <label className="block text-sm font-medium text-gray-700 mb-1">Completion % : {installation['Completion %'] || 0}%</label>
                 <input type="range" min="0" max="100" value={installation['Completion %'] || 0} onChange={e => setInstallation({...installation, 'Completion %': e.target.value})} className="w-full" disabled={!canEditInstallation} />
              </div>
              <div className="w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">Progress Notes</label>
                <textarea
                  className="w-full rounded-md border border-gray-300 p-2 text-sm focus:ring-2 focus:ring-solar outline-none min-h-[100px]"
                  value={installation['Progress Notes'] || ''}
                  onChange={e => setInstallation({...installation, 'Progress Notes': e.target.value})}
                  disabled={!canEditInstallation}
                />
              </div>
              {canEditInstallation && (
                <Button onClick={() => handleSaveTab(SHEET_NAMES.INSTALLATIONS, installation, setInstallation, ['Team Members', 'Progress Notes', 'Completion %', 'Start Date', 'End Date'])}>Save Installation Details</Button>
              )}
            </div>
          )}

          {activeTab === 'Subsidy' && (
            <div className="space-y-4 max-w-2xl">
              <Select
                label="Status"
                value={subsidy['Status'] || ''}
                onChange={e => setSubsidy({...subsidy, 'Status': e.target.value})}
                options={[
                  {label:'Select...', value:''},
                  {label:'Applied', value:'Applied'},
                  {label:'Under Review', value:'Under Review'},
                  {label:'Approved', value:'Approved'},
                  {label:'Received', value:'Received'}
                ]}
                disabled={!canEditSubsidy}
              />
              <Input label="Applied Date" type="date" value={subsidy['Applied Date'] || ''} onChange={e => setSubsidy({...subsidy, 'Applied Date': e.target.value})} disabled={!canEditSubsidy} />
              <Input label="Approval Date" type="date" value={subsidy['Approval Date'] || ''} onChange={e => setSubsidy({...subsidy, 'Approval Date': e.target.value})} disabled={!canEditSubsidy} />
              <Input label="Amount (₹)" type="number" value={subsidy['Amount (₹)'] || ''} onChange={e => setSubsidy({...subsidy, 'Amount (₹)': e.target.value})} disabled={!canEditSubsidy} />
              {canEditSubsidy && (
                <Button onClick={() => handleSaveTab(SHEET_NAMES.SUBSIDIES, subsidy, setSubsidy, ['Status', 'Applied Date', 'Approval Date', 'Amount (₹)'])}>Save Subsidy Details</Button>
              )}
            </div>
          )}

          {activeTab === 'Payment' && (
            <div className="space-y-4 max-w-2xl">
              <Input 
                label="Total Amount (₹)" 
                type="number" 
                value={payment['Total Amount (₹)'] || ''} 
                onChange={e => {
                  const total = parseFloat(e.target.value) || 0;
                  const paid = parseFloat(payment['Paid Amount (₹)']) || 0;
                  setPayment({
                    ...payment,
                    'Total Amount (₹)': e.target.value,
                    'Pending Amount (₹)': String(Math.max(0, total - paid))
                  });
                }} 
                disabled={!canEditPayment} 
              />
              <Input 
                label="Paid Amount (₹)" 
                type="number" 
                value={payment['Paid Amount (₹)'] || ''} 
                onChange={e => {
                  const total = parseFloat(payment['Total Amount (₹)']) || 0;
                  const paid = parseFloat(e.target.value) || 0;
                  setPayment({
                    ...payment,
                    'Paid Amount (₹)': e.target.value,
                    'Pending Amount (₹)': String(Math.max(0, total - paid))
                  });
                }} 
                disabled={!canEditPayment} 
              />
              <Input 
                label="Pending Amount (₹)" 
                type="number" 
                value={payment['Pending Amount (₹)'] || ''} 
                disabled={true} 
                placeholder="Automatically calculated"
              />
              <Input label="Due Date" type="date" value={payment['Due Date'] || ''} onChange={e => setPayment({...payment, 'Due Date': e.target.value})} disabled={!canEditPayment} />
              <Select
                label="Payment Status"
                value={payment['Payment Status'] || ''}
                onChange={e => setPayment({...payment, 'Payment Status': e.target.value})}
                options={[
                  {label:'Select...', value:''},
                  {label:'Pending', value:'Pending'},
                  {label:'Partial', value:'Partial'},
                  {label:'Paid', value:'Paid'},
                  {label:'Overdue', value:'Overdue'}
                ]}
                disabled={!canEditPayment}
              />
              {canEditPayment && (
                <Button onClick={() => handleSaveTab(SHEET_NAMES.PAYMENTS, payment, setPayment, ['Total Amount (₹)', 'Paid Amount (₹)', 'Pending Amount (₹)', 'Due Date', 'Payment Status'])}>Save Payment Details</Button>
              )}
            </div>
          )}

          {activeTab === 'Documents' && (
            <div className="space-y-4 max-w-4xl">
              <p className="text-sm text-gray-500 mb-4">Upload files directly or provide links/document numbers manually.</p>

              {/* Aadhaar Section */}
              <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-slate-50">
                <label className="text-sm font-medium text-slate-700">Aadhaar</label>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1.5">Upload Photo / PDF</label>
                    <div className="flex flex-col lg:flex-row gap-2 items-start">
                      <UploadWithCamera accept="image/*,.pdf" onFileChange={(e) => handleFileUpload(e, documents, setDocuments, 'Aadhaar Link')} />
                      <Input value={documents['Aadhaar Link'] || ''} onChange={e => setDocuments({...documents, 'Aadhaar Link': e.target.value})} placeholder="Drive Link" />
                    </div>
                    <DocumentPreview url={documents['Aadhaar Link']} label="Aadhaar" />
                  </div>
                  <div className="border-t pt-3">
                    <label className="text-xs font-medium text-slate-600 block mb-1.5">Or Enter Aadhaar Number</label>
                    <Input value={documents['Aadhaar Number'] || ''} onChange={e => setDocuments({...documents, 'Aadhaar Number': e.target.value})} placeholder="XXXX XXXX XXXX" maxLength={12} />
                  </div>
                </div>
              </div>

              {/* Electricity Bill Section */}
              <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-slate-50">
                <label className="text-sm font-medium text-slate-700">Electricity Bill</label>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1.5">Upload Photo / PDF</label>
                    <div className="flex flex-col lg:flex-row gap-2 items-start">
                      <UploadWithCamera accept="image/*,.pdf" onFileChange={(e) => handleFileUpload(e, documents, setDocuments, 'Electricity Bill Link')} />
                      <Input value={documents['Electricity Bill Link'] || ''} onChange={e => setDocuments({...documents, 'Electricity Bill Link': e.target.value})} placeholder="Drive Link" />
                    </div>
                    <DocumentPreview url={documents['Electricity Bill Link']} label="Bill" />
                  </div>
                  <div className="border-t pt-3">
                    <label className="text-xs font-medium text-slate-600 block mb-1.5">Or Enter Bill Number</label>
                    <Input value={documents['Bill Number'] || ''} onChange={e => setDocuments({...documents, 'Bill Number': e.target.value})} placeholder="Electricity bill number" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Quotation Doc</label>
                <div className="flex flex-col lg:flex-row gap-2 items-start">
                  <UploadWithCamera accept=".pdf,image/*" onFileChange={(e) => handleFileUpload(e, documents, setDocuments, 'Quotation Doc Link')} />
                  <Input value={documents['Quotation Doc Link'] || ''} onChange={e => setDocuments({...documents, 'Quotation Doc Link': e.target.value})} placeholder="Drive Link" />
                </div>
                <DocumentPreview url={documents['Quotation Doc Link']} label="Quotation" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Installation Photos</label>
                <div className="flex flex-col lg:flex-row gap-2 items-start">
                  <UploadWithCamera accept="image/*" multiple onFileChange={(e) => handleFileUpload(e, documents, setDocuments, 'Installation Photos Link')} />
                  <Input value={documents['Installation Photos Link'] || ''} onChange={e => setDocuments({...documents, 'Installation Photos Link': e.target.value})} placeholder="Drive Link" />
                </div>
                <DocumentPreview url={documents['Installation Photos Link']} label="Install Photo" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Subsidy Docs</label>
                <div className="flex flex-col lg:flex-row gap-2 items-start">
                  <UploadWithCamera accept="image/*,.pdf" multiple onFileChange={(e) => handleFileUpload(e, documents, setDocuments, 'Subsidy Docs Link')} />
                  <Input value={documents['Subsidy Docs Link'] || ''} onChange={e => setDocuments({...documents, 'Subsidy Docs Link': e.target.value})} placeholder="Drive Link" />
                </div>
                <DocumentPreview url={documents['Subsidy Docs Link']} label="Subsidy Doc" />
              </div>

              <Button onClick={() => handleSaveTab(SHEET_NAMES.DOCUMENTS, documents, setDocuments, [
                'Aadhaar Link', 'Aadhaar Number', 'Electricity Bill Link', 'Bill Number', 
                'PAN Card Link', 'Bank Details', 'Additional Doc 1 Link', 'Additional Doc 2 Link', 'Additional Doc 3 Link',
                'Quotation Doc Link', 'Installation Photos Link', 'Subsidy Docs Link'
              ])} className="mt-4">Save Document Links</Button>
            </div>
          )}

        </CardContent>
      </Card>

      {client && (
        <ProposalGenerator
          clientId={id || ''}
          clientData={client}
          quotationData={quotation?._isNew ? null : quotation}
          isOpen={proposalOpen}
          onClose={() => setProposalOpen(false)}
          onSaved={(url: string) => {
            setQuotation((prev: any) => ({ ...prev, 'Quotation PDF': url }));
            toast.success('Proposal saved to client record');
            setProposalOpen(false);
          }}
        />
      )}
    </div>
  );
}