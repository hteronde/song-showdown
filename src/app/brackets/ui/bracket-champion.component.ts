import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SongAlbumArtComponent } from './song-album-art.component';
export interface BracketChampion { title: string; album: string | null; year: number | null; albumCoverUrl: string | null; }
@Component({
  selector: 'app-bracket-champion', standalone: true, imports: [CommonModule, SongAlbumArtComponent],
  template: `
    <section class="history-champion" *ngIf="champion && !celebrating">
      <div class="champion-star">✳</div><div><small>YOUR BRACKET CHAMPION</small><h3>{{ champion.title }}</h3><span>{{ champion.album || 'Album not recorded' }}<ng-container *ngIf="champion.year"> · {{ champion.year }}</ng-container></span></div>
      <app-song-album-art [url]="champion.albumCoverUrl" [title]="champion.title"></app-song-album-art>
    </section>
    <dialog #dialog class="champion-dialog" aria-labelledby="champion-title" (close)="dismiss()" (cancel)="dismiss()">
      <ng-container *ngIf="champion"><div class="celebration-stars" aria-hidden="true">✦ ✳ ✦</div><span class="champion-label">YOUR BRACKET CHAMPION</span>
        <app-song-album-art [url]="champion.albumCoverUrl" [title]="champion.title"></app-song-album-art>
        <h2 id="champion-title">The champion is {{ champion.title }}!</h2><p>{{ champion.album }}<ng-container *ngIf="champion.album && champion.year"> · </ng-container>{{ champion.year }}</p>
        <button type="button" (click)="dismiss()" autofocus>View bracket</button>
      </ng-container>
    </dialog>
  `,
  styles: [`:host{display:block}.history-champion{margin:18px 0}.history-champion app-song-album-art{--album-art-size:72px;margin-left:auto;flex:none}.champion-dialog{box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-height:calc(100dvh - 40px);overflow-y:auto;padding:32px 24px;border:1px solid #c5ab75;border-radius:10px;background:#334a43;color:#fff8e9;text-align:center;box-shadow:0 20px 80px #18251e55}.champion-dialog::backdrop{background:#18251e99}.champion-dialog app-song-album-art{--album-art-size:160px;margin:22px auto}.celebration-stars{font-size:38px;letter-spacing:14px;color:#f1ce87}.champion-label{display:block;font:10px 'DM Mono',monospace;letter-spacing:.15em;color:#ecd7ac;margin-top:12px}.champion-dialog h2{font:700 30px/1.25 'Space Grotesk',sans-serif;overflow-wrap:anywhere;margin:18px 0 10px}.champion-dialog p{color:#d6d9c9;font-size:13px}.champion-dialog button{margin-top:14px;padding:12px 20px;border:1px solid #ecd7ac;border-radius:5px;background:#f1ce87;color:#253c31;font:600 12px 'DM Mono',monospace;cursor:pointer}`]
})
export class BracketChampionComponent implements OnChanges, AfterViewInit {
  constructor(private readonly changeDetector: ChangeDetectorRef) {}
  @Input() champion: BracketChampion | null = null;
  @Input() bracketId = 0;
  @Input() celebrate = true;
  @ViewChild('dialog') dialog?: ElementRef<HTMLDialogElement>;
  celebrating = false;
  private announced = '';
  private get storageKey(): string { return `bracket-champion-${this.bracketId}`; }
  ngOnChanges(): void { this.sync(); }
  ngAfterViewInit(): void { queueMicrotask(() => {if (!this.dialog?.nativeElement.isConnected) return;this.sync();this.changeDetector.markForCheck();}); }
  private sync(): void {
    if (!this.bracketId) return;
    if (!this.champion) {
      this.announced = ''; this.celebrating = false;
      this.dialog?.nativeElement.close();
      try { sessionStorage.removeItem(this.storageKey); } catch {}
      return;
    }
    if (!this.celebrate || !this.dialog) return;
    let seen = this.announced;
    try { seen = sessionStorage.getItem(this.storageKey) || seen; } catch {}
    if (seen === this.champion.title) return;
    this.announced = this.champion.title;
    this.celebrating = true;
    this.dialog.nativeElement.showModal();
  }
  dismiss(): void {
    if (this.champion) { try { sessionStorage.setItem(this.storageKey, this.champion.title); } catch {} }
    this.celebrating = false;
    this.dialog?.nativeElement.close();
  }
}
