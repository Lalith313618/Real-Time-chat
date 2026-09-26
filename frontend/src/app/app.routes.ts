import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { UserSearchComponent } from './features/users/user-search/user-search.component';
import { UserProfileComponent } from './features/users/user-profile/user-profile.component';
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
    path: '**',
    redirectTo: ''
  }
];
