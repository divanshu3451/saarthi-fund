import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe, UpperCasePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService, Loan, PreEmiInterest, EmiSchedule } from '../../core/services/api.service';

@Component({
  selector: 'app-loan-detail',
  standalone: true,
  imports: [
    FormsModule, CurrencyPipe, DatePipe, UpperCasePipe, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatTableModule,
    MatChipsModule, MatProgressSpinnerModule, MatSnackBarModule
  ],
  templateUrl: './loan-detail.html',
  styleUrl: './loan-detail.scss'
})
export class LoanDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private snackBar = inject(MatSnackBar);

  loan = signal<Loan | null>(null);
  loading = signal(false);

  emiStartDate = new Date().toISOString().split('T')[0];
  emiMonths = 12;
  
  prepayAmount = 0;
  prepayDate = new Date().toISOString().split('T')[0];

  preEmiColumns = ['period', 'days', 'amount', 'due_date', 'status', 'action'];
  emiColumns = ['emi_number', 'due_date', 'principal', 'interest', 'total', 'outstanding', 'status', 'action'];

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

    this.api.startEmi(loanId, this.emiStartDate, this.emiMonths).subscribe({
      next: (data) => {
        this.loan.set(data);
        this.loading.set(false);
        this.snackBar.open('EMI started successfully!', 'Close', { duration: 3000 });
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Failed to start EMI', 'Close', { duration: 5000 });
        this.loading.set(false);
      }
    });
  }

  makePrepayment() {
    const loanId = this.loan()?.id;
    if (!loanId || this.prepayAmount <= 0) return;

    this.loading.set(true);

    this.api.prepay(loanId, this.prepayAmount, this.prepayDate).subscribe({
      next: () => {
        this.snackBar.open('Prepayment recorded successfully!', 'Close', { duration: 3000 });
        this.loadLoan(loanId);
        this.prepayAmount = 0;
        this.loading.set(false);
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Failed to record prepayment', 'Close', { duration: 5000 });
        this.loading.set(false);
      }
    });
  }

  payPreEmi(preEmi: PreEmiInterest) {
    const today = new Date().toISOString().split('T')[0];
    
    this.api.payPreEmi(preEmi.id, Number(preEmi.interest_amount), today).subscribe({
      next: () => {
        this.snackBar.open('Pre-EMI interest paid!', 'Close', { duration: 3000 });
        this.loadLoan(this.loan()!.id);
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Failed to record payment', 'Close', { duration: 5000 });
      }
    });
  }

  payEmi(emi: EmiSchedule) {
    const today = new Date().toISOString().split('T')[0];
    
    this.api.payEmi(emi.id, Number(emi.total_emi), today).subscribe({
      next: () => {
        this.snackBar.open('EMI paid successfully!', 'Close', { duration: 3000 });
        this.loadLoan(this.loan()!.id);
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Failed to record payment', 'Close', { duration: 5000 });
      }
    });
  }
}
