import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { VotingService, Election, Candidate, VoterStatus } from '../../services/voting.service';
import { AuthService } from '../../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { AddCandidateDialogComponent } from '../add-candidate-dialog/add-candidate-dialog.component';
import { RegisterVotersDialogComponent } from '../register-voter-dialog/register-voter-dialog.component';
import { SHARED_IMPORTS } from '../../../shared-imports';

@Component({
  selector: 'app-election-details',
  imports: [
    SHARED_IMPORTS,
    RouterLink
  ],
  templateUrl: './election-details.component.html',
  styleUrl: './election-details.component.scss'
})
export class ElectionDetailsComponent implements OnInit {
  electionId!: number;
  election: Election | null = null;
  candidates: Candidate[] = [];
  voterStatus: VoterStatus | null = null;
  loading = true;
  loadingCandidates = true;
  userAddress: string = '';
  isAdmin = false;
  
  // Statistics
  stats = {
    totalVotes: 0,
    candidateCount: 0,
    averageVotes: 0,
    leadingCandidate: '',
    timeRemaining: '',
    progress: 0
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private votingService: VotingService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.electionId = Number(this.route.snapshot.paramMap.get('id'));
    this.userAddress = this.authService.getUserAddress();
    this.isAdmin = this.authService.isAdmin();
    
    this.loadElectionDetails();
    this.loadCandidates();
    this.checkVoterStatus();
  }

