export async function countDocuments(g,id,seen=new Set()){
 if(seen.has(id))throw Error('Arborescence circulaire');const path=new Set(seen).add(id);let total=0;
 for(const row of await g.children(id)){if(row.name==='_OPUS'||/^(desktop\.ini|intervention\.json)$/i.test(row.name))continue;if(row.folder)total+=await countDocuments(g,row.id,path);else total++;}return total;
}
export async function displayDocumentCounts(g,root){
 for(const badge of root.querySelectorAll('[data-folder-count]')){if(!badge.isConnected)return;try{const n=await countDocuments(g,badge.dataset.folderCount);if(badge.isConnected){badge.textContent=String(n);badge.setAttribute('aria-label',n+' document'+(n===1?'':'s'));badge.title=n+' document'+(n===1?'':'s');}}catch{if(badge.isConnected)badge.textContent='À vérifier';}}
}
