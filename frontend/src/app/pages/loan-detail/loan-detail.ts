import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ApiService, Loan } from '../../core/services/api.service';

@Component({
  selector: 'app-loan-detail',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe],
  templateUrl: './loan-detail.html',
  styleUrl: './loan-detail.scss'
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
