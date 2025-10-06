import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import Web3 from 'web3';

declare let window: any;

@Injectable({
  providedIn: 'root'
})
export class Web3Service {
  private web3: any;
  private accounts: string[] = [];
  private accountSubject = new BehaviorSubject<string>('');
  private networkSubject = new BehaviorSubject<number>(0);
  
  public account$ = this.accountSubject.asObservable();
  public network$ = this.networkSubject.asObservable();

  constructor() {
    this.initializeWeb3();
  }

  private async initializeWeb3() {
    if (typeof window.ethereum !== 'undefined') {
      this.web3 = new Web3(window.ethereum);
      
      // Listen for account changes
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        this.accounts = accounts;
        this.accountSubject.next(accounts[0] || '');
      });

      // Listen for network changes
      window.ethereum.on('chainChanged', (chainId: string) => {
        this.networkSubject.next(parseInt(chainId, 16));
        window.location.reload();
      });
    }
  }

  async connectWallet(): Promise<string> {
    if (typeof window.ethereum === 'undefined') {
      throw new Error('MetaMask is not installed!');
    }

    try {
      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });
      
      this.accounts = accounts;
      this.accountSubject.next(accounts[0]);
      
      // Get network
      const chainId = await window.ethereum.request({
        method: 'eth_chainId'
      });
      this.networkSubject.next(parseInt(chainId, 16));
      
      return accounts[0];
    } catch (error: any) {
      throw new Error(`Failed to connect wallet: ${error.message}`);
    }
  }

  async signMessage(message: string): Promise<string> {
    if (!this.accounts.length) {
      throw new Error('No account connected');
    }

    try {
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, this.accounts[0]]
      });
      return signature;
    } catch (error: any) {
      throw new Error(`Failed to sign message: ${error.message}`);
    }
  }

  async sendTransaction(transaction: any): Promise<string> {
  if (!this.accounts.length) {
    throw new Error('No account connected');
  }

  try {
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [transaction]
    });
    return txHash;
  } catch (error: any) {
    // Handle different error types
    let errorMsg = 'Unknown error';
    if (typeof error === 'string') {
      errorMsg = error;
    } else if (error?.message) {
      errorMsg = error.message;
    } else if (error?.toString) {
      errorMsg = error.toString();
    }
    throw new Error(`Transaction failed: ${errorMsg}`);
  }
}
  async waitForTransaction(txHash: string): Promise<any> {
    const receipt = await this.web3.eth.getTransactionReceipt(txHash);
    if (receipt) {
      return receipt;
    }
    
    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.waitForTransaction(txHash);
  }

  getCurrentAccount(): string {
    return this.accounts[0] || '';
  }

  isConnected(): boolean {
    return this.accounts.length > 0;
  }

  async getBalance(address: string): Promise<string> {
    const balance = await this.web3.eth.getBalance(address);
    return this.web3.utils.fromWei(balance, 'ether');
  }

  async getBlockNumber(): Promise<number> {
    return await this.web3.eth.getBlockNumber();
  }

  async getGasPrice(): Promise<string> {
    const gasPrice = await this.web3.eth.getGasPrice();
    return this.web3.utils.fromWei(gasPrice, 'gwei');
  }

  getWeb3Instance(): any {
    return this.web3;
  }

  formatAddress(address: string): string {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }
}