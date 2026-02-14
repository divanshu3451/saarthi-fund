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
  templateUrl: './loans.html',
  styleUrl: './loans.scss'
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
