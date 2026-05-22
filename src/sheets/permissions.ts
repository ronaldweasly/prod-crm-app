/**
 * Role-Based Access Control (RBAC) System
 * Enforces permissions and authorization across the app
 */

import { Role } from './types';

export interface Permission {
  resource: string;
  action: string;
  roles: Role[];
}

export interface RouteAccess {
  path: string;
  allowedRoles: Role[];
  requireAdmin?: boolean;
}

// Define all permissions in the system
const PERMISSIONS: Permission[] = [
  // Dashboard
  { resource: 'dashboard', action: 'view', roles: ['Admin', 'Manager', 'Sales Team', 'Engineer', 'Accountant'] },

  // Clients
  { resource: 'clients', action: 'view', roles: ['Admin', 'Manager', 'Sales Team', 'Engineer', 'Accountant'] },
  { resource: 'clients', action: 'create', roles: ['Admin', 'Manager', 'Sales Team'] },
  { resource: 'clients', action: 'edit', roles: ['Admin', 'Manager', 'Sales Team'] },
  { resource: 'clients', action: 'delete', roles: ['Admin'] },

  // Surveys
  { resource: 'surveys', action: 'view', roles: ['Admin', 'Manager', 'Sales Team', 'Engineer', 'Accountant'] },
  { resource: 'surveys', action: 'create', roles: ['Admin', 'Engineer'] },
  { resource: 'surveys', action: 'edit', roles: ['Admin', 'Engineer'] },
  { resource: 'surveys', action: 'delete', roles: ['Admin'] },

  // Quotations
  { resource: 'quotations', action: 'view', roles: ['Admin', 'Manager', 'Sales Team', 'Engineer', 'Accountant'] },
  { resource: 'quotations', action: 'create', roles: ['Admin', 'Engineer'] },
  { resource: 'quotations', action: 'edit', roles: ['Admin'] },
  { resource: 'quotations', action: 'approve', roles: ['Admin', 'Accountant'] },
  { resource: 'quotations', action: 'delete', roles: ['Admin'] },

  // Installations
  { resource: 'installations', action: 'view', roles: ['Admin', 'Manager', 'Sales Team', 'Engineer', 'Accountant'] },
  { resource: 'installations', action: 'create', roles: ['Admin', 'Engineer'] },
  { resource: 'installations', action: 'edit', roles: ['Admin', 'Engineer'] },
  { resource: 'installations', action: 'delete', roles: ['Admin'] },

  // Payments
  { resource: 'payments', action: 'view', roles: ['Admin', 'Manager', 'Sales Team', 'Accountant'] },
  { resource: 'payments', action: 'edit', roles: ['Admin', 'Accountant'] },
  { resource: 'payments', action: 'approve', roles: ['Admin'] },
  { resource: 'payments', action: 'delete', roles: ['Admin'] },

  // Subsidies
  { resource: 'subsidies', action: 'view', roles: ['Admin', 'Manager', 'Sales Team', 'Engineer', 'Accountant'] },
  { resource: 'subsidies', action: 'track', roles: ['Admin', 'Accountant'] },

  // Reports
  { resource: 'reports', action: 'view', roles: ['Admin', 'Manager', 'Accountant'] },
  { resource: 'reports', action: 'export', roles: ['Admin', 'Manager', 'Accountant'] },

  // Users Management
  { resource: 'users', action: 'view', roles: ['Admin'] },
  { resource: 'users', action: 'create', roles: ['Admin'] },
  { resource: 'users', action: 'edit', roles: ['Admin'] },
  { resource: 'users', action: 'delete', roles: ['Admin'] },

  // Backups & Settings
  { resource: 'backups', action: 'view', roles: ['Admin'] },
  { resource: 'backups', action: 'create', roles: ['Admin'] },
  { resource: 'backups', action: 'export', roles: ['Admin'] },
  { resource: 'backups', action: 'delete', roles: ['Admin'] },

  { resource: 'activity_logs', action: 'view', roles: ['Admin', 'Manager'] },
  { resource: 'activity_logs', action: 'export', roles: ['Admin', 'Manager'] },
];

// Define route access
export const ROUTE_ACCESS: RouteAccess[] = [
  { path: '/dashboard', allowedRoles: ['Admin', 'Manager', 'Sales Team', 'Engineer', 'Accountant'] },
  { path: '/clients', allowedRoles: ['Admin', 'Manager', 'Sales Team', 'Engineer', 'Accountant'] },
  { path: '/clients/:id', allowedRoles: ['Admin', 'Manager', 'Sales Team', 'Engineer', 'Accountant'] },
  { path: '/reports', allowedRoles: ['Admin', 'Manager', 'Accountant'] },
  { path: '/users', allowedRoles: ['Admin'], requireAdmin: true },
];

