import {ActivatedRoute,Router} from '@angular/router';
import {Location} from '@angular/common';
import {Subscription} from 'rxjs';
import { SessionSettings, previewSessionSchedule, sessionTimingKey } from './session-schedule';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BracketsApiService } from '../data-access/brackets-api.service';
import { SessionPlaylist, BracketSession, BracketSessionsData, BracketInput, BracketParticipant, BracketRecord, BracketSong, BracketAlbum, TiebreakerOption, RandomizationMode } from '../data-access/bracket.model';

@Component({
  selector: 'app-brackets-page', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './brackets-page.component.html', styles: [`
    :host{display:block;padding:32px 40px;color:#26352e}.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}.head h1{font-size:28px;margin:0}.primary,.save{background:#294d3d;color:white;border:0;border-radius:7px;padding:11px 16px;font-weight:650;cursor:pointer}.list{display:grid;gap:12px}.card,.form-card{background:#fff;border:1px solid #e5e9e5;border-radius:10px;padding:18px 20px}.card{display:flex;align-items:center;justify-content:space-between}.card h2{margin:0 0 5px;font-size:17px}.muted{color:#78847d;font-size:13px}.actions{display:flex;gap:8px}.actions button:disabled,.cancel:disabled{opacity:.5;cursor:not-allowed}.form-head{gap:12px;flex-wrap:wrap}.actions button,.cancel{border:1px solid #dce2dd;background:white;border-radius:6px;padding:8px 12px;cursor:pointer;color:#304138}.form-card{max-width:900px}.form-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.form-head h2{margin:0}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.field{display:flex;flex-direction:column;gap:6px}.field label,.participant-label{font-size:13px;font-weight:650;color:#43544b}.field input,.field select,.field textarea{font:inherit;padding:10px;border:1px solid #d9e0da;border-radius:6px;background:#fff}.field textarea{min-height:210px;resize:vertical}.field input.invalid-control,.field textarea.invalid-control,.participants.invalid-control{border-color:#c83b32}.field-error{color:#b42318;font-size:12px;line-height:1.4;margin:0}.wide{grid-column:1/-1}.hint{font-size:12px;color:#78847d}.participants{border:1px solid #d9e0da;border-radius:7px;padding:8px;max-height:190px;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.participants label{font-size:14px;padding:5px}.footer{display:flex;gap:10px;margin-top:18px}.error{margin:0 0 15px;padding:11px 14px;background:#fff0ed;border:1px solid #f0c5bc;color:#9f3324;border-radius:7px}.success{margin:0 0 15px;padding:11px 14px;background:#edf6ee;border:1px solid #c8dfc9;color:#315b3a;border-radius:7px}.empty{padding:28px;background:#fff;border-radius:9px;color:#78847d}@media(max-width:700px){:host{padding:22px 16px}.form-grid{grid-template-columns:1fr}.wide{grid-column:auto}.card{align-items:flex-start;gap:12px;flex-direction:column}}
    .song-entry{margin-top:24px;padding:20px;border:1px solid #e5e3db;border-radius:5px;background:#fcfbf8}.song-entry h3{margin:7px 0 18px;font-size:16px;color:#30312b}.song-entry .stat-label{font:8px 'DM Mono',monospace;color:#9c9a8f}.song-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.song-fields label{display:flex;flex-direction:column;gap:6px;font:8px 'DM Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:#828176}.song-fields input,.song-fields select{min-width:0;padding:10px;border:1px solid #e3e1d9;border-radius:3px;font:11px 'DM Sans',sans-serif}.add-song{margin-top:14px;background:#34352e;color:white;border:0;border-radius:3px;padding:11px 15px;font:9px 'DM Mono',monospace;cursor:pointer}.added-songs{padding:0;list-style:none}.added-songs li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #e5e3db}.added-songs small{display:block;color:#828176;margin-top:4px}@media(max-width:700px){.song-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:420px){.song-fields{grid-template-columns:1fr}}
    .song-dialog{box-sizing:border-box;width:min(960px,calc(100vw - 32px));max-height:calc(100dvh - 40px);overflow-y:auto;padding:24px 20px;border:1px solid #e5e3db;border-radius:5px;background:#fcfbf8;color:#30312b;box-shadow:0 20px 70px #24251e33}.song-dialog::backdrop{background:#24251e80}.song-dialog h3{margin:7px 0 18px;font:600 16px 'Space Grotesk',sans-serif}.song-dialog .stat-label{font:8px 'DM Mono',monospace;letter-spacing:.08em;color:#9c9a8f}.song-modal-actions,.song-row-actions{display:flex;align-items:center;gap:8px}.song-modal-actions{margin-top:14px}.song-modal-actions .add-song{margin-top:0}.song-dialog .song-fields input,.song-dialog .song-fields select{height:36px;box-sizing:border-box;background:#fff;color:#30312b}.song-dialog .song-fields input::placeholder{color:#aaa}.song-dialog .song-fields label{font-size:8px}.song-row-actions{flex-shrink:0}.added-songs li>div:first-child{min-width:0;overflow-wrap:anywhere}@media(max-width:420px){.added-songs li{align-items:flex-start;flex-direction:column}}
    .finale-session-summary{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;padding:16px;border:1px solid #d3decd;border-radius:6px;background:#edf3e9;margin-top:12px}.finale-session-summary strong{display:block;font-size:14px;color:#334a43}.finale-session-summary small{display:block;margin-top:5px;font-size:12px;color:#65765f}.finale-session-date{text-align:right}.finale-session-date span{display:block;font-size:11px;color:#65765f;margin-bottom:5px}@media(max-width:500px){.finale-session-summary{grid-template-columns:1fr}.finale-session-date{text-align:left}}
    .session-toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:1100;box-sizing:border-box;width:max-content;max-width:calc(100vw - 32px);display:flex;align-items:flex-start;gap:16px;padding:14px 18px;border:1px solid #7ca184;border-radius:7px;background:#edf6ee;color:#315b3a;box-shadow:0 6px 25px #24251e33;font:14px/1.5 'DM Sans',sans-serif}.session-toast span{max-width:700px;overflow-wrap:anywhere}.session-toast.toast-error{background:#fff0ed;border-color:#c83b32;color:#9f3324}.session-toast button{border:0;background:none;color:inherit;padding:0 3px;font-size:23px;line-height:1;cursor:pointer;flex:none}.session-toast button:focus-visible{outline:2px solid currentColor;outline-offset:3px}
    .session-settings-dialog .form-head h3{margin:0}.session-settings-dialog>.hint{margin-bottom:20px}
    .manage-sessions{margin-top:24px;border-top:1px solid #e5e3db;padding-top:20px}.manage-sessions h3{margin:6px 0 12px}.session-list{display:grid;gap:12px}.session-row{display:grid;grid-template-columns:minmax(120px,1fr) minmax(0,1.3fr) minmax(0,1.3fr);gap:12px;align-items:center;border:1px solid #e5e3db;border-radius:6px;padding:12px}.session-row strong{display:block;font-size:13px}.session-row small{display:block;font-size:11px;color:#78847d;margin-top:4px}.session-row label{display:flex;flex-direction:column;gap:6px;font-size:12px}.session-row input{box-sizing:border-box;width:100%;min-width:0;padding:8px;border:1px solid #d9e0da;border-radius:5px;font:inherit;background:white}.session-date-actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}@media(max-width:650px){.session-row{grid-template-columns:1fr}.session-row input{min-height:40px}}
    .form-error-banner{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:1000;box-sizing:border-box;width:max-content;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overflow-y:auto;display:flex;align-items:flex-start;gap:18px;padding:14px 18px;border:1px solid #c83b32;border-radius:7px;background:#fff0ed;color:#9f3324;box-shadow:0 6px 25px #24251e33;font-size:14px;line-height:1.5}.form-error-banner span{max-width:760px;overflow-wrap:anywhere}.form-error-banner button{flex:none;border:0;background:none;color:inherit;padding:0 3px;font-size:23px;line-height:1;cursor:pointer}.form-error-banner button:focus-visible{outline:2px solid #9f3324;outline-offset:3px}
    .seed-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.seed-help-link{border:0;padding:2px 0;background:none;color:#a96244;text-decoration:underline;text-underline-offset:3px;font:12px 'DM Sans',sans-serif;cursor:pointer}.seed-help-link:focus-visible{outline:2px solid #66816a;outline-offset:3px}.seed-help-dialog{max-width:640px}.seed-help-dialog p{font-size:13px;line-height:1.65;color:#656b61}.seed-help-dialog h4{font:600 14px 'Space Grotesk',sans-serif;margin:20px 0 8px}.seed-heading label{margin:0}
    .matchup-order-note{padding:12px 14px;border-left:3px solid #a96244;background:#f4eee5;color:#645344;font-size:13px;line-height:1.5}.matchup-pairs li>div:first-of-type{min-width:0;overflow-wrap:anywhere}.matchup-pairs li{position:relative;margin:0;padding:14px;border:1px solid #dcd8cb;background:white}.matchup-pairs li.pair-start{margin-top:14px;padding-top:36px;border-bottom:0;border-radius:6px 6px 0 0}.matchup-pairs li.pair-end{padding-top:22px;border-top:0;border-radius:0 0 6px 6px}.matchup-pairs li.pair-start:last-child{border-bottom:1px solid #dcd8cb;border-radius:6px}.pair-label{position:absolute;top:12px;left:14px;font:10px 'DM Mono',monospace;letter-spacing:.08em;color:#a96244}.pair-versus{position:absolute;top:0;left:14px;right:14px;display:flex;align-items:center;gap:8px;font:9px 'DM Mono',monospace;color:#9c9a8f}.pair-versus::before,.pair-versus::after{content:'';height:1px;background:#e5e3db;flex:1}
    .seeding-toolbar{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-bottom:16px}.seeding-toolbar label{display:flex;flex-direction:column;gap:6px;font-size:12px}.seeding-toolbar input,.seeding-toolbar select{padding:9px;border:1px solid #d9e0da;border-radius:5px;background:white;font:inherit}.seeding-toolbar .add-song{margin:0}.seeding-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.seeding-group{padding:12px;border:1px solid #d9e0da;border-radius:6px;background:#fff;min-width:0}.seeding-group.incomplete{border-color:#d6ad87}.seeding-group h4{margin:0 0 12px;font-size:14px}.seeding-group h4 small{font-weight:400;color:#78847d}.seeding-song{display:flex;align-items:flex-start;gap:8px;padding:9px 0;border-top:1px solid #eeece5;font-size:13px;overflow-wrap:anywhere}.seeding-song input{flex:none;accent-color:#294d3d}.seeding-song small{display:block;color:#78847d;margin-top:3px}.seeding-warning{padding:10px;background:#f8f2e9;border:1px solid #e4d6c2;border-radius:5px;font-size:12px}.seeding-toolbar button:disabled{opacity:.5;cursor:not-allowed}
    .seed-distribution{display:flex;flex-wrap:wrap;gap:6px}.seed-distribution span{padding:5px 8px;border:1px solid #c8dfc9;border-radius:4px;background:#edf6ee;font-size:11px}.seed-distribution .seed-incomplete{border-color:#e4d6c2;background:#f8f2e9}.seed-assignment{display:flex;align-items:center;gap:6px;font-size:12px}.seed-assignment select{padding:7px;border:1px solid #d9e0da;border-radius:5px;background:white}.song-row-actions{flex-wrap:wrap}
    .participant-email-row{display:grid;grid-template-columns:minmax(110px,1fr) minmax(0,2fr);align-items:center;gap:12px;padding:10px;border-bottom:1px solid #e5e3db;min-width:0}.participant-email-row>label{display:flex;align-items:center;gap:7px;min-width:0;overflow-wrap:anywhere}.participant-email-row input[type=checkbox]{flex:none;margin:0}.participant-email-row input[type=email]{box-sizing:border-box;width:100%;min-width:0;padding:8px;border:1px solid #d9e0da;border-radius:5px;font:inherit;font-size:13px}.participants-dialog .participants{grid-template-columns:1fr}

    .participant-summary{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;font-size:13px;color:#43544b}.participants-dialog{max-width:600px}.participants-dialog .participants{max-height:50dvh}.participants-dialog .hint{margin-top:14px}@media(max-width:420px){.participants-dialog .participants{grid-template-columns:1fr}}
    .playlist-song-list{padding:0;list-style:none;margin:12px 0}.playlist-song-list li{padding:10px 0;border-bottom:1px solid #e5e3db;font-size:13px;line-height:1.7}.playlist-song-list small{display:block;color:#78847d;font-size:10px}.playlist-song-list .versus{margin:0 8px;color:#9c9a8f;font:10px 'DM Mono',monospace}
    .playlist-session{padding:14px;border:1px solid #e5e3db;border-radius:6px;margin:12px 0}.playlist-session h4{margin:0 0 4px;font-size:14px}.playlist-session .song-fields{grid-template-columns:1fr 2fr;margin-top:12px}@media(max-width:600px){.playlist-session .song-fields{grid-template-columns:1fr}}
    .album-cover-thumb{width:48px;height:48px;object-fit:cover;border-radius:3px;flex:none}.album-list-info{display:flex;align-items:center;gap:12px;min-width:0}.album-list-info strong{font-size:13px}.album-preview{width:120px;max-width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px;margin-top:14px}
    .anonymous-field label{display:flex;flex-direction:row;align-items:center;gap:8px}.anonymous-field input{accent-color:#294d3d;width:16px;height:16px;padding:0;margin:0}
    .randomization-choice{display:flex;align-items:flex-start;gap:10px;border:1px solid #e5e3db;border-radius:5px;padding:16px;margin:12px 0;cursor:pointer}.randomization-choice input{margin-top:3px;accent-color:#294d3d}.randomization-choice strong{display:block;font-size:14px;margin-bottom:6px}.randomization-choice small{display:block;font-size:12px;line-height:1.6;color:#78847d}.randomization-summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  `]
})
export class BracketsPageComponent implements OnInit, OnDestroy {
  constructor(private readonly route:ActivatedRoute,private readonly router:Router,private readonly location:Location,private readonly bracketsApi: BracketsApiService, private readonly changeDetector: ChangeDetectorRef) {}

