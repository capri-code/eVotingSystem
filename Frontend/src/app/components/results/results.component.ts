import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { VotingService, ElectionResults, Candidate } from '../../services/voting.service';
import { WebSocketService } from '../../services/websocket.service';
import { Subscription, interval } from 'rxjs';
import { trigger, transition, style, animate } from '@angular/animations';
import { SHARED_IMPORTS } from '../../../shared-imports';

@Component({
  selector: 'app-results',
  imports: [
    SHARED_IMPORTS
  ],
  templateUrl: './results.component.html',
  styleUrl: './results.component.scss',
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(-100%)', opacity: 0 }),
        animate('500ms ease-in', style({ transform: 'translateX(0)', opacity: 1 }))
      ])
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms', style({ opacity: 1 }))
      ])
    ])
  ]
})

export class ResultsComponent implements OnInit, OnDestroy {
  electionId!: number;
  results: ElectionResults | null = null;
  loading = true;
  error: string | null = null;
  lastUpdate: Date = new Date();
  private subscriptions: Subscription[] = [];
  totalVotes = 0;
  leadingCandidate: Candidate | null = null;
  
  // Chart data
  chartLabels: string[] = [];
  chartData: number[] = [];
  chartColors: string[] = [];

  constructor(
    private route: ActivatedRoute,
    protected votingService: VotingService,
    private wsService: WebSocketService
  ) {}

  ngOnInit() {
    this.electionId = Number(this.route.snapshot.paramMap.get('id'));
    
    // Initial load
    this.loadResults();
    
    // Set up WebSocket connection for real-time updates
    this.setupWebSocket();
    
    // Fallback: Poll every 2.5 seconds if WebSocket fails
    const pollSubscription = interval(2500).subscribe(() => {
      if (!this.wsService.isConnected()) {
        this.loadResults();
      }
    });
    
    this.subscriptions.push(pollSubscription);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.wsService.disconnect();
  }

  private setupWebSocket() {
    // Only connect if election ID is valid
    if (this.electionId && this.electionId > 0) {
      const wsSubscription = this.wsService.connectToElectionResults(this.electionId)
        .subscribe({
          next: (data) => {
            // Check if it's an error message
            if (data.error) {
              console.log('WebSocket message:', data.error);
              // Don't update results if there's an error
              return;
            }
            
            this.updateResults(data);
            this.loading = false;
          },
          error: (error) => {
            console.error('WebSocket error:', error);
            // Fall back to polling
          }
        });
      
      this.subscriptions.push(wsSubscription);
    }
  }

  private loadResults() {
    this.votingService.getElectionResults(this.electionId).subscribe({
      next: (results) => {
        this.updateResults(results);
        this.loading = false;
      },
      error: (error) => {
        this.error = 'Failed to load results';
        this.loading = false;
        console.error(error);
      }
    });
  }

  private updateResults(data: any) {
    // Check if data has the expected structure
    if (!data || (!data.candidates && !data.election)) {
      console.log('Invalid data received:', data);
      return;
    }
    
    // Sort candidates by votes (highest first), then by ID for consistency in ties
    if (data.candidates && Array.isArray(data.candidates)) {
      data.candidates.sort((a: any, b: any) => {
        const voteDiff = (b.voteCount || 0) - (a.voteCount || 0);
        // If votes are equal, sort by ID to maintain consistent order
        if (voteDiff === 0) {
          return (a.id || 0) - (b.id || 0);
        }
        return voteDiff;
      });
    }
    
    this.results = data;
    this.lastUpdate = new Date();
    
    // Calculate total votes safely
    this.totalVotes = data.candidates ? data.candidates.reduce((sum: number, c: any) => sum + (c.voteCount || 0), 0) : 0;
    
    // Identify leading candidate(s) - handle ties
    if (data.candidates && data.candidates.length > 0) {
      const maxVotes = data.candidates[0].voteCount || 0;
      
      // Check if there's a tie
      const tiedCandidates = data.candidates.filter((c: any) => c.voteCount === maxVotes);
      
      if (tiedCandidates.length > 1) {
        // It's a tie
        this.leadingCandidate = null;
        this.isTie = true;
        this.tiedCandidates = tiedCandidates;
      } else {
        // Clear winner
        this.leadingCandidate = data.candidates[0];
        this.isTie = false;
        this.tiedCandidates = [];
      }
    } else {
      this.leadingCandidate = null;
      this.isTie = false;
      this.tiedCandidates = [];
    }
    
    // Update chart data
    this.updateChartData();
  }

  // Add these properties to the component
  isTie = false;
  tiedCandidates: Candidate[] = [];

  private updateChartData() {
    if (!this.results) return;
    
    this.chartLabels = this.results.candidates.map(c => c.name);
    this.chartData = this.results.candidates.map(c => c.voteCount);
    
    // Generate colors for each candidate
    this.chartColors = this.results.candidates.map((_, index) => {
      const colors = [
        '#3F51B5', '#E91E63', '#4CAF50', '#FF9800', 
        '#9C27B0', '#00BCD4', '#FFC107', '#795548'
      ];
      return colors[index % colors.length];
    });
  }

  getVotePercentage(candidate: Candidate): number {
    if (this.totalVotes === 0) return 0;
    return Math.round((candidate.voteCount / this.totalVotes) * 100);
  }

  getCandidatePosition(candidate: Candidate): number {
    if (!this.results) return 0;
    return this.results.candidates.findIndex(c => c.id === candidate.id) + 1;
  }

  getPositionIcon(position: number): string {
    switch (position) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${position}`;
    }
  }

  getProgressBarClass(position: number): string {
    switch (position) {
      case 1: return 'gold';
      case 2: return 'silver';
      case 3: return 'bronze';
      default: return 'default';
    }
  }

  isElectionActive(): boolean {
    return this.results ? this.votingService.isElectionActive(this.results.election) : false;
  }

  isElectionEnded(): boolean {
    return this.results ? this.votingService.isElectionEnded(this.results.election) : false;
  }

  formatDate(timestamp: number): string {
    return this.votingService.formatDate(timestamp);
  }

  refresh() {
    this.loading = true;
    this.loadResults();
  }
}