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
  'Lead', 'Survey Scheduled', 'Survey Done', 'Quotation Sent',
  'Quotation Approved', 'Installation Started', 'Installation Completed',
  'Subsidy Applied', 'Subsidy Received', 'Project Closed'
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
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = validateUploadFile(file);
    if (!validation.valid) {
      toast.error(`Upload failed: ${validation.errors[0]}`);
      return;
    }

    if (!validation.sanitizedFile) {
      toast.error('Failed to sanitize file');
      return;
    }

    const toastId = toast.loading(`Validating and uploading ${file.name}...`);
    try {
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

      setState({ ...state, [fieldKey]: publicUrl });
      toast.success(`${file.name} (${formatFileSize(file.size)}) uploaded!`, { id: toastId });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(`Upload failed: ${error.message || 'Unknown error'}`, { id: toastId });
    }
  };

  const handleStageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStage = e.target.value;
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center flex-wrap gap-2 sm:gap-4">
          <Button variant="outline" onClick={() => navigate(-1)} className="px-2 sm:px-4">
            &larr; <span className="hidden sm:inline ml-1">Back</span>
          </Button>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight truncate max-w-[200px] sm:max-w-md">{client?.Name}</h1>
          <Badge variant={currentStage === 'Project Closed' ? 'success' : 'warning'}>{currentStage}</Badge>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 w-full md:w-auto">
          {(!isEngineer && !isAccountant) && (
            <div className="flex items-center gap-2 flex-1 md:flex-none">
              <span className="text-sm font-medium text-gray-500 hidden sm:inline whitespace-nowrap">Update Stage:</span>
              <Select
                value={currentStage}
                onChange={handleStageChange}
                options={STAGES.map(s => ({label: s, value: s}))}
                className="w-full md:w-48"
              />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">Client Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="text-gray-500">Client ID</div><div className="font-medium text-gray-900">{client?.ID}</div>
                  <div className="text-gray-500">Phone</div><div className="font-medium text-gray-900">{client?.Phone}</div>
                  <div className="text-gray-500">Address</div><div className="font-medium text-gray-900">{client?.Address}</div>
                  <div className="text-gray-500">System Size</div><div className="font-medium text-gray-900">{client?.['System Size (kW)']} kW ({client?.['Roof Type']})</div>
                  <div className="text-gray-500">Battery</div><div className="font-medium text-gray-900">{client?.['Battery Type'] || 'Not set'}</div>
                  <div className="text-gray-500">Created Date</div><div className="font-medium text-gray-900">{client?.['Created Date']}</div>
                  <div className="text-gray-500">Assigned To</div><div className="font-medium text-gray-900">{client?.['Assigned To'] || 'Unassigned'}</div>
                </div>
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
              <Input label="Total Amount (₹)" type="number" value={payment['Total Amount (₹)'] || ''} onChange={e => setPayment({...payment, 'Total Amount (₹)': e.target.value})} disabled={!canEditPayment} />
              <Input label="Paid Amount (₹)" type="number" value={payment['Paid Amount (₹)'] || ''} onChange={e => setPayment({...payment, 'Paid Amount (₹)': e.target.value})} disabled={!canEditPayment} />
              <Input label="Pending Amount (₹)" type="number" value={payment['Pending Amount (₹)'] || ''} onChange={e => setPayment({...payment, 'Pending Amount (₹)': e.target.value})} disabled={!canEditPayment} />
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
                    <Input value={documents['Aadhaar Number'] || ''} onChange={e => setDocuments({...documents, 'Aadhaar Number': e.target.value})} placeholder="XXXX XXXX XXXX" maxLength="12" />
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