  brackets: BracketRecord[] = [];
  members: BracketParticipant[] = [];
  loading = true; saving = false; error = ''; success = '';
  private currentEditingId:number|null=null;
  get editingId():number|null {return this.currentEditingId;}
  set editingId(id:number|null) {
    this.currentEditingId=id;
    if(id!==null && this.pageMode==='add')this.location.replaceState(`/manage/brackets/${id}/edit`);
  }
  get pageMode():'list'|'add'|'edit' {return this.route.snapshot.data['pageMode']??'list';}
  private routeSubscription?:Subscription;
  formOpen = false;
  showValidationErrors = false;
  validationBannerDismissed=false;
  get formErrorMessage(): string { return this.error || (this.showValidationErrors && !this.validationBannerDismissed ? Object.values(this.fieldErrors).join(' ') : ''); }
  dismissFormError(): void {this.error='';this.validationBannerDismissed=true;}
  fieldErrors: Partial<Record<'title' | 'artist' | 'startAt' | 'participants' | 'songList', string>> = {};
  logoUrl = '';
  title = ''; artist = ''; songCount = 16; songList = '';
  albums: BracketAlbum[] = [];
  albumDraft: Omit<BracketAlbum,'albumId'> & {albumId?:number} = {title:'',year:null,albumCoverUrl:''};
  albumSaving=false;
  albumError='';
  @ViewChild('albumsManagerDialog') albumsManagerDialog?:ElementRef<HTMLDialogElement>;
  openAlbumsManager():void {this.albumsManagerDialog?.nativeElement.showModal();}
  closeAlbumsManager():void {if(!this.albumSaving&&!this.albumRemoving)this.albumsManagerDialog?.nativeElement.close();}
  albumToRemove:BracketAlbum|null=null;
  albumRemoving=false;albumRemovalError='';
  @ViewChild('removeAlbumDialog') removeAlbumDialog?:ElementRef<HTMLDialogElement>;
  removeAlbum(album:BracketAlbum):void {this.albumToRemove=album;this.albumRemovalError='';this.removeAlbumDialog?.nativeElement.showModal();}
  closeAlbumRemoval():void {if(!this.albumRemoving){this.removeAlbumDialog?.nativeElement.close();this.albumToRemove=null;}}
  async confirmRemoveAlbum():Promise<void> {
    if(!this.editingId||!this.albumToRemove||this.albumRemoving)return;
    this.albumRemoving=true;this.albumRemovalError='';
    try {
      const result=await this.bracketsApi.removeAlbum(this.editingId,this.albumToRemove.albumId);
      this.albums=result.albums;const affected=new Set(result.affectedSongIds);
      this.songs=this.songs.map(song=>song.bracketSongId!=null&&affected.has(song.bracketSongId)?{...song,albumId:null,album:'',year:null,albumCoverUrl:''}:song);
      this.syncSongs();this.removeAlbumDialog?.nativeElement.close();this.albumToRemove=null;this.showSessionToast('Album Removed','success');this.success='Album removed.';
    }catch(error){this.albumRemovalError=this.message(error);}
    finally{this.albumRemoving=false;this.changeDetector.markForCheck();}
  }
  @ViewChild('albumDialog') albumDialog?: ElementRef<HTMLDialogElement>;
  openAlbumModal(album?:BracketAlbum): void {
    this.albumDraft=album ? {...album} : {title:'',year:null,albumCoverUrl:''};this.albumError='';
    this.albumDialog?.nativeElement.showModal();
  }
  closeAlbumModal(): void { if(!this.albumSaving) this.albumDialog?.nativeElement.close(); }
  async saveAlbum(): Promise<void> {
    if(this.albumSaving) return;
    this.albumSaving=true;this.albumError='';
    try {
      const result=await this.bracketsApi.saveAlbum(this.editingId,this.albumDraft,this.title,this.artist);
      this.editingId=result.bracketId;this.albums=result.albums;
      this.songs=this.songs.map(song=>this.songWithAlbum(song));this.syncSongs();
      this.albumDialog?.nativeElement.close();this.showSessionToast('Album Saved','success');this.success='Album saved. Its details are shared by every linked song in this bracket.';
    } catch(error) {this.albumError=this.message(error);}
    finally {this.albumSaving=false;this.changeDetector.markForCheck();}
  }
  private songWithAlbum(song:BracketSong):BracketSong {
    const album=this.albums.find(album=>album.albumId===song.albumId);
    return album ? {...song,album:album.title,year:album.year,albumCoverUrl:album.albumCoverUrl??''} : song;
  }
  @ViewChild('seedHelpDialog') seedHelpDialog?: ElementRef<HTMLDialogElement>;
  openSeedHelp(): void {this.seedHelpDialog?.nativeElement.showModal();}
  closeSeedHelp(): void {this.seedHelpDialog?.nativeElement.close();}
  @ViewChild('seedingDialog') seedingDialog?: ElementRef<HTMLDialogElement>;
  seedingDraft: (number|null)[] = [];
  seedingSelected = new Set<number>();
  seedingSearch = '';
  seedingTarget: number|null = 1;
  openSeeding(): void {
    this.modalErrors['seeding']='';this.seedingDraft=this.songs.map(song=>song.assignedSeed??null);
    this.seedingSelected=new Set();this.seedingSearch='';this.seedingTarget=1;
    this.seedingDialog?.nativeElement.showModal();
  }
  closeSeeding(): void {if(this.modalSaving)return;this.seedingDialog?.nativeElement.close();}
  get seedingGroups(): (number|null)[] {return [null,...this.seedRanks];}
  seedingGroupSongs(rank:number|null): {index:number;song:BracketSong}[] {
    const query=this.seedingSearch.trim().toLocaleLowerCase();
    return this.songs.map((song,index)=>({song,index})).filter(({song,index})=>this.seedingDraft[index]===rank && (!query || `${song.title} ${song.album??''} ${song.category??''}`.toLocaleLowerCase().includes(query)));
  }
  trackSeedingSong(_index:number,entry:{index:number}): number {return entry.index;}
  seedingGroupCount(rank:number|null): number {return this.seedingDraft.filter(seed=>seed===rank).length;}
  toggleSeedingSong(index:number,checked:boolean): void {
    if(checked)this.seedingSelected.add(index);else this.seedingSelected.delete(index);
  }
  selectVisibleSeeding(): void {
    for(const rank of this.seedingGroups)for(const {index} of this.seedingGroupSongs(rank))this.seedingSelected.add(index);
  }
  get seedingTargetRemaining(): number {
    return this.seedingTarget===null?this.songs.length:Math.max(0,this.songCount/this.seedingSize-this.seedingGroupCount(this.seedingTarget));
  }
  get seedingAssignmentOverflow(): boolean {
    if(this.seedingTarget===null)return false;
    const incoming=[...this.seedingSelected].filter(index=>this.seedingDraft[index]!==this.seedingTarget).length;
    return incoming>this.seedingTargetRemaining;
  }
  get seedingOverCapacity(): boolean {
    return this.seedRanks.some(rank=>this.seedingGroupCount(rank)>this.songCount/this.seedingSize);
  }
  applyBulkSeed(): void {
    if(!this.seedingSelected.size || this.seedingAssignmentOverflow)return;
    this.seedingDraft=this.seedingDraft.map((rank,index)=>this.seedingSelected.has(index)?this.seedingTarget:rank);
    this.seedingSelected.clear();
  }
  get seedingIncomplete(): boolean {
    return this.seedingDraft.some(seed=>seed==null) || this.seedRanks.some(rank=>this.seedingGroupCount(rank)!==this.songCount/this.seedingSize);
  }
  async saveSeeding():Promise<void> {
    if(this.seedingOverCapacity)return;
    const songs=this.songs.map((song,index)=>({...song,assignedSeed:this.seedingDraft[index]??null}));
    await this.saveModalSettings('seeding','Seeding',{seedingSize:this.seedingSize,songs},this.seedingDialog?.nativeElement,()=>{this.songs=this.songs.map(song=>({...song,assignedSeed:songs.find(item=>item.title===song.title)?.assignedSeed??null}));this.useSeeds=true;this.refreshFieldErrors();});
  }
  useSeeds=false;
  seedingSize=4;
  get seedingSizeOptions(): number[] {return [4,8,16,32,64,128].filter(size=>size<=this.songCount);}
  get seedRanks(): number[] {return Array.from({length:this.seedingSize},(_,i)=>i+1);}
  seedAssignmentCount(rank:number): number {return this.songs.filter(song=>song.assignedSeed===rank).length;}
  toggleUseSeeds(checked:boolean): void {this.useSeeds=checked;if(!checked && ['seed','seed_low'].includes(this.tiebreakerOption))this.tiebreakerOption='admin_pick';if(this.seedingSize>this.songCount)this.seedingSize=this.songCount;}
  changeSeedRange(): void {this.songs=this.songs.map(song=>({...song,assignedSeed:song.assignedSeed!=null&&song.assignedSeed<=this.seedingSize?song.assignedSeed:null}));}
  songCountChanged(): void {if(this.seedingSize>this.songCount){this.seedingSize=this.songCount;this.changeSeedRange();}this.refreshFieldErrors();this.updateSessionPreview();}
  private seedAssignmentError(): string {
    if(!this.useSeeds)return '';
    if(this.songs.some(song=>song.assignedSeed==null))return 'Assign a seed to every song.';
    const required=this.songCount/this.seedingSize;
    const invalid=this.seedRanks.find(rank=>this.seedAssignmentCount(rank)!==required);
    return invalid==null?'':`Seed ${invalid} needs exactly ${required} song${required===1?'':'s'}; currently assigned ${this.seedAssignmentCount(invalid)}.`;
  }
  songs: BracketSong[] = [];
  songDraft: BracketSong = this.emptySong();
  songError = '';
  songSaving = false;
  removalIndex: number | null = null;
  removalError = '';
  @ViewChild('removeSongDialog') removeSongDialog?: ElementRef<HTMLDialogElement>;
  editingSongIndex: number | null = null;
  @ViewChild('songsManagerDialog') songsManagerDialog?:ElementRef<HTMLDialogElement>;
  private songSettingsSnapshot:{songCount:number;useSeeds:boolean;seedingSize:number;randomizationMode:RandomizationMode;tiebreakerOption:TiebreakerOption;seeds:Map<number,number|null>}|null=null;
  openSongsManager():void {
    this.songSettingsSnapshot={songCount:this.songCount,useSeeds:this.useSeeds,seedingSize:this.seedingSize,randomizationMode:this.randomizationMode,tiebreakerOption:this.tiebreakerOption,seeds:new Map(this.songs.filter(song=>song.bracketSongId!=null).map(song=>[song.bracketSongId!,song.assignedSeed??null]))};
    this.modalErrors['songs']='';this.songsManagerDialog?.nativeElement.showModal();
  }
  closeSongsManager():void {
    if(this.songSaving||this.modalSaving)return;
    const saved=this.songSettingsSnapshot;
    if(saved){this.songCount=saved.songCount;this.useSeeds=saved.useSeeds;this.seedingSize=saved.seedingSize;this.randomizationMode=saved.randomizationMode;this.randomizeSongs=saved.randomizationMode!=='none';this.tiebreakerOption=saved.tiebreakerOption;this.songs=this.songs.map(song=>song.bracketSongId!=null&&saved.seeds.has(song.bracketSongId)?{...song,assignedSeed:saved.seeds.get(song.bracketSongId)!}:song);this.updateSessionPreview();}
    this.songsManagerDialog?.nativeElement.close();
  }
  @ViewChild('songOrderDialog') songOrderDialog?:ElementRef<HTMLDialogElement>;
  songOrderDraft:BracketSong[]=[];
  songOrderPositions:number[]=[];
  songOrderError='';
  songOrderSaving=false;
  openSongOrder():void {this.songOrderDraft=[...this.songs];this.songOrderPositions=this.songs.map((_,index)=>index);this.songOrderError='';this.songOrderDialog?.nativeElement.showModal();}
  closeSongOrder():void {if(!this.songOrderSaving)this.songOrderDialog?.nativeElement.close();}
  canMoveSong(index:number,target:number):boolean {
    if(this.songOrderSaving || target<0 || target>=this.songOrderDraft.length || index===target)return false;
    return !this.songOrderDraft.slice(Math.min(index,target),Math.max(index,target)+1).some(song=>song.reorderLocked);
  }
  moveSong(index:number,target:number):void {
    if(!this.canMoveSong(index,target))return;
    const songs=[...this.songOrderDraft];const [song]=songs.splice(index,1);songs.splice(target,0,song);this.songOrderDraft=songs;
  }
  async saveSongOrder(resetHistory=false):Promise<void> {
    if(this.songOrderSaving)return;
    if(this.songOrderDraft.every((song,index)=>song===this.songs[index])){this.closeSongOrder();return;}
    this.songOrderSaving=true;this.songOrderError='';
    let saved=false;
    try {await this.persistSongs(this.songOrderDraft,resetHistory);saved=true;}
    catch(error){if(!this.offerHistoryReset(error,'order'))this.songOrderError=this.message(error);}
    finally {
      this.songOrderSaving=false;
      // Flush the returned order and enabled controls before restoring focus to
      // the parent dialog. Native dialog close does not drive Angular rendering.
      this.changeDetector.detectChanges();
    }
    if(saved)this.songOrderDialog?.nativeElement.close();
  }
  @ViewChild('songDialog') songDialog?: ElementRef<HTMLDialogElement>;
  openSongModal(index: number | null = null): void {
    this.editingSongIndex = index;
    this.songDraft = index === null ? this.emptySong() : { ...this.songs[index] };
    this.songError = '';
    this.songDialog?.nativeElement.showModal();
  }
  closeSongModal(): void { if (!this.songSaving) this.songDialog?.nativeElement.close(); }
  onSongModalClosed(): void {
    this.songDraft = this.emptySong();
    this.editingSongIndex = null;
    this.songError = '';
  }

