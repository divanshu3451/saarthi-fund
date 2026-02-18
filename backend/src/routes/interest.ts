import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth';

const router = Router();

// Type assertion for new tables (until migration is run and prisma is regenerated)
const db = prisma as any;

/**
 * @swagger
 * /api/interest/snapshots:
 *   get:
 *     summary: Get all monthly pool snapshots
 *     tags: [Interest]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of snapshots }
 */
router.get('/snapshots', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const snapshots = await db.monthly_pool_snapshot.findMany({
      orderBy: { fund_month: 'desc' }
    });
    res.json(snapshots);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

/**
 * @swagger
 * /api/interest/snapshots:
 *   post:
 *     summary: Create monthly pool snapshot (admin only)
 *     tags: [Interest]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fund_month, month_year]
 *             properties:
 *               fund_month: { type: integer }
 *               month_year: { type: string, example: "2023-07" }
 *     responses:
 *       201: { description: Snapshot created }
 */
router.post('/snapshots', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { fund_month, month_year } = req.body;

    // Check if snapshot already exists
    const existing = await db.monthly_pool_snapshot.findUnique({
      where: { fund_month }
    });
    if (existing) {
      return res.status(400).json({ error: `Snapshot for month ${fund_month} already exists` });
    }

    // Calculate pool totals
    const deposits = await prisma.deposits.groupBy({
      by: ['user_id'],
      _sum: { amount: true }
    });

    const memberSnapshots: Record<string, number> = {};
    let totalAmount = 0;

    for (const dep of deposits) {
      const amount = Number(dep._sum.amount || 0);
      const units = Math.floor(amount / 300);
      memberSnapshots[dep.user_id] = units;
      totalAmount += amount;
    }

    const totalUnits = Math.floor(totalAmount / 300);

    const snapshot = await db.monthly_pool_snapshot.create({
      data: {
        fund_month,
        month_year,
        total_pool_amount: totalAmount,
        total_pool_units: totalUnits,
        cumulative_pool_units: totalUnits,
        member_snapshots: memberSnapshots,
        is_finalized: true,
        finalized_at: new Date(),
        finalized_by: req.user!.id
      }
    });

    res.status(201).json(snapshot);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create snapshot' });
  }
});

/**
 * @swagger
 * /api/interest/entries:
 *   get:
 *     summary: Get all interest entries
 *     tags: [Interest]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of interest entries }
 */
router.get('/entries', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const entries = await db.monthly_interest.findMany({
      include: {
        loans: { select: { principal_amount: true, user_id: true } },
        member_interest_shares: {
          include: { users: { select: { name: true } } }
        }
      },
      orderBy: { earned_month: 'desc' }
    });
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch interest entries' });
  }
});

/**
 * @swagger
 * /api/interest/entries:
 *   post:
 *     summary: Add interest entry and distribute to members (admin only)
 *     tags: [Interest]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [earned_month, source, amount, pool_source_month]
 *             properties:
 *               earned_month: { type: integer, description: "Month when interest was received" }
 *               source: { type: string, enum: [loan_interest, bank_interest, other] }
 *               source_description: { type: string }
 *               loan_id: { type: string, format: uuid }
 *               pool_source_month: { type: integer, description: "Month whose pool funded the loan" }
 *               amount: { type: number }
 *     responses:
 *       201: { description: Interest added and distributed }
 */
