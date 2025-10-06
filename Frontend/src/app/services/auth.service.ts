import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { Web3Service } from './web3.service';
import { environment } from '../../environments/environment';

export interface User {
  address: string;
  isAdmin: boolean;
  authenticated: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private API_URL = environment.apiUrl || 'http://localhost:8000';
  private userSubject = new BehaviorSubject<User | null>(null);
  public user$ = this.userSubject.asObservable();
  
  constructor(
    private http: HttpClient,
    private web3Service: Web3Service
  ) {
    this.loadUserFromStorage();
    
    // Listen for account changes from MetaMask
    this.web3Service.account$.subscribe(account => {
      const currentUser = this.getCurrentUser();
      if (account && currentUser && account.toLowerCase() !== currentUser.address.toLowerCase()) {
        // Account changed, clear session
        console.log('Account changed, clearing session');
        this.logout();
      }
    });
  }

  private loadUserFromStorage() {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      this.userSubject.next(JSON.parse(storedUser));
    }
  }

  async login(): Promise<User> {
    try {
      // Connect wallet
      const address = await this.web3Service.connectWallet();
      
      // Create message to sign
      const message = `Sign this message to authenticate with Voting DApp\nTimestamp: ${Date.now()}`;
      
      // Sign message
      const signature = await this.web3Service.signMessage(message);
      
      // Send to backend for verification
      const response = await this.http.post<User>(`${this.API_URL}/api/auth/login`, {
        address,
        signature,
        message
      }).toPromise();
      
      if (response) {
        this.userSubject.next(response);
        localStorage.setItem('user', JSON.stringify(response));
        return response;
      }
      
      throw new Error('Login failed');
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  }

  logout() {
    this.userSubject.next(null);
    localStorage.removeItem('user');
  }

  getCurrentUser(): User | null {
    return this.userSubject.value;
  }

  isAuthenticated(): boolean {
    const user = this.getCurrentUser();
    return user !== null && user.authenticated;
  }

  isAdmin(): boolean {
    const user = this.getCurrentUser();
    return user !== null && user.isAdmin;
  }

  getUserAddress(): string {
    const user = this.getCurrentUser();
    return user?.address || '';
  }
}