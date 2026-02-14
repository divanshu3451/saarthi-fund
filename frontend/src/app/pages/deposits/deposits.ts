import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ApiService, Deposit } from '../../core/services/api.service';

@Component({
  selector: 'app-deposits',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe],
  template: `
    <div class="deposits-page">
      <h1>Deposits</h1>
      
      @if (auth.isAdmin()) {
        <section class="add-deposit">
          <h2>Record New Deposit</h2>
          <form (ngSubmit)="onSubmit()" class="deposit-form">
            <div class="form-row">
              <div class="form-group">
                <label>Member</label>
                <select [(ngModel)]="newDeposit.user_id" name="user_id" required>
                  <option value="">Select Member</option>
                  @for (member of members(); track member.id) {
                    <option [value]="member.id">{{ member.name }} ({{ member.email }})</option>
                  }
                </select>
              </div>
              <div class="form-group">
                <label>Amount (₹)</label>
                <input type="number" [(ngModel)]="newDeposit.amount" name="amount" step="300" min="300" required />
              </div>
              <div class="form-group">
                <label>Member Month</label>
                <input type="number" [(ngModel)]="newDeposit.member_month" name="member_month" min="1" required />
              </div>
              <div class="form-group">
                <label>Date</label>
                <input type="date" [(ngModel)]="newDeposit.deposit_date" name="deposit_date" required />
              </div>
            </div>
            <button type="submit" class="btn-primary" [disabled]="loading()">
              {{ loading() ? 'Recording...' : 'Record Deposit' }}
            </button>
          </form>
          @if (error()) {
            <div class="error-message">{{ error() }}</div>
          }
          @if (success()) {
            <div class="success-message">{{ success() }}</div>
          }
        </section>
      }
      
      <section class="deposits-list">
        <h2>Deposit History</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                @if (auth.isAdmin()) {
                  <th>Member</th>
                }
                <th>Amount</th>
                <th>Month</th>
                <th>Date</th>
                <th>Cumulative Total</th>
              </tr>
            </thead>
            <tbody>
              @for (deposit of deposits(); track deposit.id) {
                <tr>
                  @if (auth.isAdmin()) {
                    <td>{{ deposit.users_deposits_user_idTousers?.name }}</td>
                  }
                  <td>{{ deposit.amount | currency:'INR' }}</td>
                  <td>Month {{ deposit.member_month }}</td>
                  <td>{{ deposit.deposit_date | date:'mediumDate' }}</td>
                  <td>{{ deposit.cumulative_total | currency:'INR' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td [attr.colspan]="auth.isAdmin() ? 5 : 4" class="empty">No deposits found</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
  styles: [`
    h1 { margin-bottom: 2rem; color: #333; }
    section { margin-bottom: 2rem; }
    h2 { color: #444; margin-bottom: 1rem; }
    .deposit-form { background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.5rem; }
    label { font-weight: 500; color: #333; }
    input, select { padding: 0.75rem; border: 1px solid #ddd; border-radius: 6px; font-size: 1rem; }
    input:focus, select:focus { outline: none; border-color: #667eea; }
    .btn-primary {
      padding: 0.75rem 1.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
    .table-container { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; color: #333; }
    .empty { text-align: center; color: #666; padding: 2rem; }
    .error-message { background: #fee; color: #c00; padding: 0.75rem; border-radius: 6px; margin-top: 1rem; }
    .success-message { background: #efe; color: #060; padding: 0.75rem; border-radius: 6px; margin-top: 1rem; }
  `]
})
export class DepositsComponent implements OnInit {
  auth = inject(AuthService);
  private api = inject(ApiService);

  deposits = signal<Deposit[]>([]);
  members = signal<any[]>([]);
  loading = signal(false);
  error = signal('');
  success = signal('');

  newDeposit = {
    user_id: '',
    amount: 300,
    member_month: 1,
    deposit_date: new Date().toISOString().split('T')[0]
  };

  ngOnInit() {
    this.loadDeposits();
    if (this.auth.isAdmin()) {
      this.api.getMembers().subscribe(data => this.members.set(data));
    }
  }

  loadDeposits() {
    this.api.getDeposits().subscribe(data => this.deposits.set(data));
  }

  onSubmit() {
    this.loading.set(true);
    this.error.set('');
    this.success.set('');

    this.api.createDeposit(this.newDeposit).subscribe({
      next: () => {
        this.success.set('Deposit recorded successfully!');
        this.loadDeposits();
        this.loading.set(false);
        this.newDeposit.amount = 300;
        this.newDeposit.member_month++;
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to record deposit');
        this.loading.set(false);
      }
    });
  }
}
