import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  signInUser, 
  signOutUser, 
  getCurrentSession,
} from '../sheets/localAuth';
import { getSheetData, appendRow } from '../sheets/api';
import { UserRow, Role } from '../sheets/types';
import { SHEET_NAMES } from '../sheets/config';
import { logActivity } from '../sheets/activity';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  picture?: string;
  provider: 'email';
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
  // Add refresh token functionality
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isLoadingRoleRef = useRef(false);
  const initializedRef = useRef(false);
  const userCacheRef = useRef<Map<string, AuthUser>>(new Map());

  const loadUserRole = async (email: string): Promise<AuthUser | null> => {
    // Check cache first (super fast, <1ms)
    const cached = userCacheRef.current.get(email.toLowerCase());
    if (cached) {
      setUser(cached);
      setError(null);
      return cached;
    }
    
    // If already loading THIS user, wait and don't duplicate the effort
    if (isLoadingRoleRef.current) {
      let attempts = 0;
      while (isLoadingRoleRef.current && attempts < 30) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      const cached2 = userCacheRef.current.get(email.toLowerCase());
      if (cached2) return cached2;
      if (isLoadingRoleRef.current) return null;
    }
    
    isLoadingRoleRef.current = true;

    try {
      const session = await getCurrentSession();
      if (!session?.user) {
        throw new Error('No active session found');
      }

      let matchedUser: any = null;

      // Only fetch users table if running in mock mode or test environment
      const isMockOrTest = import.meta.env.VITE_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';
      if (isMockOrTest) {
        const users = await getSheetData<UserRow>(SHEET_NAMES.USERS).catch(err => {
          console.warn('[Auth] Could not fetch users table from DB:', err.message);
          return [];
        });
        matchedUser = users.find((u) => u.Email?.toLowerCase() === email.toLowerCase());
      }

      // If user is found in session but not in users table (or in live database mode),
      // we use the role and name from the backend session directly.
      if (!matchedUser) {
        const defaultRole: Role = (session.user.role as Role) || 'Sales Team';
        const defaultName = session.user.name || email.split('@')[0];
        
        // Try to insert user into users table in mock mode or test environment
        if (isMockOrTest) {
          try {
            await appendRow(SHEET_NAMES.USERS, [
              email,           // email
              defaultRole,     // role
              defaultName,     // name
              'TRUE',          // active
              '',              // password
            ]);
            console.log('[Auth] Auto-registered user in DB:', email.toLowerCase());
          } catch (insertErr: any) {
            console.warn('[Auth] Could not auto-register user (may already exist):', insertErr.message);
          }
        }

        matchedUser = {
          Email: email,
          Role: defaultRole,
          Name: defaultName,
          Active: 'TRUE',
        };
      }
      
      if (matchedUser.Active !== 'TRUE') {
        throw new Error('Your account is currently inactive. Please contact your administrator.');
      }

      const authUser: AuthUser = {
        id: session.user.id || email,
        email,
        name: matchedUser.Name || session.user.name || email.split('@')[0],
        role: matchedUser.Role,
        picture: undefined,
        provider: 'email',
      };

      // Cache the user
      userCacheRef.current.set(email.toLowerCase(), authUser);
      setUser(authUser);
      setError(null);
      
      // Persist to localStorage for session persistence across page refreshes
      localStorage.setItem('solar_crm_auth', JSON.stringify({
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
        role: authUser.role,
        picture: authUser.picture,
        provider: authUser.provider,
      }));
      
      return authUser;
    } catch (err: any) {
      console.error('[Auth] User role loading failed:', err.message);
      // Only sign out if the backend session itself is gone or the user is inactive.
      // Don't log out on rate-limit hits or transient network errors.
      const session = await getCurrentSession().catch(() => null);
      const isInactive = err.message?.includes('inactive');
      if (!session?.user || isInactive) {
        setError(err.message || 'Session expired');
        await signOutUser().catch(() => {});
        setUser(null);
      } else {
        console.warn('[Auth] Fetch error but session still valid — keeping user logged in');
        setError(null);
      }
      throw err;
    } finally {
      isLoadingRoleRef.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (initializedRef.current) return;
      initializedRef.current = true;

      try {
        // FIRST: Check localStorage for persisted session (survives page refresh)
        const savedAuth = localStorage.getItem('solar_crm_auth');
        if (savedAuth && mounted) {
          try {
            const cached = JSON.parse(savedAuth);
            
            // Verify session is still valid via /me endpoint
            const session = await getCurrentSession();
            
            if (session?.user && session.user.email.toLowerCase() === cached.email.toLowerCase()) {
              // Session is still valid, restore from cache/session
              const role = (session.user.role || cached.role) as Role;
              const authUser: AuthUser = {
                id: session.user.id || cached.id,
                email: session.user.email,
                name: session.user.name || cached.name,
                role,
                picture: cached.picture,
                provider: cached.provider,
              };
              userCacheRef.current.set(authUser.email.toLowerCase(), authUser);
              setUser(authUser);
              setError(null);
              if (mounted) setIsLoading(false);
              return;
            } else {
              // Session expired or user mismatch
              localStorage.removeItem('solar_crm_auth');
            }
          } catch (parseErr) {
            localStorage.removeItem('solar_crm_auth');
          }
        }
        
        // SECOND: Check for backend session via /me endpoint
        const session = await getCurrentSession();
        if (!mounted) return;

        if (session?.user?.email) {
          await loadUserRole(session.user.email);
        }
      } catch (err: any) {
        console.error('[Auth] Init error:', err.message);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    // Run session check
    init();

    // SAFETY NET: If nothing resolves within 3 seconds, stop loading
    const safetyTimer = setTimeout(() => {
      if (mounted && isLoading) {
        setIsLoading(false);
      }
    }, 3000);

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      if (!email || !password) throw new Error('Please enter both email and password');
      
      const { session } = await signInUser(email, password);
      
      if (!session?.user) {
        throw new Error('Login failed. No session returned.');
      }

      // Wait for user role to be loaded before continuing
      const userLoaded = await loadUserRole(session.user.email);
      if (!userLoaded) {
        throw new Error('Failed to load user profile');
      }

      // Save session to localStorage for persistence across page refreshes
      localStorage.setItem('solar_crm_auth', JSON.stringify({
        id: userLoaded.id,
        email: userLoaded.email,
        name: userLoaded.name,
        role: userLoaded.role,
        picture: userLoaded.picture,
        provider: userLoaded.provider,
      }));

      // User state is already set by loadUserRole
      setIsLoading(false);
    } catch (err: any) {
      const errorMessage = err.message || 'Login failed';
      console.error('Email login failed:', err);
      
      // FALLBACK: Try mock authentication for development
      if (import.meta.env.VITE_USE_MOCK === 'true') {
        try {
          const users = await getSheetData<UserRow>(SHEET_NAMES.USERS).catch(() => []);
          const matchedUser = users.find((u) => u.Email?.toLowerCase() === email.toLowerCase());
          
          if (matchedUser && matchedUser.Active === 'TRUE') {
            const authUser: AuthUser = {
              id: `mock_${email}`,
              email,
              name: matchedUser.Name || email.split('@')[0],
              role: matchedUser.Role,
              picture: undefined,
              provider: 'email',
            };
            
            // Cache and set user
            userCacheRef.current.set(email.toLowerCase(), authUser);
            setUser(authUser);
            setError(null);
            
            localStorage.setItem('solar_crm_auth', JSON.stringify({
              id: authUser.id,
              email: authUser.email,
              name: authUser.name,
              role: authUser.role,
              picture: authUser.picture,
              provider: authUser.provider,
            }));

            setIsLoading(false);
            return;
          } else if (!matchedUser) {
            throw new Error(`User "${email}" not found in system`);
          } else {
            throw new Error('Your account is inactive');
          }
        } catch (fallbackErr: any) {
          console.error('[Auth] Mock login also failed:', fallbackErr.message);
          setError(fallbackErr.message || 'Login failed');
        }
      } else {
        setError(errorMessage);
      }

      setIsLoading(false);
    }
  };

  const refreshSession = async () => {
    setIsLoading(true);
    try {
      const session = await getCurrentSession();
      if (session?.user?.email) {
        await loadUserRole(session.user.email);
      }
    } catch (err: any) {
      console.error('[Auth] Refresh session failed:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      if (user) {
        logActivity({
          userId: user.id,
          userEmail: user.email,
          action: 'VIEW',
          sheet: 'Auth',
          recordId: user.id,
          recordName: user.name,
          details: 'User logged out',
          status: 'success',
        });
      }
      await signOutUser();
      setUser(null);
      setError(null);
      localStorage.removeItem('solar_crm_auth');
      // Clear any cached data on logout
      userCacheRef.current.clear();
    } catch (err: any) {
      console.error('[Auth] Logout failed:', err.message);
      setError(err.message || 'Logout failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, error, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}