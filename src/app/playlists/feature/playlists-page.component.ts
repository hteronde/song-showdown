import {ActivatedRoute,Router} from '@angular/router';
import {Subscription} from 'rxjs';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlaylistBracket, PlaylistInput, PlaylistRecord } from '../data-access/playlist.model';
import { PlaylistsApiService } from '../data-access/playlists-api.service';

@Component({
  selector: 'app-playlists-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './playlists-page.component.html'
})
export class PlaylistsPageComponent implements OnInit, OnDestroy {
  constructor(private readonly route:ActivatedRoute,private readonly router:Router,private readonly changeDetector:ChangeDetectorRef,private readonly playlistsApi: PlaylistsApiService) {}

  playlists: PlaylistRecord[] = [];
  brackets: PlaylistBracket[] = [];
  draft = this.emptyDraft();
  editingId: number | null = null;
  loading = true;
  saving = false;
  error = '';
  success = '';

  get selectedBracket(): PlaylistBracket | undefined {
    return this.brackets.find(bracket => bracket.bracketId === this.draft.bracketId);
  }

  get pageMode():'list'|'add'|'edit' {return this.route.snapshot.data['pageMode']??'list';}
  private routeSubscription?:Subscription;
  ngOnInit():void {
    this.success=window.history.state?.message??'';
    this.routeSubscription=this.route.paramMap.subscribe(()=>{void this.loadRoute();});
  }
  ngOnDestroy():void {this.routeSubscription?.unsubscribe();}
  private async loadRoute():Promise<void> {
    this.editingId=null;this.draft=this.emptyDraft();
    await this.loadData();
    if(this.pageMode==='edit'&&!this.error) {
      const id=Number(this.route.snapshot.paramMap.get('id'));
      const item=this.playlists.find(item=>item.playlistId===id);
      if(item)this.populateDraft(item);else this.error='The requested playlist was not found.';
    }
    this.changeDetector.markForCheck();
  }
  add():void {void this.router.navigate(['/manage/playlists/new']);}
  edit(playlist:PlaylistRecord):void {void this.router.navigate(['/manage/playlists',playlist.playlistId,'edit']);}


  async loadData(): Promise<void> {
    this.loading = true;
    try {
      [this.playlists, this.brackets] = await Promise.all([
        this.playlistsApi.getAll(),
        this.playlistsApi.getBrackets()
      ]);
      if (this.draft.bracketId === null && this.brackets.length) {
        this.draft.bracketId = this.brackets[0].bracketId;
      }
      this.error = '';
    } catch (error) {
      this.error = this.errorMessage(error, 'Could not load playlists.');
    } finally {
      this.loading = false;this.changeDetector.markForCheck();
    }
  }

  onBracketChange(): void {
    this.draft.weekId = null;
  }

  private populateDraft(playlist: PlaylistRecord): void {
    this.editingId = playlist.playlistId;
    this.draft = {
      bracketId: playlist.bracketId,
      weekId: playlist.weekId,
      playlistName: playlist.playlistName,
      playlistUrl: playlist.playlistUrl
    };
    this.success = '';
  }

  cancelEdit():void {if(!this.saving)void this.router.navigate(['/manage/playlists']);}

  async savePlaylist(): Promise<void> {
    if(this.saving||this.loading||this.pageMode==='list'||(this.pageMode==='edit'&&this.editingId===null))return;
    if (this.draft.bracketId === null) {
      this.error = 'Create a bracket before adding a playlist.';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    const body: PlaylistInput = { ...this.draft, bracketId: this.draft.bracketId };
    try {
      if (this.editingId === null) await this.playlistsApi.create(body);
      else await this.playlistsApi.update(this.editingId, body);
      this.success = this.editingId === null ? 'Playlist added.' : 'Playlist updated.';
      await this.router.navigate(['/manage/playlists'],{state:{message:this.success}});
    } catch (error) {
      this.error = this.errorMessage(error, 'Could not save this playlist.');
    } finally {
      this.saving = false;this.changeDetector.markForCheck();
    }
  }

  async deletePlaylist(playlist: PlaylistRecord): Promise<void> {
    if (!window.confirm(`Delete the playlist “${playlist.playlistName}”?`)) return;
    this.error = '';
    this.success = '';
    try {
      await this.playlistsApi.remove(playlist.playlistId);
      if (this.editingId === playlist.playlistId) this.cancelEdit();
      this.success = 'Playlist deleted.';
      await this.loadData();
    } catch (error) {
      this.error = this.errorMessage(error, 'Could not delete this playlist.');
    }
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof TypeError
      ? 'The database API is unavailable. Start it with npm run start:api.'
      : error instanceof Error ? error.message : fallback;
  }

  private emptyDraft(): { bracketId: number | null; weekId: number | null; playlistName: string; playlistUrl: string } {
    return { bracketId: null, weekId: null, playlistName: '', playlistUrl: '' };
  }
}
