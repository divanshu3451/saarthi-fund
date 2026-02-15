import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone, password]
 *             properties:
 *               name: { type: string }
 *               phone: { type: string, description: 'Required, must be unique' }
 *               email: { type: string, format: email, description: 'Optional' }
 *               password: { type: string, minLength: 6 }
 *     responses:
 *       201: { description: Registration pending approval }
 *       400: { description: Phone already registered }
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Name, phone, and password are required' });
    }

    // Check if phone already exists
    const existingPhone = await prisma.users.findFirst({ where: { phone } });
    if (existingPhone) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    // Check if email already exists (if provided)
    if (email) {
      const existingEmail = await prisma.users.findUnique({ where: { email } });
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }
    }

    const password_hash = await bcrypt.hash(password, 10);
    
    const user = await prisma.users.create({
      data: { name, email: email && email.trim() ? email.trim() : null, phone, password_hash },
      select: { id: true, name: true, phone: true, email: true, status: true }
    });

    res.status(201).json({ message: 'Registration pending approval', user });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user via phone number
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, password]
 *             properties:
 *               phone: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login successful, returns JWT token }
 *       401: { description: Invalid credentials }
 *       403: { description: Account not active }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;

    const user = await prisma.users.findFirst({ where: { phone } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: `Account is ${user.status}` });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: User profile }
 *       401: { description: Unauthorized }
 */
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.users.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, joined_at: true }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * @swagger
 * /api/auth/pending:
 *   get:
 *     summary: Get pending user registrations (Admin only)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of pending users }
 *       403: { description: Admin access required }
 */
router.get('/pending', authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.users.findMany({
      where: { status: 'pending' },
      select: { id: true, name: true, email: true, phone: true, created_at: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending users' });
  }
});

/**
 * @swagger
 * /api/auth/approve/{id}:
 *   post:
 *     summary: Approve a pending user (Admin only)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: User approved }
 *       403: { description: Admin access required }
 */
router.post('/approve/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.users.update({
      where: { id: req.params.id as string },
      data: {
        status: 'active',
        joined_at: new Date(),
        approved_by: req.user!.id,
        approved_at: new Date()
      },
      select: { id: true, name: true, email: true, status: true, joined_at: true }
    });
    res.json({ message: 'User approved', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

/**
 * @swagger
 * /api/auth/reject/{id}:
 *   post:
 *     summary: Reject a pending user (Admin only)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200: { description: User rejected }
 *       403: { description: Admin access required }
 */
router.post('/reject/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const user = await prisma.users.update({
      where: { id: req.params.id as string },
      data: { status: 'rejected', rejection_reason: reason },
      select: { id: true, name: true, email: true, status: true }
    });
    res.json({ message: 'User rejected', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject user' });
  }
});

/**
 * @swagger
 * /api/auth/admin/register:
 *   post:
 *     summary: Register a new user directly (Admin only, auto-approved)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone, password]
 *             properties:
 *               name: { type: string }
 *               phone: { type: string, description: 'Required, must be unique' }
 *               email: { type: string, format: email, description: 'Optional' }
 *               password: { type: string, minLength: 6 }
 *               joined_at: { type: string, format: date, description: 'Optional join date for backdating' }
 *     responses:
 *       201: { description: User created and activated }
 *       400: { description: Phone already registered }
 *       403: { description: Admin access required }
 */
router.post('/admin/register', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, password, joined_at } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Name, phone, and password are required' });
    }

    // Check if phone already exists
    const existingPhone = await prisma.users.findFirst({ where: { phone } });
    if (existingPhone) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    // Check if email already exists (if provided)
    if (email) {
      const existingEmail = await prisma.users.findUnique({ where: { email } });
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }
    }

    const password_hash = await bcrypt.hash(password, 10);
    const joinDate = joined_at ? new Date(joined_at) : new Date();
    
    const user = await prisma.users.create({
      data: {
        name,
        email: email && email.trim() ? email.trim() : null,
        phone,
        password_hash,
        status: 'active',
        joined_at: joinDate,
        approved_by: req.user!.id,
        approved_at: new Date()
      },
      select: { id: true, name: true, phone: true, email: true, status: true, joined_at: true }
    });

    res.status(201).json({ message: 'User created and activated', user });
  } catch (error) {
    console.error('Admin register error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * @swagger
 * /api/auth/admin/delete/{id}:
 *   delete:
 *     summary: Soft delete a user (set status to inactive)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: User deactivated }
 *       400: { description: Cannot delete admin users }
 *       403: { description: Admin access required }
 *       404: { description: User not found }
 */
router.delete('/admin/delete/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id as string;

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Cannot delete admin users' });
    }

    // Soft delete - set status to inactive
    await prisma.users.update({
      where: { id: userId },
      data: { status: 'inactive' }
    });

    res.json({ message: `User ${user.name} has been deactivated. Their records are preserved.` });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * @swagger
 * /api/auth/admin/purge/{id}:
 *   delete:
 *     summary: Permanently delete a user and ALL their data (IRREVERSIBLE)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [confirmName]
 *             properties:
 *               confirmName: { type: string, description: 'Must match user name exactly' }
 *     responses:
 *       200: { description: User permanently deleted }
 *       400: { description: Confirmation failed or has active loans }
 *       403: { description: Admin access required }
 *       404: { description: User not found }
 */
router.delete('/admin/purge/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id as string;
    const { confirmName } = req.body;

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Cannot delete admin users' });
    }

    // Require exact name match for confirmation
    if (confirmName !== user.name) {
      return res.status(400).json({ error: 'Confirmation name does not match. Please type the exact user name.' });
    }

    // Check for active loans
    const activeLoans = await prisma.loans.count({
      where: { user_id: userId, status: 'active' }
    });
    if (activeLoans > 0) {
      return res.status(400).json({ error: 'Cannot permanently delete user with active loans. Deactivate or close loans first.' });
    }

    // Delete in order due to foreign key constraints
    // 1. Delete payments
    await prisma.payments.deleteMany({ where: { user_id: userId } });
    
    // 2. Delete EMI schedules and pre-EMI interest for user's loans
    const userLoans = await prisma.loans.findMany({ where: { user_id: userId }, select: { id: true } });
    const loanIds = userLoans.map(l => l.id);
    
    if (loanIds.length > 0) {
      await prisma.emi_schedule.deleteMany({ where: { loan_id: { in: loanIds } } });
      await prisma.pre_emi_interest.deleteMany({ where: { loan_id: { in: loanIds } } });
    }
    
    // 3. Delete loans
    await prisma.loans.deleteMany({ where: { user_id: userId } });
    
    // 4. Delete deposits
    await prisma.deposits.deleteMany({ where: { user_id: userId } });
    
    // 5. Delete user
    await prisma.users.delete({ where: { id: userId } });

    res.json({ message: `User ${user.name} and all their data have been permanently deleted.` });
  } catch (error) {
    console.error('Purge user error:', error);
    res.status(500).json({ error: 'Failed to permanently delete user' });
  }
});

export default router;
