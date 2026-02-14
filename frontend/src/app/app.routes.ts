import { Routes } from '@angular/router';
import { authGuard, adminGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then(m => m.LoginComponent),
    canActivate: [guestGuard]
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register').then(m => m.RegisterComponent),
    canActivate: [guestGuard]
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'deposits',
    loadComponent: () => import('./pages/deposits/deposits').then(m => m.DepositsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'loans',
    loadComponent: () => import('./pages/loans/loans').then(m => m.LoansComponent),
    canActivate: [authGuard]
  },
  {
    path: 'loans/:id',
    loadComponent: () => import('./pages/loan-detail/loan-detail').then(m => m.LoanDetailComponent),
    canActivate: [authGuard]
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin/admin').then(m => m.AdminComponent),
    canActivate: [authGuard, adminGuard]
  },
  { path: '**', redirectTo: 'dashboard' }
];
