import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { VotingService, Election } from '../../services/voting.service';
import { AuthService } from '../../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SHARED_IMPORTS } from '../../../shared-imports';

@Component({
  selector: 'app-election-list',
  imports: [
    SHARED_IMPORTS,
  ],
  templateUrl: './election-list.component.html',
  styleUrl: './election-list.component.scss'
})
export class ElectionListComponent implements OnInit {
  elections: Election[] = [];
  filteredElections: Election[] = [];
  loading = true;
  searchTerm = '';
  filterStatus: 'all' | 'active' | 'upcoming' | 'ended' = 'all';
  sortBy: 'newest' | 'oldest' | 'name' | 'votes' = 'newest';
  viewMode: 'grid' | 'list' = 'grid';
  
  constructor(
    protected votingService: VotingService,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadElections();
  }

  loadElections() {
    this.loading = true;
    
    this.votingService.getElections().subscribe({
      next: (elections) => {
        this.elections = elections;
        this.applyFilters();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading elections:', error);
        this.snackBar.open('Dështoi ngarkimi i zgjedhjeve', 'OK', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
        this.loading = false;
      }
    });
  }

  applyFilters() {
    let filtered = [...this.elections];
    
    // Apply search filter
    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(e => 
        e.name.toLowerCase().includes(search) ||
        e.description.toLowerCase().includes(search)
      );
    }
    
    // Apply status filter
    const now = Date.now() / 1000;
    switch (this.filterStatus) {
      case 'active':
        filtered = filtered.filter(e => 
          e.isActive && now >= e.startTime && now <= e.endTime
        );
        break;
      case 'upcoming':
        filtered = filtered.filter(e => 
          e.isActive && now < e.startTime
        );
        break;
      case 'ended':
        filtered = filtered.filter(e => 
          !e.isActive || now > e.endTime
        );
        break;
    }
    
    // Apply sorting
    switch (this.sortBy) {
      case 'newest':
        filtered.sort((a, b) => b.id - a.id);
        break;
      case 'oldest':
        filtered.sort((a, b) => a.id - b.id);
        break;
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'votes':
        filtered.sort((a, b) => b.totalVotes - a.totalVotes);
        break;
    }
    
    this.filteredElections = filtered;
  }

  onSearchChange() {
    this.applyFilters();
  }

  onFilterChange(filter: 'all' | 'active' | 'upcoming' | 'ended') {
    this.filterStatus = filter;
    this.applyFilters();
  }

  onSortChange(sort: 'newest' | 'oldest' | 'name' | 'votes') {
    this.sortBy = sort;
    this.applyFilters();
  }

  toggleViewMode() {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
  }

  viewElection(election: Election) {
    this.router.navigate(['/election', election.id]);
  }

  viewResults(election: Election) {
    this.router.navigate(['/results', election.id]);
  }

  voteInElection(election: Election) {
    if (this.votingService.isElectionActive(election)) {
      this.router.navigate(['/vote', election.id]);
    } else {
      this.snackBar.open('Kjo zgjedhje nuk është aktive', 'OK', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
    }
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

  getStatusColor(election: Election): string {
    const now = Date.now() / 1000;
    
    if (!election.isActive) return 'warn';
    if (now < election.startTime) return 'accent';
    if (now <= election.endTime) return 'primary';
    return 'warn';
  }

  getTimeInfo(election: Election): string {
    const now = Date.now() / 1000;
    
    if (now < election.startTime) {
      const diff = election.startTime - now;
      const days = Math.floor(diff / 86400);
      if (days > 0) return `Fillon pas ${days} ditësh`;
      const hours = Math.floor(diff / 3600);
      return `Fillon pas ${hours} orësh`;
    }
    
    if (now <= election.endTime) {
      const diff = election.endTime - now;
      const days = Math.floor(diff / 86400);
      if (days > 0) return `${days} ditë të mbetura`;
      const hours = Math.floor(diff / 3600);
      return `${hours} orë të mbetura`;
    }
    
    return 'Përfunduar';
  }
}
