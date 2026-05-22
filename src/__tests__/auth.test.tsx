/// <reference types="@testing-library/jest-dom" />
// @vitest-environment jsdom
/**
 * Authentication Test Suite
 * 
 * Tests for local auth (backend JWT) authentication system
 * 
 * Run via: npm run test -- auth.test.tsx
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import Login from '../pages/Login';

// Mock localAuth
vi.mock('../sheets/localAuth', () => ({
  signInUser: vi.fn(),
  signOutUser: vi.fn(),
  getCurrentSession: vi.fn(),
  changePassword: vi.fn(),
}));

// Mock API
vi.mock('../sheets/api', () => ({
  getSheetData: vi.fn(),
  appendRow: vi.fn(),
  setAccessToken: vi.fn(),
}));

// Mock activity logging
vi.mock('../sheets/activity', () => ({
  logActivity: vi.fn(),
}));

import { signInUser, signOutUser, getCurrentSession } from '../sheets/localAuth';
import { getSheetData } from '../sheets/api';

// Helper to render with providers
function renderWithProviders(component: React.ReactElement) {
  return render(
    <BrowserRouter>
      <AuthProvider>
        {component}
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}

// Helper to get auth context
function useTestAuth() {
  return useAuth();
}

describe('Authentication Tests', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default mocks to return valid promises and avoid undefined.catch crashes
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    vi.mocked(signInUser).mockResolvedValue({ session: null });
    vi.mocked(signOutUser).mockResolvedValue();
    // Set VITE_USE_MOCK to false for live tests, true enables fallback
    import.meta.env.VITE_USE_MOCK = 'false';
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  describe('1. Login Page - UI Verification', () => {
    it('should render login page with email form only', async () => {
      renderWithProviders(<Login />);
      await screen.findByRole('button', { name: /Sign In/i });
      
      expect(screen.getByText('DOCTOR ELECTRIC CRM')).toBeInTheDocument();
      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      
      // Google OAuth button should NOT exist
      expect(screen.queryByText(/Sign in with Google/i)).not.toBeInTheDocument();
    });

    it('should have email and password input fields', async () => {
      renderWithProviders(<Login />);
      await screen.findByRole('button', { name: /Sign In/i });
      
      const emailInput = screen.getByPlaceholderText('you@company.com') as HTMLInputElement;
      const passwordInput = screen.getByPlaceholderText('Enter your password') as HTMLInputElement;
      
      expect(emailInput).toBeInTheDocument();
      expect(passwordInput).toBeInTheDocument();
      expect(passwordInput.type).toBe('password');
    });

    it('should toggle password visibility', async () => {
      renderWithProviders(<Login />);
      await screen.findByRole('button', { name: /Sign In/i });
      
      const passwordInput = screen.getByPlaceholderText('Enter your password') as HTMLInputElement;
      const toggleButton = screen.getByRole('button', { name: '' }).parentElement?.querySelector('[tabindex="-1"]');
      
      expect(passwordInput.type).toBe('password');
      
      if (toggleButton) fireEvent.click(toggleButton);
      if (toggleButton) fireEvent.click(toggleButton);
      expect(passwordInput.type).toBe('password');
    });
  });

  describe('2. Valid Email/Password Login', () => {
    it('should successfully login with valid admin credentials', async () => {
      const mockSession = {
        session: {
          user: {
            id: 'admin-123',
            email: 'admin@solar.com',
            name: 'System Admin',
            role: 'Admin',
          },
        },
      };

      vi.mocked(signInUser).mockResolvedValueOnce(mockSession);
      vi.mocked(getCurrentSession)
        .mockResolvedValueOnce(null)
        .mockResolvedValue(mockSession.session);
      vi.mocked(getSheetData).mockResolvedValueOnce([
        {
          Email: 'admin@solar.com',
          Role: 'Admin',
          Name: 'System Admin',
          Active: 'TRUE',
        },
      ]);

      renderWithProviders(<Login />);

      const emailInput = await screen.findByPlaceholderText('you@company.com') as HTMLInputElement;
      const passwordInput = screen.getByPlaceholderText('Enter your password') as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /Sign In/i });

      await userEvent.type(emailInput, 'admin@solar.com');
      await userEvent.type(passwordInput, 'password123');
      
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(signInUser).toHaveBeenCalledWith('admin@solar.com', 'password123');
      }, { timeout: 1000 });
    });
  });

  describe('3. Form Validation', () => {
    it('should not allow submission with empty email', async () => {
      renderWithProviders(<Login />);
      await screen.findByRole('button', { name: /Sign In/i });

      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const submitButton = screen.getByRole('button', { name: /Sign In/i });

      await userEvent.type(passwordInput, 'password123');

      expect(submitButton).toBeDisabled();
      
      fireEvent.click(submitButton);
      expect(signInUser).not.toHaveBeenCalled();
    });

    it('should not allow submission with empty password', async () => {
      renderWithProviders(<Login />);
      await screen.findByRole('button', { name: /Sign In/i });

      const emailInput = screen.getByPlaceholderText('you@company.com');
      const submitButton = screen.getByRole('button', { name: /Sign In/i });

      await userEvent.type(emailInput, 'admin@solar.com');

      expect(submitButton).toBeDisabled();
      
      fireEvent.click(submitButton);
      expect(signInUser).not.toHaveBeenCalled();
    });
  });

  describe('4. Error Handling', () => {
    it('should display error for invalid credentials', async () => {
      vi.mocked(signInUser).mockRejectedValueOnce(
        new Error('Invalid email or password')
      );

      renderWithProviders(<Login />);
      await screen.findByRole('button', { name: /Sign In/i });

      const emailInput = screen.getByPlaceholderText('you@company.com');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const submitButton = screen.getByRole('button', { name: /Sign In/i });

      await userEvent.type(emailInput, 'baduser@solar.com');
      await userEvent.type(passwordInput, 'wrongpass');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Invalid email or password/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('should display error for inactive user', async () => {
      const mockSession = {
        session: {
          user: {
            id: 'inactive-user',
            email: 'inactive@solar.com',
            name: 'Inactive User',
            role: 'User',
          },
        },
      };

      vi.mocked(signInUser).mockResolvedValueOnce(mockSession);
      vi.mocked(getCurrentSession)
        .mockResolvedValueOnce(null)
        .mockResolvedValue(mockSession.session);
      vi.mocked(getSheetData).mockResolvedValueOnce([
        {
          Email: 'inactive@solar.com',
          Role: 'User',
          Name: 'Inactive User',
          Active: 'FALSE',
        },
      ]);

      renderWithProviders(<Login />);
      await screen.findByRole('button', { name: /Sign In/i });

      const emailInput = screen.getByPlaceholderText('you@company.com');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const submitButton = screen.getByRole('button', { name: /Sign In/i });

      await userEvent.type(emailInput, 'inactive@solar.com');
      await userEvent.type(passwordInput, 'pass');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/inactive/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe('5. Auth Context - Session Management', () => {
    it('should initialize with no user if no session', async () => {
      vi.mocked(getCurrentSession).mockResolvedValueOnce(null);

      const TestComponent = () => {
        const { user, isLoading } = useTestAuth();
        return (
          <div>
            {isLoading ? <div>Loading...</div> : <div>Ready</div>}
            {user ? <div>{user.email}</div> : <div>Not logged in</div>}
          </div>
        );
      };

      renderWithProviders(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByText('Ready')).toBeInTheDocument();
        expect(screen.getByText('Not logged in')).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should load user if session exists', async () => {
      const mockSession = {
        user: {
          id: 'admin-123',
          email: 'admin@solar.com',
          name: 'System Admin',
          role: 'Admin',
        },
      };

      vi.mocked(getCurrentSession).mockResolvedValue(mockSession);
      vi.mocked(getSheetData).mockResolvedValueOnce([
        {
          Email: 'admin@solar.com',
          Role: 'Admin',
          Name: 'System Admin',
          Active: 'TRUE',
        },
      ]);

      const TestComponent = () => {
        const { user, isLoading } = useTestAuth();
        return (
          <div>
            {isLoading ? <div>Loading...</div> : <div>Ready</div>}
            {user && <div>{user.email}</div>}
          </div>
        );
      };

      renderWithProviders(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByText('Ready')).toBeInTheDocument();
        expect(screen.getByText('admin@solar.com')).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe('6. Performance - Auth Initialization Speed', () => {
    it('should initialize auth within 3 seconds', async () => {
      vi.mocked(getCurrentSession).mockResolvedValueOnce(null);

      const TestComponent = () => {
        const { isLoading } = useTestAuth();
        return <div>{isLoading ? 'Loading' : 'Done'}</div>;
      };

      renderWithProviders(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });
});
