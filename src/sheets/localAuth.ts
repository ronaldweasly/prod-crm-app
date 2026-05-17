/**
 * Local Authentication Service
 * Uses backend API auth (JWT + HTTP-only cookies)
 *
 * Backend endpoints (from infrastructure/backend AUTH_SETUP.md):
 *   POST /api/auth/login    — email + password → sets httpOnly cookie
 *   POST /api/auth/logout   — clears cookie
 *   GET  /api/auth/me       — returns current user from cookie
 *   POST /api/auth/change-password — change password
 */

const API_BASE = '/api';

export interface AuthSession {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

/**
 * Sign in with email and password via backend API
 */
export async function signInUser(email: string, password: string): Promise<{ session: AuthSession }> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Login failed: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    session: {
      user: data.user || data,
    },
  };
}

/**
 * Sign out — clears the httpOnly cookie on the backend
 */
export async function signOutUser(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch (err: any) {
    console.error('[LocalAuth] Logout error:', err.message);
  }
}

/**
 * Get current session by calling /me endpoint
 * Backend reads the httpOnly cookie and returns user data or null
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 401) return null;
      throw new Error(`Session check failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data || !data.email) return null;

    return {
      user: {
        id: data.id || data.email,
        email: data.email,
        name: data.name || data.email.split('@')[0],
        role: data.role || 'Sales Team',
      },
    };
  } catch (err: any) {
    // Network errors or backend not running — treat as no session
    return null;
  }
}

/**
 * Get current user from session
 */
export async function getCurrentUser(): Promise<AuthSession['user'] | null> {
  const session = await getCurrentSession();
  return session?.user || null;
}

/**
 * Change password for the logged-in user
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Failed to change password');
  }
}