import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ApiService, Deposit } from '../../core/services/api.service';

@Component({
  selector: 'app-deposits',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe],
  templateUrl: './deposits.html',
  styleUrl: './deposits.scss'
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
