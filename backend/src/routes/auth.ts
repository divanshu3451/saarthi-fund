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
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               phone: { type: string }
 *               password: { type: string, minLength: 6 }
 *     responses:
 *       201: { description: Registration pending approval }
 *       400: { description: Email already registered }
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password } = req.body;

    const existing = await prisma.users.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    
    const user = await prisma.users.create({
      data: { name, email, phone, password_hash },
      select: { id: true, name: true, email: true, status: true }
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
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login successful, returns JWT token }
 *       401: { description: Invalid credentials }
 *       403: { description: Account not active }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.users.findUnique({ where: { email } });
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
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
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

export default router;
