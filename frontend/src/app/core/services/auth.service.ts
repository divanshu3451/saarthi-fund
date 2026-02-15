import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'member';
  status?: string;
  joined_at?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;
  
  private userSignal = signal<User | null>(null);
  private tokenSignal = signal<string | null>(null);

  user = this.userSignal.asReadonly();
  token = this.tokenSignal.asReadonly();
  isLoggedIn = computed(() => !!this.tokenSignal());
  isAdmin = computed(() => this.userSignal()?.role === 'admin');

  constructor(private http: HttpClient, private router: Router) {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
      this.tokenSignal.set(token);
      this.userSignal.set(JSON.parse(user));
    }
  }

  register(data: { name: string; email: string; phone?: string; password: string }) {
    return this.http.post<{ message: string; user: User }>(`${this.apiUrl}/register`, data);
  }

  login(email: string, password: string) {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, { email, password });
  }

  setSession(response: LoginResponse) {
    this.tokenSignal.set(response.token);
    this.userSignal.set(response.user);
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
  }

  logout() {
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/login']);
  }

  getMe() {
    return this.http.get<User>(`${this.apiUrl}/me`);
  }

  getPendingUsers() {
    return this.http.get<User[]>(`${this.apiUrl}/pending`);
  }

  approveUser(id: string) {
    return this.http.post<{ message: string; user: User }>(`${this.apiUrl}/approve/${id}`, {});
  }

  rejectUser(id: string, reason: string) {
    return this.http.post<{ message: string; user: User }>(`${this.apiUrl}/reject/${id}`, { reason });
  }

  adminRegisterUser(data: { name: string; email: string; phone?: string; password: string; joined_at?: string }) {
    return this.http.post<{ message: string; user: User }>(`${this.apiUrl}/admin/register`, data);
  }
}
