import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { loadFrontendModule } from './test-support/frontend-module.mjs';
const client=await loadFrontendModule(new URL('../src/app/shared/data-access/api-client.ts',import.meta.url));
const source=readFileSync(new URL('../src/app/app.component.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
const context=createContext({exports:{},Error,URLSearchParams,setInterval,clearInterval,setTimeout,clearTimeout,window:{location:{hash:''}},require:name=>name==='@angular/core'?{Component:()=>()=>{}}:name==='./shared/data-access/api-client'?client:{}});
runInContext(compiled,context);
const user={userId:7,email:'user@example.com',displayName:'Test User',role:'member'};

test('session expiry signs out the shell, clears private navigation, and stops polling',async()=>{
  const app=new context.exports.AppComponent({async getCurrentUser(){return null;}},{detectChanges(){},markForCheck(){}},{url:'/brackets',async navigateByUrl(){}},{async getParticipating(){return [];}});
  try {
    await app.restoreSession();
    app.acceptLogin(user);await Promise.resolve();
    app.userBrackets=[{bracketId:1}];app.password='temporary';app.confirmPassword='temporary';
    assert.equal(app.authState,'signedIn');assert.ok(app.bracketRefreshTimer);
    client.apiSession.expire(client.apiSession.generation);
    assert.equal(app.authState,'signedOut');assert.equal(app.authUser,null);assert.equal(app.userBrackets.length,0);
    assert.equal(app.password,'');assert.equal(app.confirmPassword,'');assert.equal(app.bracketRefreshTimer,undefined);
    assert.equal(app.authMode,'login');assert.equal(app.authError,'Your session has expired. Please log in again.');
  } finally { app.ngOnDestroy(); }
});
