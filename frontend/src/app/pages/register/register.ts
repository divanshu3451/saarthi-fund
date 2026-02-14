import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.scss'
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
