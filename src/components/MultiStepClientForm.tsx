import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { v4 as uuidv4 } from 'uuid';
import { appendRow } from '../sheets/api';
import { SHEET_NAMES } from '../sheets/config';

interface MultiStepClientFormProps {
  salesUsers: { label: string; value: string }[];
  user?: { email?: string };
  onSuccess?: () => void;
}

interface LeadFormData {
  Name: string;
  Phone: string;
  Address: string;
  RoofType: string;
  BatteryType: string;
  SystemSize: string;
  AssignedTo: string;
}

export function MultiStepClientForm({ salesUsers, user, onSuccess }: MultiStepClientFormProps) {
  const [pendingClientId] = useState(() => uuidv4().slice(0, 8).toUpperCase());
  const [submitting, setSubmitting] = useState(false);

  const { register, getValues } = useForm<LeadFormData>({
    defaultValues: {
      Name: '',
      Phone: '',
      Address: '',
      RoofType: '',
      BatteryType: '',
      SystemSize: '',
      AssignedTo: '',
    }
  });

  const onSubmit = async () => {
    if (submitting) return;

    const data = getValues();

    // Validate required fields
    if (!data.Name?.trim()) { toast.error('Name is required'); return; }
    if (!data.Phone?.trim()) { toast.error('Phone number is required'); return; }
    if (!data.Address?.trim()) { toast.error('Address is required'); return; }
    if (!data.RoofType) { toast.error('Roof type is required'); return; }
    if (!data.SystemSize) { toast.error('System size is required'); return; }

    setSubmitting(true);
    try {
      const clientRow = [
        pendingClientId,
        data.Name.trim(),
        data.Phone.trim(),
        data.Address.trim(),
        data.RoofType,
        data.BatteryType || '',
        data.SystemSize,
        new Date().toLocaleDateString('en-GB'),
        data.AssignedTo || user?.email || '',
      ];

      await appendRow(SHEET_NAMES.CLIENTS, clientRow);

      toast.success('✓ Lead created! Add documents & details from the client panel.');
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create lead');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">New Lead</h3>
            <p className="text-xs text-slate-500">Add basic info — documents & details can be added later</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-5 py-5 pb-28 sm:pb-6 space-y-4">
        <Input
          label="Full Name *"
          placeholder="e.g. Rajesh Kumar"
          {...register('Name')}
        />

        <Input
          label="Phone Number *"
          placeholder="e.g. 98765 43210"
          type="tel"
          {...register('Phone')}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Address *</label>
          <textarea
            placeholder="Full address with city, district..."
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[80px] resize-none"
            {...register('Address')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Roof Type *"
            {...register('RoofType')}
            options={[
              { label: 'Select...', value: '' },
              { label: 'Flat', value: 'Flat' },
              { label: 'Sloped', value: 'Sloped' },
              { label: 'Mixed', value: 'Mixed' },
            ]}
          />
          <Select
            label="System Size *"
            {...register('SystemSize')}
            options={[
              { label: 'Select...', value: '' },
              { label: '3 kW', value: '3' },
              { label: '5 kW', value: '5' },
              { label: '8 kW', value: '8' },
              { label: '10 kW', value: '10' },
              { label: '15 kW', value: '15' },
              { label: '20 kW', value: '20' },
            ]}
          />
        </div>

        <Select
          label="Battery Type"
          {...register('BatteryType')}
          options={[
            { label: 'Not decided', value: '' },
            { label: 'On-Grid', value: 'On-Grid' },
            { label: 'Off-Grid', value: 'Off-Grid' },
            { label: 'Hybrid', value: 'Hybrid' },
          ]}
        />

        <Select
          label="Assign To"
          {...register('AssignedTo')}
          options={[{ label: 'Unassigned', value: '' }, ...salesUsers]}
        />

        {/* Tip */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 flex gap-2">
          <span className="text-base leading-none">💡</span>
          <span>Documents, survey details, quotation, and payment info can be added from the <strong>client detail page</strong> after creating this lead.</span>
        </div>
      </div>

      {/* Submit button — sticky bottom */}
      <div
        className="border-t border-slate-100 px-5 py-4 bg-white"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <Button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="w-full"
        >
          {submitting ? '⏳ Creating...' : '✓ Create Lead'}
        </Button>
      </div>
    </div>
  );
}
