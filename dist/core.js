export const STORAGE_KEY = 'gunpla-library.v1';
export const STATUSES = ['Unbuilt', 'Building', 'Completed'];
export const GRADES = ['All kits', 'HG', 'RG', 'MG', 'PG', 'EG', 'SD', 'More'];
export function emptyState() { return {version: 1, entries: {}, customKits: []}; }
export function safeUrl(value) {
  if (!value) return '';
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function validateState(raw) {
  const fail = () => { throw new Error('This file is not a valid Gunpla Library backup. Your collection has not changed.'); };
  if (!raw || raw.version !== 1 || !raw.entries || typeof raw.entries !== 'object' || Array.isArray(raw.entries) || !Array.isArray(raw.customKits)) fail();
  if (Object.keys(raw.entries).length > 20000 || raw.customKits.length > 10000) fail();
  const state = emptyState();
  for (const [id, entry] of Object.entries(raw.entries)) {
    if (!/^[bmdc]-[a-zA-Z0-9_-]{1,100}$/.test(id) || !entry || typeof entry.owned !== 'boolean' || typeof entry.wishlist !== 'boolean' || !STATUSES.includes(entry.status)) fail();
    state.entries[id] = {owned:entry.owned, wishlist:entry.wishlist, status:entry.status};
  }
  const ids = new Set();
  for (const k of raw.customKits) {
    if (!k || typeof k.id !== 'string' || !/^c-[a-zA-Z0-9-]{1,100}$/.test(k.id) || ids.has(k.id) || typeof k.name !== 'string' || !k.name.trim() || k.name.length > 180) fail();
    for (const field of ['grade','scale','series']) if (typeof k[field] !== 'string' || k[field].length > 150) fail();
    if (k.manualUrl && !safeUrl(k.manualUrl)) fail();
    ids.add(k.id);
    state.customKits.push({id:k.id,name:k.name.trim(),nameJa:'',grade:k.grade,scale:k.scale,series:k.series,release:'',productUrl:'',image:'',manualUrl:safeUrl(k.manualUrl),kind:'Kit',custom:true});
  }
  return state;
}
export function normalize(s) { return String(s).normalize('NFKC').toLowerCase().replace(/ν/g,'nu').replace(/[^\p{L}\p{N}]/gu,''); }
export function hasManual(k) { return Boolean(k.manualUrl || k.communityUrl); }
export function releaseNumber(k) { const m=k.release.match(/(\d{4})\D*(\d{1,2})?/); return m ? Number(m[1])*100 + Number(m[2] || 0) : 0; }
export function filterKits(kits, entries, filters) {
  const terms=filters.query.trim().split(/\s+/).map(normalize).filter(Boolean);
  return kits.filter(k => {
    const e=entries[k.id];
    if (filters.view==='collection' && !e?.owned) return false;
    if (filters.view==='wishlist' && !e?.wishlist) return false;
    if ((filters.view==='manuals' || filters.manualOnly) && !hasManual(k)) return false;
    if (k.kind==='Accessory' && !filters.accessories && filters.view!=='collection' && filters.view!=='wishlist') return false;
    if (filters.grade==='More' && ['HG','RG','MG','PG','EG','SD'].includes(k.grade)) return false;
    if (!['All kits','More'].includes(filters.grade) && k.grade!==filters.grade) return false;
    if (filters.series && k.series!==filters.series) return false;
    if (filters.status && (!e?.owned || e.status!==filters.status)) return false;
    const text=normalize([k.name,k.nameJa,k.grade,k.scale,k.series,k.code || ''].join(' '));
    return terms.every(t=>text.includes(t));
  });
}
