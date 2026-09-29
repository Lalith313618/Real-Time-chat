import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { UserSearchComponent } from './features/users/user-search/user-search.component';
import { UserProfileComponent } from './features/users/user-profile/user-profile.component';
import { OrganizationDashboardComponent } from './features/organization/organization-dashboard/organization-dashboard.component';
import { HomeComponent } from './features/home/home.component';
import { ChatComponent } from './features/chat/chat.component';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent
  },
  {
    path: 'auth/login',
    component: LoginComponent,
    canActivate: [guestGuard]
  },
  {
    path: 'auth/register',
    component: RegisterComponent,
    canActivate: [guestGuard]
  },
  {
    path: 'chat',
    component: ChatComponent,
    canActivate: [authGuard]
  },
  {
    path: 'chat/:id',
    component: ChatComponent,
    canActivate: [authGuard]
  },
  {
    path: 'users/search',
    component: UserSearchComponent,
    canActivate: [authGuard]
  },
  {
    path: 'users/profile',
    component: UserProfileComponent,
    canActivate: [authGuard]
  },
  {
    path: 'organization',
    component: OrganizationDashboardComponent,
    canActivate: [authGuard]
  },
  {
    path: 'teams',
    loadComponent: () => import('./features/teams/team-list/team-list.component').then(m => m.TeamListComponent),
    canActivate: [authGuard]
  },
  {
    path: 'teams/:teamId/channels/:channelId',
    loadComponent: () => import('./features/teams/channel-chat/channel-chat.component').then(m => m.ChannelChatComponent),
    canActivate: [authGuard]
  },
  {
    path: 'teams/:teamId/channels',
    loadComponent: () => import('./features/teams/channel-chat/channel-chat.component').then(m => m.ChannelChatComponent),
    canActivate: [authGuard]
  },
  {
    path: 'tasks',
    loadComponent: () => import('./features/tasks/task-board/task-board.component').then(m => m.TaskBoardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'notifications',
    loadComponent: () => import('./features/notifications/notification-center/notification-center.component').then(m => m.NotificationCenterComponent),
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
