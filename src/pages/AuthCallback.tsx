import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentSession } from '../sheets/localAuth';
import { Sun } from 'lucide-react';

/**
 * AuthCallback — mounted at /auth/callback
 *
 * Handles auth redirects and session initialization.
 * this component simply verifies the session is valid and redirects.
 * It's kept as a safety net for any legacy redirect-based auth flows.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const session = await getCurrentSession();
        if (!mounted) return;

        if (session?.user) {
          setTimeout(() => navigate('/dashboard', { replace: true }), 300);
        } else {
          setStatus('error');
          setErrorMsg('No valid session found. Please sign in again.');
        }
      } catch {
        if (!mounted) return;
        setStatus('error');
        setErrorMsg('Session validation failed. Please sign in again.');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-6">
      {status === 'processing' ? (
        <>
          {/* Animated solar logo spinner */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" />
            <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 shadow-md">
              <Sun className="w-8 h-8 text-amber-500 animate-spin" style={{ animationDuration: '3s' }} />
            </div>
          </div>

          <div className="text-center">
            <p className="text-slate-700 font-semibold text-base">Verifying session…</p>
            <p className="text-slate-400 text-sm mt-1">Please wait.</p>
          </div>
        </>
      ) : (
        <div className="text-center space-y-4 max-w-sm">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mx-auto">
            <span className="text-2xl">⚠️</span>
          </div>
          <p className="text-slate-800 font-semibold">{errorMsg}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="text-sm text-blue-700 underline hover:text-blue-900"
          >
            Back to login
          </button>
        </div>
      )}
    </div>
  );
}