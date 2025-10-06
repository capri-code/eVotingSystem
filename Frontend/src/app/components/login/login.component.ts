import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Web3Service } from '../../services/web3.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SHARED_IMPORTS } from '../../../shared-imports';

@Component({
  selector: 'app-login',
  imports: [
    SHARED_IMPORTS,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  loading = false;
  hasMetaMask = false;
  currentAccount = '';
  networkId = 0;
  copyrightYear = new Date().getFullYear();
  
  constructor(
    private authService: AuthService,
    private web3Service: Web3Service,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.checkMetaMask();
    
    // Subscribe to account changes
    this.web3Service.account$.subscribe(account => {
      this.currentAccount = account;
    });
    
    // Subscribe to network changes
    this.web3Service.network$.subscribe(network => {
      this.networkId = network;
    });
  }

  checkMetaMask() {
    this.hasMetaMask = typeof (window as any).ethereum !== 'undefined';
    
    if (!this.hasMetaMask) {
      console.log('MetaMask not detected');
    }
  }

  async connectWallet() {
    if (!this.hasMetaMask) {
      window.open('https://metamask.io/download/', '_blank');
      return;
    }

    this.loading = true;
    
    try {
      // Login with MetaMask
      const user = await this.authService.login();
      
      this.snackBar.open('Login u krye me sukses!', 'OK', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
      
      // Navigate based on user role
      if (user.isAdmin) {
        this.router.navigate(['/admin']);
      } else {
        this.router.navigate(['/dashboard']);
      }
    } catch (error: any) {
      console.error('Login error:', error);
      
      let errorMessage = 'Login dështoi. Ju lutem provoni përsëri.';
      
      if (error.message?.includes('User rejected')) {
        errorMessage = 'Ju refuzuat kërkesën për konektim.';
      } else if (error.message?.includes('MetaMask')) {
        errorMessage = 'Problem me MetaMask. Ju lutem kontrolloni që është i hapur.';
      }
      
      this.snackBar.open(errorMessage, 'OK', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.loading = false;
    }
  }

  disconnectWallet() {
    this.currentAccount = '';
    this.authService.logout();
    
    this.snackBar.open('Jeni shkëputur nga wallet', 'OK', {
      duration: 2000
    });
  }

  copyAddress() {
    if (this.currentAccount) {
      navigator.clipboard.writeText(this.currentAccount);
      this.snackBar.open('Adresa u kopjua!', 'OK', {
        duration: 2000
      });
    }
  }

  formatAddress(address: string): string {
    return this.web3Service.formatAddress(address);
  }

  getNetworkName(): string {
    switch (this.networkId) {
      case 1: return 'Ethereum Mainnet';
      case 5: return 'Goerli Testnet';
      case 11155111: return 'Sepolia Testnet';
      case 1337: return 'Ganache Local';
      default: return `Network ID: ${this.networkId}`;
    }
  }

  generateHash(): string {
    // Generate random hash-like string for visual effect
    const chars = '0123456789abcdef';
    let hash = '0x';
    for (let i = 0; i < 8; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  }
}