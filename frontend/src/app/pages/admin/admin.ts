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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AuthService, User } from '../../core/services/auth.service';
import { ApiService, InterestBracket, FundSetting } from '../../core/services/api.service';

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
    MatSnackBarModule, MatDialogModule
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
  newMember = { name: '', email: '', phone: '', password: '', joined_at: '' };
  addMemberLoading = signal(false);

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.authService.getPendingUsers().subscribe(data => this.pendingUsers.set(data));
    this.api.getMembers().subscribe(data => this.members.set(data));
    this.api.getSettings().subscribe(data => this.settings.set(data));
    this.api.getInterestBrackets().subscribe(data => this.brackets.set(data));
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
    const lastMonth = this.bulkDeposits().length > 0 
      ? Math.max(...this.bulkDeposits().map(d => d.member_month)) + 1 
      : 1;
    
    this.bulkDeposits.update(rows => [...rows, {
      amount: 300,
      member_month: lastMonth,
      deposit_date: today,
      notes: ''
    }]);
  }

  removeBulkRow(index: number) {
    this.bulkDeposits.update(rows => rows.filter((_, i) => i !== index));
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

  // Add member
  addMember() {
    if (!this.newMember.name || !this.newMember.email || !this.newMember.password) {
      this.snackBar.open('Name, email, and password are required', 'Close', { duration: 3000 });
      return;
    }

    this.addMemberLoading.set(true);

    this.authService.adminRegisterUser({
      name: this.newMember.name,
      email: this.newMember.email,
      phone: this.newMember.phone || undefined,
      password: this.newMember.password,
      joined_at: this.newMember.joined_at || undefined
    }).subscribe({
      next: (result) => {
        this.snackBar.open(result.message, 'Close', { duration: 3000 });
        this.newMember = { name: '', email: '', phone: '', password: '', joined_at: '' };
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
}
