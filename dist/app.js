import {STORAGE_KEY,STATUSES,GRADES,emptyState,safeUrl,validateState,normalize,hasManual,releaseNumber,filterKits} from './core.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',box:'m12 3 9 5-9 5-9-5 9-5z M3 8v9l9 5 9-5V8 M12 13v9 M7.5 5.5l9 5',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',book:'M12 5c-4-3-8-2-9-1v15c3-2 6-1 9 1 3-2 6-3 9-1V4c-3-2-6-1-9 1z M12 5v15',database:'M21 5c0 4-18 4-18 0s18-4 18 0z M3 5v14c0 4 18 4 18 0V5 M3 12c0 4 18 4 18 0',plus:'M12 5v14 M5 12h14',tool:'M14 6a6 6 0 0 0-8 8L2 18l4 4 4-4a6 6 0 0 0 8-8l-4 4-4-4 4-4z',search:'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',list:'M9 5h12 M9 12h12 M9 19h12 M3 5h1 M3 12h1 M3 19h1',download:'M12 3v12 m-5-5 5 5 5-5 M4 15v6h16v-6',upload:'M12 16V4 m-5 5 5-5 5 5 M4 16v5h16v-5',check:'m5 12 4 4L19 6',arrow:'M7 17 17 7 M7 7h10v10'};
const icon=n=>`<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[n] || paths.box}"/></svg>`;
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
let catalog=[],meta={},state=emptyState(),storageBlocked=false,currentPage=1,detailId='',toastTimer;
const filters={view:'catalog',query:'',grade:'All kits',series:'',sort:'popular',status:'',manualOnly:false,accessories:false};
const pageSize=24;
const views={catalog:['Kit catalog','The Gunpla library.','Discover kits, find instructions, and make room for your next build.','Explore the catalog'],collection:['My collection','Your very own hangar.','A place for every kit, from the first runner to the final detail.','Your collection'],wishlist:['Wishlist','The next build awaits.','Keep your favorites close. Give your next project a place to land.','On your wishlist'],manuals:['Instruction library','Every build needs a guide.','Official instructions and community references, linked to the right kit.','Find your instructions']};
function kits() { return [...catalog,...state.customKits]; }
function entry(id) { return state.entries[id] || {owned:false,wishlist:false,status:'Unbuilt'}; }
function toast(message) { $('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500); }
function persist(next) {
  if (storageBlocked) { toast('Existing browser data could not be read. Export or recover it before making changes.');return false; }
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(next));state=next;return true; }
  catch { toast('Browser storage is unavailable or full. Your change was not saved.');return false; }
}
function change(id,patch) {
  const next={...state,entries:{...state.entries,[id]:{...entry(id),...patch}}};
  if (persist(next)) {render();if($('#kit-dialog').open)renderDetail(detailId);return true;}return false;
}
function title(k) {
  let name=k.name.replace(/^(ENTRY GRADE|FULL MECHANICS|MEGA SIZE|HG[A-Z]*|RG|MGEX|MGSD|MG|PG|RE\/100|SD[A-Z]*)\s+(?:1\/\d+\s*)?/i,'');
  // Keep source spelling for names and versions; format only all-caps English words.
  return name.replace(/\b[A-Z]{3,}\b/g,w=>['GUNDAM','UNICORN','FREEDOM','DESTINY','BARBATOS','AERIAL','STRIKE','WING','ZERO','NU','SAZABI','GOD','EXIA','ZETA','SINANJU','KSHATRIYA','TALLGEESE','JUSTICE','CALIBARN'].includes(w)?w[0]+w.slice(1).toLowerCase():w);
}
function dateLabel(k) { const n=releaseNumber(k);return n?`${Math.floor(n/100)}${n%100?'-'+String(n%100).padStart(2,'0'):''}`:'Release not listed'; }
function image(k,large=false) { return safeUrl(k.image)?`<img src="${esc(k.image)}" alt="${esc(title(k))}" ${large?'':'loading="lazy"'} referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><div class="image-placeholder" hidden>${icon('box')}<span>${esc(k.grade)} · ${esc(k.scale || 'Gunpla')}</span></div>`:`<div class="image-placeholder">${icon('box')}<span>${esc(k.grade)} · ${esc(k.scale || 'Gunpla')}</span></div>`; }
function manualLink(k) {
  if(k.custom && k.manualUrl)return `<a class="manual-link community" href="${esc(safeUrl(k.manualUrl))}" target="_blank" rel="noopener noreferrer">${icon('book')}Your manual link ↗</a>`;
  if(k.manualUrl)return `<a class="manual-link available" href="${esc(safeUrl(k.manualUrl))}" target="_blank" rel="noopener noreferrer">${icon('book')}Official manual ↗</a>`;
  if(k.communityUrl)return `<a class="manual-link community" href="${esc(safeUrl(k.communityUrl))}" target="_blank" rel="noopener noreferrer">${icon('book')}Community guide ↗</a>`;
  return `<span class="manual-link">${icon('book')}Manual not linked</span>`;
}
function buildSelect(k,e) {return `<select class="build-select" aria-label="Build status for ${esc(title(k))}" data-status="${esc(k.id)}">${STATUSES.map(s=>`<option ${e.status===s?'selected':''}>${s}</option>`).join('')}</select>`;}
function card(k) {
  const e=entry(k.id);
  return `<article class="kit-card"><div class="kit-visual"><button class="image-open" data-detail="${esc(k.id)}" aria-label="View ${esc(title(k))}">${image(k)}</button><span class="grade-badge grade-${esc(k.grade)}">${esc(k.grade)}</span><button class="wish-button ${e.wishlist?'on':''}" data-wish="${esc(k.id)}" aria-label="${e.wishlist?'Remove from':'Add to'} wishlist: ${esc(title(k))}" aria-pressed="${e.wishlist}">${icon('heart')}</button></div><div class="kit-text"><div class="kit-series">${esc(k.series==='Not classified'?'BANDAI GUNPLA':k.series)}</div><button class="kit-name" data-detail="${esc(k.id)}" title="${esc(title(k))}">${esc(title(k))}</button><div class="kit-meta"><span>${esc(k.scale || k.grade)}</span><span>${esc(dateLabel(k))}</span>${k.custom?'<span>Personal entry</span>':''}</div></div><div class="kit-footer">${manualLink(k)}<button class="own-button ${e.owned?'on':''}" data-own="${esc(k.id)}" aria-pressed="${e.owned}" aria-label="${e.owned?'Remove from':'Add to'} collection: ${esc(title(k))}">${icon(e.owned?'check':'plus')}${e.owned?'Owned':'Collect'}</button></div>${e.owned?buildSelect(k,e):''}</article>`;
}
function priority(k) {
  if(k.id==='b-4573102671554000')return 0;
  const n=normalize(title(k));
  const picks=[['RG','νgundam'],['MG','gundambarbatos'],['HG','gundamaerial'],['RG','sazabi'],['MG','winggundamzeroewverka'],['RG','hiνgundam'],['HG','gundamcalibarn'],['MG','freedomgundamver20'],['RG','godgundam']];
  const p=picks.findIndex(([g,s])=>k.grade===g && n===normalize(s));
  return p<0?100:p+1;
}
function renderStats(all) {
  const owned=all.filter(k=>entry(k.id).owned),building=owned.filter(k=>entry(k.id).status==='Building').length,built=owned.filter(k=>entry(k.id).status==='Completed').length;
  $('#catalog-count').textContent=all.length.toLocaleString();$('#owned-count').textContent=owned.length;$('#wish-count').textContent=all.filter(k=>entry(k.id).wishlist).length;
  $('#stat-catalog').textContent=all.length.toLocaleString();$('#stat-owned').textContent=owned.length;$('#stat-building').textContent=building;$('#built-count').textContent=`${built} completed`;$('#stat-manuals').textContent=all.filter(hasManual).length.toLocaleString();
}
function render() {
  const all=kits();renderStats(all);
  let found=filterKits(all,state.entries,filters);
  found.sort((a,b)=>filters.sort==='name'?title(a).localeCompare(title(b)):filters.sort==='grade'?a.grade.localeCompare(b.grade)||title(a).localeCompare(title(b)):filters.sort==='newest'?releaseNumber(b)-releaseNumber(a):priority(a)-priority(b)||Number(!a.image)-Number(!b.image)||releaseNumber(b)-releaseNumber(a));
  const pages=Math.max(1,Math.ceil(found.length/pageSize));currentPage=Math.min(currentPage,pages);
  $('#result-total').textContent=found.length.toLocaleString();$('#loading').hidden=true;
  const start=(currentPage-1)*pageSize;
  $('#results').innerHTML=found.slice(start,start+pageSize).map(card).join('') || `<div class="empty">${icon(filters.view==='wishlist'?'heart':filters.view==='collection'?'box':'search')}<h3>${filters.view==='collection'?'Your hangar is ready.':filters.view==='wishlist'?'Good builds start with a wishlist.':'No matching kits yet.'}</h3><p>${filters.view==='collection'?'Tap Collect on a kit to add it, then set its build status.':filters.view==='wishlist'?'Tap the heart on any kit to save it here.':'Try another spelling, clear your filters, or add a missing kit.'}</p><button class="secondary" id="reset-filters">${['collection','wishlist'].includes(filters.view)?'Browse the catalog':'Clear filters'}</button></div>`;
  const nums=[...new Set([1,currentPage-1,currentPage,currentPage+1,pages])].filter(n=>n>=1&&n<=pages).sort((a,b)=>a-b);
  $('#pagination').innerHTML=found.length?`<span>Showing ${start+1}–${Math.min(start+pageSize,found.length)} of ${found.length.toLocaleString()}</span><div><button data-page="${currentPage-1}" ${currentPage===1?'disabled':''} aria-label="Previous page">←</button>${nums.map((n,i)=>(i&&n>nums[i-1]+1?'<span>…</span>':'')+`<button data-page="${n}" class="${n===currentPage?'current':''}" ${n===currentPage?'aria-current="page"':''}>${n}</button>`).join('')}<button data-page="${currentPage+1}" ${currentPage===pages?'disabled':''} aria-label="Next page">→</button></div>`:'';
}
function renderDetail(id) {
  const k=kits().find(k=>k.id===id);if(!k)return;detailId=id;const e=entry(id);
  $('#kit-detail').innerHTML=`<div class="detail-layout"><div class="detail-image">${image(k,true)}</div><div class="detail-body"><div class="eyebrow">${esc(k.grade)} ${k.scale?' / '+esc(k.scale):''}</div><h2>${esc(title(k))}</h2>${k.nameJa&&k.nameJa!==k.name?`<p class="original-name">${esc(k.nameJa)}</p>`:''}<dl class="detail-facts"><div><dt>Series</dt><dd>${esc(k.series)}</dd></div><div><dt>Release</dt><dd>${esc(dateLabel(k))}</dd></div><div><dt>Model code</dt><dd>${esc(k.code || 'Not listed')}</dd></div><div><dt>Collection</dt><dd>${e.owned?esc(e.status):'Not collected'}</dd></div></dl><div class="detail-actions"><button class="${e.owned?'secondary':'primary'}" data-own="${esc(id)}">${icon(e.owned?'check':'plus')}${e.owned?'Remove from collection':'Add to my collection'}</button>${e.owned?buildSelect(k,e):''}<button class="secondary" data-wish="${esc(id)}">${icon('heart')}${e.wishlist?'Remove from wishlist':'Save to wishlist'}</button>${k.manualUrl?`<a class="primary" href="${esc(safeUrl(k.manualUrl))}" target="_blank" rel="noopener noreferrer">${icon('book')}${k.custom?'Open your instruction link':'Open official instructions'} ↗</a>`:k.communityUrl?`<a class="primary" href="${esc(safeUrl(k.communityUrl))}" target="_blank" rel="noopener noreferrer">${icon('book')}Open Dalong instructions ↗</a><span class="muted">Community information page. Look for the manual section.</span>`:'<span class="muted">No exact-kit instruction link has been verified yet.</span>'}</div><div class="detail-links">${k.productUrl?`<a href="${esc(safeUrl(k.productUrl))}" target="_blank" rel="noopener noreferrer">Bandai product page ↗</a>`:''}<a href="https://manual.bandai-hobby.net/?freeword=${encodeURIComponent(k.nameJa || k.name)}" target="_blank" rel="noopener noreferrer">Search Bandai ↗</a><a href="https://www.dalong.net/reviews/dalong_search_e.htm?q=${encodeURIComponent(title(k))}" target="_blank" rel="noopener noreferrer">Search Dalong ↗</a>${k.custom?`<button data-delete="${esc(id)}">Delete personal entry</button>`:''}</div></div></div>`;
}
function updateView() {
  const name=location.hash.slice(1);filters.view=Object.hasOwn(views,name)?name:'catalog';currentPage=1;
  const [crumb,title,desc,section]=views[filters.view];$('#crumb').textContent=crumb;$('#view-title').textContent=title;$('#view-description').textContent=desc;$('#section-title').firstChild.textContent=section+' ';$('#feature').hidden=filters.view!=='catalog';
  document.querySelectorAll('[data-view]').forEach(a=>{a.classList.toggle('active',a.dataset.view===filters.view);if(a.dataset.view===filters.view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  $('#manual-only').disabled=filters.view==='manuals';$('#manual-only').checked=filters.view==='manuals'||filters.manualOnly;render();
}
function resetFilters() {
  filters.query='';filters.grade='All kits';filters.series='';filters.status='';filters.manualOnly=false;filters.accessories=false;
  $('#search').value='';$('#series').value='';$('#status').value='';$('#manual-only').checked=false;$('#accessories').checked=false;renderGrades();currentPage=1;
}
function renderGrades() { $('#grades').innerHTML=GRADES.map(g=>`<button class="${filters.grade===g?'selected':''}" data-grade="${g}" aria-pressed="${filters.grade===g}">${g}</button>`).join(''); }
function download(data,filename) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.addEventListener('click',event=>{
  const el=event.target.closest('button');if(!el)return;
  if(el.dataset.own){const e=entry(el.dataset.own);if(change(el.dataset.own,{owned:!e.owned}))toast(e.owned?'Removed from collection':'Added to collection');}
  else if(el.dataset.wish){const e=entry(el.dataset.wish);if(change(el.dataset.wish,{wishlist:!e.wishlist}))toast(e.wishlist?'Removed from wishlist':'Saved to wishlist');}
  else if(el.dataset.detail){renderDetail(el.dataset.detail);$('#kit-dialog').showModal();}
  else if(el.dataset.grade){filters.grade=el.dataset.grade;currentPage=1;renderGrades();render();}
  else if(el.dataset.page){currentPage=Number(el.dataset.page);render();$('.catalog-section').scrollIntoView({behavior:'smooth',block:'start'});}
  else if(el.dataset.delete){if(confirm('Delete this personal kit entry and its collection status?')){const entries={...state.entries};delete entries[el.dataset.delete];if(persist({...state,entries,customKits:state.customKits.filter(k=>k.id!==el.dataset.delete)})){$('#kit-dialog').close();render();toast('Personal kit deleted');}}}
  else if(el.id==='reset-filters'){resetFilters();if(['collection','wishlist'].includes(filters.view))location.hash='catalog';else render();}
  else if(el.classList.contains('close-dialog'))el.closest('dialog').close();
});
document.addEventListener('change',e=>{if(e.target.dataset.status)change(e.target.dataset.status,{status:e.target.value,owned:true});});
$('#search').addEventListener('input',e=>{filters.query=e.target.value;currentPage=1;render();});
for(const [id,key] of [['series','series'],['sort','sort'],['status','status']])$('#'+id).addEventListener('change',e=>{filters[key]=e.target.value;currentPage=1;render();});
for(const [id,key] of [['manual-only','manualOnly'],['accessories','accessories']])$('#'+id).addEventListener('change',e=>{filters[key]=e.target.checked;currentPage=1;render();});
for(const mode of ['grid','list'])$('#'+mode+'-view').addEventListener('click',()=>{$('#results').classList.toggle('list-mode',mode==='list');for(const m of ['grid','list']){$('#'+m+'-view').classList.toggle('selected',m===mode);$('#'+m+'-view').setAttribute('aria-pressed',String(m===mode));}});
for(const id of ['data-button','coverage-button'])$('#'+id).addEventListener('click',()=>$('#data-dialog').showModal());
$('#add-kit').addEventListener('click',()=>{$('#add-error').textContent='';$('#add-dialog').showModal();});
$('#add-form').addEventListener('submit',e=>{
  e.preventDefault();const f=new FormData(e.target),manual=f.get('manual').trim(),name=f.get('name').trim();
  if(!name){$('#add-error').textContent='Enter a kit name.';return;}
  if(manual&&!safeUrl(manual)){$('#add-error').textContent='Use a complete HTTPS instruction link.';return;}
  const kit={id:'c-'+crypto.randomUUID(),name,nameJa:'',grade:f.get('grade'),scale:f.get('scale').trim(),series:f.get('series').trim()||'Personal entry',release:'',productUrl:'',image:'',manualUrl:safeUrl(manual),kind:'Kit',custom:true};
  const entries={...state.entries};if(f.has('owned'))entries[kit.id]={owned:true,wishlist:false,status:'Unbuilt'};
  if(persist({...state,entries,customKits:[...state.customKits,kit]})){$('#add-dialog').close();e.target.reset();resetFilters();location.hash=f.has('owned')?'collection':'catalog';updateView();renderDetail(kit.id);$('#kit-dialog').showModal();toast('Personal kit added');}
});
$('#export').addEventListener('click',()=>{
  if(storageBlocked){let raw='';try{raw=localStorage.getItem(STORAGE_KEY) || '';}catch{}download({recoveryRawData:raw},'gunpla-library-recovery.json');toast('Recovery file exported');return;}
  download(state,`gunpla-library-backup-${new Date().toISOString().slice(0,10)}.json`);toast('Backup exported');
});
$('#import').addEventListener('click',()=>$('#import-file').click());
$('#import-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try {
    if(file.size>5*1024*1024)throw new Error('Choose a backup smaller than 5 MB.');
    const imported=validateState(JSON.parse(await file.text()));
    if(storageBlocked)throw new Error('Existing data needs recovery first. Keep a recovery export and reopen in a fresh browser profile.');
    if(!confirm(`Merge ${Object.keys(imported.entries).length} kit records and ${imported.customKits.length} personal entries? Existing records for the same kit will use the imported values.`))return;
    const custom=new Map(state.customKits.map(k=>[k.id,k]));imported.customKits.forEach(k=>custom.set(k.id,k));
    if(persist({version:1,entries:{...state.entries,...imported.entries},customKits:[...custom.values()]})){render();toast('Backup imported');}
  }catch(err){toast(err instanceof SyntaxError?'This file is not valid JSON. Your collection has not changed.':err.message);}finally{e.target.value='';}
});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();$('#search').focus();}});
window.addEventListener('hashchange',()=>{resetFilters();updateView();});
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){try{state=e.newValue?validateState(JSON.parse(e.newValue)):emptyState();render();if($('#kit-dialog').open)renderDetail(detailId);}catch{storageBlocked=true;toast('Another tab changed library data to an unreadable format. Reload to recover.');}}});
async function init() {
  try {const raw=localStorage.getItem(STORAGE_KEY);if(raw)state=validateState(JSON.parse(raw));}catch{storageBlocked=true;toast('Saved library data could not be read. Use Backup to export a recovery file.');}
  try {
    const response=await fetch('catalog.json');if(!response.ok)throw new Error('Catalog could not be loaded.');const data=await response.json();catalog=data.kits;meta=data.meta;
    const series=[...new Set(catalog.map(k=>k.series))].sort();$('#series').innerHTML='<option value="">All series</option>'+series.map(s=>`<option>${esc(s)}</option>`).join('');
    $('#feature-image').src='mecha.svg';$('#feature-image').alt='Original geometric mecha illustration';$('#feature-name').textContent='SMALL PARTS. BIG POSSIBILITIES.';
    $('#snapshot-date').textContent=`Source snapshot · ${meta.updated}`;
    $('#coverage').innerHTML=`<p><strong>${meta.bandaiProductRecords.toLocaleString()}</strong> official product records, <strong>${meta.officialManuals.toLocaleString()}</strong> official manual entries, and <strong>${(meta.communityManuals||0).toLocaleString()}</strong> community instruction links after matching.</p><p>${esc(meta.coverage)}</p><p>Different grades and editions remain separate. Some source records may describe the same release differently and remain separate when a confident match is unavailable. Unclassified series and Japanese source names are kept rather than guessed. Images load from Bandai when available.</p><p><a href="https://www.bandaispirits.co.jp/products/search/result.php?category=1" target="_blank" rel="noopener noreferrer">Bandai Spirits product catalog ↗</a><br><a href="https://manual.bandai-hobby.net/" target="_blank" rel="noopener noreferrer">Bandai official manual library ↗</a><br><a href="https://www.dalong.net/reviews/about_e.htm" target="_blank" rel="noopener noreferrer">Dalong community library ↗</a></p><p>Catalog updates are not automatic. Manual pages may change or be unavailable. Personal links are user supplied and are labeled separately.</p>`;
    renderGrades();updateView();
  }catch(err){$('#loading').innerHTML=`<h3>We couldn’t load the catalog.</h3><p>${esc(err.message)} Please reload to try again.</p>`;}
}
init();
