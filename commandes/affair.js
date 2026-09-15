export function affairIdentity(project='',fallback=''){
 const label=String(project||'').replace(/_/g,' ').replace(/\s+/g,' ').trim();
 const match=label.match(/\b(20\d{2}-\d{4,8})\b/);
 const number=match?.[1]||String(fallback||'').trim();
 const name=match?label.replace(match[0],'').replace(/^\s*[-–·]\s*/,'').trim():label;
 return {number,name,label};
}
export function matchAffair(projects,reference){
 const ref=String(reference||'').trim();if(!ref)return null;
 const digits=ref.match(/^(?:20\d{2}[- ]+)?(\d{4,8})$/)?.[1];
 const matches=projects.filter(p=>{const a=affairIdentity(p.name);if(/^20\d{2}[- ]\d{4,8}$/.test(ref))return a.number===ref.replace(' ','-');return digits&&a.number?Number(a.number.split('-').at(-1))===Number(digits):a.label.toLowerCase()===ref.replace(/_/g,' ').toLowerCase();});
 return matches.length===1?matches[0]:null;
}
