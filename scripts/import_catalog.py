import concurrent.futures, html, json, re, time, unicodedata, urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
CACHE = ROOT / 'cache'
CACHE.mkdir(exist_ok=True)
OUT = ROOT.parent / 'dist'

def fetch(kind, page):
    path = CACHE / f'{kind}-{page}.html'
    if path.exists(): return path.read_text()
    url = (f'https://manual.bandai-hobby.net/?page={page}' if kind == 'manual' else
           f'https://www.bandaispirits.co.jp/products/search/result.php?category=1&dsp_cnt=60&paging={page}')
    for attempt in range(3):
        try:
            text = urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'GunplaPersonalLibrary/1.0'}),timeout=30).read().decode()
            path.write_text(text)
            return text
        except Exception:
            if attempt == 2: raise
            time.sleep(2)

def clean(s): return html.unescape(re.sub('<[^>]+>', '', s)).strip()
def norm(s): return re.sub(r'[\W_]+','',unicodedata.normalize('NFKC',s)).lower()
def extract(pattern,s):
    m=re.search(pattern,s,re.S)
    return clean(m.group(1)) if m else ''

series = ['Gundam SEED','Gundam Breaker Battlogue','Gundam Reconguista in G','Gundam Sentinel','Gundam Build Divers','Gundam Build Divers Re:RISE','Gundam Build Fighters','Gundam Build Metaverse','Gundam AGE','Victory Gundam','Zeta Gundam','Gundam The Origin','Cucuruz Doan’s Island','Gundam Thunderbolt','Gundam Narrative','Char’s Counterattack','Gundam Hathaway','Iron-Blooded Orphans','Mobile Suit Gundam','Gundam 00','Gundam 0080','Gundam F91','Gundam SEED Destiny','Gundam Twilight AXIS','Gundam ZZ','Gundam Unicorn','The Witch from Mercury','Crossbone Gundam','G Gundam','Gundam Wing','Gundam 0083','Gundam MS IGLOO','The 08th MS Team','Other Gunpla','Gundam X','The Blue Destiny','Advance of Z','Turn A Gundam','Gundam MSV','Moon Gundam']
SERIES={str(i+1):s for i,s in enumerate(series)}
SERIES.update({'67':'Gundam SEED Freedom','133':'Requiem for Vengeance','166':'Gundam GQuuuuuuX','331':'HaroPla','364':'Gundam SEED Freedom Zero'})
GRADE={'1':'HG','2':'EG','4':'FM','5':'HG','6':'MG','7':'MGEX','8':'MGSD','9':'PG','10':'RG','11':'SD','12':'SD','14':'SD','35':'SD','133':'RE/100','232':'Mega Size'}

def grade(name):
    s=unicodedata.normalize('NFKC',name).upper()
    for g in ['MGEX','MGSD','HGUC','HGAC','HGAW','HGFC','HGCE','HGBF','HGBD','HG','RG','MG','PG','RE/100']:
        if re.match(r'^'+re.escape(g)+r'(?=\W|\d|$)',s):return 'HG' if g.startswith('HG') else g
    if s.startswith('ENTRY GRADE'):return 'EG'
    if s.startswith('FULL MECHANICS'):return 'FM'
    if 'SD' in s[:12] or 'BB戦士' in s:return 'SD'
    if 'メガサイズ' in s:return 'Mega Size'
    return 'Other'

catalog=[];manuals=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    jobs={pool.submit(fetch,k,p):(k,p) for k,maxp in [('catalog',64),('manual',150)] for p in range(1,maxp+1)}
    for i,f in enumerate(concurrent.futures.as_completed(jobs),1):
        k,p=jobs[f];s=f.result()
        if k=='catalog':
            for block in s.split('<div class="m_cardA">')[1:]:
                m=re.search(r'href="([^"]+detail\.php[^\"]+)"',block)
                if not m:continue
                url='https://www.bandaispirits.co.jp'+html.unescape(m.group(1))
                name=extract(r'class="m_cardA__title">(.*?)</div>',block)
                id=re.search(r'prd_id=(\d+)',url).group(1)
                catalog.append({'id':'b-'+id,'name':name,'nameJa':name,'grade':grade(name),'scale':extract(r'(1/\d+)',unicodedata.normalize('NFKC',name)),'series':'Not classified','release':extract(r'class="m_cardA__date">(.*?)</div>',block),'productUrl':url,'image':extract(r'<img src="([^"]+)"',block),'manualUrl':'','kind':'Accessory' if any(x in name for x in ['デカール','アクションベース','エフェクト','LEDユニット','ビルダーズパーツ','オプションパーツ','武器セット']) else 'Kit'})
        else:
            # Out-of-range pages redirect to page 1. Only accept the requested active page.
            active=extract(r'bl_paging_item[^\"]*is-current">(\d+)',s)
            if active and int(active)!=p:continue
            for block in s.split('<div class="bl_result_item">')[1:]:
                id=extract(r'/menus/detail/(\d+)',block)
                if not id:continue
                title=extract(r'/images/titles/(\d+)\.jpeg',block)
                if title not in SERIES:continue
                raw=re.search(r'class="bl_result_name">(.*?)</div>',block,re.S).group(1)
                nameJa=clean(raw.split('<span')[0]);en=extract(r'class="bl_result_name_en">(.*?)</span>',raw)
                cat=extract(r'/images/categories/(\d+)\.jpeg',block)
                manuals.append({'id':'m-'+id,'name':en or nameJa,'nameJa':nameJa,'grade':GRADE.get(cat,grade(en or nameJa)),'scale':extract(r'(1/\d+)',unicodedata.normalize('NFKC',en or nameJa)),'series':SERIES[title],'release':extract(r'<dd>(.*?)</dd>',block),'productUrl':'','image':extract(r'<img src="([^"]+)"',block),'manualUrl':'https://manual.bandai-hobby.net/menus/detail/'+id,'kind':'Accessory' if cat in ['67','100'] else 'Kit'})
        if i%25==0:print(f'Fetched {i}/{len(jobs)} pages',flush=True)

catalog=list({x['id']:x for x in catalog}.values())
manuals=list({x['id']:x for x in manuals}.values())
index={}
for kit in catalog:index.setdefault(norm(kit['nameJa']),[]).append(kit)
matched=0
for m in manuals:
    targets=index.get(norm(m['nameJa']),[])
    if len(targets)==1:
        target=targets[0]
        for key in ['name','series','manualUrl','grade']:
            target[key]=m[key]
        if not target['scale']:target['scale']=m['scale']
        matched+=1
    else:catalog.append(m)

for k in catalog:
    if k['image'] and not k['image'].startswith('https://'):k['image']=''
catalog.sort(key=lambda x:(x['release'][:4],x['id']),reverse=True)
assert len({k['id'] for k in catalog})==len(catalog)
assert all(k['name'] and k['id'] for k in catalog)
meta={'updated':'2026-10-16','bandaiProductRecords':sum(k['id'].startswith('b-') for k in catalog),'officialManuals':len(manuals),'matchedManuals':matched,'totalRecords':len(catalog),'sources':['https://www.bandaispirits.co.jp/products/search/result.php?category=1','https://manual.bandai-hobby.net/'],'coverage':'Imported Bandai Spirits Gunpla category and Gundam-related entries from the official manual library. Historical, regional, and limited releases may be absent. Accessories are identified where the source name makes this clear. Japanese source names are retained when no official English name is supplied.'}
(OUT/'catalog.json').write_text(json.dumps({'meta':meta,'kits':catalog},ensure_ascii=False,separators=(',',':')))
print(json.dumps(meta,indent=2),flush=True)
