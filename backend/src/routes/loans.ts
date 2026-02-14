import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth';
import { getMemberEligibility, getInterestRate, calculatePreEmiInterest, generateEMISchedule } from '../utils/interest';

const router = Router();

/**
 * @swagger
 * /api/loans:
 *   get:
 *     summary: Get all loans (admin sees all, member sees own)
 *     tags: [Loans]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of loans }
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const where = req.user!.role === 'admin' ? {} : { user_id: req.user!.id };
    
    const loans = await prisma.loans.findMany({
      where,
      include: {
        users_loans_user_idTousers: { select: { name: true, email: true } },
        pre_emi_interest: true,
        emi_schedule: { orderBy: { emi_number: 'asc' } }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(loans);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch loans' });
  }
});

/**
 * @swagger
 * /api/loans/eligibility:
 *   get:
 *     summary: Get loan eligibility for current user
 *     tags: [Loans]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Eligibility details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 eligible: { type: boolean }
 *                 totalDeposits: { type: number }
 *                 totalPool: { type: number }
 *                 outstanding: { type: number }
 *                 maxEligible: { type: number }
 *                 activeLoans: { type: integer }
 *                 maxActiveLoans: { type: integer }
 */
router.get('/eligibility', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const activeLoans = await prisma.loans.count({
      where: { user_id: userId, status: 'active' }
    });

    const maxLoans = await prisma.fund_settings.findUnique({
      where: { setting_key: 'max_active_loans' }
    });
    const maxAllowed = parseInt(maxLoans?.setting_value || '2');

    if (activeLoans >= maxAllowed) {
      return res.json({ 
        eligible: false, 
        reason: `Already has ${activeLoans} active loans (max: ${maxAllowed})`,
        maxEligible: 0
      });
    }

    const eligibility = await getMemberEligibility(userId);
    
    res.json({
      eligible: eligibility.maxEligible > 0,
      ...eligibility,
      activeLoans,
      maxActiveLoans: maxAllowed
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate eligibility' });
  }
});

/**
 * @swagger
 * /api/loans/eligibility/{userId}:
 *   get:
 *     summary: Get loan eligibility for specific user (Admin only)
 *     tags: [Loans]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Eligibility details }
 *       403: { description: Admin access required }
 */
router.get('/eligibility/:userId', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.userId as string;

    const activeLoans = await prisma.loans.count({
      where: { user_id: userId, status: 'active' }
    });

    const maxLoans = await prisma.fund_settings.findUnique({
      where: { setting_key: 'max_active_loans' }
    });
    const maxAllowed = parseInt(maxLoans?.setting_value || '2');

    if (activeLoans >= maxAllowed) {
      return res.json({ 
        eligible: false, 
        reason: `Already has ${activeLoans} active loans (max: ${maxAllowed})`,
        maxEligible: 0
      });
    }

    const eligibility = await getMemberEligibility(userId);
    
    res.json({
      eligible: eligibility.maxEligible > 0,
      ...eligibility,
      activeLoans,
      maxActiveLoans: maxAllowed
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate eligibility' });
  }
});

/**
 * @swagger
 * /api/loans/request:
 *   post:
 *     summary: Request a new loan
 *     tags: [Loans]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: number, description: 'Loan amount requested' }
 *               emi_start_date: { type: string, format: date, description: 'Optional EMI start date' }
 *     responses:
 *       201: { description: Loan created }
 *       400: { description: Validation error or exceeds eligibility }
 */
