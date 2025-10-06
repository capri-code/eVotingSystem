import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Web3Service } from './web3.service';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export interface Election {
  id: number;
  name: string;
  description: string;
  startTime: number;
  endTime: number;
  isActive: boolean;
  creator: string;
  totalVotes: number;
  candidateCount: number;
  status?: string;
}

export interface Candidate {
  id: number;
  name: string;
  party: string;
  voteCount: number;
  imageUrl: string;
}

export interface ElectionResults {
  election: Election;
  candidates: Candidate[];
  lastUpdate: Date;
}

export interface VoterStatus {
  eligible: boolean;
  hasVoted: boolean;
  canVote: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class VotingService {
  private API_URL = environment.apiUrl || 'http://localhost:8000';
  
  constructor(
    private http: HttpClient,
    private web3Service: Web3Service,
    private authService: AuthService
  ) {}

  // Elections
  getElections(): Observable<Election[]> {
    return this.http.get<Election[]>(`${this.API_URL}/api/elections`);
  }

  getElection(id: number): Observable<Election> {
    return this.http.get<Election>(`${this.API_URL}/api/elections/${id}`);
  }

  getActiveElections(): Observable<number[]> {
    return this.http.get<number[]>(`${this.API_URL}/api/elections/active`);
  }

  async createElection(name: string, description: string, startTime: Date, endTime: Date): Promise<string> {
    const senderAddress = this.authService.getUserAddress();
    
    try {
      const response = await this.http.post<any>(`${this.API_URL}/api/elections`, {
        name,
        description,
        startTime: Math.floor(startTime.getTime() / 1000),
        endTime: Math.floor(endTime.getTime() / 1000),
        senderAddress
      }).toPromise();
      
      if (response?.transaction) {
        // Ensure transaction has correct format for MetaMask
        const tx = response.transaction;
        console.log('Raw transaction:', tx);
        
        // Convert all numeric values to hex
        const fieldsToConvert = ['gas', 'gasPrice', 'value', 'nonce'];
        for (const field of fieldsToConvert) {
          if (tx[field] && typeof tx[field] === 'number') {
            tx[field] = '0x' + tx[field].toString(16);
          }
        }
        
        console.log('Formatted transaction:', tx);
        const txHash = await this.web3Service.sendTransaction(tx);
        console.log('Transaction hash:', txHash);
        await this.web3Service.waitForTransaction(txHash);
        return txHash;
      }
      
      throw new Error('Failed to create election');
    } catch (error: any) {
      console.error('Create election error:', error);
      if (error.error?.detail) {
        throw new Error(error.error.detail);
      }
      throw error;
    }
  }

  // Candidates
  getCandidates(electionId: number): Observable<Candidate[]> {
    return this.http.get<Candidate[]>(`${this.API_URL}/api/elections/${electionId}/candidates`);
  }

  async addCandidate(electionId: number, name: string, party: string, imageUrl: string = ''): Promise<string> {
    const senderAddress = this.authService.getUserAddress();
    
    if (!senderAddress) {
      throw new Error('User not authenticated. Please login again.');
    }
    
    try {
      const response = await this.http.post<any>(`${this.API_URL}/api/candidates`, {
        electionId,
        name,
        party,
        imageUrl,
        senderAddress
      }).toPromise();
      
      if (response?.transaction) {
        // Ensure transaction has correct format for MetaMask
        const tx = response.transaction;
        console.log('Raw transaction:', tx);
        
        // Convert all numeric values to hex
        const fieldsToConvert = ['gas', 'gasPrice', 'value', 'nonce'];
        for (const field of fieldsToConvert) {
          if (tx[field] && typeof tx[field] === 'number') {
            tx[field] = '0x' + tx[field].toString(16);
          }
        }
        
        console.log('Formatted transaction:', tx);
        const txHash = await this.web3Service.sendTransaction(tx);
        console.log('Transaction hash:', txHash);
        await this.web3Service.waitForTransaction(txHash);
        return txHash;
      }
      
      throw new Error('Failed to add candidate');
    } catch (error: any) {
      console.error('Add candidate error:', error);
      if (error.error?.detail) {
        throw new Error(error.error.detail);
      }
      throw error;
    }
  }

  // Voters
  getVoterStatus(electionId: number, voterAddress: string): Observable<VoterStatus> {
    if (!voterAddress) {
      return new Observable(observer => {
        observer.next({ eligible: false, hasVoted: false, canVote: false });
        observer.complete();
      });
    }
    return this.http.get<VoterStatus>(`${this.API_URL}/api/voters/${electionId}/${voterAddress}/eligible`);
  }

  async registerVoters(electionId: number, voterAddresses: string[]): Promise<string> {
    const senderAddress = this.authService.getUserAddress();
    
    if (!senderAddress) {
      throw new Error('User not authenticated. Please login again.');
    }
    
    try {
      const response = await this.http.post<any>(`${this.API_URL}/api/voters/register`, {
        electionId,
        voterAddresses,
        senderAddress
      }).toPromise();
      
     if (response?.transaction) {
        // Ensure transaction has correct format for MetaMask
        const tx = response.transaction;
        console.log('Raw transaction:', tx);
        
        // Convert all numeric values to hex
        const fieldsToConvert = ['gas', 'gasPrice', 'value', 'nonce'];
        for (const field of fieldsToConvert) {
          if (tx[field] && typeof tx[field] === 'number') {
            tx[field] = '0x' + tx[field].toString(16);
          }
        }
        
        console.log('Formatted transaction:', tx);
        const txHash = await this.web3Service.sendTransaction(tx);
        console.log('Transaction hash:', txHash);
        await this.web3Service.waitForTransaction(txHash);
        return txHash;
      }
      
      throw new Error('Failed to register voters');
    } catch (error: any) {
      console.error('Register voters error:', error);
      if (error.error?.detail) {
        throw new Error(error.error.detail);
      }
      throw error;
    }
  }

  // Voting
  async castVote(electionId: number, candidateId: number): Promise<string> {
    const senderAddress = this.authService.getUserAddress();
    
    if (!senderAddress) {
      throw new Error('User not authenticated. Please login again.');
    }
    
    try {
      const response = await this.http.post<any>(`${this.API_URL}/api/vote`, {
        electionId,
        candidateId,
        senderAddress
      }).toPromise();
      
      if (response?.transaction) {
        // Ensure transaction has correct format for MetaMask
        const tx = response.transaction;
        console.log('Raw transaction:', tx);
        
        // Convert all numeric values to hex
        const fieldsToConvert = ['gas', 'gasPrice', 'value', 'nonce'];
        for (const field of fieldsToConvert) {
          if (tx[field] && typeof tx[field] === 'number') {
            tx[field] = '0x' + tx[field].toString(16);
          }
        }
        
        console.log('Formatted transaction:', tx);
        const txHash = await this.web3Service.sendTransaction(tx);
        console.log('Transaction hash:', txHash);
        await this.web3Service.waitForTransaction(txHash);
        return txHash;
      }
      
      throw new Error('Failed to cast vote');
    } catch (error: any) {
      console.error('Cast vote error:', error);
      if (error.error?.detail) {
        throw new Error(error.error.detail);
      }
      throw error;
    }
  }

  // Results
  getElectionResults(electionId: number): Observable<ElectionResults> {
    return this.http.get<ElectionResults>(`${this.API_URL}/api/elections/${electionId}/results`);
  }

  // Admin
  async addAdmin(adminAddress: string): Promise<string> {
    const senderAddress = this.authService.getUserAddress();
    
    const response = await this.http.post<any>(`${this.API_URL}/api/admin/add`, {
      senderAddress,
      adminAddress
    }).toPromise();
    
    if (response?.transaction) {
      const txHash = await this.web3Service.sendTransaction(response.transaction);
      await this.web3Service.waitForTransaction(txHash);
      return txHash;
    }
    
    throw new Error('Failed to add admin');
  }

  // Blockchain status
  getBlockchainStatus(): Observable<any> {
    return this.http.get(`${this.API_URL}/api/blockchain/status`);
  }

  // Helper functions
  formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }

  isElectionActive(election: Election): boolean {
    const now = Date.now() / 1000;
    return election.isActive && now >= election.startTime && now <= election.endTime;
  }

  isElectionUpcoming(election: Election): boolean {
    const now = Date.now() / 1000;
    return election.isActive && now < election.startTime;
  }

  isElectionEnded(election: Election): boolean {
    const now = Date.now() / 1000;
    return now > election.endTime;
  }

  getElectionStatusText(election: Election): string {
    if (!election.isActive) return 'Inactive';
    if (this.isElectionUpcoming(election)) return 'Upcoming';
    if (this.isElectionActive(election)) return 'Active';
    if (this.isElectionEnded(election)) return 'Ended';
    return 'Unknown';
  }

  getElectionProgress(election: Election): number {
    const now = Date.now() / 1000;
    if (now < election.startTime) return 0;
    if (now > election.endTime) return 100;
    
    const duration = election.endTime - election.startTime;
    const elapsed = now - election.startTime;
    return Math.round((elapsed / duration) * 100);
  }
}