  private emptySong(): BracketSong { return { assignedSeed: null, albumId: null, albumCoverUrl: '', seed: null, title: '', category: '', album: '', year: null, youtubeUrl: '', spotifyUrl: '' }; }
  seedKeydown(event: KeyboardEvent): void {
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 && !/^[0-9]$/.test(event.key)) event.preventDefault();
  }
  seedBeforeInput(event: Event): void {
    const data = (event as InputEvent).data;
    if (data && !/^[0-9]+$/.test(data)) event.preventDefault();
  }
  seedPaste(event: ClipboardEvent): void {
    if (!/^[0-9]+$/.test(event.clipboardData?.getData('text') ?? '')) event.preventDefault();
  }
  async addSong(resetHistory = false): Promise<void> {
    if (this.songSaving) return;
    this.songError = '';
    const song = this.songWithAlbum({ ...this.songDraft, title: this.songDraft.title.trim() });
    if (song.seed != null && (!Number.isInteger(song.seed) || song.seed < 1 || song.seed > 16)) { this.songError = 'Seed must be a whole number from 1 to 16, or left blank.'; return; }
    if (!song.title) { this.songError = 'Song title is required.'; return; }
    if (this.editingSongIndex === null && this.songs.length >= this.songCount) { this.songError = `This bracket already has ${this.songCount} songs.`; return; }
    if (this.songs.some((item, index) => index !== this.editingSongIndex && item.title.toLocaleLowerCase() === song.title.toLocaleLowerCase())) { this.songError = 'This song is already in the bracket.'; return; }
    const songs = this.editingSongIndex === null
      ? [...this.songs, song]
      : this.songs.map((item, index) => index === this.editingSongIndex ? song : item);
    this.songSaving = true;
    try {
      await this.persistSongs(songs,resetHistory);
      this.songDialog?.nativeElement.close();
    } catch (error) { if(!this.offerHistoryReset(error,'song')) this.songError = this.message(error); }
    finally { this.songSaving = false; this.changeDetector.markForCheck(); }
  }
  removeSong(index: number): void {
    this.removalIndex = index; this.removalError = '';
    this.removeSongDialog?.nativeElement.showModal();
  }
  closeRemovalModal(): void { if (!this.songSaving) this.removeSongDialog?.nativeElement.close(); }
  async confirmRemoveSong(resetHistory = false): Promise<void> {
    if (this.songSaving || this.removalIndex === null) return;
    this.songSaving = true; this.removalError = '';
    try {
      await this.persistSongs(this.songs.filter((_, i) => i !== this.removalIndex),resetHistory);
      this.removeSongDialog?.nativeElement.close(); this.removalIndex = null;
    } catch (error) { if(!this.offerHistoryReset(error,'remove')) this.removalError = this.message(error); }
    finally { this.songSaving = false; this.changeDetector.markForCheck(); }
  }
  private async persistSongs(songs: BracketSong[],resetHistory = false): Promise<void> {
    const result = await this.bracketsApi.saveSongs(this.editingId, songs, this.title, this.artist, resetHistory);
    this.editingId = result.bracketId;
    this.songs = result.songs.map(song=>{const draft=songs.find(draft=>draft.title===song.title);return {...song,reorderLocked:draft?.reorderLocked??song.reorderLocked,assignedSeed:draft?draft.assignedSeed??null:song.assignedSeed??null};});
    if(resetHistory) this.startAt='';
    this.syncSongs();
    this.showSessionToast('Songs Saved','success');
    this.success = result.needsSetup
      ? 'Songs saved. Voting is paused until the field is complete and the bracket schedule is configured.'
      : 'Songs saved.';
  }
  private syncSongs(): void { this.songList = this.songs.map(song => song.title).join('\n'); this.refreshFieldErrors(); }
  participantIds: number[] = [];
  participantDraftIds: number[] = [];
  participantModalError = '';
  participantEmails: Record<number,string> = {};
  participantSaving = false;
  @ViewChild('participantsDialog') participantsDialog?: ElementRef<HTMLDialogElement>;
  openParticipantsModal(): void {
    this.participantDraftIds = [...this.participantIds];
    this.participantEmails = Object.fromEntries(this.members.map(member=>[member.userId,member.email]));
    this.participantModalError = '';
    this.participantsDialog?.nativeElement.showModal();
  }
  closeParticipantsModal(): void { if(!this.participantSaving) this.participantsDialog?.nativeElement.close(); }
  get allParticipantsSelected(): boolean { return this.members.length > 0 && this.members.every(member => this.participantDraftIds.includes(member.userId)); }
  selectAllParticipants(): void {
    this.participantDraftIds = this.allParticipantsSelected ? [] : this.members.map(member => member.userId);
    this.participantModalError = '';
  }
  async saveParticipants(): Promise<void> {
    if(this.participantSaving) return;
    if (!this.participantDraftIds.length) { this.participantModalError = 'Select at least one participant.'; return; }
    const changes = this.members.filter(member=>this.participantEmails[member.userId]?.trim()!==member.email).map(member=>({userId:member.userId,email:this.participantEmails[member.userId]?.trim()??'',previousEmail:member.email}));
    if(changes.some(change=>change.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(change.email))) {this.participantModalError='Enter a valid email address for each participant.';return;}
    this.participantSaving=true;this.participantModalError='';
    try {
      const result=await this.bracketsApi.saveParticipants(this.editingId,{participantIds:this.participantDraftIds,changes,title:this.title,artist:this.artist});
      this.editingId=result.bracketId;
      this.members=this.members.map(member=>({...member,email:result.members.find(item=>item.userId===member.userId)?.email??member.email}));
      this.participantIds=[...result.participantIds];
      this.refreshFieldErrors();
      this.participantsDialog?.nativeElement.close();this.showSessionToast('Participants Saved','success');
    } catch(error) {this.participantModalError=error instanceof Error?error.message:'Could not save participant emails.';}
    finally {this.participantSaving=false;this.changeDetector.markForCheck();}
  }
  startAt = '';
  finaleDate='';
  finaleStartRound:number|null=null;
  private finaleOptionsSongCount:number|null=null;
  private cachedFinaleRoundOptions:Array<{roundNumber:number;name:string}>=[];
  get finaleRoundOptions():Array<{roundNumber:number;name:string}> {
    if(this.finaleOptionsSongCount!==this.songCount) {
      this.finaleOptionsSongCount=this.songCount;
      this.cachedFinaleRoundOptions=Array.from({length:Math.log2(this.songCount)},(_,index)=>{const size=this.songCount/(2**index);return {roundNumber:index+1,name:size===2?'Championship':size===4?'Final Four':size===8?'Elite 8':size===16?'Sweet 16':`Round of ${size}`};});
    }
    return this.cachedFinaleRoundOptions;
  }
  trackFinaleRound(_index:number,round:{roundNumber:number}):number {return round.roundNumber;}
  songsPerSession = 2;
  noSessionTimer=false;
  randomizeSongs=false;
  randomizationMode:RandomizationMode='none';
  randomizationDraft:'round1'|'each_round'='round1';
  @ViewChild('randomizationDialog') randomizationDialog?:ElementRef<HTMLDialogElement>;
  toggleRandomization(checked:boolean):void {
    if(!checked) {this.randomizationMode='none';this.randomizeSongs=false;return;}
    this.openRandomizationOptions();
  }
  openRandomizationOptions():void {
    this.modalErrors['randomization']='';this.randomizationDraft=this.randomizationMode==='each_round'?'each_round':'round1';
    this.randomizationDialog?.nativeElement.showModal();
  }
  async saveRandomizationOptions():Promise<void> {
    const mode=this.randomizationDraft;
    await this.saveModalSettings('randomization','Randomization',{randomizationMode:mode},this.randomizationDialog?.nativeElement,()=>{this.randomizationMode=mode;this.randomizeSongs=true;});
  }
  cancelRandomizationOptions():void {
    if(this.modalSaving)return;this.randomizeSongs=this.randomizationMode!=='none';this.randomizationDialog?.nativeElement.close();
  }
  anonymous=false;
  tiebreakerOption: TiebreakerOption = 'admin_pick';
  readonly tiebreakerLabels: Record<TiebreakerOption, string> = { random: 'Random', seed: 'Seed (higher seed wins, #1 beats #2)', seed_low: 'Seed (lower seed wins, #2 beats #1)', admin_pick: "Admin pick (the admin's choice advances)" };
  durationValue = 1; durationUnit: 'minutes'|'hours'|'days'|'weeks' = 'weeks';
  readonly songCounts = [4,8,16,32,64,128];

  ngOnInit():void {
    this.success=window.history.state?.message??'';
    this.routeSubscription=this.route.paramMap.subscribe(()=>{void this.loadRoute();});
  }
  private async loadRoute():Promise<void> {
    await this.load();
    if(this.error)return;
    if(this.pageMode==='add'){this.resetForm();this.formOpen=true;}
    else if(this.pageMode==='edit') {
      const id=Number(this.route.snapshot.paramMap.get('id'));
      if(Number.isSafeInteger(id)&&id>0){this.loading=true;await this.loadBracket(id);this.loading=false;}
      else this.error='The requested bracket was not found.';
    }else this.formOpen=false;
    this.changeDetector.markForCheck();
  }

  async load(): Promise<void> {
    this.loading = true; this.error = '';
    try {
      const [brackets, members] = await Promise.all([this.bracketsApi.getAll(), this.bracketsApi.getParticipants()]);
      this.brackets = brackets; this.members = members;
    } catch (error) { this.error = this.message(error); }
    finally { this.loading = false; this.changeDetector.markForCheck(); }
  }

  newBracket():void {void this.router.navigate(['/manage/brackets/new']);}
  showList():void {
    if(this.pageMode==='list')void this.load();
    else void this.router.navigate(['/manage/brackets']);
  }
  edit(bracket:BracketRecord):Promise<boolean> {return this.router.navigate(['/manage/brackets',bracket.bracketId,'edit']);}

  private async loadBracket(bracketId:number): Promise<void> {
    this.error = ''; this.success = '';
    try {
      const [item,sessionData] = await Promise.all([this.bracketsApi.get(bracketId),this.bracketsApi.getSessions(bracketId)]);
      this.setSessionData(sessionData);this.sessionsError='';this.sessionsNotice='';
      this.randomizationMode=item.randomizationMode??'none';this.randomizeSongs=this.randomizationMode!=='none';this.anonymous=!!item.anonymous; this.albums=item.albums??[];this.sessionPlaylists=item.sessionPlaylists??[]; this.tiebreakerOption = item.tiebreakerOption ?? 'admin_pick'; this.editingStatus=item.status;this.editingId = item.bracketId; this.logoUrl=item.logoUrl??''; this.title = item.title; this.artist = item.artist; this.songCount = Number(item.songCount);this.useSeeds=item.seedingSize!=null;this.seedingSize=item.seedingSize??4;if(!this.useSeeds && ['seed','seed_low'].includes(this.tiebreakerOption))this.tiebreakerOption='admin_pick';
      this.songList = item.songList ?? ''; this.songs = item.songs ?? this.songList.split(/\r?\n/).filter(Boolean).map(title => ({ ...this.emptySong(), title })); this.songDraft = this.emptySong(); this.songError = ''; this.participantIds = item.participantIds ?? [];
      this.startAt = item.startAt ? this.toLocalInput(item.startAt) : '';
      this.finaleDate=item.finaleAt?item.finaleAt.slice(0,10):'';this.finaleStartRound=item.finaleStartRound==null?null:Number(item.finaleStartRound);
      this.songsPerSession = Number(item.songsPerSession); this.noSessionTimer=item.sessionDurationMinutes===null;this.setDuration(this.noSessionTimer?10080:Number(item.sessionDurationMinutes));if(item.durationUnit)this.durationUnit=item.durationUnit;if(item.durationValue!=null)this.durationValue=item.durationValue; this.formOpen = true;
      this.scheduleBaseline=this.currentSessionSettings();this.lastPreviewTimingKey=sessionTimingKey(this.scheduleBaseline);
      if(this.sessionStoredDraft||!this.sessions.length){this.lastPreviewTimingKey='';this.updateSessionPreview();}
      if(item.sessionSchedule){for(const session of this.sessions){const draft=item.sessionSchedule.find(row=>row.weekNumber===session.weekNumber);if(draft){session.startInput=this.sessionDateInput(draft.opensAt);session.endInput=this.sessionDateInput(draft.closesAt);}}}
      this.showValidationErrors = false; this.fieldErrors = {};
    } catch (error) { this.error = this.message(error); }
    finally { this.changeDetector.markForCheck(); }
  }

  modalSaving='';
  modalErrors:Record<string,string>={};
  private modalRetry:(()=>Promise<void>)|null=null;
  private async persistModalPatch(patch:Record<string,unknown>,resetHistory=false):Promise<void> {
    if(!this.editingId) {
      const result=await this.bracketsApi.saveDraft(null,{title:this.title,artist:this.artist,...patch});
      this.editingId=result.bracketId;this.editingStatus='draft';this.sessionStoredDraft=true;return;
    }
    const [stored,sessions]=await Promise.all([this.bracketsApi.get(this.editingId),this.bracketsApi.getSessions(this.editingId)]);
    const scoped={...patch};
    if(Array.isArray(scoped['songs'])) {
      const seeds=scoped['songs'] as BracketSong[];
      scoped['songs']=(stored.songs??[]).map(song=>({...song,assignedSeed:seeds.find(item=>item.bracketSongId===song.bracketSongId)?.assignedSeed??null}));
    }
    if(sessions.isDraft) {
      await this.bracketsApi.saveDraft(this.editingId,{...stored,...scoped});this.sessionStoredDraft=true;
    } else {
      await this.bracketsApi.update(this.editingId,{...stored,...scoped,anonymous:!!stored.anonymous,startAt:stored.startAt??'',resetHistory} as BracketInput);
      const fresh=await this.bracketsApi.getSessions(this.editingId);this.setSessionData(fresh);this.editingStatus=fresh.status;
      const freshBracket=await this.bracketsApi.get(this.editingId);
      this.songs=this.songs.map(song=>{
        const fresh=freshBracket.songs?.find(item=>item.title===song.title);
        if(!fresh)return song;
        const snapshot=this.songSettingsSnapshot;
        if(snapshot && song.bracketSongId!=null && fresh.bracketSongId!=null && snapshot.seeds.has(song.bracketSongId))snapshot.seeds.set(fresh.bracketSongId,snapshot.seeds.get(song.bracketSongId)!);
        return {...song,bracketSongId:fresh.bracketSongId,seed:fresh.seed,position:fresh.position};
      });this.syncSongs();
    }
  }
  private async saveModalSettings(key:string,label:string,patch:Record<string,unknown>,dialog:HTMLDialogElement|undefined,after?:()=>void,reset=false):Promise<void> {
    if(this.modalSaving)return;
    this.modalSaving=key;this.modalErrors[key]='';
    try {
      await this.persistModalPatch(patch,reset);after?.();
      const snapshot=this.songSettingsSnapshot;
      if(snapshot){
        if(patch['songCount']!==undefined)snapshot.songCount=Number(patch['songCount']);
        if(patch['seedingSize']!==undefined){snapshot.useSeeds=patch['seedingSize']!==null;if(patch['seedingSize']!==null)snapshot.seedingSize=Number(patch['seedingSize']);}
        if(patch['randomizationMode']!==undefined)snapshot.randomizationMode=patch['randomizationMode'] as RandomizationMode;
        if(patch['tiebreakerOption']!==undefined)snapshot.tiebreakerOption=patch['tiebreakerOption'] as TiebreakerOption;
        if(Array.isArray(patch['songs']))snapshot.seeds=new Map(this.songs.filter(song=>song.bracketSongId!=null).map(song=>[song.bracketSongId!,song.assignedSeed??null]));
      }
      this.modalSaving='';this.changeDetector.detectChanges();dialog?.close();this.showSessionToast(label+' Saved','success');
    }catch(error){
      if(this.offerHistoryReset(error,'modal'))this.modalRetry=()=>this.saveModalSettings(key,label,patch,dialog,after,true);
      else this.modalErrors[key]=this.message(error);
    }finally{this.modalSaving='';this.changeDetector.markForCheck();}
  }
  saveSongSettings():Promise<void> {
    return this.saveModalSettings('songs','Song Settings',{songCount:this.songCount,seedingSize:this.useSeeds?this.seedingSize:null,randomizationMode:this.randomizationMode,tiebreakerOption:this.tiebreakerOption,songs:this.songs},this.songsManagerDialog?.nativeElement);
  }
  sessionPlaylists:SessionPlaylist[]=[];
  playlistDraft:Array<SessionPlaylist & {label:string;matchupCount:number;matchups:Array<{label:string;songA:string|null;songB:string|null}>}>=[];
  @ViewChild('playlistsDialog') playlistsDialog?:ElementRef<HTMLDialogElement>;
  get assignedPlaylistCount():number {return this.sessionPlaylists.filter(row=>row.playlistUrl.trim()).length;}
  private sessionPlaylistsPayload():SessionPlaylist[] {
    return this.sessionPlaylists.filter(row=>!this.sessions.length || this.sessions.some(session=>session.weekNumber===row.weekNumber));
  }
  playlistsSaving=false;
  playlistsError='';
  get playlistsSaveImmediately():boolean {return true;}
  playlistSongsLoading=false;
  playlistSongsError='';
  async openPlaylists():Promise<void> {
    this.updateSessionPreview();
    this.modalErrors['playlists']='';this.playlistsError='';this.playlistSongsError='';this.playlistSongsLoading=!!this.editingId;
    const firstFinale=this.sessions.find(session=>session.isFinale);
    const sessions=this.sessions.filter(session=>!session.isFinale || session===firstFinale);
    this.playlistDraft=sessions.map(session=>{
      const saved=this.sessionPlaylists.find(row=>row.weekNumber===session.weekNumber);
      return {weekNumber:session.weekNumber,playlistName:saved?.playlistName??'',playlistUrl:saved?.playlistUrl??'',label:session.isFinale?`Finale Week · ${this.finaleSessionSummary?.roundRange}`:`Week ${session.weekNumber} · ${session.roundName}`,matchupCount:session.isFinale?this.finaleSessionSummary?.matchupCount??0:session.matchupCount,matchups:[]};
    });
    this.playlistsDialog?.nativeElement.showModal();
    let stored:BracketSession[]=[];
    try {if(this.editingId){const data=await this.bracketsApi.getSessions(this.editingId);stored=data.sessions;this.sessionStoredDraft=!!data.isDraft;}}
    catch(error){this.playlistSongsError=this.message(error);}
    const sameStructure=!!this.scheduleBaseline && this.scheduleBaseline.songCount===this.songCount && this.scheduleBaseline.matchups===this.songsPerSession;
    for(const row of this.playlistDraft) {
      const session=this.sessions.find(session=>session.weekNumber===row.weekNumber)!;
      const included=session.isFinale?this.sessions.filter(item=>item.isFinale):[session];
      row.matchups=included.flatMap(item=>{
        const saved=sameStructure?stored.find(saved=>saved.weekNumber===item.weekNumber)?.matchups:undefined;
        const firstRoundOffset=this.sessions.filter(previous=>previous.roundNumber===1&&previous.weekNumber<item.weekNumber).reduce((total,previous)=>total+previous.matchupCount*2,0);
        return Array.from({length:item.matchupCount},(_,index)=>{
          const actual=saved?.[index];
          const canPreview=item.roundNumber===1&&!this.useSeeds&&!this.randomizeSongs;
          return {label:`${session.isFinale?item.roundName+' · ':''}Matchup ${actual?.matchupNumber??index+1}`,songA:canPreview?this.songs[firstRoundOffset+index*2]?.title??null:actual?.songA??null,songB:canPreview?this.songs[firstRoundOffset+index*2+1]?.title??null:actual?.songB??null};
        });
      });
    }
    this.playlistSongsLoading=false;this.changeDetector.markForCheck();
  }
  closePlaylists():void {if(!this.playlistsSaving&&!this.modalSaving)this.playlistsDialog?.nativeElement.close();}
  async applyPlaylists():Promise<void> {
    if(this.playlistsSaving||this.modalSaving)return;
    this.playlistsError='';
    const updated=new Set(this.playlistDraft.map(row=>row.weekNumber));
    const changes=this.playlistDraft.map(({weekNumber,playlistName,playlistUrl})=>({weekNumber,playlistName:playlistName.trim(),playlistUrl:playlistUrl.trim()}));
    if(this.editingId && !this.sessionStoredDraft) {
      if(!this.scheduleBaseline || this.scheduleBaseline.songCount!==this.songCount || this.scheduleBaseline.matchups!==this.songsPerSession) {
        this.playlistsError='Save the bracket’s song count and matchups per session before assigning playlists to the new sessions.';return;
      }
      this.playlistsSaving=true;
      try {
        const result=await this.bracketsApi.saveSessionPlaylists(this.editingId,changes);
        this.sessionPlaylists=result.sessionPlaylists;
        this.playlistsSaving=false;this.changeDetector.detectChanges();this.closePlaylists();
        this.showSessionToast('Playlists Saved','success');
      }catch(error){this.playlistsError=this.message(error);}
      finally{this.playlistsSaving=false;this.changeDetector.markForCheck();}
    } else {
      const playlists=[...this.sessionPlaylists.filter(row=>!updated.has(row.weekNumber)),...changes];
      await this.saveModalSettings('playlists','Playlists',{sessionPlaylists:playlists},this.playlistsDialog?.nativeElement,()=>{this.sessionPlaylists=playlists;});
    }
  }
  @ViewChild('sessionSettingsDialog') sessionSettingsDialog?:ElementRef<HTMLDialogElement>;
  openSessionSettings():void {if(this.editingStatus==='complete')return;this.clearSessionToast();this.updateSessionPreview();this.sessionSettingsDialog?.nativeElement.showModal();this.sessionModalOpen=true;}
  closeSessionSettings():void {if(!this.sessionsSaving&&!this.saving){this.sessionSettingsDialog?.nativeElement.close();this.sessionModalOpen=false;}}
  sessions: Array<BracketSession & {startInput:string;endInput:string}> = [];
  sessionsNoTimer=false; sessionsPaused=false; sessionsSaving=false; sessionsError=''; sessionsNotice='';
  get onlineSessions():typeof this.sessions {return this.sessions.filter(session=>!session.isFinale);}
  get finaleSessionSummary():{roundRange:string;matchupCount:number}|null {
    const finale=this.sessions.filter(session=>session.isFinale);
    if(!finale.length)return null;
    const first=finale[0].roundName,last=finale[finale.length-1].roundName;
    return {roundRange:first===last?first:`${first} - ${last}`,matchupCount:finale.reduce((total,session)=>total+Number(session.matchupCount),0)};
  }
  get displayedSessionCount():number {return this.onlineSessions.length+(this.finaleSessionSummary?1:0);}
  private sessionStoredDraft=false;
  private savedSessions:BracketSession[]=[];
  private scheduleBaseline:SessionSettings|null=null;
  private lastPreviewTimingKey='';
  private sessionsEffectiveAt=new Date();
  private currentSessionSettings():SessionSettings {return {songCount:this.songCount,startAt:this.startAt,matchups:this.songsPerSession,minutes:this.noSessionTimer?null:Math.round(this.durationValue*({minutes:1,hours:60,days:1440,weeks:10080}[this.durationUnit])),finaleRound:this.finaleStartRound,finaleDate:this.finaleDate};}
  get sessionSettingsNeedSaving():boolean {return !this.scheduleBaseline || JSON.stringify(this.currentSessionSettings())!==JSON.stringify(this.scheduleBaseline);}
  changeSessionDuration(value:number):void {this.durationValue=value;this.updateSessionPreview();}
  changeSessionDurationUnit(value:'minutes'|'hours'|'days'|'weeks'):void {this.durationUnit=value;this.updateSessionPreview();}
  changeSessionTimerMode(value:boolean):void {this.noSessionTimer=value;this.updateSessionPreview();}
  updateSessionPreview():void {
    const settings=this.currentSessionSettings(),key=sessionTimingKey(settings);
    if(key!==this.lastPreviewTimingKey || !this.sessions.length) {
      this.sessions=previewSessionSchedule(settings,this.savedSessions,this.sessionStoredDraft?null:this.scheduleBaseline,this.sessionsPaused?this.sessionsEffectiveAt:new Date()).map(session=>({...session,startInput:this.sessionDateInput(session.opensAt),endInput:this.sessionDateInput(session.closesAt)}));
      this.lastPreviewTimingKey=key;
    } else this.sessions=this.sessions.map(session=>({...session,isFinale:settings.finaleRound!=null&&session.roundNumber>=settings.finaleRound,state:session.state==='Decided'?'Decided':settings.finaleRound!=null&&session.roundNumber>=settings.finaleRound?'Finale':session.state==='Finale'?'Upcoming':session.state}));
    this.sessionsNoTimer=this.noSessionTimer;this.sessionsError='';this.sessionsNotice='';
  }
  private sessionSchedulePayload():Array<{weekNumber:number;opensAt:string|null;closesAt:string|null}> {
    const value=(input:string,original:string|null):string|null=>input===this.sessionDateInput(original)?original:input?new Date(input).toISOString():null;
    return this.sessions.map(session=>({weekNumber:session.weekNumber,opensAt:value(session.startInput,session.opensAt),closesAt:value(session.endInput,session.closesAt)}));
  }
  private changedSessionSchedule():ReturnType<BracketsPageComponent['sessionSchedulePayload']>|undefined {
    if(!this.sessions.length)return undefined;
    const schedule=this.sessionSchedulePayload();
    return schedule.length!==this.savedSessions.length || schedule.some((session,i)=>session.opensAt!==this.savedSessions[i]?.opensAt||session.closesAt!==this.savedSessions[i]?.closesAt)?schedule:undefined;
  }
  private sessionsRevision='';
  private sessionDateInput(value:string|null):string {
    if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,19);
  }
  private setSessionData(data:BracketSessionsData):void {
    this.sessionStoredDraft=!!data.isDraft;
    this.savedSessions=data.sessions.map(session=>({...session}));
    this.sessionsEffectiveAt=data.effectiveAt?new Date(data.effectiveAt):new Date();
    this.sessions=data.sessions.map(session=>({...session,startInput:this.sessionDateInput(session.opensAt),endInput:this.sessionDateInput(session.closesAt)}));
    this.sessionsRevision=data.revision;this.sessionsNoTimer=data.noTimer;this.sessionsPaused=data.paused;
  }
  sessionModalOpen=false;
  sessionToastMessage='';sessionToastType:'success'|'error'='success';
  private sessionToastTimer?:ReturnType<typeof setTimeout>;
  clearSessionToast():void {if(this.sessionToastTimer)clearTimeout(this.sessionToastTimer);this.sessionToastMessage='';}
  private showSessionToast(message:string,type:'success'|'error'):void {
    this.clearSessionToast();this.sessionToastMessage=message;this.sessionToastType=type;
    if(type==='success')this.sessionToastTimer=setTimeout(()=>{this.sessionToastMessage='';this.changeDetector.markForCheck();},5000);
  }
  ngOnDestroy():void {this.routeSubscription?.unsubscribe();if(this.sessionToastTimer)clearTimeout(this.sessionToastTimer);}
  get canSaveSessionDates():boolean {return this.editingStatus!=='complete' && this.sessions.length>0;}
  private sessionSettingsPayload():Record<string,unknown> {
    return {songCount:this.songCount,startAt:this.startAt?new Date(this.startAt).toISOString():null,songsPerSession:this.songsPerSession,sessionDurationMinutes:this.currentSessionSettings().minutes,durationValue:this.durationValue,durationUnit:this.durationUnit,finaleAt:this.finaleDate||null,finaleStartRound:this.finaleStartRound,sessionSchedule:this.sessionSchedulePayload()};
  }
  async saveSessionDates(resetHistory=false):Promise<void> {
    if(!this.canSaveSessionDates||this.sessionsSaving)return;this.sessionsSaving=true;this.sessionsError='';this.sessionsNotice='';this.error='';this.clearSessionToast();
    try {
      if(!this.editingId || this.sessionStoredDraft) {
        await this.persistModalPatch(this.sessionSettingsPayload());
      } else if(this.sessionSettingsNeedSaving) {
        const stored=await this.bracketsApi.get(this.editingId);
        const payload={...stored,...this.sessionSettingsPayload(),resetHistory,sessionPlaylists:stored.sessionPlaylists?.filter(row=>this.sessions.some(session=>session.weekNumber===row.weekNumber)),startAt:this.startAt?new Date(this.startAt).toISOString():'',anonymous:!!stored.anonymous,sessionScheduleRevision:this.sessionsRevision} as BracketInput;
        await this.bracketsApi.update(this.editingId,payload);
        const data=await this.bracketsApi.getSessions(this.editingId);this.setSessionData(data);this.editingStatus=data.status;
      } else {
        const schedule=this.sessionSchedulePayload();
        const data=await this.bracketsApi.saveSessions(this.editingId,this.sessionsRevision,this.sessions.map((session,i)=>({weekId:session.weekId,opensAt:schedule[i].opensAt,closesAt:schedule[i].closesAt})));
        this.setSessionData(data);if(data.startAt)this.startAt=this.toLocalInput(data.startAt);this.editingStatus=data.status;
      }
      this.scheduleBaseline=this.currentSessionSettings();this.lastPreviewTimingKey=sessionTimingKey(this.scheduleBaseline);
      this.sessionSettingsDialog?.nativeElement.close();this.sessionModalOpen=false;
      this.showSessionToast('Sessions Saved','success');
    }catch(error){if(this.offerHistoryReset(error,'modal'))this.modalRetry=()=>this.saveSessionDates(true);else{this.sessionsError=this.message(error);this.showSessionToast(this.sessionsError,'error');}}
    finally{this.sessionsSaving=false;this.changeDetector.markForCheck();}
  }

  editingStatus: string | null = null;
  savingDraft=false;
  get canSaveDraft():boolean {return this.editingStatus==null || this.editingStatus==='draft';}
  async saveAsDraft():Promise<void> {
    if(this.saving || this.sessionsSaving || !this.canSaveDraft)return;
    this.error='';this.success='';this.showValidationErrors=false;this.fieldErrors={};
    if(!this.title.trim()||!this.artist.trim()) {this.error='Title and Theme are required to save a draft.';return;}
    this.saving=true;this.savingDraft=true;
    try {
      const duration=Math.round(this.durationValue*({minutes:1,hours:60,days:1440,weeks:10080}[this.durationUnit]));
      const result=await this.bracketsApi.saveDraft(this.editingId,{title:this.title,artist:this.artist,logoUrl:this.logoUrl,songCount:this.songCount,songs:this.songs,sessionPlaylists:this.sessionPlaylistsPayload(),participantIds:this.participantIds,startAt:this.startAt||null,songsPerSession:this.songsPerSession,sessionDurationMinutes:this.noSessionTimer?null:duration,durationValue:this.durationValue,durationUnit:this.durationUnit,finaleAt:this.finaleDate||null,finaleStartRound:this.finaleStartRound,seedingSize:this.useSeeds?this.seedingSize:null,randomizationMode:this.randomizationMode,tiebreakerOption:this.tiebreakerOption,anonymous:this.anonymous,sessionSchedule:this.sessions.length?this.sessionSchedulePayload():undefined});
      this.editingId=result.bracketId;this.editingStatus='draft';
      await this.router.navigate(['/manage/brackets'],{state:{message:'Draft saved. You can reopen it and finish setting up the bracket later.'}});
    } catch(error){this.error=this.message(error);}
    finally{this.saving=false;this.savingDraft=false;this.changeDetector.markForCheck();}
  }

  async save(resetHistory = false): Promise<void> {
    if(this.saving||this.sessionsSaving)return;
    this.error = '';
    this.success = '';
    this.showValidationErrors = true;
    this.validationBannerDismissed=false;
    if (!this.validateFields()) return;
    if(!!this.finaleDate !== (this.finaleStartRound!==null)) {this.error='Choose both a Finale Date and a finale starting round, or leave both unset.';return;}
    const seedError=this.seedAssignmentError();if(seedError){this.error=seedError;return;}
    if(this.finaleStartRound!==null && this.finaleStartRound>Math.log2(this.songCount)) {this.error='Choose a finale round available for this song count.';return;}
    this.saving = true;
    try {
      const sessionDurationMinutes = Math.round(this.durationValue * ({minutes:1,hours:60,days:1440,weeks:10080}[this.durationUnit]));
      const body: BracketInput = { seedingSize:this.useSeeds?this.seedingSize:null, logoUrl:this.logoUrl.trim()||null, finaleAt:this.finaleDate||null,finaleStartRound:this.finaleStartRound, resetHistory, anonymous:this.anonymous, randomizationMode:this.randomizationMode, title:this.title,artist:this.artist,songCount:this.songCount,songList:this.songList,songs:this.songs,sessionPlaylists:this.sessionPlaylistsPayload(),participantIds:this.participantIds,startAt:`${this.startAt.replace('T',' ')}:00`,songsPerSession:this.songsPerSession,tiebreakerOption:this.tiebreakerOption,sessionDurationMinutes:this.noSessionTimer?null:sessionDurationMinutes,sessionSchedule:this.changedSessionSchedule(),sessionScheduleRevision:this.savedSessions.length?this.sessionsRevision:undefined };
      const wasEditing = this.editingId !== null;
      if (wasEditing) await this.bracketsApi.update(this.editingId!, body);
      else await this.bracketsApi.create(body);
      this.saving = false;
      this.success = wasEditing ? 'Bracket updated successfully.' : 'Bracket added successfully.';
      await this.router.navigate(['/manage/brackets'],{state:{message:this.success}});
    } catch(error) { if(!this.offerHistoryReset(error,'bracket')) this.error=this.message(error); }
    finally { this.saving=false; this.changeDetector.markForCheck(); }
  }

  @ViewChild('historyResetDialog') historyResetDialog?: ElementRef<HTMLDialogElement>;
  resetWarning='';
  pendingResetAction: 'bracket' | 'song' | 'remove' | 'order' | 'modal' | null = null;
  private offerHistoryReset(error: unknown,action:'bracket'|'song'|'remove'|'order'|'modal'): boolean {
    if(!(error instanceof Error) || !('requiresReset' in error) || !error.requiresReset) return false;
    this.resetWarning=error.message; this.pendingResetAction=action;
    this.historyResetDialog?.nativeElement.showModal(); return true;
  }
  cancelHistoryReset(): void { this.modalRetry=null;this.pendingResetAction=null;this.historyResetDialog?.nativeElement.close(); }
  async confirmHistoryReset(): Promise<void> {
    const action=this.pendingResetAction,retry=this.modalRetry;this.cancelHistoryReset();
    if(action==='bracket') await this.save(true);
    else if(action==='song') await this.addSong(true);
    else if(action==='remove') await this.confirmRemoveSong(true);
    else if(action==='order') await this.saveSongOrder(true);
    else if(action==='modal'&&retry)await retry();
  }

  pauseSavingId: number | null = null;
  async togglePaused(bracket: BracketRecord): Promise<void> {
    this.pauseSavingId = bracket.bracketId; this.error = '';
    try { await this.bracketsApi.setPaused(bracket.bracketId,!bracket.pausedAt); await this.load(); }
    catch (error) { this.error = this.message(error); }
    finally { this.pauseSavingId = null; this.changeDetector.markForCheck(); }
  }

  duplicatingId:number|null=null;
  async duplicateBracket(bracket:BracketRecord):Promise<void> {await this.createDuplicate(bracket.bracketId);}
  async duplicateCurrentBracket():Promise<void> {
    if(!this.editingId)return;
    const duration=Math.round(this.durationValue*({minutes:1,hours:60,days:1440,weeks:10080}[this.durationUnit]));
    await this.createDuplicate(this.editingId,{title:this.title,artist:this.artist,logoUrl:this.logoUrl,songCount:this.songCount,songs:this.songs,sessionPlaylists:this.sessionPlaylistsPayload(),participantIds:this.participantIds,startAt:this.startAt||null,songsPerSession:this.songsPerSession,sessionDurationMinutes:this.noSessionTimer?null:duration,durationValue:this.durationValue,durationUnit:this.durationUnit,finaleAt:this.finaleDate||null,finaleStartRound:this.finaleStartRound,seedingSize:this.useSeeds?this.seedingSize:null,randomizationMode:this.randomizationMode,tiebreakerOption:this.tiebreakerOption,anonymous:this.anonymous,sessionSchedule:this.sessions.length?this.sessionSchedulePayload():undefined});
  }
  private async createDuplicate(bracketId:number,input:Record<string,unknown>={}):Promise<void> {
    if(this.duplicatingId!=null||this.saving||this.sessionsSaving)return;
    this.duplicatingId=bracketId;this.error='';this.success='';
    try {
      const copy=await this.bracketsApi.duplicate(bracketId,input);
      const records=await this.bracketsApi.getAll();this.brackets=records;
      const record=records.find(item=>item.bracketId===copy.bracketId);
      if(record)await this.edit(record);
      this.success=`${copy.title} saved as a draft.`;
    }catch(error){this.error=this.message(error);}
    finally{this.duplicatingId=null;this.changeDetector.markForCheck();}
  }

  readonly deletingBracketIds = new Set<number>();
  async remove(bracket: BracketRecord): Promise<void> {
    if (this.deletingBracketIds.has(bracket.bracketId) || !window.confirm(`Delete “${bracket.title}”?`)) return;
    this.error='';this.success='';this.deletingBracketIds.add(bracket.bracketId);
    try {
      await this.bracketsApi.remove(bracket.bracketId);
      this.brackets = this.brackets.filter(item=>item.bracketId!==bracket.bracketId);
      this.success='Bracket deleted.';
    } catch(error) { this.error=this.message(error); }
    finally {this.deletingBracketIds.delete(bracket.bracketId);this.changeDetector.markForCheck();}
  }

  toggleParticipant(id: number, checked: boolean): void {
    this.participantDraftIds = checked ? [...new Set([...this.participantDraftIds,id])] : this.participantDraftIds.filter(value=>value!==id);
    this.participantModalError = '';
  }
  refreshFieldErrors(): void { if (this.showValidationErrors) this.validateFields(); }
  get enteredSongCount(): number { return this.songList.split(/\r?\n/).map(song=>song.trim()).filter(Boolean).length; }
  closeForm(): void {if(this.sessionsSaving||this.saving)return;void this.router.navigate(['/manage/brackets']);}
  private validateFields(): boolean {
    const enteredCount = this.songList.split(/\r?\n/).map(song=>song.trim()).filter(Boolean).length;
    this.fieldErrors = {
      ...(!this.title.trim() ? { title: 'Title is required.' } : {}),
      ...(!this.artist.trim() ? { artist: 'Theme is required.' } : {}),
      ...(!this.startAt ? { startAt: 'Start date and time is required.' } : {}),
      ...(!this.participantIds.length ? { participants: 'Select at least one participant.' } : {}),
      ...(enteredCount !== this.songCount ? { songList: `Enter exactly ${this.songCount} songs using Add a song.` } : {})
    };
    return Object.keys(this.fieldErrors).length === 0;
  }
  private resetForm(): void { this.editingId=null;this.sessionPlaylists=[];this.playlistDraft=[];this.sessionStoredDraft=false;this.savedSessions=[];this.scheduleBaseline=null;this.lastPreviewTimingKey='';this.sessions=[];this.sessionsError='';this.sessionsNotice='';this.sessionsRevision='';this.editingStatus=null;this.useSeeds=false;this.seedingSize=4; this.randomizationMode='none';this.randomizeSongs=false; this.anonymous=false; this.albums=[]; this.tiebreakerOption='admin_pick'; this.title=''; this.artist=''; this.logoUrl=''; this.songCount=16; this.songList=''; this.songs=[]; this.songDraft=this.emptySong(); this.songError=''; this.participantIds=[]; this.startAt=''; this.finaleDate='';this.finaleStartRound=null; this.songsPerSession=2;this.noSessionTimer=false; this.durationValue=1; this.durationUnit='weeks'; this.error=''; this.success=''; this.showValidationErrors=false; this.fieldErrors={}; }
  private setDuration(minutes:number): void { if(minutes%10080===0){this.durationUnit='weeks';this.durationValue=minutes/10080;} else if(minutes%1440===0){this.durationUnit='days';this.durationValue=minutes/1440;} else if(minutes%60===0){this.durationUnit='hours';this.durationValue=minutes/60;} else {this.durationUnit='minutes';this.durationValue=minutes;} }
  private toLocalInput(value:string):string { const date=new Date(value); return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16); }
  private message(error:unknown):string { return error instanceof Error?error.message:'Something went wrong.'; }
}
