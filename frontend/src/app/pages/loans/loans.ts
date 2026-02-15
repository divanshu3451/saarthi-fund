import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';
import { ApiService, Loan, Eligibility } from '../../core/services/api.service';

@Component({
  selector: 'app-loans',
  standalone: true,
  imports: [
    FormsModule, RouterLink, CurrencyPipe, DatePipe, MatCardModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    MatChipsModule, MatProgressSpinnerModule, MatSnackBarModule
  ],
  templateUrl: './loans.html',
  styleUrl: './loans.scss'
})
export class LoansComponent implements OnInit {
  auth = inject(AuthService);
  private api = inject(ApiService);
  private snackBar = inject(MatSnackBar);

  loans = signal<Loan[]>([]);
  eligibility = signal<Eligibility | null>(null);
  loading = signal(false);

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

    this.api.requestLoan(this.loanAmount, this.emiStartDate || undefined).subscribe({
      next: () => {
        this.snackBar.open('Loan requested successfully!', 'Close', { duration: 3000 });
        this.loadData();
        this.loading.set(false);
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Failed to request loan', 'Close', { duration: 5000 });
        this.loading.set(false);
      }
    });
  }
}
