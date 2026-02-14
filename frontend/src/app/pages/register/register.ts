import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <h1>Join Saarthi Fund</h1>
        <p class="subtitle">Create your account</p>
        
        @if (error()) {
          <div class="error-message">{{ error() }}</div>
        }
        
        @if (success()) {
          <div class="success-message">{{ success() }}</div>
        }
        
        <form (ngSubmit)="onSubmit()">
          <div class="form-group">
            <label for="name">Full Name</label>
            <input type="text" id="name" [(ngModel)]="name" name="name" required />
          </div>
          
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" [(ngModel)]="email" name="email" required />
          </div>
          
          <div class="form-group">
            <label for="phone">Phone (optional)</label>
            <input type="tel" id="phone" [(ngModel)]="phone" name="phone" />
          </div>
          
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" [(ngModel)]="password" name="password" required minlength="6" />
          </div>
          
          <button type="submit" class="btn-primary" [disabled]="loading()">
            {{ loading() ? 'Registering...' : 'Register' }}
          </button>
        </form>
        
        <p class="auth-link">
          Already have an account? <a routerLink="/login">Login</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 80vh;
    }
    .auth-card {
      background: white;
      padding: 2.5rem;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      width: 100%;
      max-width: 400px;
    }
    h1 { margin: 0 0 0.5rem; color: #333; }
    .subtitle { color: #666; margin-bottom: 2rem; }
    .form-group { margin-bottom: 1.5rem; }
    label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: #333; }
    input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 1rem;
      box-sizing: border-box;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102,126,234,0.1);
    }
    .btn-primary {
      width: 100%;
      padding: 0.875rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
    .auth-link { text-align: center; margin-top: 1.5rem; color: #666; }
    .auth-link a { color: #667eea; text-decoration: none; font-weight: 500; }
    .error-message { background: #fee; color: #c00; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
    .success-message { background: #efe; color: #060; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
  `]
})
export class RegisterComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  name = '';
  email = '';
  phone = '';
  password = '';
  loading = signal(false);
  error = signal('');
  success = signal('');

  onSubmit() {
    this.loading.set(true);
    this.error.set('');
    this.success.set('');

    this.authService.register({ name: this.name, email: this.email, phone: this.phone, password: this.password }).subscribe({
      next: () => {
        this.success.set('Registration successful! Please wait for admin approval.');
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Registration failed');
        this.loading.set(false);
      }
    });
  }
}
