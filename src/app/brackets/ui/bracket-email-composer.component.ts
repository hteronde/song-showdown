import {CommonModule} from '@angular/common';
import {ChangeDetectorRef, Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {apiRequest} from '../../shared/data-access/api-client';
import {InvitationParticipant} from '../data-access/brackets-api.service';

@Component({
  selector:'app-bracket-email-composer', standalone:true, imports:[CommonModule,FormsModule],
  templateUrl:'./bracket-email-composer.component.html', styleUrls:['./bracket-email-composer.component.css']
})
export class BracketEmailComposerComponent implements OnDestroy {
  constructor(private readonly changeDetector:ChangeDetectorRef) {}
  @ViewChild('dialog') dialog?:ElementRef<HTMLDialogElement>;
  @Output() sent=new EventEmitter<string>();
  title=''; subject=''; body=''; feedback='';
  recipients:InvitationParticipant[]=[];
  selected=new Set<number>();
  loading=false; sending=false; attempted=false;
  private bracketId=0;
  private requestId='';
  private generation=0;
  private controller?:AbortController;
  async open(bracketId:number,title:string):Promise<void> {
    if(this.sending)return;
    this.controller?.abort();this.controller=new AbortController();
    const generation=++this.generation;
    this.bracketId=bracketId;this.title=title;this.subject='';this.body='';this.feedback='';
    this.recipients=[];this.selected=new Set();this.attempted=false;this.loading=true;
    this.requestId=crypto.randomUUID();this.dialog?.nativeElement.showModal();
    try {
      const data=await apiRequest<{participants:InvitationParticipant[]}>(`/api/admin/brackets/${bracketId}/invitations`,{signal:this.controller.signal});
      if(generation!==this.generation)return;
      this.recipients=data.participants.filter(person=>person.status==='accepted');
      this.selected=new Set(this.recipients.map(person=>Number(person.userId)));
    } catch(error) {
      if(generation===this.generation)this.feedback=error instanceof Error?error.message:'Could not load participants.';
    } finally {
      if(generation===this.generation){this.loading=false;this.changeDetector.markForCheck();}
    }
  }
  selectAll():void {if(!this.attempted)this.selected=new Set(this.recipients.map(person=>Number(person.userId)));}
  deselectAll():void {if(!this.attempted)this.selected=new Set();}
  toggle(id:number):void {
    if(this.attempted)return;
    const selected=new Set(this.selected);selected.has(id)?selected.delete(id):selected.add(id);this.selected=selected;
  }
  close():void {
    if(this.sending)return;
    ++this.generation;this.controller?.abort();this.loading=false;this.dialog?.nativeElement.close();
  }
  async send():Promise<void> {
    if(this.sending||this.loading||!this.selected.size||!this.subject.trim()||!this.body.trim())return;
    this.sending=true;this.attempted=true;this.feedback='';
    const generation=this.generation;
    try {
      const result=await apiRequest<{sent:number;failed:number}>(`/api/admin/brackets/${this.bracketId}/email`,{
        method:'POST',json:{subject:this.subject,body:this.body,requestId:this.requestId,recipientIds:[...this.selected]},timeoutMs:120000,signal:this.controller?.signal
      });
      if(generation!==this.generation)return;
      this.feedback=result.failed?`${result.sent} emails accepted for delivery; ${result.failed} failed. You can retry this message.`:`${result.sent} emails accepted for delivery.`;
      if(!result.failed){this.dialog?.nativeElement.close();this.sent.emit(this.feedback);}
    } catch(error) {
      if(generation===this.generation)this.feedback=error instanceof Error?error.message:'Could not send the email.';
    } finally {if(generation===this.generation){this.sending=false;this.changeDetector.markForCheck();}}
  }
  ngOnDestroy():void {++this.generation;this.controller?.abort();}
}
