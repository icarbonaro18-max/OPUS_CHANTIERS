// Browser lifecycle signals are complementary on iOS and Android.
export function installResumeSync({window,document,refresh,markStale,checkpoint,onError=()=>{},now=()=>Date.now()}){
 let busy=null,last=-Infinity,stopped=false,retryOnline=false;
 const run=({stale=false,force=false}={})=>{
  if(stopped||document.hidden)return busy;
  // A network recovery can arrive while the failed/offline request is settling.
  // Keep one retry so the online event is not lost behind that request.
  if(busy){if(force)retryOnline=true;return busy;}
  if(!force&&now()-last<1500)return busy;
  last=now();if(stale)markStale();
  busy=Promise.resolve().then(refresh).catch(onError).finally(()=>{
   busy=null;if(retryOnline&&!stopped){retryOnline=false;void run({force:true});}
  });return busy;
 };
 const visible=()=>{if(document.hidden){checkpoint();markStale();}else run({stale:true});};
 // Focus can be a native date picker or another window closing. It is not a
 // loss of authentication or proof that the current form is outdated.
 const focus=()=>run(),pageshow=()=>run({stale:true}),online=()=>run({stale:true,force:true});
 document.addEventListener('visibilitychange',visible);window.addEventListener('focus',focus);window.addEventListener('pageshow',pageshow);window.addEventListener('online',online);
 return ()=>{stopped=true;retryOnline=false;document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',focus);window.removeEventListener('pageshow',pageshow);window.removeEventListener('online',online);};
}
