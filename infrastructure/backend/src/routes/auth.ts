import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getTable, insertRow, logActivity, mutateDb, updateById } from '../db/localStore.js';
import { authenticate } from '../middleware/auth.js';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-change-me-before-sharing';
const SESSION_EXPIRY = process.env.SESSION_EXPIRY || '7d';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1).max(255),
  role: z.enum(['Admin', 'Sales Team', 'Engineer', 'Accountant', 'Manager']).default('Sales Team'),
});

function publicUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    active: user.active,
  };
}

function setSessionCookie(res: Response, token: string) {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const users = await getTable<any>('users');
    const user = users.find((item) => item.email === email.toLowerCase());

    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.active) {
      res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
      return;
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: SESSION_EXPIRY as any,
    });
    setSessionCookie(res, token);

    await logActivity({
      user_email: user.email,
      action: 'LOGIN',
      entity_type: 'auth',
      details: { method: 'password' },
      ip_address: req.ip,
    });

    res.json({ token, user: publicUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.get('/me', authenticate, (req: Request, res: Response) => {
  res.json(req.user);
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('auth_token', { path: '/' });
  res.json({ message: 'Logged out successfully' });
});

authRouter.post('/register', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Only admins can create users' });
      return;
    }

    const { email, password, name, role } = registerSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase();
    const users = await getTable<any>('users');

    if (users.some((user) => user.email === normalizedEmail)) {
      res.status(409).json({ error: 'User with this email already exists' });
      return;
    }

    const user = await insertRow<any>('users', {
      email: normalizedEmail,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role,
      name,
      active: true,
    });

    await logActivity({
      user_email: req.user.email,
      action: 'CREATE',
      entity_type: 'user',
      entity_id: user.id,
      details: { created_email: normalizedEmail, role },
    });

    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.get('/users', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role !== 'Admin') {
    res.status(403).json({ error: 'Only admins can list users' });
    return;
  }

  const users = await getTable<any>('users');
  res.json(users.map(publicUser));
});

authRouter.patch('/users', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role !== 'Admin') {
    res.status(403).json({ error: 'Only admins can update users' });
    return;
  }

  const schema = z.object({
    email: z.string().email(),
    role: z.enum(['Admin', 'Sales Team', 'Engineer', 'Accountant', 'Manager']).optional(),
    name: z.string().min(1).optional(),
    active: z.boolean().optional(),
  });

  try {
    const body = schema.parse(req.body);
    const updated = await mutateDb((db) => {
      const user = db.users.find((item) => item.email === body.email.toLowerCase());
      if (!user) return null;
      Object.assign(user, {
        role: body.role ?? user.role,
        name: body.name ?? user.name,
        active: body.active ?? user.active,
        updated_at: new Date().toISOString(),
      });
      return publicUser(user);
    });

    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('User update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.delete('/users/:email', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role !== 'Admin') {
    res.status(403).json({ error: 'Only admins can delete users' });
    return;
  }

  const targetEmail = req.params.email.toLowerCase();

  if (req.user.email.toLowerCase() === targetEmail) {
    res.status(400).json({ error: 'You cannot delete your own account' });
    return;
  }

  try {
    const deletedUser = await mutateDb((db) => {
      const index = db.users.findIndex((u) => u.email.toLowerCase() === targetEmail);
      if (index === -1) return null;
      const [removed] = db.users.splice(index, 1);
      return removed;
    });

    if (!deletedUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await logActivity({
      user_email: req.user.email,
      action: 'DELETE',
      entity_type: 'user',
      entity_id: deletedUser.id,
      details: { deleted_email: targetEmail },
    });

    res.json({ message: `User ${targetEmail} deleted successfully` });
  } catch (err) {
    console.error('User deletion error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    });

    const { currentPassword, newPassword } = schema.parse(req.body);
    const users = await getTable<any>('users');
    const user = users.find((item) => item.id === req.user!.id);

    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    await updateById('users', user.id, {
      password: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
