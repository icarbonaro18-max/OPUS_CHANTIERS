// An existing case is edited as a patch: untouched inputs cannot rewrite client
// snapshots, legacy fields, timestamps or the linked calendar allocation.
export function captureEditState(form){
 const read=id=>{
  if(id==='teamPerson')return JSON.stringify([...form.querySelectorAll('[name=teamPerson]:checked')].map(e=>e.value).sort());
  const input=form.querySelector('#'+id);return input?input.type==='checkbox'?input.checked:input.value:undefined;
 };
 const values=new Map([...form.querySelectorAll('input[id],textarea[id],select[id]')].map(e=>[e.id,read(e.id)]));values.set('teamPerson',read('teamPerson'));
 return {changed:(...ids)=>ids.some(id=>values.get(id)!==read(id))};
}
export function validateEditedFields(form,state){
 for(const input of form.querySelectorAll('input[id],textarea[id],select[id]')){
  if(input.disabled||input.closest('[hidden]')||!state.changed(input.id)||input.checkValidity())continue;
  const label=input.closest('div')?.querySelector('label')?.textContent||input.id;
  throw Error('Vérifiez le champ « '+label.trim()+' ».');
 }
}
export function preserveUnedited(record,before,state,prefix){
 const fields=prefix==='i'?{
  iTitle:['title'],iRequest:['request'],iSiteName:['siteName'],iSiteAddress:['siteAddress'],iSiteContact:['siteContact'],iSitePhone:['sitePhone'],iSiteEmail:['siteEmail'],iAccess:['siteAccess'],iMission:['missionType'],iAgreement:['billingAgreement'],iStart:['plannedStart'],iEnd:['plannedEnd'],iSize:['teamSize'],iVehicle:['vehicle'],iWeekends:['plannedWeekends'],teamPerson:['teamIds']
 }:{vType:['type'],vSiteName:['siteName'],vMeetingAddress:['siteAddress'],vContact:['siteContact'],vContactPhone:['sitePhone','phone'],vContactEmail:['siteEmail','email'],vAccess:['siteAccess'],vReq:['request'],vStart:['plannedStart'],vEnd:['plannedEnd']};
 const restore=key=>{if(Object.hasOwn(before,key))record[key]=before[key];else delete record[key];};
 for(const [id,keys] of Object.entries(fields))if(!state.changed(id))for(const key of keys)restore(key);
 const clientFields=['Mode','Client','Site','Kind','Name','First','Address','Phone','Email'].map(s=>prefix+s);
 if(!state.changed(...clientFields)){for(const key of ['clientId','siteId'])restore(key);if(before.clientName!=null)restore('clientName');}
 if(before.billingAddress!=null&&!state.changed(...clientFields,...(prefix==='i'?['iBilling']:[])))restore('billingAddress');
 if(!schedulingChanged(state,prefix))restore('status');
}
export function schedulingChanged(state,prefix){return state.changed(...(prefix==='i'?['iStart','iEnd','iSize','iVehicle','iWeekends','teamPerson']:['vStart','vEnd']));}
export function restoreRecord(record,before){for(const key of Object.keys(record))delete record[key];Object.assign(record,before);}
