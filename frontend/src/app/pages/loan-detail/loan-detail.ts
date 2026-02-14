import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ApiService, Loan } from '../../core/services/api.service';

@Component({
  selector: 'app-loan-detail',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe],
  template: `
    <div class="loan-detail">
      @if (loan()) {
        <div class="loan-header">
          <h1>Loan Details</h1>
          <span class="loan-status" [class]="loan()!.status">{{ loan()!.status }}</span>
        </div>
        
        <section class="loan-info">
          <div class="info-grid">
            <div class="info-card">
              <span class="label">Principal Amount</span>
              <span class="value">{{ loan()!.principal_amount | currency:'INR' }}</span>
            </div>
            <div class="info-card">
              <span class="label">Interest Rate</span>
              <span class="value">{{ loan()!.interest_rate }}%</span>
            </div>
            <div class="info-card">
              <span class="label">Multiplier</span>
              <span class="value">{{ loan()!.multiplier_at_disbursement }}x</span>
            </div>
            <div class="info-card">
              <span class="label">Outstanding</span>
              <span class="value">{{ loan()!.outstanding_principal | currency:'INR' }}</span>
            </div>
            <div class="info-card">
              <span class="label">Disbursed On</span>
              <span class="value">{{ loan()!.disbursed_at | date:'mediumDate' }}</span>
            </div>
            <div class="info-card">
              <span class="label">Maturity Date</span>
              <span class="value">{{ loan()!.maturity_date | date:'mediumDate' }}</span>
            </div>
          </div>
        </section>
        
        @if (!loan()!.emi_start_date && loan()!.status === 'active') {
          <section class="start-emi">
            <h2>Start EMI</h2>
            <form (ngSubmit)="startEmi()" class="emi-form">
              <div class="form-row">
                <div class="form-group">
                  <label>EMI Start Date</label>
                  <input type="date" [(ngModel)]="emiStartDate" name="emi_start_date" required />
                </div>
                <div class="form-group">
                  <label>Number of EMIs</label>
                  <input type="number" [(ngModel)]="emiMonths" name="emi_months" min="1" max="36" required />
                </div>
              </div>
              <button type="submit" class="btn-primary" [disabled]="loading()">
                {{ loading() ? 'Starting...' : 'Start EMI' }}
              </button>
            </form>
            @if (error()) {
              <div class="error-message">{{ error() }}</div>
            }
          </section>
        }
        
        @if (loan()!.pre_emi_interest?.length) {
          <section class="pre-emi-section">
            <h2>Pre-EMI Interest</h2>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Days</th>
                    <th>Amount</th>
                    <th>Due Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (pei of loan()!.pre_emi_interest; track pei.id) {
                    <tr>
                      <td>{{ pei.period_start | date:'shortDate' }} - {{ pei.period_end | date:'shortDate' }}</td>
                      <td>{{ pei.days_count }} days</td>
                      <td>{{ pei.interest_amount | currency:'INR' }}</td>
                      <td>{{ pei.due_date | date:'mediumDate' }}</td>
                      <td>
                        @if (pei.is_paid) {
                          <span class="badge paid">Paid</span>
                        } @else {
                          <span class="badge pending">Pending</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
        
        @if (loan()!.emi_schedule?.length) {
          <section class="emi-section">
            <h2>EMI Schedule</h2>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>EMI #</th>
                    <th>Due Date</th>
                    <th>Principal</th>
                    <th>Interest</th>
                    <th>Total EMI</th>
                    <th>Outstanding After</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (emi of loan()!.emi_schedule; track emi.id) {
                    <tr>
                      <td>{{ emi.emi_number }}</td>
                      <td>{{ emi.due_date | date:'mediumDate' }}</td>
                      <td>{{ emi.principal_component | currency:'INR' }}</td>
                      <td>{{ emi.interest_component | currency:'INR' }}</td>
                      <td>{{ emi.total_emi | currency:'INR' }}</td>
                      <td>{{ emi.outstanding_after | currency:'INR' }}</td>
                      <td>
                        @if (emi.is_paid) {
                          <span class="badge paid">Paid</span>
                        } @else {
                          <span class="badge pending">Pending</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      } @else {
        <p>Loading...</p>
      }
    </div>
  `,
  styles: [`
    .loan-detail { max-width: 1000px; }
    .loan-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
    h1 { color: #333; margin: 0; }
    h2 { color: #444; margin-bottom: 1rem; }
    section { margin-bottom: 2rem; }
    .loan-status { padding: 0.5rem 1rem; border-radius: 20px; font-weight: 600; text-transform: uppercase; }
    .loan-status.active { background: #e0e7ff; color: #4338ca; }
    .loan-status.completed { background: #dcfce7; color: #166534; }
    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }
    .info-card {
      background: white;
      padding: 1.25rem;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .info-card .label { color: #666; font-size: 0.875rem; }
    .info-card .value { font-size: 1.25rem; font-weight: 600; color: #333; }
    .emi-form { background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.5rem; }
    label { font-weight: 500; color: #333; }
    input { padding: 0.75rem; border: 1px solid #ddd; border-radius: 6px; font-size: 1rem; }
    .btn-primary {
      padding: 0.75rem 1.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    .table-container { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 600px; }
    th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; color: #333; }
    .badge { padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
    .badge.paid { background: #dcfce7; color: #166534; }
    .badge.pending { background: #fef3c7; color: #92400e; }
    .error-message { background: #fee; color: #c00; padding: 0.75rem; border-radius: 6px; margin-top: 1rem; }
  `]
})
export class LoanDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);

  loan = signal<Loan | null>(null);
  loading = signal(false);
  error = signal('');

  emiStartDate = new Date().toISOString().split('T')[0];
  emiMonths = 12;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadLoan(id);
    }
  }

  loadLoan(id: string) {
    this.api.getLoan(id).subscribe({
      next: (data) => this.loan.set(data),
      error: () => this.router.navigate(['/loans'])
    });
  }

  startEmi() {
    const loanId = this.loan()?.id;
    if (!loanId) return;

    this.loading.set(true);
    this.error.set('');

    this.api.startEmi(loanId, this.emiStartDate, this.emiMonths).subscribe({
      next: (data) => {
        this.loan.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to start EMI');
        this.loading.set(false);
      }
    });
  }
}
