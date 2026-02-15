import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get admin dashboard summary
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_pool: { type: number }
 *                 total_loaned: { type: number }
 *                 available_balance: { type: number }
 *                 members: { type: object }
 *                 active_loans: { type: integer }
 *                 pending_payments: { type: integer }
 *       403: { description: Admin access required }
 */
router.get('/dashboard', authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const poolTotal = await prisma.deposits.aggregate({ _sum: { amount: true } });
    
    const loanedOut = await prisma.loans.aggregate({
      where: { status: 'active' },
      _sum: { outstanding_principal: true }
    });

    const memberCounts = await prisma.users.groupBy({
      by: ['status'],
      where: { role: 'member' },
      _count: true
    });

    const activeLoans = await prisma.loans.count({ where: { status: 'active' } });

    const pendingPreEmi = await prisma.pre_emi_interest.count({ where: { is_paid: false } });
    const pendingEmi = await prisma.emi_schedule.count({ where: { is_paid: false } });

    res.json({
      total_pool: poolTotal._sum.amount || 0,
      total_loaned: loanedOut._sum.outstanding_principal || 0,
      available_balance: Number(poolTotal._sum.amount || 0) - Number(loanedOut._sum.outstanding_principal || 0),
      members: memberCounts.reduce((acc: Record<string, number>, m: { status: string | null; _count: number }) => ({ ...acc, [m.status!]: m._count }), {}),
      active_loans: activeLoans,
      pending_payments: pendingPreEmi + pendingEmi
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

/**
 * @swagger
 * /api/admin/members:
 *   get:
 *     summary: Get all members
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of members }
 *       403: { description: Admin access required }
 */
router.get('/members', authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const members = await prisma.users.findMany({
      where: { role: 'member' },
      select: {
        id: true, name: true, email: true, phone: true, 
        status: true, joined_at: true, created_at: true
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

/**
 * @swagger
 * /api/admin/settings:
 *   get:
 *     summary: Get all fund settings
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of settings }
 *       403: { description: Admin access required }
 */
router.get('/settings', authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await prisma.fund_settings.findMany();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * @swagger
 * /api/admin/settings/{key}:
 *   put:
 *     summary: Update a fund setting
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *         description: Setting key (e.g., min_monthly_deposit, max_active_loans)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [value]
 *             properties:
 *               value: { type: string }
 *     responses:
 *       200: { description: Setting updated }
 *       403: { description: Admin access required }
 */
router.put('/settings/:key', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { value } = req.body;
    const setting = await prisma.fund_settings.update({
      where: { setting_key: req.params.key as string },
      data: { setting_value: value, updated_at: new Date() }
    });
    res.json(setting);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

/**
 * @swagger
 * /api/admin/interest-brackets:
 *   get:
 *     summary: Get all interest rate brackets
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of interest brackets }
 *       403: { description: Admin access required }
 */
router.get('/interest-brackets', authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const brackets = await prisma.interest_brackets.findMany({
      orderBy: { min_multiplier: 'asc' }
    });
    res.json(brackets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch brackets' });
  }
});

/**
 * @swagger
 * /api/admin/interest-brackets:
 *   post:
 *     summary: Add a new interest rate bracket
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [min_multiplier, interest_rate]
 *             properties:
 *               min_multiplier: { type: number }
 *               max_multiplier: { type: number }
 *               interest_rate: { type: number }
 *     responses:
 *       201: { description: Bracket created }
 *       403: { description: Admin access required }
 */
router.post('/interest-brackets', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { min_multiplier, max_multiplier, interest_rate } = req.body;
    const bracket = await prisma.interest_brackets.create({
      data: { min_multiplier, max_multiplier, interest_rate }
    });
    res.status(201).json(bracket);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create bracket' });
  }
});

/**
 * @swagger
 * /api/admin/interest-brackets/{id}:
 *   put:
 *     summary: Update an interest rate bracket
 *     tags: [Admin]
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
 *             properties:
 *               min_multiplier: { type: number }
 *               max_multiplier: { type: number }
 *               interest_rate: { type: number }
 *               is_active: { type: boolean }
 *     responses:
 *       200: { description: Bracket updated }
 *       403: { description: Admin access required }
 */
router.put('/interest-brackets/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { min_multiplier, max_multiplier, interest_rate, is_active } = req.body;
    const bracket = await prisma.interest_brackets.update({
      where: { id: req.params.id as string },
      data: { min_multiplier, max_multiplier, interest_rate, is_active }
    });
    res.json(bracket);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update bracket' });
  }
});

/**
 * @swagger
 * /api/admin/bulk-deposits:
 *   post:
 *     summary: Bulk import deposits for a user (backdate support)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, deposits]
 *             properties:
 *               user_id:
 *                 type: string
 *                 format: uuid
 *               deposits:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [amount, member_month, deposit_date]
 *                   properties:
 *                     amount: { type: number }
 *                     member_month: { type: integer }
 *                     deposit_date: { type: string, format: date }
 *                     notes: { type: string }
 *     responses:
 *       201: { description: Deposits imported successfully }
 *       400: { description: Validation error }
 *       403: { description: Admin access required }
 */
router.post('/bulk-deposits', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, deposits } = req.body;

    if (!user_id || !deposits || !Array.isArray(deposits) || deposits.length === 0) {
      return res.status(400).json({ error: 'user_id and deposits array are required' });
    }

    // Verify user exists
    const user = await prisma.users.findUnique({ where: { id: user_id } });
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Get deposit multiple setting
    const settings = await prisma.fund_settings.findUnique({
      where: { setting_key: 'deposit_multiple' }
    });
    const multiple = parseInt(settings?.setting_value || '300');

    // Validate all deposits first
    for (const dep of deposits) {
      if (!dep.amount || !dep.member_month || !dep.deposit_date) {
        return res.status(400).json({ error: 'Each deposit must have amount, member_month, and deposit_date' });
      }
      if (dep.amount % multiple !== 0) {
        return res.status(400).json({ error: `Amount ${dep.amount} must be multiple of ${multiple}` });
      }
      if (dep.member_month < 1) {
        return res.status(400).json({ error: 'member_month must be at least 1' });
      }
    }

    // Sort deposits by member_month to calculate cumulative correctly
    const sortedDeposits = [...deposits].sort((a, b) => a.member_month - b.member_month);

    // Get existing cumulative total
    const existing = await prisma.deposits.aggregate({
      where: { user_id },
      _sum: { amount: true }
    });
    let runningTotal = Number(existing._sum.amount || 0);

    // Create all deposits in a transaction
    const createdDeposits = await prisma.$transaction(
      sortedDeposits.map(dep => {
        runningTotal += dep.amount;
        return prisma.deposits.create({
          data: {
            user_id,
            amount: dep.amount,
            member_month: dep.member_month,
            deposit_date: new Date(dep.deposit_date),
            cumulative_total: runningTotal,
            notes: dep.notes || `Bulk import`,
            recorded_by: req.user!.id
          }
        });
      })
    );

    res.status(201).json({
      message: `Successfully imported ${createdDeposits.length} deposits`,
      count: createdDeposits.length,
      deposits: createdDeposits
    });
  } catch (error) {
    console.error('Bulk deposit error:', error);
    res.status(500).json({ error: 'Failed to import deposits' });
  }
});

export default router;
