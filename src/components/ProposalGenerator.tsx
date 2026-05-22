import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { uploadFileToStorage } from '../sheets/storage';
import { ClientRow, QuotationRow } from '../sheets/types';
import { ProposalData } from '../sheets/proposalTypes';
import { generateProposalPdf } from '../utils/proposalPdf';

interface Props {
  clientId: string;
  clientData: ClientRow;
  quotationData: QuotationRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (pdfUrl: string) => void;
}

const COMPANY_STORAGE_KEY = 'solarcrm_company_info';

const formatInr = (value: number) => `Rs ${Math.round(value).toLocaleString('en-IN')}`;
const formatInverterType = (value: string) => {
  if (!value) return 'N/A';
  return value.toLowerCase().includes('inverter') ? value : `${value} Inverter`;
};

export default function ProposalGenerator({
  clientId,
  clientData,
  quotationData,
  isOpen,
  onClose,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const [view, setView] = useState<'form' | 'preview'>('form');
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const [systemSizeKw, setSystemSizeKw] = useState(clientData['System Size (kW)'] || '');
  const [panelCount, setPanelCount] = useState('');
  const [panelWattage, setPanelWattage] = useState('540');
  const [inverterType, setInverterType] = useState('String');
  const [inverterBrand, setInverterBrand] = useState('');
  const [mountingStructure, setMountingStructure] = useState('RCC Roof');
  const [batteryBackup, setBatteryBackup] = useState(false);
  const [batteryCapacityKwh, setBatteryCapacityKwh] = useState('');

  const [systemCostBeforeSubsidy, setSystemCostBeforeSubsidy] = useState(quotationData?.['Amount (₹)'] || '');
  const [gstPercent, setGstPercent] = useState('18');
  const [subsidyEligible, setSubsidyEligible] = useState(false);
  const [subsidyAmount, setSubsidyAmount] = useState('');

  const [estimatedMonthlyGeneration, setEstimatedMonthlyGeneration] = useState('');
  const [estimatedAnnualSavings, setEstimatedAnnualSavings] = useState('');

  const [companyPreset, setCompanyPreset] = useState<'doctor_electric' | 'custom'>('doctor_electric');
  const [preparedBy, setPreparedBy] = useState(user?.name || '');
  const [validityDays, setValidityDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [companyName, setCompanyName] = useState('Doctor Electric');
  const [companyPhone, setCompanyPhone] = useState('+91 832 911 4497');
  const [companyEmail, setCompanyEmail] = useState('yt.doctorelectric@gmail.com');
  const [warrantyYearsPanel, setWarrantyYearsPanel] = useState('25');
  const [warrantyYearsInverter, setWarrantyYearsInverter] = useState('5');
  const [customTerms, setCustomTerms] = useState(
    '1. Net-metering approval and solar subsidy are subject to DISCOM and government policies.\n' +
    '2. Payment Terms: 60% advance with order, 30% upon material delivery, and 10% after installation.\n' +
    '3. Customer is responsible for providing clear site access, water, and electricity during execution.'
  );

  useEffect(() => {
    if (!isOpen) return;
    setShowErrors(false);
    const savedPreset = localStorage.getItem('solarcrm_company_preset') || 'doctor_electric';
    setCompanyPreset(savedPreset as 'doctor_electric' | 'custom');
    if (savedPreset === 'doctor_electric') {
      setCompanyName('Doctor Electric');
      setCompanyPhone('+91 832 911 4497');
      setCompanyEmail('yt.doctorelectric@gmail.com');
    } else {
      const stored = localStorage.getItem(COMPANY_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setCompanyName(parsed.companyName || '');
          setCompanyPhone(parsed.companyPhone || '');
          setCompanyEmail(parsed.companyEmail || '');
        } catch {}
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (companyPreset === 'custom') {
      localStorage.setItem(
        COMPANY_STORAGE_KEY,
        JSON.stringify({ companyName, companyPhone, companyEmail })
      );
    }
  }, [companyName, companyPhone, companyEmail, companyPreset, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setPreparedBy(user?.name || '');
  }, [user?.name, isOpen]);

  const handlePresetChange = (preset: 'doctor_electric' | 'custom') => {
    setCompanyPreset(preset);
    localStorage.setItem('solarcrm_company_preset', preset);
    if (preset === 'doctor_electric') {
      setCompanyName('Doctor Electric');
      setCompanyPhone('+91 832 911 4497');
      setCompanyEmail('yt.doctorelectric@gmail.com');
    } else {
      const stored = localStorage.getItem(COMPANY_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setCompanyName(parsed.companyName || '');
          setCompanyPhone(parsed.companyPhone || '');
          setCompanyEmail(parsed.companyEmail || '');
          return;
        } catch {}
      }
      setCompanyName('');
      setCompanyPhone('');
      setCompanyEmail('');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const size = Number(systemSizeKw) || 0;
    if (size > 0 && !estimatedMonthlyGeneration) {
      // Client-friendly default estimate: high-performing Indian conditions
      setEstimatedMonthlyGeneration(String(Math.round(size * 135)));
    }
  }, [systemSizeKw, estimatedMonthlyGeneration, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const monthly = Number(estimatedMonthlyGeneration) || 0;
    if (monthly > 0) {
      // Calculated at Rs 8 per unit
      setEstimatedAnnualSavings(String(Math.round(monthly * 12 * 8)));
    } else {
      setEstimatedAnnualSavings('');
    }
  }, [estimatedMonthlyGeneration, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (subsidyEligible && systemSizeKw) {
      const kw = Number(systemSizeKw) || 0;
      if (kw > 0) {
        // UP Solar Subsidy Scheme Rules
        // Central subsidy: ₹30,000/kW for systems <= 2 kW; for systems > 2 kW: ₹60,000 + (kW - 2) * ₹18,000 (capped at ₹78,000).
        let central = 0;
        if (kw <= 2) {
          central = kw * 30000;
        } else {
          central = Math.min(78000, 60000 + (kw - 2) * 18000);
        }
        // State subsidy (UP): ₹15,000/kW capped at ₹30,000.
        const state = Math.min(30000, kw * 15000);
        const total = central + state;
        setSubsidyAmount(String(total));
      } else {
        setSubsidyAmount('');
      }
    } else if (!subsidyEligible) {
      setSubsidyAmount('');
    }
  }, [subsidyEligible, systemSizeKw, isOpen]);

  const computed = useMemo(() => {
    const systemCost = Number(systemCostBeforeSubsidy) || 0;
    const gst = Number(gstPercent) || 0;
    const subsidyDeduction = subsidyEligible ? Number(subsidyAmount) || 0 : 0;
    const annualSavings = Number(estimatedAnnualSavings) || 0;
    const gstAmount = (systemCost * gst) / 100;
    const systemCostAfterSubsidy = Math.max(0, systemCost - subsidyDeduction);
    const finalCost = systemCost + gstAmount - subsidyDeduction;
    const payback = annualSavings > 0 ? finalCost / annualSavings : 0;
    const roi = finalCost > 0 ? (annualSavings / finalCost) * 100 : 0;

    return {
      gstAmount,
      subsidyDeduction,
      systemCostAfterSubsidy,
      finalCost,
      paybackPeriodYears: Number.isFinite(payback) ? Number(payback.toFixed(1)) : 0,
      roiPercent: Number.isFinite(roi) ? Number(roi.toFixed(1)) : 0,
    };
  }, [systemCostBeforeSubsidy, gstPercent, subsidyEligible, subsidyAmount, estimatedAnnualSavings]);

  const proposalData = useMemo<ProposalData>(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      clientName: clientData.Name,
      clientPhone: clientData.Phone,
      clientAddress: clientData.Address,
      roofType: clientData['Roof Type'] || 'RCC Roof',
      systemSizeKw: Number(systemSizeKw) || 0,
      panelCount: Number(panelCount) || 0,
      panelWattage: Number(panelWattage) || 0,
      inverterType,
      inverterBrand,
      mountingStructure,
      batteryBackup,
      batteryCapacityKwh: batteryBackup ? Number(batteryCapacityKwh) || undefined : undefined,
      subsidyEligible,
      pmSuryaGharSubsidyAmount: subsidyEligible ? Number(subsidyAmount) || undefined : undefined,
      systemCostBeforeSubsidy: Number(systemCostBeforeSubsidy) || 0,
      subsidyDeduction: computed.subsidyDeduction,
      finalCostToCustomer: computed.finalCost,
      gstPercent: Number(gstPercent) || 0,
      gstAmount: computed.gstAmount,
      estimatedMonthlyGeneration: Number(estimatedMonthlyGeneration) || 0,
      estimatedAnnualSavings: Number(estimatedAnnualSavings) || 0,
      paybackPeriodYears: computed.paybackPeriodYears,
      roiPercent: computed.roiPercent,
      validityDays: Number(validityDays) || 30,
      proposalDate: today,
      preparedBy,
      companyName,
      companyPhone,
      companyEmail,
      warrantyYearsPanel: Number(warrantyYearsPanel) || 25,
      warrantyYearsInverter: Number(warrantyYearsInverter) || 5,
      notes: notes || undefined,
      customTerms: customTerms || undefined,
      useDoctorElectricLogo: companyPreset === 'doctor_electric',
    };
  }, [
    clientData,
    systemSizeKw,
    panelCount,
    panelWattage,
    inverterType,
    inverterBrand,
    mountingStructure,
    batteryBackup,
    batteryCapacityKwh,
    subsidyEligible,
    subsidyAmount,
    systemCostBeforeSubsidy,
    computed.subsidyDeduction,
    computed.finalCost,
    gstPercent,
    computed.gstAmount,
    estimatedMonthlyGeneration,
    estimatedAnnualSavings,
    computed.paybackPeriodYears,
    computed.roiPercent,
    validityDays,
    preparedBy,
    companyName,
    companyPhone,
    companyEmail,
    warrantyYearsPanel,
    warrantyYearsInverter,
    customTerms,
    notes,
    companyPreset,
  ]);

  const validateRequired = () => {
    if (!proposalData.systemSizeKw || !proposalData.panelCount || !proposalData.systemCostBeforeSubsidy || !proposalData.estimatedAnnualSavings) {
      setShowErrors(true);
      toast.error('Please fill required fields: system size, panel count, system cost, and annual savings');
      return false;
    }
    setShowErrors(false);
    return true;
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const blob = await generateProposalPdf(proposalData);
      const url = URL.createObjectURL(blob);
      const safeName = proposalData.clientName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `Proposal_${safeName}_${proposalData.proposalDate}.pdf`;
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Proposal downloaded');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to generate proposal PDF');
    } finally {
      setDownloading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const blob = await generateProposalPdf(proposalData);
      const file = new File([blob], `proposal_${clientId}_${Date.now()}.pdf`, { type: 'application/pdf' });
      const publicUrl = await uploadFileToStorage(file, 'proposals');
      onSaved(publicUrl);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save proposal to client record');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Solar Proposal Generator" className="max-w-4xl max-h-[90vh] overflow-y-auto">
      {view === 'form' ? (
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">System specs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="System Size (kW)"
                type="number"
                value={systemSizeKw}
                onChange={(e) => {
                  setSystemSizeKw(e.target.value);
                  if (e.target.value) setShowErrors(false);
                }}
                error={showErrors && !systemSizeKw ? 'Required' : undefined}
              />
              <Input
                label="Panel count"
                type="number"
                value={panelCount}
                onChange={(e) => {
                  setPanelCount(e.target.value);
                  if (e.target.value) setShowErrors(false);
                }}
                error={showErrors && !panelCount ? 'Required' : undefined}
              />
              <Input label="Panel wattage (W)" type="number" value={panelWattage} onChange={(e) => setPanelWattage(e.target.value)} />
              <Select
                label="Inverter type"
                value={inverterType}
                onChange={(e) => setInverterType(e.target.value)}
                options={[{ label: 'String', value: 'String' }, { label: 'Micro', value: 'Micro' }, { label: 'Hybrid', value: 'Hybrid' }]}
              />
              <Input label="Inverter brand" value={inverterBrand} onChange={(e) => setInverterBrand(e.target.value)} />
              <Select
                label="Mounting structure"
                value={mountingStructure}
                onChange={(e) => setMountingStructure(e.target.value)}
                options={[
                  { label: 'RCC Roof', value: 'RCC Roof' },
                  { label: 'Metal Sheet', value: 'Metal Sheet' },
                  { label: 'Ground Mount', value: 'Ground Mount' },
                  { label: 'Tin Shade', value: 'Tin Shade' },
                ]}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={batteryBackup} onChange={(e) => setBatteryBackup(e.target.checked)} />
              Battery backup
            </label>
            {batteryBackup && (
              <Input
                label="Battery capacity (kWh)"
                type="number"
                value={batteryCapacityKwh}
                onChange={(e) => setBatteryCapacityKwh(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Financial</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="System cost before subsidy (Rs)"
                type="number"
                value={systemCostBeforeSubsidy}
                onChange={(e) => {
                  setSystemCostBeforeSubsidy(e.target.value);
                  if (e.target.value) setShowErrors(false);
                }}
                error={showErrors && !systemCostBeforeSubsidy ? 'Required' : undefined}
              />
              <Select
                label="GST %"
                value={gstPercent}
                onChange={(e) => setGstPercent(e.target.value)}
                options={[{ label: '5%', value: '5' }, { label: '18%', value: '18' }]}
              />
              <Input
                label="System cost after subsidy (Rs)"
                type="number"
                value={computed.systemCostAfterSubsidy || ''}
                disabled
                placeholder="Automatically calculated"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={subsidyEligible} onChange={(e) => setSubsidyEligible(e.target.checked)} />
              Subsidy eligible
            </label>
            {subsidyEligible && (
              <Input
                label="PM Surya Ghar subsidy amount (Rs)"
                type="number"
                value={subsidyAmount}
                onChange={(e) => setSubsidyAmount(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Savings estimate</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Input
                  label="Estimated monthly generation (kWh)"
                  type="number"
                  value={estimatedMonthlyGeneration}
                  onChange={(e) => setEstimatedMonthlyGeneration(e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-1">Tip: use 120-140 kWh per kW per month for strong-performing sites in India</p>
              </div>
              <Input
                label="Estimated annual electricity savings (Rs)"
                type="number"
                value={estimatedAnnualSavings}
                onChange={(e) => {
                  setEstimatedAnnualSavings(e.target.value);
                  if (e.target.value) setShowErrors(false);
                }}
                error={showErrors && !estimatedAnnualSavings ? 'Required' : undefined}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Proposal details</h3>
            
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Quotation Template Preset</label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="companyPreset"
                    checked={companyPreset === 'doctor_electric'}
                    onChange={() => handlePresetChange('doctor_electric')}
                    className="text-solar focus:ring-solar h-4 w-4"
                  />
                  Doctor Electric (with Logo)
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="companyPreset"
                    checked={companyPreset === 'custom'}
                    onChange={() => handlePresetChange('custom')}
                    className="text-solar focus:ring-solar h-4 w-4"
                  />
                  Custom Details (No Logo)
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Prepared by" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} />
              <Input label="Validity (days)" type="number" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} />
              <Input label="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={companyPreset === 'doctor_electric'} />
              <Input label="Company phone" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} disabled={companyPreset === 'doctor_electric'} />
              <Input label="Company email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} disabled={companyPreset === 'doctor_electric'} />
              <Input label="Panel warranty (years)" type="number" value={warrantyYearsPanel} onChange={(e) => setWarrantyYearsPanel(e.target.value)} />
              <Input label="Inverter warranty (years)" type="number" value={warrantyYearsInverter} onChange={(e) => setWarrantyYearsInverter(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-solar min-h-[90px]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Standard Terms &amp; Conditions</label>
              <textarea
                value={customTerms}
                onChange={(e) => setCustomTerms(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-solar min-h-[90px]"
              />
            </div>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Live Summary</h4>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Auto-calculated
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-600">Basic Price</span>
                <span className="font-semibold text-slate-800">{formatInr(Number(systemCostBeforeSubsidy) || 0)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-600">GST ({gstPercent}%)</span>
                <span className="font-semibold text-slate-800">{formatInr(computed.gstAmount)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-600">Subsidy Deduction</span>
                <span className="font-semibold text-rose-600">-{formatInr(computed.subsidyDeduction)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-600 font-medium">Final Cost</span>
                <span className="font-bold text-emerald-700">{formatInr(computed.finalCost)}</span>
              </div>
              <div className="flex justify-between pb-1 sm:pb-0">
                <span className="text-slate-600">Payback Period</span>
                <span className="font-semibold text-slate-800">{computed.paybackPeriodYears.toFixed(1)} years</span>
              </div>
              <div className="flex justify-between pb-1 sm:pb-0">
                <span className="text-slate-600">ROI</span>
                <span className="font-semibold text-emerald-700">{computed.roiPercent.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => {
                if (!validateRequired()) return;
                setView('preview');
              }}
            >
              Preview &amp; Generate
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="text-base font-semibold text-slate-800">Proposal Preview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="text-slate-500">Client</div><div className="text-slate-800 font-medium">{proposalData.clientName}</div>
              <div className="text-slate-500">System Size</div><div className="text-slate-800 font-medium">{proposalData.systemSizeKw} kW</div>
              <div className="text-slate-500">Panels</div><div className="text-slate-800 font-medium">{proposalData.panelCount} x {proposalData.panelWattage} W</div>
              <div className="text-slate-500">Inverter</div><div className="text-slate-800 font-medium">{formatInverterType(proposalData.inverterType)} ({proposalData.inverterBrand || 'N/A'})</div>
              <div className="text-slate-500">Final Cost</div><div className="text-slate-800 font-medium">{formatInr(proposalData.finalCostToCustomer)}</div>
              <div className="text-slate-500">Annual Savings</div><div className="text-slate-800 font-medium">{formatInr(proposalData.estimatedAnnualSavings)}</div>
              <div className="text-slate-500">Payback</div><div className="text-slate-800 font-medium">{proposalData.paybackPeriodYears.toFixed(1)} years</div>
              <div className="text-slate-500">ROI</div><div className="text-slate-800 font-medium">{proposalData.roiPercent.toFixed(1)}%</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setView('form')}
            className="text-sm text-blue-700 hover:text-blue-900 underline"
          >
            Back
          </button>

          <div className="flex flex-wrap gap-3 justify-end">
            <Button onClick={handleDownload} isLoading={downloading} disabled={saving || downloading}>
              Download PDF
            </Button>
            <Button variant="outline" onClick={handleSave} isLoading={saving} disabled={saving || downloading}>
              Save to Client Record
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
