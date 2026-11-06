import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector:'app-song-album-art',standalone:true,imports:[CommonModule],
  template:`<img *ngIf="url && url !== failedUrl; else fallback" [src]="url" [alt]="'Album cover for ' + title" loading="lazy" referrerpolicy="no-referrer" (error)="failedUrl=url">
    <ng-template #fallback><div class="cover-fallback" role="img" [attr.aria-label]="'Album artwork unavailable for ' + title"><div class="record"><i></i></div><small>ALBUM ART UNAVAILABLE</small></div></ng-template>`,
  styles:[`:host{display:block;width:var(--album-art-size,160px);max-width:100%;aspect-ratio:1;border-radius:4px;overflow:hidden;box-shadow:0 3px 10px #24251e18}img{display:block;width:100%;height:100%;object-fit:cover}.cover-fallback{height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:8px;padding:12px;background:#efede6}.record{width:65%;aspect-ratio:1;border-radius:50%;background:repeating-radial-gradient(#30332d 0 2px,#42463b 3px 4px);display:grid;place-items:center}.record i{display:block;width:25%;aspect-ratio:1;border:4px solid #bd9271;background:#e2c6a8;border-radius:50%}small{font:7px 'DM Mono',monospace;letter-spacing:.04em;text-align:center;color:#8b897f}`]
})
export class SongAlbumArtComponent {
  @Input() url:string|null|undefined=null;
  @Input() title='';
  failedUrl:string|null|undefined;
}
