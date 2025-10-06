import { Component, inject, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, RouterLink } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './services/auth.service';
import { Web3Service } from './services/web3.service';
import { SHARED_IMPORTS } from '../shared-imports';
import { MatMenuModule } from '@angular/material/menu';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  imports: [
    SHARED_IMPORTS,
    RouterOutlet,
    MatMenuModule,
    RouterLink
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'Blockchain Voting System';
  showNavbar = false;
  currentUser: any = null;
  currentRoute = '';
  copyrightYear = new Date().getFullYear();
  currentLang = 'en';
  private translate = inject(TranslateService);

  constructor(
    private router: Router,
    private authService: AuthService,
    private web3Service: Web3Service
  ) {
    this.translate.addLangs(['en', 'sq']);
    this.translate.setDefaultLang('en');

    const savedLang = localStorage.getItem('preferredLanguage') || 'en';
    this.currentLang = savedLang;
    this.translate.use(savedLang);
  }

  switchLanguage(lang: string) {
    this.currentLang = lang;
    this.translate.use(lang);
    localStorage.setItem('preferredLanguage', lang);
  }

  ngOnInit() {
    // Subscribe to route changes
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentRoute = event.url;
      this.showNavbar = !event.url.includes('/login');
    });

    // Subscribe to user changes
    this.authService.user$.subscribe(user => {
      this.currentUser = user;
    });

    // Subscribe to account changes
    this.web3Service.account$.subscribe(account => {
      if (account && this.currentUser && account !== this.currentUser.address) {
        // Account changed, re-authenticate
        this.handleAccountChange();
      }
    });
  }

  handleAccountChange() {
    // Clear current session
    this.authService.logout();
    
    // Redirect to login if not already there
    if (!this.currentRoute.includes('/login')) {
      this.router.navigate(['/login']);
    }
  }

  isLoginPage(): boolean {
    return this.currentRoute.includes('/login');
  }

  isAdminPage(): boolean {
    return this.currentRoute.includes('/admin');
  }

  getUserRole(): string {
    return this.currentUser?.isAdmin ? 'Admin' : 'Votues';
  }

  formatAddress(address: string): string {
    if (!address) return '';
    return this.web3Service.formatAddress(address);
  }

  navigateTo(route: string) {
    this.router.navigate([route]);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}