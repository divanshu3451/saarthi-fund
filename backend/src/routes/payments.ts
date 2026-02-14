import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /api/payments:
 *   get:
 *     summary: Get all payments (admin sees all, member sees own)
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of payments }
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const where = req.user!.role === 'admin' ? {} : { user_id: req.user!.id };
    
    const payments = await prisma.payments.findMany({
      where,
      include: {
        loans: { select: { principal_amount: true, interest_rate: true } },
        users_payments_user_idTousers: { select: { name: true } }
      },
      orderBy: { payment_date: 'desc' }
    });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

/**
 * @swagger
 * /api/payments/pending:
 *   get:
 *     summary: Get pending payment dues
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Pending dues
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pre_emi_dues: { type: array }
 *                 emi_dues: { type: array }
 */
router.get('/pending', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.role === 'admin' ? undefined : req.user!.id;

    const preEmiDues = await prisma.pre_emi_interest.findMany({
      where: {
        is_paid: false,
        loans: userId ? { user_id: userId, status: 'active' } : { status: 'active' }
      },
      include: {
        loans: {
          include: { users_loans_user_idTousers: { select: { name: true } } }
        }
      }
    });

    const emiDues = await prisma.emi_schedule.findMany({
      where: {
        is_paid: false,
        loans: userId ? { user_id: userId, status: 'active' } : { status: 'active' }
      },
      include: {
        loans: {
          include: { users_loans_user_idTousers: { select: { name: true } } }
        }
      },
      orderBy: { due_date: 'asc' }
    });

    res.json({
      pre_emi_dues: preEmiDues,
      emi_dues: emiDues
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending payments' });
  }
});

/**
 * @swagger
 * /api/payments/pre-emi/{preEmiId}:
 *   post:
 *     summary: Record pre-EMI interest payment
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: preEmiId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, payment_date]
 *             properties:
 *               amount: { type: number }
 *               payment_date: { type: string, format: date }
 *     responses:
 *       201: { description: Payment recorded }
 *       404: { description: Pre-EMI interest not found }
 */
router.post('/pre-emi/:preEmiId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { amount, payment_date } = req.body;
    
    const preEmi = await prisma.pre_emi_interest.findUnique({
      where: { id: req.params.preEmiId as string },
      include: { loans: true }
    });

    if (!preEmi) {
      return res.status(404).json({ error: 'Pre-EMI interest not found' });
    }

    if (preEmi.loans.user_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const payment = await prisma.payments.create({
      data: {
        loan_id: preEmi.loan_id,
        user_id: preEmi.loans.user_id,
        amount,
        interest_component: amount,
        payment_type: 'pre_emi_interest',
        payment_date: new Date(payment_date),
        pre_emi_interest_id: preEmi.id,
        recorded_by: req.user!.role === 'admin' ? req.user!.id : null
      }
    });

    await prisma.pre_emi_interest.update({
      where: { id: preEmi.id },
      data: { is_paid: true, paid_amount: amount, paid_at: new Date(payment_date) }
    });

    await prisma.loans.update({
      where: { id: preEmi.loan_id },
      data: { total_interest_paid: { increment: amount } }
    });

    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

/**
 * @swagger
 * /api/payments/emi/{emiId}:
 *   post:
 *     summary: Record EMI payment
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: emiId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, payment_date]
 *             properties:
 *               amount: { type: number }
 *               payment_date: { type: string, format: date }
 *     responses:
 *       201: { description: Payment recorded }
 *       404: { description: EMI not found }
 */
router.post('/emi/:emiId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { amount, payment_date } = req.body;
    
    const emi = await prisma.emi_schedule.findUnique({
      where: { id: req.params.emiId as string },
      include: { loans: true }
    });

    if (!emi) {
      return res.status(404).json({ error: 'EMI not found' });
    }

    if (emi.loans.user_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const payment = await prisma.payments.create({
      data: {
        loan_id: emi.loan_id,
        user_id: emi.loans.user_id,
        amount,
        principal_component: emi.principal_component,
        interest_component: emi.interest_component,
        payment_type: 'emi',
        payment_date: new Date(payment_date),
        emi_schedule_id: emi.id,
        recorded_by: req.user!.role === 'admin' ? req.user!.id : null
      }
    });

    await prisma.emi_schedule.update({
      where: { id: emi.id },
      data: { is_paid: true, paid_amount: amount, paid_at: new Date(payment_date) }
    });

    const updatedLoan = await prisma.loans.update({
      where: { id: emi.loan_id },
      data: {
        outstanding_principal: { decrement: emi.principal_component },
        total_interest_paid: { increment: emi.interest_component }
      }
    });

    if (Number(updatedLoan.outstanding_principal) <= 0) {
      await prisma.loans.update({
        where: { id: emi.loan_id },
        data: { status: 'completed', completed_at: new Date() }
      });
    }

    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

/**
 * @swagger
 * /api/payments/prepay/{loanId}:
 *   post:
 *     summary: Record prepayment on a loan
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: loanId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, payment_date]
 *             properties:
 *               amount: { type: number }
 *               payment_date: { type: string, format: date }
 *     responses:
 *       201: { description: Prepayment recorded }
 *       400: { description: Amount exceeds outstanding }
 *       404: { description: Loan not found }
 */
router.post('/prepay/:loanId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { amount, payment_date } = req.body;
    
    const loan = await prisma.loans.findUnique({ where: { id: req.params.loanId as string } });

    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    if (loan.user_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (amount > Number(loan.outstanding_principal)) {
      return res.status(400).json({ error: 'Amount exceeds outstanding principal' });
    }

    const payment = await prisma.payments.create({
      data: {
        loan_id: loan.id,
        user_id: loan.user_id,
        amount,
        principal_component: amount,
        payment_type: 'prepayment',
        payment_date: new Date(payment_date),
        recorded_by: req.user!.role === 'admin' ? req.user!.id : null
      }
    });

    const updatedLoan = await prisma.loans.update({
      where: { id: loan.id },
      data: { outstanding_principal: { decrement: amount } }
    });

    if (Number(updatedLoan.outstanding_principal) <= 0) {
      await prisma.loans.update({
        where: { id: loan.id },
        data: { status: 'completed', completed_at: new Date() }
      });
    }

    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to record prepayment' });
  }
});

export default router;