router.post('/request', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { amount, emi_start_date } = req.body;
    const userId = req.user!.id;

    const activeLoans = await prisma.loans.count({
      where: { user_id: userId, status: 'active' }
    });
    const maxLoans = await prisma.fund_settings.findUnique({
      where: { setting_key: 'max_active_loans' }
    });
    if (activeLoans >= parseInt(maxLoans?.setting_value || '2')) {
      return res.status(400).json({ error: 'Maximum active loans reached' });
    }

    const eligibility = await getMemberEligibility(userId);
    if (amount > eligibility.maxEligible) {
      return res.status(400).json({ 
        error: `Amount exceeds eligibility. Max: ${eligibility.maxEligible}` 
      });
    }

    const multiplier = eligibility.totalDeposits > 0 ? amount / eligibility.totalDeposits : 0;
    const interestRate = await getInterestRate(multiplier);

    const disbursedAt = new Date();
    const maturityDate = new Date(disbursedAt);
    maturityDate.setFullYear(maturityDate.getFullYear() + 3);

    const loan = await prisma.loans.create({
      data: {
        user_id: userId,
        principal_amount: amount,
        interest_rate: interestRate,
        multiplier_at_disbursement: Math.round(multiplier * 100) / 100,
        user_total_deposits_at_loan: eligibility.totalDeposits,
        total_pool_at_loan: eligibility.totalPool,
        max_eligible_at_loan: eligibility.maxEligible,
        disbursed_at: disbursedAt,
        emi_start_date: emi_start_date ? new Date(emi_start_date) : null,
        maturity_date: maturityDate,
        outstanding_principal: amount
      }
    });

    res.status(201).json(loan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create loan' });
  }
});

/**
 * @swagger
 * /api/loans/{id}/approve:
 *   post:
 *     summary: Approve a loan (Admin only)
 *     tags: [Loans]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Loan approved }
 *       403: { description: Admin access required }
 */
router.post('/:id/approve', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const loan = await prisma.loans.update({
      where: { id: req.params.id as string },
      data: { approved_by: req.user!.id }
    });
    res.json({ message: 'Loan approved', loan });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve loan' });
  }
});

/**
 * @swagger
 * /api/loans/{id}/start-emi:
 *   post:
 *     summary: Set EMI start date and generate EMI schedule
 *     tags: [Loans]
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
 *             required: [emi_start_date]
 *             properties:
 *               emi_start_date: { type: string, format: date }
 *               emi_months: { type: integer, default: 12, description: 'Number of EMI months' }
 *     responses:
 *       200: { description: EMI schedule generated }
 *       404: { description: Loan not found }
 */
router.post('/:id/start-emi', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { emi_start_date, emi_months } = req.body;
    const loan = await prisma.loans.findUnique({ where: { id: req.params.id as string } });
    
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    if (loan.user_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const startDate = new Date(emi_start_date);
    const disbursedAt = new Date(loan.disbursed_at);
    
    const daysDiff = Math.floor((startDate.getTime() - disbursedAt.getTime()) / (1000 * 60 * 60 * 24));
    const preEmiInterest = calculatePreEmiInterest(
      Number(loan.principal_amount),
      Number(loan.interest_rate),
      daysDiff
    );

    await prisma.pre_emi_interest.create({
      data: {
        loan_id: loan.id,
        period_start: disbursedAt,
        period_end: startDate,
        days_count: daysDiff,
        principal_amount: loan.principal_amount,
        interest_rate: loan.interest_rate,
        interest_amount: Math.round(preEmiInterest * 100) / 100,
        due_date: startDate
      }
    });

    const months = emi_months || 12;
    const schedule = generateEMISchedule(
      Number(loan.outstanding_principal),
      Number(loan.interest_rate),
      months,
      startDate
    );

    await prisma.emi_schedule.createMany({
      data: schedule.map(emi => ({
        loan_id: loan.id,
        ...emi
      }))
    });

    const updatedLoan = await prisma.loans.update({
      where: { id: loan.id },
      data: { 
        emi_start_date: startDate,
        pre_emi_interest_amount: Math.round(preEmiInterest * 100) / 100
      },
      include: {
        pre_emi_interest: true,
        emi_schedule: { orderBy: { emi_number: 'asc' } }
      }
    });

    res.json(updatedLoan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to start EMI' });
  }
});

/**
 * @swagger
 * /api/loans/{id}:
 *   get:
 *     summary: Get single loan details
 *     tags: [Loans]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Loan details with schedules and payments }
 *       404: { description: Loan not found }
 */
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const loan = await prisma.loans.findUnique({
      where: { id: req.params.id as string },
      include: {
        users_loans_user_idTousers: { select: { name: true, email: true } },
        pre_emi_interest: true,
        emi_schedule: { orderBy: { emi_number: 'asc' } },
        payments: { orderBy: { payment_date: 'desc' } }
      }
    });

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    if (loan.user_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(loan);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch loan' });
  }
});

export default router;
