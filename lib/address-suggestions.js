const selector='#peAddress,#iAddress,#vAddress,#iSiteAddress,#vMeetingAddress,#iBilling,#cBilling,#f-adresse,input[data-s="address"]';
export function addressLabels(data){return [...new Set((data?.features||[]).map(f=>f.properties?.label).filter(v=>typeof v==='string'&&v.trim()))].slice(0,5);}
export function installAddressSuggestions(doc=document,fetcher=(...args)=>fetch(...args),delay=400){
 let dispose=()=>{},serial=0;
 const focus=e=>{
  const input=e.target;if(!input.matches?.(selector)||input.disabled||input.readOnly)return;
  dispose();const win=doc.defaultView;
  let timer,controller,revision=0,labels=[],active=-1,choosing=false;
  const box=doc.createElement('div');box.className='addressSuggestions';box.hidden=true;
  const list=doc.createElement('div');list.id='addressSuggestions-'+(++serial);list.setAttribute('role','listbox');
  const status=doc.createElement('small');status.setAttribute('role','status');box.append(list,status);input.after(box);
  const attrs=['role','autocomplete','aria-autocomplete','aria-controls','aria-expanded','aria-activedescendant'];
  const previous=attrs.map(k=>[k,input.getAttribute(k)]);
  input.setAttribute('role','combobox');input.setAttribute('autocomplete','off');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');
  const cancel=()=>{revision++;clearTimeout(timer);controller?.abort();};
  const hide=()=>{box.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;};
  const choose=i=>{if(!labels[i])return;cancel();choosing=true;input.value=labels[i];input.dispatchEvent(new win.Event('input',{bubbles:true}));input.dispatchEvent(new win.Event('change',{bubbles:true}));choosing=false;hide();};
  const search=()=>{
   if(choosing)return;cancel();hide();labels=[];list.replaceChildren();
   const query=input.value.trim();if(query.length<4||query.length>200)return;
   const stamp=revision;
   timer=setTimeout(async()=>{
    const requestController=new AbortController();controller=requestController;const timeout=setTimeout(()=>requestController.abort(),8000);
    try{
     const url=new URL('https://data.geopf.fr/geocodage/search');url.search=new URLSearchParams({q:query,index:'address',limit:'5',autocomplete:'1'});
     const response=await fetcher(url.href,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
     if(!response.ok)throw Error('Service indisponible');const data=await response.json();
     if(stamp!==revision||!input.isConnected||doc.activeElement!==input)return;
     labels=addressLabels(data);list.replaceChildren();
     labels.forEach((label,i)=>{const item=doc.createElement('button');item.type='button';item.tabIndex=-1;item.id=list.id+'-'+i;item.setAttribute('role','option');item.setAttribute('aria-selected','false');item.textContent=label;item.onpointerdown=e=>e.preventDefault();item.onclick=()=>choose(i);list.append(item);});
     status.textContent=labels.length?'Adresses françaises · IGN / Base Adresse Nationale':'Aucune proposition. Vous pouvez conserver votre saisie.';
     box.hidden=false;input.setAttribute('aria-expanded',String(!!labels.length));
    }catch{
     if(stamp!==revision||!input.isConnected||doc.activeElement!==input)return;
     list.replaceChildren();status.textContent='Suggestions indisponibles. Saisissez l’adresse librement.';box.hidden=false;
    }finally{clearTimeout(timeout);}
   },delay);
  };
  const key=e=>{
   if(e.key==='Escape'&&!box.hidden){e.preventDefault();e.stopPropagation();cancel();hide();return;}
   if(box.hidden||!labels.length)return;
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();active=(active+(e.key==='ArrowDown'?1:-1)+labels.length)%labels.length;
    [...list.children].forEach((b,i)=>b.setAttribute('aria-selected',String(i===active)));input.setAttribute('aria-activedescendant',list.children[active].id);
   }else if(e.key==='Enter'&&active>=0){e.preventDefault();choose(active);}
  };
  const blur=()=>dispose();
  input.addEventListener('input',search);input.addEventListener('keydown',key);input.addEventListener('blur',blur);
  dispose=()=>{cancel();box.remove();input.removeEventListener('input',search);input.removeEventListener('keydown',key);input.removeEventListener('blur',blur);for(const [k,v] of previous){if(v===null)input.removeAttribute(k);else input.setAttribute(k,v);}dispose=()=>{};};
 };
 doc.addEventListener('focusin',focus);
 return ()=>{dispose();doc.removeEventListener('focusin',focus);};
}
