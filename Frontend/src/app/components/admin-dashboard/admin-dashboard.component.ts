import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { VotingService, Election } from '../../services/voting.service';
import { AuthService } from '../../services/auth.service';
import { CreateElectionDialogComponent } from '../create-election-dialog/create-election-dialog.component';
import { AddCandidateDialogComponent } from '../add-candidate-dialog/add-candidate-dialog.component';
import { Router, RouterLink } from '@angular/router';
import { SHARED_IMPORTS } from '../../../shared-imports';
import { RegisterVotersDialogComponent } from '../register-voter-dialog/register-voter-dialog.component';

@Component({
  selector: 'app-admin-dashboard',
  imports: [
    SHARED_IMPORTS,
    RouterLink
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit {
  elections: Election[] = [];
  loading = true;
  selectedElection: Election | null = null;
  displayedColumns: string[] = ['id', 'name', 'status', 'candidates', 'votes', 'period', 'actions'];
  
  stats = {
    totalElections: 0,
    activeElections: 0,
    totalVotes: 0,
    upcomingElections: 0
  };

  constructor(
    protected votingService: VotingService,
    private authService: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadElections();
    this.loadStats();
  }

  loadElections() {
    this.loading = true;
    this.votingService.getElections().subscribe({
      next: (elections) => {
        this.elections = elections.sort((a, b) => b.id - a.id);
        this.loading = false;
        this.calculateStats();
      },
      error: (error) => {
        console.error('Error loading elections:', error);
        this.snackBar.open('Dështoi ngarkimi i zgjedhjeve', 'OK', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  loadStats() {
    this.votingService.getBlockchainStatus().subscribe({
      next: (status) => {
        console.log('Blockchain status:', status);
      },
      error: (error) => {
        console.error('Error loading blockchain status:', error);
      }
    });
  }

  calculateStats() {
    this.stats.totalElections = this.elections.length;
    this.stats.activeElections = this.elections.filter(e => 
      this.votingService.isElectionActive(e)
    ).length;
    this.stats.upcomingElections = this.elections.filter(e => 
      this.votingService.isElectionUpcoming(e)
    ).length;
    this.stats.totalVotes = this.elections.reduce((sum, e) => sum + e.totalVotes, 0);
  }

  openCreateElectionDialog() {
    const dialogRef = this.dialog.open(CreateElectionDialogComponent, {
      width: '600px'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.createElection(result);
      }
    });
  }

  async createElection(data: any) {
    // Check if user is still logged in
    if (!this.authService.isAuthenticated()) {
      this.snackBar.open('Sesioni ka përfunduar. Ju lutem logohuni përsëri.', 'OK', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      this.router.navigate(['/login']);
      return;
    }
    
    this.loading = true;
    try {
      const txHash = await this.votingService.createElection(
        data.name,
        data.description,
        data.startTime,
        data.endTime
      );
      
      this.snackBar.open('Zgjedhja u krijua me sukses!', 'OK', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
      
      // Reload elections after creation
      setTimeout(() => this.loadElections(), 2000);
    } catch (error: any) {
      console.error('Error creating election:', error);
      
      let errorMessage = 'Dështoi krijimi i zgjedhjes';
      
      if (error.message?.includes('not authenticated')) {
        errorMessage = 'Ju lutem logohuni përsëri';
        this.router.navigate(['/login']);
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      this.snackBar.open(errorMessage, 'OK', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.loading = false;
    }
  }

  openAddCandidateDialog(election: Election) {
    const dialogRef = this.dialog.open(AddCandidateDialogComponent, {
      width: '500px',
      data: { electionId: election.id, electionName: election.name }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.addCandidate(election.id, result);
      }
    });
  }

  async addCandidate(electionId: number, data: any) {
    this.loading = true;
    try {
      const txHash = await this.votingService.addCandidate(
        electionId,
        data.name,
        data.party,
        data.imageUrl
      );
      
      this.snackBar.open('Kandidati u shtua me sukses!', 'OK', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
      
      this.loadElections();
    } catch (error: any) {
      console.error('Error adding candidate:', error);
      this.snackBar.open(
        error.message || 'Dështoi shtimi i kandidatit',
        'OK',
        { duration: 5000, panelClass: ['error-snackbar'] }
      );
    } finally {
      this.loading = false;
    }
  }

  openRegisterVotersDialog(election: Election) {
    const dialogRef = this.dialog.open(RegisterVotersDialogComponent, {
      width: '600px',
      data: { electionId: election.id, electionName: election.name }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.registerVoters(election.id, result.addresses);
      }
    });
  }

  async registerVoters(electionId: number, addresses: string[]) {
    this.loading = true;
    try {
      const txHash = await this.votingService.registerVoters(electionId, addresses);
      
      this.snackBar.open(
        `${addresses.length} votues u regjistruan me sukses!`,
        'OK',
        { duration: 3000, panelClass: ['success-snackbar'] }
      );
      
      this.loadElections();
    } catch (error: any) {
      console.error('Error registering voters:', error);
      this.snackBar.open(
        error.message || 'Dështoi regjistrimi i votuesve',
        'OK',
        { duration: 5000, panelClass: ['error-snackbar'] }
      );
    } finally {
      this.loading = false;
    }
  }

  viewResults(election: Election) {
    this.router.navigate(['/results', election.id]);
  }

  viewDetails(election: Election) {
    this.router.navigate(['/election', election.id]);
  }

  getStatusColor(election: Election): string {
    if (!election.isActive) return 'warn';
    if (this.votingService.isElectionActive(election)) return 'primary';
    if (this.votingService.isElectionUpcoming(election)) return 'accent';
    if (this.votingService.isElectionEnded(election)) return 'warn';
    return '';
  }

  getStatusText(election: Election): string {
    return this.votingService.getElectionStatusText(election);
  }

  formatDate(timestamp: number): string {
    return this.votingService.formatDate(timestamp);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}