router.post('/entries', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { earned_month, source, source_description, loan_id, pool_source_month, amount, notes } = req.body;

    // Get the snapshot for the source month
    const snapshot = await db.monthly_pool_snapshot.findUnique({
      where: { fund_month: pool_source_month }
    });

    if (!snapshot) {
      return res.status(400).json({ 
        error: `Pool snapshot for month ${pool_source_month} not found. Create snapshot first.` 
      });
    }

    const memberSnapshots = snapshot.member_snapshots as Record<string, number>;
    const totalUnits = snapshot.cumulative_pool_units;

    if (totalUnits === 0) {
      return res.status(400).json({ error: 'Pool has zero units' });
    }

    // Create interest entry
    const interestEntry = await db.monthly_interest.create({
      data: {
        earned_month,
        source,
        source_description,
        loan_id: loan_id || null,
        pool_source_month,
        amount,
        recorded_by: req.user!.id,
        notes
      }
    });

    // Calculate rate per unit
    const ratePerUnit = Number(amount) / totalUnits;

    // Distribute to members
    const shares = [];
    for (const [userId, units] of Object.entries(memberSnapshots)) {
      if (units > 0) {
        const shareAmount = ratePerUnit * units;
        const sharePercentage = (units / totalUnits) * 100;

        shares.push({
          user_id: userId,
          monthly_interest_id: interestEntry.id,
          member_cumulative_units: units,
          total_pool_units: totalUnits,
          share_percentage: sharePercentage,
          interest_share: Math.round(shareAmount * 100) / 100
        });
      }
    }

    await db.member_interest_shares.createMany({ data: shares });

    // Update emergency fund
    let emergencyFund = await db.emergency_fund.findFirst();
    if (!emergencyFund) {
      emergencyFund = await db.emergency_fund.create({
        data: { total_balance: 0, last_interest_month: 0 }
      });
    }

    const newBalance = Number(emergencyFund.total_balance) + Number(amount);

    await db.emergency_fund.update({
      where: { id: emergencyFund.id },
      data: {
        total_balance: newBalance,
        last_interest_month: Math.max(emergencyFund.last_interest_month || 0, earned_month),
        updated_at: new Date()
      }
    });

    // Record transaction
    await db.emergency_fund_transactions.create({
      data: {
        transaction_type: 'interest_credit',
        amount,
        monthly_interest_id: interestEntry.id,
        balance_after: newBalance,
        description: source_description,
        recorded_by: req.user!.id
      }
    });

    // Fetch complete entry with shares
    const result = await db.monthly_interest.findUnique({
      where: { id: interestEntry.id },
      include: {
        member_interest_shares: {
          include: { users: { select: { name: true } } }
        }
      }
    });

    res.status(201).json({
      message: `Interest distributed to ${shares.length} members`,
      entry: result
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add interest' });
  }
});

/**
 * @swagger
 * /api/interest/my-shares:
 *   get:
 *     summary: Get current user's interest shares
 *     tags: [Interest]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: User's interest shares }
 */
router.get('/my-shares', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const shares = await db.member_interest_shares.findMany({
      where: { user_id: req.user!.id },
      include: {
        monthly_interest: {
          select: { earned_month: true, source: true, source_description: true, amount: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    const totalEarned = shares.reduce((sum: number, s: any) => sum + Number(s.interest_share), 0);

    res.json({
      shares,
      total_interest_earned: totalEarned
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch interest shares' });
  }
});

/**
 * @swagger
 * /api/interest/emergency-fund:
 *   get:
 *     summary: Get emergency fund status
 *     tags: [Interest]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Emergency fund status }
 */
router.get('/emergency-fund', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    let fund = await db.emergency_fund.findFirst();
    if (!fund) {
      fund = await db.emergency_fund.create({
        data: { total_balance: 0, last_interest_month: 0 }
      });
    }

    const transactions = await db.emergency_fund_transactions.findMany({
      orderBy: { created_at: 'desc' },
      take: 20
    });

    res.json({
      balance: fund.total_balance,
      last_interest_month: fund.last_interest_month,
      recent_transactions: transactions
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch emergency fund' });
  }
});

/**
 * @swagger
 * /api/interest/member-summary:
 *   get:
 *     summary: Get all members' interest summary (admin only)
 *     tags: [Interest]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All members' interest summary }
 */
router.get('/member-summary', authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    // Get all active members
    const members = await prisma.users.findMany({
      where: { role: 'member', status: 'active' },
      select: { id: true, name: true }
    });

    // Get interest shares for each member
    const memberIds = members.map(m => m.id);
    const shares = await db.member_interest_shares.findMany({
      where: { user_id: { in: memberIds } },
      select: { user_id: true, interest_share: true }
    });

    // Aggregate by user
    const sharesByUser: Record<string, { total: number; count: number }> = {};
    for (const share of shares) {
      if (!sharesByUser[share.user_id]) {
        sharesByUser[share.user_id] = { total: 0, count: 0 };
      }
      sharesByUser[share.user_id].total += Number(share.interest_share);
      sharesByUser[share.user_id].count += 1;
    }

    const summary = members.map(m => ({
      id: m.id,
      name: m.name,
      total_interest_earned: sharesByUser[m.id]?.total || 0,
      entries_count: sharesByUser[m.id]?.count || 0
    }));

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch member summary' });
  }
});

export default router;
