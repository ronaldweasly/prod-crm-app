/**
 * useFormValidation Hook
 * Reduces form handling boilerplate across components
 * Handles validation, error display, loading, and submission
 */

import { useState, useCallback } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';

export interface UseFormValidationOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  showSuccessToast?: boolean;
  successMessage?: string;
  clearOnSuccess?: boolean;
}

export interface UseFormValidationReturn<T> {
  formData: Partial<T>;
  errors: Record<string, string>;
  isLoading: boolean;
  isDirty: boolean;
  
  setValue: (field: keyof T, value: any) => void;
  setMultipleValues: (values: Partial<T>) => void;
  resetForm: () => void;
  clearError: (field: keyof T) => void;
  
  handleSubmit: (onSubmit: (data: T) => Promise<void>) => (e: React.FormEvent) => Promise<void>;
}

/**
 * Hook for handling form validation and submission
 * 
 * @example
 * const form = useFormValidation<CreateClientForm>(
 *   createClientSchema,
 *   { successMessage: 'Client created!' }
 * );
 * 
 * return (
 *   <form onSubmit={form.handleSubmit(saveClient)}>
 *     <Input
 *       value={form.formData.name}
 *       onChange={e => form.setValue('name', e.target.value)}
 *       error={form.errors.name}
 *     />
 *     <Button disabled={form.isLoading}>
 *       {form.isLoading ? 'Saving...' : 'Save'}
 *     </Button>
 *   </form>
 * );
 */
export function useFormValidation<T extends Record<string, any>>(
  schema: z.ZodSchema,
  options: UseFormValidationOptions<T> = {}
): UseFormValidationReturn<T> {
  const {
    onSuccess,
    onError,
    showSuccessToast = true,
    successMessage = 'Saved successfully',
    clearOnSuccess = true,
  } = options;

  const [formData, setFormData] = useState<Partial<T>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const setValue = useCallback((field: keyof T, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    
    // Clear error for this field when user starts typing
    if (errors[field as string]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined,
      }));
    }
  }, [errors]);

  const setMultipleValues = useCallback((values: Partial<T>) => {
    setFormData(prev => ({ ...prev, ...values }));
    setIsDirty(true);
  }, []);

  const resetForm = useCallback(() => {
    setFormData({});
    setErrors({});
    setIsDirty(false);
  }, []);

  const clearError = useCallback((field: keyof T) => {
    setErrors(prev => ({
      ...prev,
      [field]: undefined,
    }));
  }, []);

  const handleSubmit = useCallback(
    (onSubmit: (data: T) => Promise<void>) =>
      async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrors({});

        try {
          // Validate form data
          const validated = await schema.parseAsync(formData);

          // Call the submit handler
          await onSubmit(validated as T);

          // Success handling
          if (showSuccessToast) {
            toast.success(successMessage);
          }
          if (clearOnSuccess) {
            resetForm();
          }
          onSuccess?.(validated as T);
        } catch (err) {
          // Handle validation errors
          if (err instanceof z.ZodError) {
            const fieldErrors: Record<string, string> = {};
            err.issues.forEach(error => {
              const path = error.path.join('.');
              fieldErrors[path] = error.message;
            });
            setErrors(fieldErrors);
            
            // Show first error as toast
            const firstError = Object.values(fieldErrors)[0];
            if (firstError) {
              toast.error(firstError);
            }
          } else if (err instanceof Error) {
            toast.error(err.message);
            onError?.(err);
          } else {
            console.error('Form submission error:', err);
            toast.error('An unexpected error occurred');
          }
        } finally {
          setIsLoading(false);
        }
      },
    [schema, formData, showSuccessToast, successMessage, clearOnSuccess, resetForm, onSuccess, onError]
  );

  return {
    formData,
    errors,
    isLoading,
    isDirty,
    setValue,
    setMultipleValues,
    resetForm,
    clearError,
    handleSubmit,
  };
}
