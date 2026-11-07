import { apiErrorMessage } from '../../shared/data-access/api-client';
import {ActivatedRoute,Router} from '@angular/router';
import {Subscription} from 'rxjs';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SongsApiService } from '../data-access/songs-api.service';
import { SongInput, SongRecord } from '../data-access/song.model';

@Component({
  selector: 'app-songs-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './songs-page.component.html'
})
export class SongsPageComponent implements OnInit, OnDestroy {
  constructor(private readonly route:ActivatedRoute,private readonly router:Router,private readonly changeDetector:ChangeDetectorRef,private readonly songsApi: SongsApiService) {}

  songs: SongRecord[] = [];
  filteredSongs: SongRecord[] = [];
  draft = this.emptyDraft();
  editingId: number | null = null;
  searchTerm = '';
  loading = true;
  saving = false;
  error = '';
  success = '';

  get pageMode():'list'|'add'|'edit' {return this.route.snapshot.data['pageMode']??'list';}
  private routeSubscription?:Subscription;
  private readController = new AbortController();
  private routeVersion = 0;
  ngOnInit():void {
    this.success=window.history.state?.message??'';
    this.routeSubscription=this.route.paramMap.subscribe(()=>{void this.loadRoute();});
  }
  ngOnDestroy():void {this.routeSubscription?.unsubscribe();this.readController.abort();++this.routeVersion;}
  private async loadRoute():Promise<void> {
    const version = ++this.routeVersion;
    this.editingId=null;this.draft=this.emptyDraft();
    await this.loadSongs();
    if (version !== this.routeVersion || this.readController.signal.aborted) return;
    if(this.pageMode==='edit'&&!this.error) {
      const id=Number(this.route.snapshot.paramMap.get('id'));
      const item=this.songs.find(item=>item.songId===id);
      if(item)this.populateDraft(item);else this.error='The requested song was not found.';
    }
    this.changeDetector.markForCheck();
  }
  add():void {void this.router.navigate(['/manage/songs/new']);}
  edit(song:SongRecord):void {void this.router.navigate(['/manage/songs',song.songId,'edit']);}


  async loadSongs(): Promise<void> {
    this.readController.abort();
    const controller = this.readController = new AbortController();
    this.loading = true;
    try {
      const items = await this.songsApi.getAll(controller.signal);
      if (controller.signal.aborted) return;
      this.songs = items;
      this.filterSongs();
      if (!controller.signal.aborted) this.error = '';
    } catch (error) {
      if (!controller.signal.aborted) this.error = apiErrorMessage(error, 'Could not load songs.');
    } finally { if (!controller.signal.aborted) {this.loading = false;this.changeDetector.markForCheck();} }
  }

  filterSongs(): void {
    const query = this.searchTerm.trim().toLocaleLowerCase();
    this.filteredSongs = this.songs.filter(song => `${song.title} ${song.artist} ${song.album ?? ''} ${song.category ?? ''}`.toLocaleLowerCase().includes(query));
  }

  private populateDraft(song: SongRecord): void {
    this.editingId = song.songId;
    this.draft = {
      artist: song.artist,
      title: song.title,
      album: song.album ?? '',
      year: song.year?.toString() ?? '',
      category: song.category ?? '',
      youtubeUrl: song.youtubeUrl ?? '',
      spotifyUrl: song.spotifyUrl ?? ''
    };
    this.success = '';
  }

  cancelEdit():void {if(!this.saving)void this.router.navigate(['/manage/songs']);}

  async saveSong(): Promise<void> {
    if(this.saving||this.loading||this.pageMode==='list'||(this.pageMode==='edit'&&this.editingId===null))return;
    this.saving = true;
    this.error = '';
    this.success = '';
    const body: SongInput = { ...this.draft, year: this.draft.year ? Number(this.draft.year) : null };
    try {
      if (this.editingId === null) await this.songsApi.create(body);
      else await this.songsApi.update(this.editingId, body);
      this.success = this.editingId === null ? 'Song added to the catalog.' : 'Song updated.';
      await this.router.navigate(['/manage/songs'],{state:{message:this.success}});
    } catch (error) { this.error = apiErrorMessage(error, 'Could not save this song.'); }
    finally { this.saving = false;this.changeDetector.markForCheck(); }
  }

  async deleteSong(song: SongRecord): Promise<void> {
    if (!window.confirm(`Delete “${song.title}” by ${song.artist}? Songs already used in brackets cannot be deleted.`)) return;
    this.error = '';
    try {
      await this.songsApi.remove(song.songId);
      if (this.editingId === song.songId) this.cancelEdit();
      this.success = 'Song deleted from the catalog.';
      await this.loadSongs();
    } catch (error) { this.error = apiErrorMessage(error, 'Could not delete this song.'); }
  }

  private emptyDraft(): { artist: string; title: string; album: string; year: string; category: string; youtubeUrl: string; spotifyUrl: string } {
    return { artist: '', title: '', album: '', year: '', category: '', youtubeUrl: '', spotifyUrl: '' };
  }
}
