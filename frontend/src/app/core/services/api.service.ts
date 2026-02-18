import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Deposit {
  id: string;
  user_id: string;
  amount: number;
  member_month: number;
  deposit_date: string;
  cumulative_total: number;
  users_deposits_user_idTousers?: { name: string; email: string };
}

export interface DepositSummary {
  total_deposits: number;
  current_month: number;
  joined_at: string;
}

export interface Loan {
  id: string;
  user_id: string;
  principal_amount: number;
  interest_rate: number;
  multiplier_at_disbursement: number;
  disbursed_at: string;
  emi_start_date: string | null;
  maturity_date: string;
  outstanding_principal: number;
  status: 'active' | 'completed' | 'defaulted';
  pre_emi_interest?: PreEmiInterest[];
  emi_schedule?: EmiSchedule[];
  users_loans_user_idTousers?: { name: string; email: string };
}

export interface PreEmiInterest {
  id: string;
  loan_id: string;
  period_start: string;
  period_end: string;
  days_count: number;
  interest_amount: number;
  is_paid: boolean;
  due_date: string;
}

export interface EmiSchedule {
  id: string;
  loan_id: string;
  emi_number: number;
  due_date: string;
  principal_component: number;
  interest_component: number;
  total_emi: number;
  outstanding_after: number;
  is_paid: boolean;
}

export interface Eligibility {
  eligible: boolean;
  totalDeposits: number;
  totalPool: number;
  outstanding: number;
  maxEligible: number;
  maxMultiplier: number;
  activeLoans: number;
  maxActiveLoans: number;
  reason?: string;
}

export interface DashboardStats {
  total_pool: number;
  total_loaned: number;
  available_balance: number;
  members: Record<string, number>;
  active_loans: number;
  pending_payments: number;
}

export interface InterestBracket {
  id: string;
  min_multiplier: number;
  max_multiplier: number | null;
  interest_rate: number;
  is_active: boolean;
}

export interface FundSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  description: string;
}

export interface PoolSnapshot {
  id: string;
  fund_month: number;
  month_year: string;
  total_pool_amount: number;
  total_pool_units: number;
  cumulative_pool_units: number;
  member_snapshots: Record<string, number>;
  is_finalized: boolean;
}

export interface MonthlyInterest {
  id: string;
  earned_month: number;
  source: 'loan_interest' | 'bank_interest' | 'other';
  source_description: string;
  loan_id: string | null;
  pool_source_month: number;
  amount: number;
  member_interest_shares?: MemberInterestShare[];
}

export interface MemberInterestShare {
  id: string;
  user_id: string;
  monthly_interest_id: string;
  member_cumulative_units: number;
  total_pool_units: number;
  share_percentage: number;
  interest_share: number;
  users?: { name: string };
  monthly_interest?: { earned_month: number; source: string; source_description: string; amount: number };
}

export interface EmergencyFund {
  balance: number;
  last_interest_month: number;
  recent_transactions: EmergencyFundTransaction[];
}

export interface EmergencyFundTransaction {
  id: string;
  transaction_type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Deposits
  getDeposits() {
    return this.http.get<Deposit[]>(`${this.apiUrl}/deposits`);
  }

  getDepositSummary() {
    return this.http.get<DepositSummary>(`${this.apiUrl}/deposits/summary`);
  }

  getPoolTotal() {
    return this.http.get<{ total_pool: number }>(`${this.apiUrl}/deposits/pool`);
  }

  createDeposit(data: { user_id: string; amount: number; member_month: number; deposit_date: string; notes?: string }) {
    return this.http.post<Deposit>(`${this.apiUrl}/deposits`, data);
  }

  recalculateDeposits(userId: string) {
    return this.http.post<{ message: string; updated: number; finalTotal: number }>(`${this.apiUrl}/deposits/recalculate/${userId}`, {});
  }

  // Loans
  getLoans() {
    return this.http.get<Loan[]>(`${this.apiUrl}/loans`);
  }

  getLoan(id: string) {
    return this.http.get<Loan>(`${this.apiUrl}/loans/${id}`);
  }

