import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthApiService } from './auth/data-access/auth-api.service';
import { BracketInvitationPageComponent } from './brackets/feature/bracket-invitation-page.component';
import { HistoryPageComponent } from './history/feature/history-page.component';
import { HomePageComponent } from './home/feature/home-page.component';

const adminGuard: CanActivateFn = async () => {
  const authApi = inject(AuthApiService);
  const router = inject(Router);
  try {
    const user = await authApi.getCurrentUser();
    // Keep an unauthenticated deep link so an admin can sign in and continue
    // to the page they requested. The signed-out shell hides the routed view.
    return !user || user.role === 'owner' ? true : router.parseUrl('/home');
  } catch {
    return true;
  }
};

const loadBracketsPage = () => import('./brackets/feature/brackets-page.component').then(module => module.BracketsPageComponent);
const loadFamilyMembersPage = () => import('./family-members/feature/family-members-page.component').then(module => module.FamilyMembersPageComponent);
const loadSongsPage = () => import('./songs/feature/songs-page.component').then(module => module.SongsPageComponent);
const loadPlaylistsPage = () => import('./playlists/feature/playlists-page.component').then(module => module.PlaylistsPageComponent);

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: 'brackets/:bracketId', component: BracketInvitationPageComponent },
  { path: 'home', component: HomePageComponent, title: 'Welcome to The Song Showdown' },
  { path: 'brackets', pathMatch: 'full', redirectTo: 'home' },
  { path: 'history', component: HistoryPageComponent },
  { path: 'history/:bracketId', component: HistoryPageComponent },
  { path: 'manage/brackets/new', loadComponent: loadBracketsPage, canActivate: [adminGuard], data: {pageMode:'add'}, title: 'Add bracket' },
  { path: 'manage/brackets/:id/edit', loadComponent: loadBracketsPage, canActivate: [adminGuard], data: {pageMode:'edit'}, title: 'Edit bracket' },
  { path: 'manage/brackets', loadComponent: loadBracketsPage, canActivate: [adminGuard], data: {pageMode:'list'}, title: 'Brackets' },
  { path: 'manage/family-members/new', loadComponent: loadFamilyMembersPage, canActivate: [adminGuard], data: {pageMode:'add'}, title: 'Add family member' },
  { path: 'manage/family-members/:id/edit', loadComponent: loadFamilyMembersPage, canActivate: [adminGuard], data: {pageMode:'edit'}, title: 'Edit family member' },
  { path: 'manage/family-members', loadComponent: loadFamilyMembersPage, canActivate: [adminGuard], data: {pageMode:'list'}, title: 'Family members' },
  { path: 'manage/songs/new', loadComponent: loadSongsPage, canActivate: [adminGuard], data: {pageMode:'add'}, title: 'Add song' },
  { path: 'manage/songs/:id/edit', loadComponent: loadSongsPage, canActivate: [adminGuard], data: {pageMode:'edit'}, title: 'Edit song' },
  { path: 'manage/songs', loadComponent: loadSongsPage, canActivate: [adminGuard], data: {pageMode:'list'}, title: 'Songs' },
  { path: 'manage/playlists/new', loadComponent: loadPlaylistsPage, canActivate: [adminGuard], data: {pageMode:'add'}, title: 'Add playlist' },
  { path: 'manage/playlists/:id/edit', loadComponent: loadPlaylistsPage, canActivate: [adminGuard], data: {pageMode:'edit'}, title: 'Edit playlist' },
  { path: 'manage/playlists', loadComponent: loadPlaylistsPage, canActivate: [adminGuard], data: {pageMode:'list'}, title: 'Playlists' },
  { path: '**', redirectTo: 'home' }
];
