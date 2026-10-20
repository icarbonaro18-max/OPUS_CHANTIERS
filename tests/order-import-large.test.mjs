import test from 'node:test';
import assert from 'node:assert/strict';
import {compactOrderText,orderBatches,mergeOrderParts,extractOrder} from '../commandes/import.js';
import {createHandler} from '../api/commande.js';
const line=i=>({reference:`REF-${i}`,description:`Article ${i}`,quantity:String(i+1),unit:'P.'});
const part=(items,number='BC1')=>({supplier:'Rexel',number,date:'',clientReference:'Affaire',deliveryMode:'inconnu',destination:'',availability:'',notes:'',warnings:[],items});
const res=()=>({setHeader(){},status(s){this.code=s;return this;},json(x){this.data=x;}});
test('long Outlook links compact without losing thirty item references and quantities',()=>{
 const rows=Array.from({length:30},(_,i)=>`Réf Rexel : REF-${i}\nQuantité : ${i+1}\n<https://emea01.safelinks.protection.outlook.com/?url=${encodeURIComponent('https://example.org/product/REF-'+i+'?id='+i+'&utm_source=email')}&data=${'x'.repeat(2000)}>\n`);
 const source=rows.join('\n'),clean=compactOrderText(source);
 assert.ok(source.length>50000);assert.ok(clean.length<10000);
 for(let i=0;i<30;i++){assert.ok(clean.includes(`Réf Rexel : REF-${i}\nQuantité : ${i+1}\n`));assert.ok(clean.includes(`product/REF-${i}?id=${i}`));}
 assert.equal(orderBatches(source,[]).length,1);assert.equal(compactOrderText(clean),clean);
});
test('thirty pages are transmitted once, in bounded sequential batches, all rows preserved',async()=>{
 const images=Array.from({length:30},(_,i)=>`data:image/jpeg;base64,${String(i).padStart(2,'0')}${'A'.repeat(900000)}`);
 const batches=orderBatches('Résumé',images);assert.deepEqual(batches.flatMap(x=>x.images),images);
 assert.equal(batches.filter(x=>x.text).length,1);
 for(const b of batches){assert.ok(Buffer.byteLength(JSON.stringify(b))<=3000000);assert.ok(b.images.length<=4);}
 let n=0,active=false;const seen=[];
 const order=await extractOrder('Résumé',images,async b=>{assert.equal(active,false);active=true;await Promise.resolve();seen.push(...b.images);const items=b.images.map(()=>line(n++));active=false;return {order:part(items)};});
 assert.equal(order.items.length,30);assert.deepEqual(seen,images);assert.deepEqual(order.items,Array.from({length:30},(_,i)=>line(i)));
});
test('failure gives no partial order and stops further requests',async()=>{
 let calls=0;await assert.rejects(extractOrder('',Array(12).fill('data:image/jpeg;base64,AAAA'),async()=>{if(++calls===2)throw Error('Connexion expirée');return {order:part([line(1)])};}),/sources sont conservées/);assert.equal(calls,2);
});
test('merge refuses different orders, retains repeated rows and warns',()=>{
 assert.throws(()=>mergeOrderParts([part([line(1)]),part([line(2)],'BC2')]),/Plusieurs numéros/);
 const p=mergeOrderParts([part([line(1)]),part([line(1)])]);assert.equal(p.items.length,2);assert.match(p.warnings[0],/doublons/);
 assert.throws(()=>mergeOrderParts([part(Array.from({length:301},(_,i)=>line(i)))]),/300 lignes/);
});
test('limits fail explicitly without silently trimming material',()=>{
 assert.throws(()=>orderBatches('A'.repeat(180001),[]),/Aucune ligne/);
 assert.throws(()=>orderBatches('',Array(31).fill('image')),/30 pages/);
 assert.throws(()=>orderBatches('',['A'.repeat(3000001)]),/Une page/);
});
test('server accepts legacy long pasted email, cleans it, returns all thirty articles',async()=>{
 const source=Array.from({length:30},(_,i)=>`REF-${i} Qté ${i+1}\n<https://emea01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.org%2Fitem${i}&data=${'x'.repeat(2000)}>\n`).join('');
 let sent;const handler=createHandler({env:{OPENAI_API_KEY:'test'},fetcher:async(url,opts)=>url.includes('graph.microsoft')?{ok:true,json:async()=>({userPrincipalName:'ignazio@opuselec.fr'})}:{ok:true,json:async()=>{sent=JSON.parse(opts.body);return {status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(part(Array.from({length:30},(_,i)=>line(i))))}]}]};}}});
 const r=res();await handler({method:'POST',headers:{authorization:'Bearer test'},body:{text:source,images:[]}},r);
 assert.equal(r.code,200);assert.equal(r.data.order.items.length,30);assert.ok(sent.input[0].content[0].text.length<50000);assert.match(sent.instructions,/30 lignes/);
});
