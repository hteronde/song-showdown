import { apiErrorMessage } from '../../shared/data-access/api-client';
import {ActivatedRoute,Router} from '@angular/router';
import {Subscription} from 'rxjs';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FamilyMembersApiService } from '../data-access/family-members-api.service';
import { FamilyMemberInput, FamilyMemberRecord } from '../data-access/family-member.model';

@Component({
  selector: 'app-family-members-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './family-members-page.component.html'
})
export class FamilyMembersPageComponent implements OnInit, OnDestroy {
  constructor(private readonly route:ActivatedRoute,private readonly router:Router,private readonly changeDetector:ChangeDetectorRef,private readonly familyMembersApi: FamilyMembersApiService) {}

  members: FamilyMemberRecord[] = [];
  draft: FamilyMemberInput = this.emptyDraft();
  editingId: number | null = null;
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
    await this.loadMembers();
    if (version !== this.routeVersion || this.readController.signal.aborted) return;
    if(this.pageMode==='edit'&&!this.error) {
      const id=Number(this.route.snapshot.paramMap.get('id'));
      const item=this.members.find(item=>item.userId===id);
      if(item)this.populateDraft(item);else this.error='The requested member was not found.';
    }
    this.changeDetector.markForCheck();
  }
  add():void {void this.router.navigate(['/manage/family-members/new']);}
  edit(member:FamilyMemberRecord):void {void this.router.navigate(['/manage/family-members',member.userId,'edit']);}


  async loadMembers(): Promise<void> {
    this.readController.abort();
    const controller = this.readController = new AbortController();
    this.loading = true;
    try {
      const items = await this.familyMembersApi.getAll(controller.signal);
      if (controller.signal.aborted) return;
      this.members = items;
      if (!controller.signal.aborted) this.error = '';
    } catch (error) {
      if (!controller.signal.aborted) this.error = apiErrorMessage(error, 'Could not load family members.');
    } finally { if (!controller.signal.aborted) {this.loading = false;this.changeDetector.markForCheck();} }
  }

  private populateDraft(member: FamilyMemberRecord): void {
    this.editingId = member.userId;
    this.draft = { displayName: member.displayName, email: member.email, user_role: member.user_role };
    this.success = '';
  }

  cancelEdit():void {if(!this.saving)void this.router.navigate(['/manage/family-members']);}

  async saveMember(): Promise<void> {
    if(this.saving||this.loading||this.pageMode==='list'||(this.pageMode==='edit'&&this.editingId===null))return;
    this.saving = true;
    this.error = '';
    this.success = '';
    try {
      if (this.editingId === null) await this.familyMembersApi.create(this.draft);
      else await this.familyMembersApi.update(this.editingId, this.draft);
      this.success = this.editingId === null ? 'Family member added.' : 'Family member updated.';
      await this.router.navigate(['/manage/family-members'],{state:{message:this.success}});
    } catch (error) { this.error = apiErrorMessage(error, 'Could not save this family member.'); }
    finally { this.saving = false;this.changeDetector.markForCheck(); }
  }

  async deleteMember(member: FamilyMemberRecord): Promise<void> {
    if (!window.confirm(`Remove ${member.displayName} from the Morgan family? Their user account and existing votes will be kept.`)) return;
    this.error = '';
    try {
      await this.familyMembersApi.remove(member);
      if (this.editingId === member.userId) this.cancelEdit();
      this.success = 'Family member removed from the family.';
      await this.loadMembers();
    } catch (error) { this.error = apiErrorMessage(error, 'Could not remove this family member.'); }
  }

  private emptyDraft(): { displayName: string; email: string; user_role: 'super' | 'viewer' } {
    return { displayName: '', email: '', user_role: 'viewer' };
  }
}
