import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';
import { ApiService, Deposit } from '../../core/services/api.service';

@Component({
  selector: 'app-deposits',
  standalone: true,
  imports: [
    FormsModule, CurrencyPipe, DatePipe, MatCardModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatTableModule, MatProgressSpinnerModule, MatSnackBarModule
  ],
  templateUrl: './deposits.html',
  styleUrl: './deposits.scss'
})
export class DepositsComponent implements OnInit {
  auth = inject(AuthService);
  private api = inject(ApiService);
  private snackBar = inject(MatSnackBar);

  deposits = signal<Deposit[]>([]);
  members = signal<any[]>([]);
  loading = signal(false);

  displayedColumns = ['amount', 'member_month', 'deposit_date', 'cumulative_total'];
  adminColumns = ['member', 'amount', 'member_month', 'deposit_date', 'cumulative_total'];

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

    this.api.createDeposit(this.newDeposit).subscribe({
      next: () => {
        this.snackBar.open('Deposit recorded successfully!', 'Close', { duration: 3000 });
        this.loadDeposits();
        this.loading.set(false);
        this.newDeposit.amount = 300;
        this.newDeposit.member_month++;
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Failed to record deposit', 'Close', { duration: 5000 });
        this.loading.set(false);
      }
    });
  }
}