/**
 * Check if a role has permission for an action
 */
export function hasPermission(
  userRole: Role | undefined,
  resource: string,
  action: string
): boolean {
  if (!userRole) {
    return false;
  }

  const permission = PERMISSIONS.find(p => p.resource === resource && p.action === action);

  if (!permission) {
    // If no permission rule exists, deny by default
    return false;
  }

  return permission.roles.includes(userRole);
}

/**
 * Check if user can access a route
 */
export function canAccessRoute(userRole: Role | undefined, path: string): boolean {
  if (!userRole) {
    return false;
  }

  const route = ROUTE_ACCESS.find(r => r.path === path);

  if (!route) {
    // Unknown route - check if it's a protected path
    return !path.startsWith('/admin');
  }

  return route.allowedRoles.includes(userRole);
}

/**
 * Get all accessible permissions for a role
 */
export function getRolePermissions(role: Role): Permission[] {
  return PERMISSIONS.filter(p => p.roles.includes(role));
}

/**
 * Get all resources accessible by a role
 */
export function getAccessibleResources(role: Role): string[] {
  const resources = new Set<string>();
  PERMISSIONS.filter(p => p.roles.includes(role)).forEach(p => {
    resources.add(p.resource);
  });
  return Array.from(resources);
}

/**
 * Check if role is admin or has admin privileges
 */
export function isAdminRole(role: Role | undefined): boolean {
  return role === 'Admin';
}

/**
 * Check if role is approver (can approve quotations, payments, etc)
 */
export function isApproverRole(role: Role | undefined): boolean {
  return role === 'Admin' || role === 'Accountant';
}

/**
 * Check if role can view financial data
 */
export function canViewFinancials(role: Role | undefined): boolean {
  return role === 'Admin' || role === 'Accountant';
}

/**
 * Check if role can create clients
 */
export function canCreateClients(role: Role | undefined): boolean {
  return role === 'Admin' || role === 'Sales Team';
}

/**
 * Check if role can create surveys
 */
export function canCreateSurveys(role: Role | undefined): boolean {
  return role === 'Admin' || role === 'Engineer';
}

/**
 * Check if role can manage installations
 */
export function canManageInstallations(role: Role | undefined): boolean {
  return role === 'Admin' || role === 'Engineer';
}

/**
 * Check if role can export data
 */
export function canExportData(role: Role | undefined): boolean {
  return role === 'Admin' || role === 'Accountant';
}

/**
 * Enforce permission - throw error if not allowed
 */
export function enforcePermission(
  userRole: Role | undefined,
  resource: string,
  action: string
) {
  if (!hasPermission(userRole, resource, action)) {
    throw new Error(
      `Access denied: ${userRole} cannot ${action} ${resource}`
    );
  }
}

/**
 * Get role description
 */
export function getRoleDescription(role: Role): string {
  const descriptions: Record<Role, string> = {
    Admin: 'Full system access, user management, backups',
    'Sales Team': 'Manage clients, quotations, and sales pipeline',
    Engineer: 'Create surveys, quotations, manage installations',
    Accountant: 'View payments, subsidies, generate reports',
    Manager: 'Oversee all CRM data, pipeline, and assignments',
  };
  return descriptions[role];
}

/**
 * Get role badge color
 */
export function getRoleBadgeColor(role: Role): string {
  const colors: Record<Role, string> = {
    Admin: 'bg-red-100 text-red-800',
    'Sales Team': 'bg-blue-100 text-blue-800',
    Engineer: 'bg-green-100 text-green-800',
    Accountant: 'bg-purple-100 text-purple-800',
    Manager: 'bg-indigo-100 text-indigo-800',
  };
  return colors[role];
}

/**
 * Validate route access and return error message if denied
 */
export function validateRouteAccess(
  userRole: Role | undefined,
  path: string
): { allowed: boolean; message?: string } {
  if (!userRole) {
    return { allowed: false, message: 'Not authenticated' };
  }

  if (!canAccessRoute(userRole, path)) {
    return {
      allowed: false,
      message: `Your role (${userRole}) does not have access to this page`,
    };
  }

  return { allowed: true };
}
