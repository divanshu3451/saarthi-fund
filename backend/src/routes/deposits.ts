import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /api/deposits:
 *   get:
 *     summary: Get all deposits (admin sees all, member sees own)
 *     tags: [Deposits]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of deposits }
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const where = req.user!.role === 'admin' ? {} : { user_id: req.user!.id };
    
    const deposits = await prisma.deposits.findMany({
      where,
      include: {
        users_deposits_user_idTousers: { select: { name: true, email: true } }
      },
      orderBy: { member_month: 'desc' }
    });
    res.json(deposits);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch deposits' });
  }
});

/**
 * @swagger
 * /api/deposits/summary:
 *   get:
 *     summary: Get current user's deposit summary
 *     tags: [Deposits]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Deposit summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_deposits: { type: number }
 *                 current_month: { type: integer }
 *                 joined_at: { type: string, format: date }
 */
router.get('/summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { joined_at: true }
    });

    const deposits = await prisma.deposits.aggregate({
      where: { user_id: userId },
      _sum: { amount: true },
      _max: { member_month: true }
    });

    res.json({
      total_deposits: deposits._sum.amount || 0,
      current_month: deposits._max.member_month || 0,
      joined_at: user?.joined_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

/**
 * @swagger
 * /api/deposits/summary/{userId}:
 *   get:
 *     summary: Get deposit summary for a specific user (Admin only)
 *     tags: [Deposits]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Deposit summary }
 *       403: { description: Admin access required }
 */
router.get('/summary/:userId', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.userId as string;

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { joined_at: true }
    });

    const deposits = await prisma.deposits.aggregate({
      where: { user_id: userId },
      _sum: { amount: true },
      _max: { member_month: true }
    });

    res.json({
      total_deposits: deposits._sum.amount || 0,
      current_month: deposits._max.member_month || 0,
      joined_at: user?.joined_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

/**
 * @swagger
 * /api/deposits:
 *   post:
 *     summary: Record a deposit for a member (Admin only)
 *     tags: [Deposits]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, amount, member_month, deposit_date]
 *             properties:
 *               user_id: { type: string, format: uuid }
 *               amount: { type: number, description: 'Must be multiple of 300' }
 *               member_month: { type: integer, description: 'Member relative month number' }
 *               deposit_date: { type: string, format: date }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Deposit recorded }
 *       400: { description: Validation error }
 *       403: { description: Admin access required }
 */
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, amount, member_month, deposit_date, notes } = req.body;

    // Validate amount is multiple of 300
    const settings = await prisma.fund_settings.findUnique({
      where: { setting_key: 'deposit_multiple' }
    });
    const multiple = parseInt(settings?.setting_value || '300');
    
    if (amount % multiple !== 0) {
      return res.status(400).json({ error: `Amount must be multiple of ${multiple}` });
    }

    // Get current cumulative total
    const existing = await prisma.deposits.aggregate({
      where: { user_id },
      _sum: { amount: true }
    });
    const currentTotal = Number(existing._sum.amount || 0);
    const newTotal = currentTotal + amount;

    // Validate minimum deposit rule (300 * month)
    const minRequired = multiple * member_month;
    if (newTotal < minRequired) {
      return res.status(400).json({ 
        error: `Total deposits (${newTotal}) must be at least ${minRequired} for month ${member_month}` 
      });
    }

    const deposit = await prisma.deposits.create({
      data: {
        user_id,
        amount,
        member_month,
        deposit_date: new Date(deposit_date),
        cumulative_total: newTotal,
        notes,
        recorded_by: req.user!.id
      }
    });

    res.status(201).json(deposit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to record deposit' });
  }
});

/**
 * @swagger
 * /api/deposits/pool:
 *   get:
 *     summary: Get total fund pool amount
 *     tags: [Deposits]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Total pool amount
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_pool: { type: number }
 */
router.get('/pool', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const total = await prisma.deposits.aggregate({
      _sum: { amount: true }
    });
    res.json({ total_pool: total._sum.amount || 0 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pool total' });
  }
});

/**
 * @swagger
 * /api/deposits/recalculate/{userId}:
 *   post:
 *     summary: Recalculate cumulative totals for a user (Admin only)
 *     tags: [Deposits]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Cumulative totals recalculated }
 *       403: { description: Admin access required }
 */
router.post('/recalculate/:userId', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.userId as string;

    // Get all deposits for user sorted by member_month
    const deposits = await prisma.deposits.findMany({
      where: { user_id: userId },
      orderBy: { member_month: 'asc' }
    });

    if (deposits.length === 0) {
      return res.json({ message: 'No deposits found for user', updated: 0 });
    }

    // Recalculate cumulative totals
    let runningTotal = 0;
    for (const deposit of deposits) {
      runningTotal += Number(deposit.amount);
      await prisma.deposits.update({
        where: { id: deposit.id },
        data: { cumulative_total: runningTotal }
      });
    }

    res.json({ 
      message: `Recalculated cumulative totals for ${deposits.length} deposits`,
      updated: deposits.length,
      finalTotal: runningTotal
    });
  } catch (error) {
    console.error('Recalculate error:', error);
    res.status(500).json({ error: 'Failed to recalculate totals' });
  }
});

export default router;
