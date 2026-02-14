import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AuthService, User } from '../../core/services/auth.service';
import { ApiService, InterestBracket, FundSetting } from '../../core/services/api.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './admin.html',
  styleUrl: './admin.scss'
})
export class AdminComponent implements OnInit {
  private authService = inject(AuthService);
  private api = inject(ApiService);

  activeTab = signal<'pending' | 'members' | 'settings' | 'brackets'>('pending');
  pendingUsers = signal<User[]>([]);
  members = signal<any[]>([]);
  settings = signal<FundSetting[]>([]);
  brackets = signal<InterestBracket[]>([]);
  editingBracket = signal<InterestBracket | null>(null);

  newBracket = { min_multiplier: 0, max_multiplier: 0, interest_rate: 0 };

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.authService.getPendingUsers().subscribe(data => this.pendingUsers.set(data));
    this.api.getMembers().subscribe(data => this.members.set(data));
    this.api.getSettings().subscribe(data => this.settings.set(data));
    this.api.getInterestBrackets().subscribe(data => this.brackets.set(data));
  }

  approveUser(id: string) {
    this.authService.approveUser(id).subscribe(() => this.loadData());
  }

  rejectUser(id: string) {
    const reason = prompt('Rejection reason:');
    if (reason) {
      this.authService.rejectUser(id, reason).subscribe(() => this.loadData());
    }
  }

  updateSetting(key: string, value: string) {
    this.api.updateSetting(key, value).subscribe(() => this.loadData());
  }

  editBracket(bracket: InterestBracket) {
    this.editingBracket.set({ ...bracket });
  }

  cancelEdit() {
    this.editingBracket.set(null);
  }

  saveBracket() {
    const bracket = this.editingBracket();
    if (!bracket) return;

    this.api.updateInterestBracket(bracket.id, {
      min_multiplier: bracket.min_multiplier,
      max_multiplier: bracket.max_multiplier || undefined,
      interest_rate: bracket.interest_rate,
      is_active: bracket.is_active
    }).subscribe(() => {
      this.editingBracket.set(null);
      this.loadData();
    });
  }

  toggleBracket(id: string, isActive: boolean) {
    this.api.updateInterestBracket(id, { is_active: isActive }).subscribe(() => this.loadData());
  }

  addBracket() {
    const data = {
      min_multiplier: this.newBracket.min_multiplier,
      max_multiplier: this.newBracket.max_multiplier || undefined,
      interest_rate: this.newBracket.interest_rate
    };
    this.api.createInterestBracket(data).subscribe(() => {
      this.loadData();
      this.newBracket = { min_multiplier: 0, max_multiplier: 0, interest_rate: 0 };
    });
  }
}
