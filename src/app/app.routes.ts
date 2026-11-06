import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthApiService } from './auth/data-access/auth-api.service';
import { BracketsPageComponent } from './brackets/feature/brackets-page.component';
import { ActiveBracketPageComponent } from './brackets/feature/active-bracket-page.component';
import { FamilyMembersPageComponent } from './family-members/feature/family-members-page.component';
import { HistoryPageComponent } from './history/feature/history-page.component';
import { HomePageComponent } from './home/feature/home-page.component';
import { PlaylistsPageComponent } from './playlists/feature/playlists-page.component';
import { SongsPageComponent } from './songs/feature/songs-page.component';

const adminGuard: CanActivateFn = async () => {
  const authApi = inject(AuthApiService);
  const router = inject(Router);
  try {
    const user = await authApi.getCurrentUser();
    // Keep an unauthenticated deep link so an admin can sign in and continue
    // to the page they requested. The signed-out shell hides the routed view.
    return !user || user.role === 'owner' ? true : router.parseUrl('/brackets');
  } catch {
    return true;
  }
};

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'brackets' },
  { path: 'brackets/:bracketId', component: ActiveBracketPageComponent },
  { path: 'brackets', component: HomePageComponent },
  { path: 'history', component: HistoryPageComponent },
  { path: 'history/:bracketId', component: HistoryPageComponent },
  { path: 'manage/brackets/new', component: BracketsPageComponent, canActivate: [adminGuard], data: {pageMode:'add'}, title: 'Add bracket' },
  { path: 'manage/brackets/:id/edit', component: BracketsPageComponent, canActivate: [adminGuard], data: {pageMode:'edit'}, title: 'Edit bracket' },
  { path: 'manage/brackets', component: BracketsPageComponent, canActivate: [adminGuard], data: {pageMode:'list'}, title: 'Brackets' },
  { path: 'manage/family-members/new', component: FamilyMembersPageComponent, canActivate: [adminGuard], data: {pageMode:'add'}, title: 'Add family member' },
  { path: 'manage/family-members/:id/edit', component: FamilyMembersPageComponent, canActivate: [adminGuard], data: {pageMode:'edit'}, title: 'Edit family member' },
  { path: 'manage/family-members', component: FamilyMembersPageComponent, canActivate: [adminGuard], data: {pageMode:'list'}, title: 'Family members' },
  { path: 'manage/songs/new', component: SongsPageComponent, canActivate: [adminGuard], data: {pageMode:'add'}, title: 'Add song' },
  { path: 'manage/songs/:id/edit', component: SongsPageComponent, canActivate: [adminGuard], data: {pageMode:'edit'}, title: 'Edit song' },
  { path: 'manage/songs', component: SongsPageComponent, canActivate: [adminGuard], data: {pageMode:'list'}, title: 'Songs' },
  { path: 'manage/playlists/new', component: PlaylistsPageComponent, canActivate: [adminGuard], data: {pageMode:'add'}, title: 'Add playlist' },
  { path: 'manage/playlists/:id/edit', component: PlaylistsPageComponent, canActivate: [adminGuard], data: {pageMode:'edit'}, title: 'Edit playlist' },
  { path: 'manage/playlists', component: PlaylistsPageComponent, canActivate: [adminGuard], data: {pageMode:'list'}, title: 'Playlists' },
  { path: '**', redirectTo: 'brackets' }
];
