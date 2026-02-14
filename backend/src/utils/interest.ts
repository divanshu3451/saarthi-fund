import prisma from '../lib/prisma';

// Calculate pre-EMI total: Principal × (1 + Rate/12)^(Days/30)
export function calculatePreEmiTotal(principal: number, ratePercent: number, days: number): number {
  const monthlyRate = ratePercent / 100 / 12;
  const periods = days / 30;
  return principal * Math.pow(1 + monthlyRate, periods);
}

// Calculate pre-EMI interest only
export function calculatePreEmiInterest(principal: number, ratePercent: number, days: number): number {
  return calculatePreEmiTotal(principal, ratePercent, days) - principal;
}

// Get interest rate for a given multiplier
export async function getInterestRate(multiplier: number): Promise<number> {
  const bracket = await prisma.interest_brackets.findFirst({
    where: {
      is_active: true,
      min_multiplier: { lt: multiplier },
      OR: [
        { max_multiplier: null },
        { max_multiplier: { gte: multiplier } }
      ]
    }
  });
  return bracket ? Number(bracket.interest_rate) : 12.0;
}

// Calculate member's max eligibility
export async function getMemberEligibility(userId: string): Promise<{
  totalDeposits: number;
  totalPool: number;
  outstanding: number;
  maxEligible: number;
  maxMultiplier: number;
}> {
  // Get user's total deposits
  const userDeposits = await prisma.deposits.aggregate({
    where: { user_id: userId },
    _sum: { amount: true }
  });
  const totalDeposits = Number(userDeposits._sum.amount || 0);

  // Get total pool
  const poolTotal = await prisma.deposits.aggregate({
    _sum: { amount: true }
  });
  const totalPool = Number(poolTotal._sum.amount || 0);

  // Get user's outstanding loans
  const outstandingLoans = await prisma.loans.aggregate({
    where: { user_id: userId, status: 'active' },
    _sum: { outstanding_principal: true }
  });
  const outstanding = Number(outstandingLoans._sum.outstanding_principal || 0);

  // If user has no deposits, they are not eligible
  if (totalDeposits === 0) {
    return { totalDeposits, totalPool, outstanding, maxEligible: 0, maxMultiplier: 0 };
  }

  // Get max pool percentage from settings
  const setting = await prisma.fund_settings.findUnique({
    where: { setting_key: 'max_pool_percentage' }
  });
  const maxPoolPercent = parseInt(setting?.setting_value || '40') / 100;

  // Get max multiplier from interest brackets (highest max_multiplier or if null, use min_multiplier of that bracket)
  const maxBracket = await prisma.interest_brackets.findFirst({
    where: { is_active: true },
    orderBy: { min_multiplier: 'desc' }
  });
  // If max_multiplier is null, it means unlimited, so use min_multiplier as the cap
  const maxMultiplier = maxBracket?.max_multiplier 
    ? Number(maxBracket.max_multiplier) 
    : Number(maxBracket?.min_multiplier || 11);

  // Max from pool = 40% of total pool
  const maxFromPool = totalPool * maxPoolPercent;

  // Max from user's deposits = deposits × max multiplier
  const maxFromDeposits = totalDeposits * maxMultiplier;

  // Max eligible = min(40% of pool, deposits × max multiplier) - outstanding
  const maxEligible = Math.max(Math.min(maxFromPool, maxFromDeposits) - outstanding, 0);

  return { totalDeposits, totalPool, outstanding, maxEligible, maxMultiplier };
}

// Calculate EMI (reducing balance)
export function calculateEMI(principal: number, annualRate: number, months: number): number {
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return principal / months;
  
  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) / 
              (Math.pow(1 + monthlyRate, months) - 1);
  return Math.round(emi * 100) / 100;
}

// Generate EMI schedule
export function generateEMISchedule(
  principal: number, 
  annualRate: number, 
  months: number,
  startDate: Date
): Array<{
  emi_number: number;
  due_date: Date;
  principal_component: number;
  interest_component: number;
  total_emi: number;
  outstanding_after: number;
}> {
  const schedule = [];
  const monthlyRate = annualRate / 100 / 12;
  const emi = calculateEMI(principal, annualRate, months);
  let outstanding = principal;

  for (let i = 1; i <= months; i++) {
    const interestComponent = Math.round(outstanding * monthlyRate * 100) / 100;
    const principalComponent = Math.round((emi - interestComponent) * 100) / 100;
    outstanding = Math.round((outstanding - principalComponent) * 100) / 100;
    
    // Handle last EMI rounding
    if (i === months) {
      outstanding = 0;
    }

    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    schedule.push({
      emi_number: i,
      due_date: dueDate,
      principal_component: principalComponent,
      interest_component: interestComponent,
      total_emi: emi,
      outstanding_after: outstanding
    });
  }

  return schedule;
}
