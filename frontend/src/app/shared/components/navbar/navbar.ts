import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="navbar">
      <div class="navbar-brand">
        <a routerLink="/dashboard" class="logo">💰 Saarthi Fund</a>
      </div>
      
      @if (auth.isLoggedIn()) {
        <div class="navbar-menu">
          <a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
          <a routerLink="/deposits" routerLinkActive="active">Deposits</a>
          <a routerLink="/loans" routerLinkActive="active">Loans</a>
          @if (auth.isAdmin()) {
            <a routerLink="/admin" routerLinkActive="active">Admin</a>
          }
        </div>
        
        <div class="navbar-end">
          <span class="user-name">{{ auth.user()?.name }}</span>
          <button class="btn-logout" (click)="auth.logout()">Logout</button>
        </div>
      }
    </nav>
  `,
  styles: [`
    .navbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 2rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .logo {
      font-size: 1.5rem;
      font-weight: bold;
      color: white;
      text-decoration: none;
    }
    .navbar-menu {
      display: flex;
      gap: 1.5rem;
    }
    .navbar-menu a {
      color: rgba(255,255,255,0.8);
      text-decoration: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .navbar-menu a:hover, .navbar-menu a.active {
      color: white;
      background: rgba(255,255,255,0.2);
    }
    .navbar-end {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .user-name {
      font-weight: 500;
    }
    .btn-logout {
      padding: 0.5rem 1rem;
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: white;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-logout:hover {
      background: rgba(255,255,255,0.3);
    }
  `]
})
export class NavbarComponent {
  auth = inject(AuthService);
}
