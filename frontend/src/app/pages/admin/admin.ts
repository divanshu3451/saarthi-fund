import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { AuthService, User } from '../../core/services/auth.service';
import { ApiService, InterestBracket, FundSetting, PoolSnapshot, MonthlyInterest, EmergencyFund } from '../../core/services/api.service';

interface BulkDepositRow {
  amount: number;
  member_month: number;
  deposit_date: string;
  notes: string;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    FormsModule, DatePipe, CurrencyPipe, MatCardModule, MatTabsModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatTableModule,
    MatChipsModule, MatCheckboxModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatDialogModule, MatTooltipModule, MatExpansionModule
  ],
  templateUrl: './admin.html',
  styleUrl: './admin.scss'
})
export class AdminComponent implements OnInit {
  private authService = inject(AuthService);
  private api = inject(ApiService);
  private snackBar = inject(MatSnackBar);

  pendingUsers = signal<User[]>([]);
  members = signal<any[]>([]);
  settings = signal<FundSetting[]>([]);
  brackets = signal<InterestBracket[]>([]);
  editingBracket = signal<InterestBracket | null>(null);

  memberColumns = ['name', 'email', 'phone', 'status', 'joined_at', 'actions'];
  bracketColumns = ['min_multiplier', 'max_multiplier', 'interest_rate', 'is_active', 'actions'];
  bulkDepositColumns = ['member_month', 'amount', 'deposit_date', 'notes', 'actions'];

  newBracket = { min_multiplier: 0, max_multiplier: 0, interest_rate: 0 };

  // Bulk deposit import
  selectedUserId = '';
  bulkDeposits = signal<BulkDepositRow[]>([]);
  bulkLoading = signal(false);

  // Add member form
  newMember = { name: '', phone: '', email: '', password: '', joined_at: '' };
  addMemberLoading = signal(false);

  // Interest Distribution
  poolSnapshots = signal<PoolSnapshot[]>([]);
  interestEntries = signal<MonthlyInterest[]>([]);
  emergencyFund = signal<EmergencyFund | null>(null);
  memberInterestSummary = signal<{ id: string; name: string; total_interest_earned: number; entries_count: number }[]>([]);
  
  snapshotColumns = ['fund_month', 'month_year', 'total_pool_amount', 'total_pool_units', 'actions'];
  interestColumns = ['earned_month', 'source', 'description', 'amount', 'pool_source_month'];
  memberInterestColumns = ['name', 'total_interest_earned', 'entries_count'];

