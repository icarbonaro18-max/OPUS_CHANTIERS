import test from 'node:test';import assert from 'node:assert/strict';
import {completeProject,ensureCompletionClock,canAutoArchive} from '../lib/project-lifecycle.js';
function setup(){const p={id:'p',category:'04'},old='2026-09-01T10:00:00Z',ui={user:{displayName:'Ignazio'},data:{projectTracking:[{id:'p',completedAt:old}],events:[],interventions:[]},repo:{save:async()=>{}},c:{isAdmin:()=>true,graph:{item:async id=>({id,lastModifiedDateTime:old}),children:async id=>id==='p'?[{id:'sub',folder:{},lastModifiedDateTime:old}]:[{id:'pdf',lastModifiedDateTime:old}]},syncProjectStages:async()=>{p.category='04';}}};return {p,ui};}
test('archive only after 15 full days, nested change resets delay and future appointment blocks it',async()=>{
 const {p,ui}=setup();assert.equal(await canAutoArchive(ui,p,new Date('2026-09-16T09:59:59Z')),false);assert.equal(await canAutoArchive(ui,p,new Date('2026-09-16T10:00:00Z')),true);
 ui.c.graph.children=async()=>[{id:'pdf',lastModifiedDateTime:'2026-09-10T10:00:00Z'}];assert.equal(await canAutoArchive(ui,p,new Date('2026-09-20T10:00:00Z')),false);assert.equal(await canAutoArchive(ui,p,new Date('2026-09-25T10:00:00Z')),true);
 ui.data.events=[{kind:'project',linkId:'p',end:'2026-09-26T10:00:00Z'}];assert.equal(await canAutoArchive(ui,p,new Date('2026-09-25T10:00:00Z')),false);
});
test('uncontrolled projects and technicians never auto archive; old completed projects get a fresh clock; failed reads stop archive',async()=>{
 const {p,ui}=setup();p.category='03';assert.equal(await canAutoArchive(ui,p,new Date('2026-10-01')),false);p.category='04';ui.c.isAdmin=()=>false;assert.equal(await canAutoArchive(ui,p,new Date('2026-10-01')),false);ui.c.isAdmin=()=>true;ui.data.projectTracking=[];assert.equal(await canAutoArchive(ui,p,new Date('2026-10-01')),false);await ensureCompletionClock(ui,p,new Date('2026-10-01'));assert.equal(ui.data.projectTracking[0].completedAt,'2026-10-01T00:00:00.000Z');ui.c.graph.children=async()=>{throw Error('offline');};await assert.rejects(canAutoArchive(ui,p,new Date('2026-11-01')),/offline/);
});
test('completion is administrator-only and failed storage does not approve control',async()=>{
 const {p,ui}=setup();p.category='03';ui.c.isAdmin=()=>false;await assert.rejects(completeProject(ui,p),/administrateur/);ui.c.isAdmin=()=>true;const before=structuredClone(ui.data.projectTracking);ui.repo.save=async()=>{throw Error('offline');};await assert.rejects(completeProject(ui,p),/offline/);assert.deepEqual(ui.data.projectTracking,before);assert.equal(p.category,'03');ui.repo.save=async()=>{};await completeProject(ui,p);assert.equal(p.category,'04');assert.equal(ui.data.projectTracking[0].controlApproved,true);assert.equal(ui.data.projectTracking[0].history.length,1);
});
