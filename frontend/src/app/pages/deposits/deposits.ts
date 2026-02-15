import { Component, inject, signal, computed, OnInit } from '@angular/core';
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
import { MatExpansionModule } from '@angular/material/expansion';
import { AuthService } from '../../core/services/auth.service';
import { ApiService, Deposit } from '../../core/services/api.service';

interface GroupedDeposits {
  userId: string;
  userName: string;
  deposits: Deposit[];
  totalDeposits: number;
  latestCumulative: number;
}

@Component({
  selector: 'app-deposits',
  standalone: true,
  imports: [
    FormsModule, CurrencyPipe, DatePipe, MatCardModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatTableModule, MatProgressSpinnerModule, MatSnackBarModule, MatExpansionModule
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

  newDeposit = {
    user_id: '',
    amount: 300,
    member_month: 1,
    deposit_date: new Date().toISOString().split('T')[0]
  };

  // Computed signal to group deposits by user
  groupedDeposits = computed<GroupedDeposits[]>(() => {
    const deps = this.deposits();
    const grouped = new Map<string, GroupedDeposits>();

    for (const dep of deps) {
      const userId = dep.user_id;
      const userName = (dep as any).users_deposits_user_idTousers?.name || 'Unknown';

      if (!grouped.has(userId)) {
        grouped.set(userId, {
          userId,
          userName,
          deposits: [],
          totalDeposits: 0,
          latestCumulative: 0
        });
      }

      const group = grouped.get(userId)!;
      group.deposits.push(dep);
      group.totalDeposits += Number(dep.amount);
    }

    // Sort deposits within each group by member_month desc and set latest cumulative
    for (const group of grouped.values()) {
      group.deposits.sort((a, b) => b.member_month - a.member_month);
      if (group.deposits.length > 0) {
        group.latestCumulative = Number(group.deposits[0].cumulative_total);
      }
    }

    // Sort groups by user name
    return Array.from(grouped.values()).sort((a, b) => a.userName.localeCompare(b.userName));
  });

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
