import {build} from 'esbuild';
import {mkdir,copyFile,cp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await mkdir('vendor',{recursive:true});
await build({stdin:{contents:"export * from '@azure/msal-browser';",resolveDir:process.cwd()},bundle:true,format:'esm',target:['chrome109','safari16'],outfile:'vendor/msal.js',minify:true,legalComments:'eof'});
await build({stdin:{contents:"export {jsPDF} from 'jspdf';",resolveDir:process.cwd()},bundle:true,format:'esm',target:['chrome109','safari16'],outfile:'vendor/jspdf.js',minify:true,legalComments:'eof'});
await build({stdin:{contents:"export {broadcastResponseToMainFrame} from '@azure/msal-browser/redirect-bridge';",resolveDir:process.cwd()},bundle:true,format:'esm',target:['chrome109','safari16'],outfile:'vendor/msal-bridge.js',minify:true,legalComments:'eof'});
await copyFile('node_modules/pdfjs-dist/legacy/build/pdf.min.mjs','vendor/pdf.mjs');
await copyFile('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs','vendor/pdf.worker.mjs');
await cp('node_modules/pdfjs-dist/standard_fonts','vendor/standard_fonts',{recursive:true});
await cp('node_modules/pdfjs-dist/cmaps','vendor/cmaps',{recursive:true});
await cp('node_modules/pdfjs-dist/wasm','vendor/wasm',{recursive:true});
await copyFile('node_modules/pdfjs-dist/LICENSE','vendor/LICENSE-PDFJS.txt');
for(const source of ['node_modules/@azure/msal-browser/LICENSE','node_modules/@azure/msal-browser/LICENSE.txt']){try{await copyFile(source,'vendor/LICENSE-MSAL.txt');break;}catch{}}
await rm('_site',{recursive:true,force:true});await mkdir('_site',{recursive:true});
for(const p of ['index.html','style.css','app.js','config.json','sw.js','manifest.webmanifest','reparer.html','auth.html','commandes','planning','lib','assets','vendor','modules','icon-512.png','icon-192.png','apple-touch-icon.png','favicon-64.png'])await cp(p,'_site/'+p,{recursive:true});
await writeFile('_site/.nojekyll','');

async function walk(dir){let out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
const paths=(await walk('_site')).map(p=>'./'+p.slice('_site/'.length)).filter(p=>!['./reparer.html','./auth.html','./commandes/outlook-auth.html','./.nojekyll','./sw.js'].includes(p)).sort();
await writeFile('_site/precache.json',JSON.stringify(paths));

// Keep the path list for older workers. Each new worker identifies exactly
// which responses it can reuse, even when a deployment overlaps an install.
const sha256=bytes=>createHash('sha256').update(bytes).digest('base64');
const revisions={};
for(const path of paths)revisions[path]=sha256(await readFile('_site/'+path));
const manifest=JSON.stringify(revisions);
await writeFile('_site/precache-integrity.json',manifest);
const worker=await readFile('sw.js','utf8');
const marker="const BUILD=null;";
if(!worker.includes(marker))throw Error('Empreinte du service worker introuvable.');
const metadata={hash:sha256(manifest),assets:revisions};
await writeFile('_site/sw.js',worker.replace(marker,()=> 'const BUILD='+JSON.stringify(metadata)+';'));
console.log('Build OPUS terminé : _site');
