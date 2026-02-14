import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ApiService, DepositSummary, Eligibility, DashboardStats } from '../../core/services/api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, CurrencyPipe, DatePipe],
  template: `
    <div class="dashboard">
      <h1>Welcome, {{ auth.user()?.name }}!</h1>
      
      @if (auth.isAdmin()) {
        <section class="admin-stats">
          <h2>Fund Overview</h2>
          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-label">Total Pool</span>
              <span class="stat-value">{{ adminStats()?.total_pool | currency:'INR' }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Total Loaned</span>
              <span class="stat-value">{{ adminStats()?.total_loaned | currency:'INR' }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Available Balance</span>
              <span class="stat-value">{{ adminStats()?.available_balance | currency:'INR' }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Active Loans</span>
              <span class="stat-value">{{ adminStats()?.active_loans }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Pending Payments</span>
              <span class="stat-value">{{ adminStats()?.pending_payments }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Active Members</span>
              <span class="stat-value">{{ adminStats()?.members?.['active'] || 0 }}</span>
            </div>
          </div>
        </section>
      }
      
      <section class="my-summary">
        <h2>My Summary</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">My Total Deposits</span>
            <span class="stat-value">{{ depositSummary()?.total_deposits | currency:'INR' }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Current Month</span>
            <span class="stat-value">Month {{ depositSummary()?.current_month || 0 }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Member Since</span>
            <span class="stat-value">{{ depositSummary()?.joined_at | date:'mediumDate' }}</span>
          </div>
        </div>
      </section>
      
      <section class="eligibility">
        <h2>Loan Eligibility</h2>
        <div class="stats-grid">
          <div class="stat-card" [class.eligible]="eligibility()?.eligible" [class.not-eligible]="!eligibility()?.eligible">
            <span class="stat-label">Status</span>
            <span class="stat-value">{{ eligibility()?.eligible ? 'Eligible' : 'Not Eligible' }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Max Eligible Amount</span>
            <span class="stat-value">{{ eligibility()?.maxEligible | currency:'INR' }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Active Loans</span>
            <span class="stat-value">{{ eligibility()?.activeLoans }} / {{ eligibility()?.maxActiveLoans }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Outstanding</span>
            <span class="stat-value">{{ eligibility()?.outstanding | currency:'INR' }}</span>
          </div>
        </div>
        
        @if (eligibility()?.eligible) {
          <a routerLink="/loans" class="btn-primary">Request Loan</a>
        }
      </section>
      
      <section class="quick-actions">
        <h2>Quick Actions</h2>
        <div class="actions-grid">
          <a routerLink="/deposits" class="action-card">
            <span class="action-icon">💰</span>
            <span class="action-label">View Deposits</span>
          </a>
          <a routerLink="/loans" class="action-card">
            <span class="action-icon">📋</span>
            <span class="action-label">View Loans</span>
          </a>
          @if (auth.isAdmin()) {
            <a routerLink="/admin" class="action-card">
              <span class="action-icon">⚙️</span>
              <span class="action-label">Admin Panel</span>
            </a>
          }
        </div>
      </section>
    </div>
  `,
  styles: [`
    .dashboard h1 { margin-bottom: 2rem; color: #333; }
    section { margin-bottom: 2.5rem; }
    h2 { color: #444; margin-bottom: 1rem; font-size: 1.25rem; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }
    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .stat-card.eligible { border-left: 4px solid #22c55e; }
    .stat-card.not-eligible { border-left: 4px solid #ef4444; }
    .stat-label { color: #666; font-size: 0.875rem; }
    .stat-value { font-size: 1.5rem; font-weight: 600; color: #333; }
    .btn-primary {
      display: inline-block;
      margin-top: 1rem;
      padding: 0.75rem 1.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
    }
    .actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
    }
    .action-card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      text-decoration: none;
      text-align: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .action-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    }
    .action-icon { font-size: 2rem; display: block; margin-bottom: 0.5rem; }
    .action-label { color: #333; font-weight: 500; }
  `]
})
export class DashboardComponent implements OnInit {
  auth = inject(AuthService);
  private api = inject(ApiService);

  depositSummary = signal<DepositSummary | null>(null);
  eligibility = signal<Eligibility | null>(null);
  adminStats = signal<DashboardStats | null>(null);

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.api.getDepositSummary().subscribe(data => this.depositSummary.set(data));
    this.api.getEligibility().subscribe(data => this.eligibility.set(data));
    
    if (this.auth.isAdmin()) {
      this.api.getDashboard().subscribe(data => this.adminStats.set(data));
    }
  }
}