  async loadElectionDetails() {
    this.loading = true;
    
    try {
      const election = await this.votingService.getElection(this.electionId).toPromise();
      
      if (election) {
        this.election = election;
        this.calculateStats();
      }
    } catch (error) {
      console.error('Error loading election:', error);
      this.snackBar.open('Dështoi ngarkimi i detajeve të zgjedhjes', 'OK', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.loading = false;
    }
  }

  async loadCandidates() {
    this.loadingCandidates = true;
    
    try {
      const candidates = await this.votingService.getCandidates(this.electionId).toPromise();
      
      if (candidates) {
        this.candidates = candidates.sort((a, b) => b.voteCount - a.voteCount);
      }
    } catch (error) {
      console.error('Error loading candidates:', error);
    } finally {
      this.loadingCandidates = false;
    }
  }

  async checkVoterStatus() {
    if (!this.userAddress) return;
    
    try {
      const status = await this.votingService.getVoterStatus(
        this.electionId,
        this.userAddress
      ).toPromise();
      
      if (status) {
        this.voterStatus = status;
      }
    } catch (error) {
      console.error('Error checking voter status:', error);
    }
  }

  calculateStats() {
    if (!this.election) return;
    
    this.stats.totalVotes = this.election.totalVotes;
    this.stats.candidateCount = this.election.candidateCount;
    this.stats.averageVotes = this.election.candidateCount > 0 
      ? Math.round(this.election.totalVotes / this.election.candidateCount) 
      : 0;
    
    if (this.candidates.length > 0) {
      this.stats.leadingCandidate = this.candidates[0].name;
    }
    
    this.stats.progress = this.votingService.getElectionProgress(this.election);
    this.stats.timeRemaining = this.calculateTimeRemaining();
  }

  calculateTimeRemaining(): string {
    if (!this.election) return '';
    
    const now = Date.now() / 1000;
    
    if (now < this.election.startTime) {
      const diff = this.election.startTime - now;
      return this.formatTimeDifference(diff) + ' për të filluar';
    }
    
    if (now <= this.election.endTime) {
      const diff = this.election.endTime - now;
      return this.formatTimeDifference(diff) + ' për të përfunduar';
    }
    
    return 'Përfunduar';
  }

  formatTimeDifference(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days} ditë, ${hours} orë`;
    }
    if (hours > 0) {
      return `${hours} orë, ${minutes} minuta`;
    }
    return `${minutes} minuta`;
  }

  // Actions
  navigateToVote() {
    if (!this.voterStatus?.eligible) {
      this.snackBar.open('Ju nuk jeni i regjistruar për këtë zgjedhje', 'OK', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      return;
    }
    
    if (this.voterStatus?.hasVoted) {
      this.snackBar.open('Ju keni votuar tashmë në këtë zgjedhje', 'OK', {
        duration: 3000,
        panelClass: ['info-snackbar']
      });
      return;
    }
    
    if (!this.isElectionActive()) {
      this.snackBar.open('Zgjedhja nuk është aktive', 'OK', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      return;
    }
    
    this.router.navigate(['/vote', this.electionId]);
  }

  viewResults() {
    this.router.navigate(['/results', this.electionId]);
  }

  // Admin Actions
  openAddCandidateDialog() {
    if (!this.isAdmin || !this.election) return;
    
    const dialogRef = this.dialog.open(AddCandidateDialogComponent, {
      width: '500px',
      data: { 
        electionId: this.election.id, 
        electionName: this.election.name 
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.addCandidate(result);
      }
    });
  }

  async addCandidate(data: any) {
    try {
      const txHash = await this.votingService.addCandidate(
        this.electionId,
        data.name,
        data.party,
        data.imageUrl
      );
      
      this.snackBar.open('Kandidati u shtua me sukses!', 'OK', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
      
      // Reload data
      setTimeout(() => {
        this.loadElectionDetails();
        this.loadCandidates();
      }, 2000);
    } catch (error: any) {
      console.error('Error adding candidate:', error);
      this.snackBar.open(
        error.message || 'Dështoi shtimi i kandidatit',
        'OK',
        { duration: 5000, panelClass: ['error-snackbar'] }
      );
    }
  }

  openRegisterVotersDialog() {
    if (!this.isAdmin || !this.election) return;
    
    const dialogRef = this.dialog.open(RegisterVotersDialogComponent, {
      width: '600px',
      data: { 
        electionId: this.election.id, 
        electionName: this.election.name 
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.registerVoters(result.addresses);
      }
    });
  }

  async registerVoters(addresses: string[]) {
    try {
      const txHash = await this.votingService.registerVoters(this.electionId, addresses);
      
      this.snackBar.open(
        `${addresses.length} votues u regjistruan me sukses!`,
        'OK',
        { duration: 3000, panelClass: ['success-snackbar'] }
      );
      
      // Reload voter status
      this.checkVoterStatus();
    } catch (error: any) {
      console.error('Error registering voters:', error);
      this.snackBar.open(
        error.message || 'Dështoi regjistrimi i votuesve',
        'OK',
        { duration: 5000, panelClass: ['error-snackbar'] }
      );
    }
  }

  // Utility Functions
  isElectionActive(): boolean {
    return this.election ? this.votingService.isElectionActive(this.election) : false;
  }

  isElectionUpcoming(): boolean {
    return this.election ? this.votingService.isElectionUpcoming(this.election) : false;
  }

  isElectionEnded(): boolean {
    return this.election ? this.votingService.isElectionEnded(this.election) : false;
  }

  getElectionStatus(): string {
    return this.election ? this.votingService.getElectionStatusText(this.election) : '';
  }

  getStatusColor(): string {
    if (!this.election) return '';
    
    if (!this.election.isActive) return 'warn';
    if (this.isElectionActive()) return 'primary';
    if (this.isElectionUpcoming()) return 'accent';
    return 'warn';
  }

  formatDate(timestamp: number): string {
    return this.votingService.formatDate(timestamp);
  }

  getCandidatePercentage(candidate: Candidate): number {
    if (!this.election || this.election.totalVotes === 0) return 0;
    return Math.round((candidate.voteCount / this.election.totalVotes) * 100);
  }

  canVote(): boolean {
    return this.voterStatus?.eligible === true && 
           !this.voterStatus?.hasVoted && 
           this.isElectionActive();
  }

  refresh() {
    this.loadElectionDetails();
    this.loadCandidates();
    this.checkVoterStatus();
  }
}
