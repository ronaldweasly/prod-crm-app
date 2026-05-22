import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../utils/cn';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  label?: string;
  options: { label: string; value: string; disabled?: boolean }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, label, options, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={cn(
              'w-full px-4 py-3 text-base rounded-lg border-2 border-slate-200 bg-white appearance-none cursor-pointer',
              'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
              'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed',
              'transition-colors',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
              className
            )}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
        </div>
        {error && (
          <p className="mt-2 text-sm font-medium text-red-600 flex items-center gap-1">
            <span>⚠</span> {error}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';
