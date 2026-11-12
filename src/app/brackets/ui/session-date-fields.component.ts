import {Component,Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {SessionEditorRow} from '../feature/session-schedule';
export type EditableSessionRow=SessionEditorRow & {startLocked?:boolean;endLocked?:boolean};
@Component({selector:'app-session-date-fields',standalone:true,imports:[CommonModule,FormsModule],templateUrl:'./session-date-fields.component.html',styleUrls:['./session-date-fields.component.css']})
export class SessionDateFieldsComponent {
  @Input() sessions:EditableSessionRow[]=[];
  @Input() saving=false;
  @Input() noTimer=false;
}
