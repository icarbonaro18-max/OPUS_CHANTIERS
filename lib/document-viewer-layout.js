// Apply the reader's structural layout at opening time, including with a stale theme stylesheet.
export function layoutDocumentViewer(root=document){
 const viewer=root.getElementById('viewer'),bar=viewer.querySelector('.viewerToolbar'),title=root.getElementById('viewerTitle');
 Object.assign(bar.style,{display:'grid',gridTemplateColumns:'minmax(0, 1fr)',alignItems:'center',gap:'6px 10px',padding:'8px',flex:'0 0 auto',maxHeight:'35%',overflow:'auto'});
 Object.assign(title.style,{display:'block',minWidth:'0',maxWidth:'100%',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',overflowWrap:'normal',wordBreak:'normal',fontSize:'13px',lineHeight:'1.4'});
 title.title=title.textContent;
 Object.assign(root.getElementById('closeViewer')?.style||{},{justifySelf:'start'});
 bar.querySelectorAll('.pager').forEach(p=>Object.assign(p.style,{gridColumn:'1 / -1',display:'flex',flexWrap:'wrap',minWidth:'0',gap:'6px',alignItems:'center'}));
 bar.querySelectorAll('button').forEach(b=>Object.assign(b.style,{whiteSpace:'nowrap',minHeight:'40px',padding:'6px 10px',fontSize:'12px',flex:'0 0 auto'}));
 Object.assign(root.getElementById('viewerBody').style,{flex:'1 1 0',minHeight:'0',minWidth:'0',padding:'12px',overflow:'auto'});
}
