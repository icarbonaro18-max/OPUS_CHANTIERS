// Only affects choices for new work; historical records are never removed.
const closed=new Set(['terminee','facturee','convertie','annulee','cancelled','cloturee','archivee','archived','closed']);
export const activeSuggestion=row=>!row.archivedAt&&!row.closedAt&&!closed.has(row.status);
export const activeProject=row=>activeSuggestion(row)&&!['04','99'].includes(String(row.category||'').slice(0,2));
const date=row=>{for(const value of [row.createdAt,row.createdDateTime,row.plannedStart]){const t=Date.parse(value);if(Number.isFinite(t))return t;}return 0;};
export const newestFirst=(a,b)=>date(b)-date(a)||String(b.number||b.name||'').localeCompare(String(a.number||a.name||''),'fr',{numeric:true});
export function suggestedRows(rows,predicate=activeSuggestion,keepIds=[]){return rows.filter(r=>predicate(r)||keepIds.includes(r.id)).slice().sort(newestFirst);}