  newSnapshot = { fund_month: 1, month_year: '' };
  newInterest = {
    earned_month: 1,
    source: 'bank_interest' as 'loan_interest' | 'bank_interest' | 'other',
    source_description: '',
    pool_source_month: 1,
    amount: 0,
    loan_id: ''
  };
  interestLoading = signal(false);
  loans = signal<any[]>([]);

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.authService.getPendingUsers().subscribe(data => this.pendingUsers.set(data));
    this.api.getMembers().subscribe(data => this.members.set(data));
    this.api.getSettings().subscribe(data => this.settings.set(data));
    this.api.getInterestBrackets().subscribe(data => this.brackets.set(data));
    this.loadInterestData();
  }

  loadInterestData() {
    this.api.getPoolSnapshots().subscribe(data => this.poolSnapshots.set(data));
    this.api.getInterestEntries().subscribe(data => this.interestEntries.set(data));
    this.api.getEmergencyFund().subscribe(data => this.emergencyFund.set(data));
    this.api.getMemberInterestSummary().subscribe(data => this.memberInterestSummary.set(data));
    this.api.getLoans().subscribe(data => this.loans.set(data));
  }

  approveUser(id: string) {
    this.authService.approveUser(id).subscribe(() => {
      this.snackBar.open('User approved successfully!', 'Close', { duration: 3000 });
      this.loadData();
    });
  }

  rejectUser(id: string) {
    const reason = prompt('Rejection reason:');
    if (reason) {
      this.authService.rejectUser(id, reason).subscribe(() => {
        this.snackBar.open('User rejected', 'Close', { duration: 3000 });
        this.loadData();
      });
    }
  }

  updateSetting(key: string, value: string) {
    this.api.updateSetting(key, value).subscribe(() => {
      this.snackBar.open('Setting updated!', 'Close', { duration: 3000 });
      this.loadData();
    });
  }

  editBracket(bracket: InterestBracket) {
    this.editingBracket.set({ ...bracket });
  }

  cancelEdit() {
    this.editingBracket.set(null);
  }

  saveBracket() {
    const bracket = this.editingBracket();
    if (!bracket) return;

    this.api.updateInterestBracket(bracket.id, {
      min_multiplier: bracket.min_multiplier,
      max_multiplier: bracket.max_multiplier || undefined,
      interest_rate: bracket.interest_rate,
      is_active: bracket.is_active
    }).subscribe(() => {
      this.snackBar.open('Bracket updated!', 'Close', { duration: 3000 });
      this.editingBracket.set(null);
      this.loadData();
    });
  }

  addBracket() {
    const data = {
      min_multiplier: this.newBracket.min_multiplier,
      max_multiplier: this.newBracket.max_multiplier || undefined,
      interest_rate: this.newBracket.interest_rate
    };
    this.api.createInterestBracket(data).subscribe(() => {
      this.snackBar.open('Bracket added!', 'Close', { duration: 3000 });
      this.loadData();
      this.newBracket = { min_multiplier: 0, max_multiplier: 0, interest_rate: 0 };
    });
  }

  // Bulk deposit methods
  addBulkRow() {
    const today = new Date().toISOString().split('T')[0];
    const rows = this.bulkDeposits();
    const lastMonth = rows.length > 0 
      ? Math.max(...rows.map(d => d.member_month)) + 1 
      : 1;
    
    const newRow: BulkDepositRow = {
      amount: 300,
      member_month: lastMonth,
      deposit_date: today,
      notes: ''
    };

    // Insert and sort by deposit_date
    this.bulkDeposits.update(existing => 
      [...existing, newRow].sort((a, b) => a.deposit_date.localeCompare(b.deposit_date))
    );
  }

  removeBulkRow(index: number) {
    this.bulkDeposits.update(rows => rows.filter((_, i) => i !== index));
  }

  // Re-sort rows when deposit_date changes
  sortBulkRows() {
    this.bulkDeposits.update(rows => 
      [...rows].sort((a, b) => a.deposit_date.localeCompare(b.deposit_date))
    );
  }

  generateBulkRows() {
    const startMonth = parseInt(prompt('Start month number:', '1') || '0');
    const endMonth = parseInt(prompt('End month number:', '12') || '0');
    const amount = parseInt(prompt('Amount per month:', '300') || '300');
    const startDate = prompt('Start date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);

    if (!startMonth || !endMonth || startMonth > endMonth || !startDate) {
      this.snackBar.open('Invalid input', 'Close', { duration: 3000 });
      return;
    }

    const rows: BulkDepositRow[] = [];
    const baseDate = new Date(startDate);

    for (let month = startMonth; month <= endMonth; month++) {
      const depositDate = new Date(baseDate);
      depositDate.setMonth(baseDate.getMonth() + (month - startMonth));
      
      rows.push({
        amount,
        member_month: month,
        deposit_date: depositDate.toISOString().split('T')[0],
        notes: ''
      });
    }

    this.bulkDeposits.set(rows);
  }

  clearBulkRows() {
    this.bulkDeposits.set([]);
  }

  getTotalBulkAmount(): number {
    return this.bulkDeposits().reduce((sum, d) => sum + d.amount, 0);
  }

  submitBulkDeposits() {
    if (!this.selectedUserId) {
      this.snackBar.open('Please select a member', 'Close', { duration: 3000 });
      return;
    }

    if (this.bulkDeposits().length === 0) {
      this.snackBar.open('Please add at least one deposit', 'Close', { duration: 3000 });
      return;
    }

    this.bulkLoading.set(true);

    this.api.bulkImportDeposits(this.selectedUserId, this.bulkDeposits()).subscribe({
      next: (result) => {
        this.snackBar.open(result.message, 'Close', { duration: 5000 });
        this.bulkDeposits.set([]);
        this.bulkLoading.set(false);
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Failed to import deposits', 'Close', { duration: 5000 });
        this.bulkLoading.set(false);
      }
    });
  }

  recalculateTotals() {
    if (!this.selectedUserId) {
      this.snackBar.open('Please select a member first', 'Close', { duration: 3000 });
      return;
    }

    this.api.recalculateDeposits(this.selectedUserId).subscribe({
      next: (result) => {
        this.snackBar.open(result.message, 'Close', { duration: 5000 });
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Failed to recalculate', 'Close', { duration: 5000 });
      }
    });
  }

  // Add member
  addMember() {
    if (!this.newMember.name || !this.newMember.phone || !this.newMember.password) {
      this.snackBar.open('Name, phone, and password are required', 'Close', { duration: 3000 });
      return;
    }

    this.addMemberLoading.set(true);

    this.authService.adminRegisterUser({
      name: this.newMember.name,
      phone: this.newMember.phone,
      email: this.newMember.email || undefined,
      password: this.newMember.password,
      joined_at: this.newMember.joined_at || undefined
    }).subscribe({
      next: (result) => {
        this.snackBar.open(result.message, 'Close', { duration: 3000 });
        this.newMember = { name: '', phone: '', email: '', password: '', joined_at: '' };
        this.addMemberLoading.set(false);
        this.loadData();
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Failed to create user', 'Close', { duration: 5000 });
        this.addMemberLoading.set(false);
      }
    });
  }

  deleteMember(member: any) {
    if (!confirm(`Are you sure you want to deactivate ${member.name}? They will no longer be able to login, but their deposit and loan records will be preserved.`)) {
      return;
    }

    this.authService.deleteUser(member.id).subscribe({
      next: (result) => {
        this.snackBar.open(result.message, 'Close', { duration: 3000 });
        this.loadData();
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Failed to deactivate user', 'Close', { duration: 5000 });
      }
    });
  }

  purgeMember(member: any) {
    const confirmName = prompt(
      `⚠️ PERMANENT DELETE ⚠️\n\n` +
      `This will permanently delete ${member.name} and ALL their data:\n` +
      `- All deposits\n` +
      `- All loans\n` +
      `- All payment history\n\n` +
      `This action CANNOT be undone!\n\n` +
      `To confirm, type the user's name exactly: "${member.name}"`
    );

    if (confirmName === null) {
      return; // User cancelled
    }

    if (confirmName !== member.name) {
      this.snackBar.open('Name does not match. Deletion cancelled.', 'Close', { duration: 5000 });
      return;
    }

    this.authService.purgeUser(member.id, confirmName).subscribe({
      next: (result) => {
        this.snackBar.open(result.message, 'Close', { duration: 5000 });
        this.loadData();
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Failed to delete user', 'Close', { duration: 5000 });
      }
    });
  }

  // Interest Distribution Methods
  createSnapshot() {
    if (!this.newSnapshot.fund_month || !this.newSnapshot.month_year) {
      this.snackBar.open('Please fill in fund month and month/year', 'Close', { duration: 3000 });
      return;
    }

    this.interestLoading.set(true);
    this.api.createPoolSnapshot(this.newSnapshot.fund_month, this.newSnapshot.month_year).subscribe({
      next: () => {
        this.snackBar.open('Pool snapshot created!', 'Close', { duration: 3000 });
        this.newSnapshot = { fund_month: this.newSnapshot.fund_month + 1, month_year: '' };
        this.loadInterestData();
        this.interestLoading.set(false);
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Failed to create snapshot', 'Close', { duration: 5000 });
        this.interestLoading.set(false);
      }
    });
  }

  addInterest() {
    if (!this.newInterest.amount || !this.newInterest.pool_source_month) {
      this.snackBar.open('Please fill in amount and pool source month', 'Close', { duration: 3000 });
      return;
    }

    this.interestLoading.set(true);
    this.api.addInterestEntry({
      earned_month: this.newInterest.earned_month,
      source: this.newInterest.source,
      source_description: this.newInterest.source_description,
      pool_source_month: this.newInterest.pool_source_month,
      amount: this.newInterest.amount,
      loan_id: this.newInterest.loan_id || undefined
    }).subscribe({
      next: (result) => {
        this.snackBar.open(result.message, 'Close', { duration: 5000 });
        this.newInterest = {
          earned_month: this.newInterest.earned_month,
          source: 'bank_interest',
          source_description: '',
          pool_source_month: this.newInterest.pool_source_month,
          amount: 0,
          loan_id: ''
        };
        this.loadInterestData();
        this.interestLoading.set(false);
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Failed to add interest', 'Close', { duration: 5000 });
        this.interestLoading.set(false);
      }
    });
  }

  getSnapshotMemberCount(snapshot: PoolSnapshot): number {
    return Object.keys(snapshot.member_snapshots || {}).length;
  }

  getTotalInterestEarned(): number {
    return this.memberInterestSummary().reduce((sum, m) => sum + m.total_interest_earned, 0);
  }
}
