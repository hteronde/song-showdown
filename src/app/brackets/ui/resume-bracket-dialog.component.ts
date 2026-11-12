import {ChangeDetectorRef,Component,ElementRef,EventEmitter,OnDestroy,Output,ViewChild} from '@angular/core';
import {CommonModule} from '@angular/common';
import {apiRequest} from '../../shared/data-access/api-client';
import {BracketSessionsData} from '../data-access/bracket.model';
import {sessionEditorRows,sessionSchedulePayload} from '../feature/session-schedule';
import {EditableSessionRow,SessionDateFieldsComponent} from './session-date-fields.component';
@Component({selector:'app-resume-bracket-dialog',standalone:true,imports:[CommonModule,SessionDateFieldsComponent],
  template: `<dialog #dialog aria-labelledby="resume-title" (cancel)="$event.preventDefault();close()">
    <h3 id="resume-title">Resume bracket</h3>
    <p>Review the session schedule before resuming. Dates below include the time spent on hold. Edit upcoming dates as needed; saving uses these exact dates.</p>
    <p *ngIf="loading" role="status">Loading sessions…</p>
    <ng-container *ngIf="plan && !loading">
      <span class="stat-label">BRACKET SCHEDULE</span><h3>Individual sessions</h3>
      <p>Dates use your local time zone. Sessions cannot overlap. Past sessions and the opening time of a session already underway are locked.</p>
      <p *ngIf="plan.noTimer">Untimed sessions may have no end date. Leave a future start blank to open it after the preceding session is decided.</p>
      <app-session-date-fields [sessions]="onlineSessions" [saving]="saving" [noTimer]="plan.noTimer"></app-session-date-fields>
      <p *ngIf="hasFinale">Finale scheduling stays unchanged. You can manage it from Edit bracket.</p>
    </ng-container>
    <p *ngIf="error" role="alert" class="error">{{error}}</p>
    <div class="actions"><button type="button" (click)="save()" [disabled]="loading || saving || !plan">{{saving ? 'Saving…' : 'Save dates and resume'}}</button><button type="button" class="cancel" (click)="close()" [disabled]="saving">Cancel</button></div>
  </dialog>`,
  styles:[`dialog{width:min(960px,calc(100vw - 32px));max-height:calc(100dvh - 40px);box-sizing:border-box;overflow:auto;border:1px solid #e5e3db;border-radius:5px;padding:24px 20px;background:#fcfbf8;color:#30312b;box-shadow:0 20px 70px #24251e33}dialog::backdrop{background:#24251e80}h3{margin:7px 0 18px;font-size:22px}p{font-size:14px;line-height:1.6;color:#667267}.stat-label{font-size:11px;letter-spacing:.1em}.actions{display:flex;gap:12px;margin-top:24px}button{padding:12px 18px;border:1px solid #34382f;border-radius:5px;background:#34382f;color:white;cursor:pointer}.cancel{background:transparent;color:#34382f}button:disabled{opacity:.5;cursor:default}.error{color:#a32e26}`]})
export class ResumeBracketDialogComponent implements OnDestroy {
  constructor(private readonly changes:ChangeDetectorRef){}
  @ViewChild('dialog') dialog?:ElementRef<HTMLDialogElement>;
  @Output() resumed=new EventEmitter<void>();
  plan:BracketSessionsData|null=null;
  sessions:EditableSessionRow[]=[];
  loading=false;saving=false;error='';
  private controller?:AbortController;
  private version=0;
  get onlineSessions():EditableSessionRow[]{return this.sessions.filter(row=>!row.isFinale);}
  get hasFinale():boolean{return this.sessions.some(row=>row.isFinale);}
  async open(id:number):Promise<void>{
    if(this.saving)return;
    this.controller?.abort();this.controller=new AbortController();const version=++this.version;
    this.plan=null;this.sessions=[];this.error='';this.loading=true;this.dialog?.nativeElement.showModal();
    try{
      const plan=await apiRequest<BracketSessionsData>(`/api/admin/brackets/${id}/resume`,{signal:this.controller.signal});
      if(version!==this.version)return;
      this.plan=plan;this.sessions=sessionEditorRows(plan.sessions);
    }catch(error){if(version===this.version)this.error=error instanceof Error?error.message:'Could not load sessions.';}
    finally{if(version===this.version){this.loading=false;this.changes.markForCheck();}}
  }
  close():void{if(this.saving)return;this.version++;this.controller?.abort();this.dialog?.nativeElement.close();}
  async save():Promise<void>{
    if(!this.plan || this.loading || this.saving)return;
    this.saving=true;this.error='';
    try{
      const dates=sessionSchedulePayload(this.sessions);
      await apiRequest(`/api/admin/brackets/${this.plan.bracketId}/resume`,{method:'POST',json:{revision:this.plan.revision,pausedAt:this.plan.effectiveAt,sessions:this.sessions.map((row,i)=>({weekId:row.weekId,opensAt:dates[i].opensAt,closesAt:dates[i].closesAt}))},signal:this.controller?.signal});
      this.dialog?.nativeElement.close();this.resumed.emit();
    }catch(error){this.error=error instanceof Error?error.message:'Could not resume bracket.';}
    finally{this.saving=false;this.changes.markForCheck();}
  }
  ngOnDestroy():void{this.version++;this.controller?.abort();}
}
