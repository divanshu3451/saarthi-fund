import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ApiService, DepositSummary, Eligibility, DashboardStats } from '../../core/services/api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, CurrencyPipe, DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
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
