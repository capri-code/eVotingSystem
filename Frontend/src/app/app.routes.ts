import { Routes } from '@angular/router';
import { ResultsComponent } from './components/results/results.component';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { AuthGuard } from './guards/auth.guard';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard.component';
import { AdminGuard } from './guards/admin.guard';
import { ElectionListComponent } from './components/election-list/election-list.component';
import { VotingComponent } from './components/voting/voting.component';
import { ElectionDetailsComponent } from './components/election-details/election-details.component';

export const routes: Routes = [
    { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { 
    path: 'dashboard', 
    component: DashboardComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'admin', 
    component: AdminDashboardComponent, 
    canActivate: [AuthGuard, AdminGuard] 
  },
  { 
    path: 'elections', 
    component: ElectionListComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'election/:id', 
    component: ElectionDetailsComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'vote/:id', 
    component: VotingComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'results/:id', 
    component: ResultsComponent 
  },
  { path: '**', redirectTo: '/login' }
];