  getEligibility() {
    return this.http.get<Eligibility>(`${this.apiUrl}/loans/eligibility`);
  }

  requestLoan(amount: number, emi_start_date?: string) {
    return this.http.post<Loan>(`${this.apiUrl}/loans/request`, { amount, emi_start_date });
  }

  startEmi(loanId: string, emi_start_date: string, emi_months: number = 12) {
    return this.http.post<Loan>(`${this.apiUrl}/loans/${loanId}/start-emi`, { emi_start_date, emi_months });
  }

  // Payments
  getPendingPayments() {
    return this.http.get<{ pre_emi_dues: any[]; emi_dues: any[] }>(`${this.apiUrl}/payments/pending`);
  }

  payPreEmi(preEmiId: string, amount: number, payment_date: string) {
    return this.http.post(`${this.apiUrl}/payments/pre-emi/${preEmiId}`, { amount, payment_date });
  }

  payEmi(emiId: string, amount: number, payment_date: string) {
    return this.http.post(`${this.apiUrl}/payments/emi/${emiId}`, { amount, payment_date });
  }

  prepay(loanId: string, amount: number, payment_date: string) {
    return this.http.post(`${this.apiUrl}/payments/prepay/${loanId}`, { amount, payment_date });
  }

  // Admin
  getDashboard() {
    return this.http.get<DashboardStats>(`${this.apiUrl}/admin/dashboard`);
  }

  getMembers() {
    return this.http.get<any[]>(`${this.apiUrl}/admin/members`);
  }

  getSettings() {
    return this.http.get<FundSetting[]>(`${this.apiUrl}/admin/settings`);
  }

  updateSetting(key: string, value: string) {
    return this.http.put(`${this.apiUrl}/admin/settings/${key}`, { value });
  }

  getInterestBrackets() {
    return this.http.get<InterestBracket[]>(`${this.apiUrl}/admin/interest-brackets`);
  }

  createInterestBracket(data: { min_multiplier: number; max_multiplier?: number; interest_rate: number }) {
    return this.http.post<InterestBracket>(`${this.apiUrl}/admin/interest-brackets`, data);
  }

  updateInterestBracket(id: string, data: Partial<InterestBracket>) {
    return this.http.put<InterestBracket>(`${this.apiUrl}/admin/interest-brackets/${id}`, data);
  }

  bulkImportDeposits(userId: string, deposits: { amount: number; member_month: number; deposit_date: string; notes?: string }[]) {
    return this.http.post<{ message: string; count: number }>(`${this.apiUrl}/admin/bulk-deposits`, { user_id: userId, deposits });
  }

  // Interest Distribution
  getPoolSnapshots() {
    return this.http.get<PoolSnapshot[]>(`${this.apiUrl}/interest/snapshots`);
  }

  createPoolSnapshot(fund_month: number, month_year: string) {
    return this.http.post<PoolSnapshot>(`${this.apiUrl}/interest/snapshots`, { fund_month, month_year });
  }

  getInterestEntries() {
    return this.http.get<MonthlyInterest[]>(`${this.apiUrl}/interest/entries`);
  }

  addInterestEntry(data: {
    earned_month: number;
    source: 'loan_interest' | 'bank_interest' | 'other';
    source_description: string;
    loan_id?: string;
    pool_source_month: number;
    amount: number;
    notes?: string;
  }) {
    return this.http.post<{ message: string; entry: MonthlyInterest }>(`${this.apiUrl}/interest/entries`, data);
  }

  getMyInterestShares() {
    return this.http.get<{ shares: MemberInterestShare[]; total_interest_earned: number }>(`${this.apiUrl}/interest/my-shares`);
  }

  getEmergencyFund() {
    return this.http.get<EmergencyFund>(`${this.apiUrl}/interest/emergency-fund`);
  }

  getMemberInterestSummary() {
    return this.http.get<{ id: string; name: string; total_interest_earned: number; entries_count: number }[]>(`${this.apiUrl}/interest/member-summary`);
  }
}
