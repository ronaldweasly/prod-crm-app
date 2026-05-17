// =============================================================================
// Auth Middleware - JWT Verification
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getTable } from '../db/localStore.js';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  name: string;
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('❌ FATAL: JWT_SECRET environment variable is not set');
    console.error('   Set JWT_SECRET in .env before starting the server');
    process.exit(1);
  }
  return secret;
})();

/**
 * Verify JWT token and attach user to request.
 * Rejects requests without a valid token.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  // Accept token from Authorization header OR from httpOnly auth_token cookie
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies?.auth_token) {
    token = req.cookies.auth_token;
  }

  if (!token) {
    res.status(401).json({ error: 'Missing or invalid authorization' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };

    // Verify user still exists and is active via local store
    const users = await getTable<any>('users');
    const user = users.find((u: any) => u.id === decoded.userId);

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    if (!user.active) {
      res.status(403).json({ error: 'Account is deactivated' });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Role-based access control middleware.
 * Use after authenticate middleware.
 */
export function authorize(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role,
      });
      return;
    }

    next();
  };
}
