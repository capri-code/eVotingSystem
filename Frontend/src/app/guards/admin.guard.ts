import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    if (this.authService.isAdmin()) {
      return true;
    }

    // Not an admin, show message and redirect
    this.snackBar.open('Vetëm administratorët kanë akses në këtë faqe', 'OK', {
      duration: 3000,
      panelClass: ['warning-snackbar']
    });
    
    this.router.navigate(['/dashboard']);
    return false;
  }
}