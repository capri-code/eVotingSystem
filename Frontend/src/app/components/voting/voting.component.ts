import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { VotingService, Election, Candidate, VoterStatus } from '../../services/voting.service';
import { AuthService } from '../../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { trigger, transition, style, animate } from '@angular/animations';
import { SHARED_IMPORTS } from '../../../shared-imports';

@Component({
  selector: 'app-voting',
  imports: [
    SHARED_IMPORTS
  ],
  templateUrl: './voting.component.html',
  styleUrl: './voting.component.scss',
  animations: [
    trigger('cardAnimation', [
      transition(':enter', [
        style({ transform: 'scale(0.8)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'scale(1)', opacity: 1 }))
      ])
    ]),
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateY(50px)', opacity: 0 }),
        animate('500ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ])
  ]
})
export class VotingComponent implements OnInit {
  electionId!: number;
  election: Election | null = null;
  candidates: Candidate[] = [];
  voterStatus: VoterStatus | null = null;
  selectedCandidate: Candidate | null = null;
  loading = true;
  voting = false;
  userAddress: string = '';
  
  // UI state
  step = 1; // 1: Select, 2: Confirm, 3: Success
  transactionHash: string = '';
  
  Date: any = Date.now;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private votingService: VotingService,
    private authService: AuthService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.electionId = Number(this.route.snapshot.paramMap.get('id'));
    this.userAddress = this.authService.getUserAddress();
    this.loadElectionData();
  }

  async loadElectionData() {
    this.loading = true;
    
    try {
      // Load election details
      const election = await this.votingService.getElection(this.electionId).toPromise();
      if (election) {
        this.election = election;
      }

      // Load candidates
      const candidates = await this.votingService.getCandidates(this.electionId).toPromise();
      if (candidates) {
        this.candidates = candidates;
      }

      // Check voter status
      const status = await this.votingService.getVoterStatus(
        this.electionId,
        this.userAddress
      ).toPromise();
      
      if (status) {
        this.voterStatus = status;
        
        // Redirect if not eligible or already voted
        if (!status.eligible) {
          this.snackBar.open('Ju nuk jeni i regjistruar për këtë zgjedhje', 'OK', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          this.router.navigate(['/dashboard']);
        } else if (status.hasVoted) {
          this.snackBar.open('Ju keni votuar tashmë në këtë zgjedhje', 'OK', {
            duration: 5000,
            panelClass: ['info-snackbar']
          });
          this.router.navigate(['/results', this.electionId]);
        }
      }
    } catch (error) {
      console.error('Error loading election data:', error);
      this.snackBar.open('Dështoi ngarkimi i të dhënave', 'OK', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.loading = false;
    }
  }

  selectCandidate(candidate: Candidate) {
    this.selectedCandidate = candidate;
  }

  confirmSelection() {
    if (!this.selectedCandidate) {
      this.snackBar.open('Ju lutem zgjidhni një kandidat', 'OK', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      return;
    }
    
    this.step = 2;
  }

  backToSelection() {
    this.step = 1;
  }

  async submitVote() {
    if (!this.selectedCandidate) return;
    
    this.voting = true;
    
    try {
      const txHash = await this.votingService.castVote(
        this.electionId,
        this.selectedCandidate.id
      );
      
      this.transactionHash = txHash;
      this.step = 3;
      
      this.snackBar.open('Vota juaj u regjistrua me sukses!', 'OK', {
        duration: 5000,
        panelClass: ['success-snackbar']
      });
      
      // Redirect to results after 5 seconds
      setTimeout(() => {
        this.router.navigate(['/results', this.electionId]);
      }, 5000);
      
    } catch (error: any) {
      console.error('Error casting vote:', error);
      
      let errorMessage = 'Dështoi regjistrimi i votës';
      
      if (error.message?.includes('already voted')) {
        errorMessage = 'Ju keni votuar tashmë';
      } else if (error.message?.includes('not eligible')) {
        errorMessage = 'Ju nuk jeni i eligjibël për të votuar';
      } else if (error.message?.includes('rejected')) {
        errorMessage = 'Ju refuzuat transaksionin';
      }
      
      this.snackBar.open(errorMessage, 'OK', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
      
      this.step = 1;
    } finally {
      this.voting = false;
    }
  }

  viewResults() {
    this.router.navigate(['/results', this.electionId]);
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  formatDate(timestamp: number): string {
    return this.votingService.formatDate(timestamp);
  }

  isElectionActive(): boolean {
    return this.election ? this.votingService.isElectionActive(this.election) : false;
  }

  getElectionStatus(): string {
    return this.election ? this.votingService.getElectionStatusText(this.election) : '';
  }

  getCandidateInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  formatTransactionHash(hash: string): string {
    if (!hash) return '';
    return `${hash.substring(0, 10)}...${hash.substring(hash.length - 8)}`;
  }

  viewOnEtherscan() {
    if (this.transactionHash) {
      // For local Ganache, just copy the hash
      navigator.clipboard.writeText(this.transactionHash);
      this.snackBar.open('Transaction hash kopjuar në clipboard', 'OK', {
        duration: 3000
      });
    }
  }
}