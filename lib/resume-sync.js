// Browser lifecycle signals are complementary on iOS and Android.
export function installResumeSync({window,document,refresh,markStale,checkpoint,onError=()=>{},now=()=>Date.now()}){
 let busy=null,last=0;
 const run=()=>{if(document.hidden||busy||now()-last<1500)return busy;last=now();markStale();busy=Promise.resolve().then(refresh).catch(onError).finally(()=>{busy=null;});return busy;};
 const visible=()=>{if(document.hidden){checkpoint();markStale();}else run();};
 document.addEventListener('visibilitychange',visible);window.addEventListener('focus',run);window.addEventListener('pageshow',run);
 return ()=>{document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',run);window.removeEventListener('pageshow',run);};
}
