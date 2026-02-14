import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ApiService, Loan, Eligibility } from '../../core/services/api.service';

@Component({
  selector: 'app-loans',
  standalone: true,
  imports: [FormsModule, RouterLink, CurrencyPipe, DatePipe],
  template: `
    <div class="loans-page">
      <h1>Loans</h1>
      
      <section class="request-loan">
        <h2>Request New Loan</h2>
        <div class="eligibility-card">
          <div class="eligibility-info">
            <span class="label">Max Eligible:</span>
            <span class="value">{{ eligibility()?.maxEligible | currency:'INR' }}</span>
          </div>
          <div class="eligibility-info">
            <span class="label">Active Loans:</span>
            <span class="value">{{ eligibility()?.activeLoans }} / {{ eligibility()?.maxActiveLoans }}</span>
          </div>
        </div>
        
        @if (eligibility()?.eligible) {
          <form (ngSubmit)="requestLoan()" class="loan-form">
            <div class="form-row">
              <div class="form-group">
                <label>Loan Amount (₹)</label>
                <input type="number" [(ngModel)]="loanAmount" name="amount" [max]="eligibility()?.maxEligible || 0" min="1" required />
              </div>
              <div class="form-group">
                <label>EMI Start Date (optional)</label>
                <input type="date" [(ngModel)]="emiStartDate" name="emi_start_date" />
              </div>
            </div>
            <button type="submit" class="btn-primary" [disabled]="loading()">
              {{ loading() ? 'Requesting...' : 'Request Loan' }}
            </button>
          </form>
        } @else {
          <p class="not-eligible">{{ eligibility()?.reason || 'You are not eligible for a loan at this time.' }}</p>
        }
        
        @if (error()) {
          <div class="error-message">{{ error() }}</div>
        }
        @if (success()) {
          <div class="success-message">{{ success() }}</div>
        }
      </section>
      
      <section class="loans-list">
        <h2>My Loans</h2>
        <div class="loans-grid">
          @for (loan of loans(); track loan.id) {
            <a [routerLink]="['/loans', loan.id]" class="loan-card" [class.active]="loan.status === 'active'" [class.completed]="loan.status === 'completed'">
              <div class="loan-header">
                <span class="loan-amount">{{ loan.principal_amount | currency:'INR' }}</span>
                <span class="loan-status" [class]="loan.status">{{ loan.status }}</span>
              </div>
              @if (auth.isAdmin() && loan.users_loans_user_idTousers) {
                <div class="loan-member">{{ loan.users_loans_user_idTousers.name }}</div>
              }
              <div class="loan-details">
                <div><span>Rate:</span> {{ loan.interest_rate }}%</div>
                <div><span>Multiplier:</span> {{ loan.multiplier_at_disbursement }}x</div>
                <div><span>Disbursed:</span> {{ loan.disbursed_at | date:'mediumDate' }}</div>
                <div><span>Outstanding:</span> {{ loan.outstanding_principal | currency:'INR' }}</div>
              </div>
              @if (loan.emi_start_date) {
                <div class="emi-info">EMI started: {{ loan.emi_start_date | date:'mediumDate' }}</div>
              } @else {
                <div class="emi-info pending">EMI not started</div>
              }
            </a>
          } @empty {
            <p class="empty">No loans found</p>
          }
        </div>
      </section>
    </div>
  `,
  styles: [`
    h1 { margin-bottom: 2rem; color: #333; }
    section { margin-bottom: 2rem; }
    h2 { color: #444; margin-bottom: 1rem; }
    .eligibility-card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex;
      gap: 2rem;
      margin-bottom: 1rem;
    }
    .eligibility-info { display: flex; flex-direction: column; gap: 0.25rem; }
    .eligibility-info .label { color: #666; font-size: 0.875rem; }
    .eligibility-info .value { font-size: 1.25rem; font-weight: 600; color: #333; }
    .loan-form { background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.5rem; }
    label { font-weight: 500; color: #333; }
    input { padding: 0.75rem; border: 1px solid #ddd; border-radius: 6px; font-size: 1rem; }
    input:focus { outline: none; border-color: #667eea; }
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
    .not-eligible { color: #666; padding: 1rem; background: #f8f9fa; border-radius: 6px; }
    .loans-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
    .loan-card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      text-decoration: none;
      color: inherit;
      transition: transform 0.2s, box-shadow 0.2s;
      border-left: 4px solid #ddd;
    }
    .loan-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
    .loan-card.active { border-left-color: #667eea; }
    .loan-card.completed { border-left-color: #22c55e; }
    .loan-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .loan-amount { font-size: 1.5rem; font-weight: 600; color: #333; }
    .loan-status { padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .loan-status.active { background: #e0e7ff; color: #4338ca; }
    .loan-status.completed { background: #dcfce7; color: #166534; }
    .loan-status.defaulted { background: #fee2e2; color: #991b1b; }
    .loan-member { color: #666; font-size: 0.875rem; margin-bottom: 0.5rem; }
    .loan-details { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.875rem; color: #666; }
    .loan-details span { color: #999; }
    .emi-info { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee; font-size: 0.875rem; color: #666; }
    .emi-info.pending { color: #f59e0b; }
    .empty { color: #666; text-align: center; padding: 2rem; }
    .error-message { background: #fee; color: #c00; padding: 0.75rem; border-radius: 6px; margin-top: 1rem; }
    .success-message { background: #efe; color: #060; padding: 0.75rem; border-radius: 6px; margin-top: 1rem; }
  `]
})
export class LoansComponent implements OnInit {
  auth = inject(AuthService);
  private api = inject(ApiService);

  loans = signal<Loan[]>([]);
  eligibility = signal<Eligibility | null>(null);
  loading = signal(false);
  error = signal('');
  success = signal('');

  loanAmount = 0;
  emiStartDate = '';

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.api.getLoans().subscribe(data => this.loans.set(data));
    this.api.getEligibility().subscribe(data => {
      this.eligibility.set(data);
      this.loanAmount = data.maxEligible;
    });
  }

  requestLoan() {
    this.loading.set(true);
    this.error.set('');
    this.success.set('');

    this.api.requestLoan(this.loanAmount, this.emiStartDate || undefined).subscribe({
      next: () => {
        this.success.set('Loan requested successfully!');
        this.loadData();
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to request loan');
        this.loading.set(false);
      }
    });
  }
}
