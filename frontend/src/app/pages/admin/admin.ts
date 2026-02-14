import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AuthService, User } from '../../core/services/auth.service';
import { ApiService, InterestBracket, FundSetting } from '../../core/services/api.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="admin-page">
      <h1>Admin Panel</h1>
      
      <div class="tabs">
        <button [class.active]="activeTab() === 'pending'" (click)="activeTab.set('pending')">Pending Users</button>
        <button [class.active]="activeTab() === 'members'" (click)="activeTab.set('members')">Members</button>
        <button [class.active]="activeTab() === 'settings'" (click)="activeTab.set('settings')">Settings</button>
        <button [class.active]="activeTab() === 'brackets'" (click)="activeTab.set('brackets')">Interest Brackets</button>
      </div>
      
      @switch (activeTab()) {
        @case ('pending') {
          <section class="pending-users">
            <h2>Pending Approvals</h2>
            @if (pendingUsers().length) {
              <div class="users-grid">
                @for (user of pendingUsers(); track user.id) {
                  <div class="user-card">
                    <div class="user-info">
                      <strong>{{ user.name }}</strong>
                      <span>{{ user.email }}</span>
                      <span>{{ user.phone }}</span>
                    </div>
                    <div class="user-actions">
                      <button class="btn-approve" (click)="approveUser(user.id)">Approve</button>
                      <button class="btn-reject" (click)="rejectUser(user.id)">Reject</button>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <p class="empty">No pending users</p>
            }
          </section>
        }
        
        @case ('members') {
          <section class="members">
            <h2>All Members</h2>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  @for (member of members(); track member.id) {
                    <tr>
                      <td>{{ member.name }}</td>
                      <td>{{ member.email }}</td>
                      <td>{{ member.phone || '-' }}</td>
                      <td><span class="badge" [class]="member.status">{{ member.status }}</span></td>
                      <td>{{ member.joined_at | date:'mediumDate' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
        
        @case ('settings') {
          <section class="settings">
            <h2>Fund Settings</h2>
            <div class="settings-grid">
              @for (setting of settings(); track setting.id) {
                <div class="setting-card">
                  <label>{{ setting.setting_key }}</label>
                  <p class="description">{{ setting.description }}</p>
                  <div class="setting-input">
                    <input type="text" [value]="setting.setting_value" #input />
                    <button class="btn-save" (click)="updateSetting(setting.setting_key, input.value)">Save</button>
                  </div>
                </div>
              }
            </div>
          </section>
        }
        
        @case ('brackets') {
          <section class="brackets">
            <h2>Interest Rate Brackets</h2>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Min Multiplier</th>
                    <th>Max Multiplier</th>
                    <th>Interest Rate</th>
                    <th>Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (bracket of brackets(); track bracket.id) {
                    <tr>
                      @if (editingBracket()?.id === bracket.id) {
                        <td><input type="number" [(ngModel)]="editingBracket()!.min_multiplier" step="0.5" class="table-input" /></td>
                        <td><input type="number" [(ngModel)]="editingBracket()!.max_multiplier" step="0.5" class="table-input" placeholder="∞" /></td>
                        <td><input type="number" [(ngModel)]="editingBracket()!.interest_rate" step="0.5" class="table-input" /></td>
                        <td>
                          <input type="checkbox" [(ngModel)]="editingBracket()!.is_active" />
                        </td>
                        <td>
                          <button class="btn-save-small" (click)="saveBracket()">Save</button>
                          <button class="btn-cancel" (click)="cancelEdit()">Cancel</button>
                        </td>
                      } @else {
                        <td>{{ bracket.min_multiplier }}x</td>
                        <td>{{ bracket.max_multiplier ? bracket.max_multiplier + 'x' : '∞' }}</td>
                        <td>{{ bracket.interest_rate }}%</td>
                        <td>
                          <span class="badge" [class.active]="bracket.is_active" [class.inactive]="!bracket.is_active">
                            {{ bracket.is_active ? 'Yes' : 'No' }}
                          </span>
                        </td>
                        <td>
                          <button class="btn-edit" (click)="editBracket(bracket)">Edit</button>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            
            <h3>Add New Bracket</h3>
            <form (ngSubmit)="addBracket()" class="bracket-form">
              <div class="form-row">
                <div class="form-group">
                  <label>Min Multiplier</label>
                  <input type="number" [(ngModel)]="newBracket.min_multiplier" name="min" step="0.5" required />
                </div>
                <div class="form-group">
                  <label>Max Multiplier</label>
                  <input type="number" [(ngModel)]="newBracket.max_multiplier" name="max" step="0.5" placeholder="Leave empty for ∞" />
                </div>
                <div class="form-group">
                  <label>Interest Rate (%)</label>
                  <input type="number" [(ngModel)]="newBracket.interest_rate" name="rate" step="0.5" required />
                </div>
              </div>
              <button type="submit" class="btn-primary">Add Bracket</button>
            </form>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    h1 { margin-bottom: 1.5rem; color: #333; }
    h2 { color: #444; margin-bottom: 1rem; }
    h3 { color: #444; margin: 1.5rem 0 1rem; }
    section { margin-bottom: 2rem; }
    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 2rem;
      border-bottom: 2px solid #eee;
      padding-bottom: 0.5rem;
    }
    .tabs button {
      padding: 0.75rem 1.5rem;
      background: none;
      border: none;
      color: #666;
      font-weight: 500;
      cursor: pointer;
      border-radius: 6px 6px 0 0;
      transition: all 0.2s;
    }
    .tabs button:hover { color: #333; background: #f8f9fa; }
    .tabs button.active { color: #667eea; background: #f0f4ff; }
    .users-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
    .user-card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .user-info { display: flex; flex-direction: column; gap: 0.25rem; }
    .user-info strong { color: #333; }
    .user-info span { color: #666; font-size: 0.875rem; }
    .user-actions { display: flex; gap: 0.5rem; }
    .btn-approve { padding: 0.5rem 1rem; background: #22c55e; color: white; border: none; border-radius: 6px; cursor: pointer; }
    .btn-reject { padding: 0.5rem 1rem; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; }
    .table-container { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; color: #333; }
    .badge { padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
    .badge.active { background: #dcfce7; color: #166534; }
    .badge.pending { background: #fef3c7; color: #92400e; }
    .badge.inactive { background: #f3f4f6; color: #6b7280; }
    .badge.rejected { background: #fee2e2; color: #991b1b; }
    .settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
    .setting-card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .setting-card label { font-weight: 600; color: #333; display: block; margin-bottom: 0.25rem; }
    .setting-card .description { color: #666; font-size: 0.875rem; margin-bottom: 1rem; }
    .setting-input { display: flex; gap: 0.5rem; }
    .setting-input input { flex: 1; padding: 0.5rem; border: 1px solid #ddd; border-radius: 6px; }
    .btn-save { padding: 0.5rem 1rem; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; }
    .bracket-form { background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.5rem; }
    .form-group label { font-weight: 500; color: #333; }
    .form-group input { padding: 0.75rem; border: 1px solid #ddd; border-radius: 6px; }
    .btn-primary {
      padding: 0.75rem 1.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    .empty { color: #666; text-align: center; padding: 2rem; background: #f8f9fa; border-radius: 12px; }
    .table-input { 
      width: 80px; 
      padding: 0.4rem; 
      border: 1px solid #ddd; 
      border-radius: 4px; 
      font-size: 0.875rem;
    }
    .btn-edit { 
      padding: 0.4rem 0.75rem; 
      background: #667eea; 
      color: white; 
      border: none; 
      border-radius: 4px; 
      cursor: pointer; 
      font-size: 0.875rem;
    }
    .btn-save-small { 
      padding: 0.4rem 0.75rem; 
      background: #22c55e; 
      color: white; 
      border: none; 
      border-radius: 4px; 
      cursor: pointer; 
      font-size: 0.875rem;
      margin-right: 0.5rem;
    }
    .btn-cancel { 
      padding: 0.4rem 0.75rem; 
      background: #6b7280; 
      color: white; 
      border: none; 
      border-radius: 4px; 
      cursor: pointer; 
      font-size: 0.875rem;
    }
  `]
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
