import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { VotingService, Election, VoterStatus } from '../../services/voting.service';
import { AuthService } from '../../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SHARED_IMPORTS } from '../../../shared-imports';
import { MatBadgeModule } from '@angular/material/badge';

interface ElectionWithStatus extends Election {
  voterStatus?: VoterStatus;
  loading?: boolean;
}

@Component({
  selector: 'app-dashboard',
  imports: [
    SHARED_IMPORTS,
    MatBadgeModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  userAddress: string = '';
  elections: ElectionWithStatus[] = [];
  myElections: ElectionWithStatus[] = [];
  activeElections: ElectionWithStatus[] = [];
  upcomingElections: ElectionWithStatus[] = [];
  endedElections: ElectionWithStatus[] = [];
  loading = true;
  selectedTab = 0;
  
  stats = {
    totalElections: 0,
    eligibleElections: 0,
    votedElections: 0,
    activeNow: 0
  };

  constructor(
    private votingService: VotingService,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.userAddress = this.authService.getUserAddress();
    this.loadElections();
  }

  async loadElections() {
    this.loading = true;
    
    try {
      const elections = await this.votingService.getElections().toPromise();
      
      if (elections) {
        this.elections = elections;
        
        // Check voter status for each election
        for (let election of this.elections) {
          election.loading = true;
          this.checkVoterStatus(election);
        }
        
        this.categorizeElections();
        this.calculateStats();
      }
    } catch (error) {
      console.error('Error loading elections:', error);
      this.snackBar.open('Dështoi ngarkimi i zgjedhjeve', 'OK', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async checkVoterStatus(election: ElectionWithStatus) {
    try {
      const status = await this.votingService.getVoterStatus(
        election.id, 
        this.userAddress
      ).toPromise();
      
      election.voterStatus = status || undefined;
      election.loading = false;
      
      // Recategorize after status update
      this.categorizeElections();
      this.calculateStats();
    } catch (error) {
      console.error('Error checking voter status:', error);
      election.loading = false;
    }
  }

  categorizeElections() {
    const now = Date.now() / 1000;
    
    // My Elections (where user is eligible)
    this.myElections = this.elections.filter(e => 
      e.voterStatus?.eligible === true
    );
    
    // Active Elections
    this.activeElections = this.elections.filter(e =>
      e.isActive && now >= e.startTime && now <= e.endTime
    );
    
    // Upcoming Elections
    this.upcomingElections = this.elections.filter(e =>
      e.isActive && now < e.startTime
    );
    
    // Ended Elections
    this.endedElections = this.elections.filter(e =>
      !e.isActive || now > e.endTime
    );
  }

  calculateStats() {
    this.stats.totalElections = this.elections.length;
    this.stats.eligibleElections = this.myElections.length;
    this.stats.votedElections = this.myElections.filter(e => 
      e.voterStatus?.hasVoted === true
    ).length;
    this.stats.activeNow = this.activeElections.length;
  }

  navigateToVote(election: ElectionWithStatus) {
    // First check if user is still authenticated
    if (!this.authService.isAuthenticated()) {
      this.snackBar.open('Sesioni ka përfunduar. Ju lutem logohuni përsëri.', 'OK', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      this.router.navigate(['/login']);
      return;
    }
    
    if (!election.voterStatus?.eligible) {
      this.snackBar.open('Ju nuk jeni i regjistruar për këtë zgjedhje', 'OK', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      return;
    }
    
    if (election.voterStatus?.hasVoted) {
      this.snackBar.open('Ju keni votuar tashmë në këtë zgjedhje', 'OK', {
        duration: 3000,
        panelClass: ['info-snackbar']
      });
      return;
    }
    
    if (!this.votingService.isElectionActive(election)) {
      this.snackBar.open('Zgjedhja nuk është aktive', 'OK', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      return;
    }
    
    this.router.navigate(['/vote', election.id]);
  }

  viewResults(election: Election) {
    this.router.navigate(['/results', election.id]);
  }

  viewDetails(election: Election) {
    this.router.navigate(['/election', election.id]);
  }

  getElectionStatus(election: Election): string {
    return this.votingService.getElectionStatusText(election);
  }

  getElectionProgress(election: Election): number {
    return this.votingService.getElectionProgress(election);
  }

  formatDate(timestamp: number): string {
    return this.votingService.formatDate(timestamp);
  }

  getTimeRemaining(election: Election): string {
    const now = Date.now() / 1000;
    
    if (now < election.startTime) {
      const diff = election.startTime - now;
      return this.formatTimeDiff(diff) + ' për të filluar';
    }
    
    if (now <= election.endTime) {
      const diff = election.endTime - now;
      return this.formatTimeDiff(diff) + ' për të përfunduar';
    }
    
    return 'Përfunduar';
  }

  private formatTimeDiff(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days} ditë`;
    if (hours > 0) return `${hours} orë`;
    return `${minutes} minuta`;
  }

  getStatusColor(election: Election): string {
    if (!election.isActive) return 'warn';
    
    const now = Date.now() / 1000;
    if (now < election.startTime) return 'accent';
    if (now <= election.endTime) return 'primary';
    return 'warn';
  }

  getVoteButtonText(election: ElectionWithStatus): string {
    if (!election.voterStatus?.eligible) return 'Nuk jeni i regjistruar';
    if (election.voterStatus?.hasVoted) return 'Keni votuar';
    if (!this.votingService.isElectionActive(election)) return 'Jo aktive';
    return 'Voto Tani';
  }

  canVote(election: ElectionWithStatus): boolean {
    return election.voterStatus?.canVote === true && 
           this.votingService.isElectionActive(election);
  }

  refresh() {
    this.loadElections();
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}