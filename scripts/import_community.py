import concurrent.futures,html,json,re,time,urllib.request,unicodedata
from pathlib import Path
ROOT=Path(__file__).parent
OUT=ROOT.parent/'dist/catalog.json'
def get(offset):
 p=ROOT/'cache'/f'dalong-{offset}.json'
 if p.exists():return json.loads(p.read_text())
 for attempt in range(3):
  try:
   d=json.load(urllib.request.urlopen(f'https://www.dalong.net/reviews/dalong_search.php?limit=100&offset={offset}&lang=en',timeout=30));p.write_text(json.dumps(d));return d
  except Exception:
   if attempt==2:raise
   time.sleep(2)
def norm(s):return re.sub(r'[\W_]+','',unicodedata.normalize('NFKC',s)).lower()
def grade(s):
 s=s.upper()
 if s.startswith('HG'):return 'HG'
 if s.startswith('SD') or s in ['BB','BB戦士']:return 'SD'
 if s=='ENTRY GRADE':return 'EG'
 if s=='FULL MECHANICS':return 'FM'
 return s if s in ['RG','MG','PG','MGEX','MGSD','RE/100','EG','FM'] else 'Other'
def route(k):
 c=k['category'].lower();f=k['folder_name']
 if c=='cg':
  if f in ['sh59a','sh59g']:c='seed'
  elif f=='agh10sp':c='age'
  elif f in ['bf09rg','h05b','h88b','hzb'] or f.startswith('bbh'):c='bf'
  elif f=='ms01r':c='etc'
  elif f.startswith('0'):c='00'
  elif f.startswith('m'):c='mg'
  elif f=='30pa' or f.startswith('h'):c='hg'
 return f'https://www.dalong.net/reviews/{c}/{f}/{f}_i.htm'
data=json.loads(OUT.read_text());kits=data['kits'];idx={}
for k in kits:idx.setdefault(norm(k['nameJa']),[]).append(k)
items=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as p:
 for d in p.map(get,range(0,5502,100)):items+=d['results']
pending=[];enriched=0
allowed=['HG','MG','RG','PG','SD','SD2','OLD','SEED','00','AGE','IB','BF']
for k in items:
 if not k.get('japanese_name'):continue
 match=idx.get(norm(k['japanese_name']),[])
 targets=match
 if len(match)>1:continue
 if not match:
  if any(t in k['english_name'].lower() for t in ['evangelion', 'ingram', 'griffon', 'mazinger', 'mazinkaiser', 'shin getter', 'gaogaigar', 'goldymarg', 'dunbine', 'group photo', 'camouflage 9 set']):continue
  if k['category'] not in allowed and not (k['category']=='CG' and grade(k['grade']) in ['MG','RG','PG','MGEX','MGSD']):continue
  # A few non-Gundam Figure-rise entries share the BF section.
  if k['folder_name'].startswith('frs'):continue
  scale=re.search(r'1/\d+',unicodedata.normalize('NFKC',k['japanese_name']))
  target={'id':'d-'+k['category'].lower()+'-'+k['folder_name'],'name':k['english_name'],'nameJa':k['japanese_name'],'grade':grade(k['grade']),'scale':scale.group() if scale else '', 'series':{'00':'Gundam 00','SEED':'Gundam SEED','AGE':'Gundam AGE','IB':'Iron-Blooded Orphans','BF':'Gundam Build Fighters','OLD':'Classic Gunpla'}.get(k['category'],'Not classified'),'release':k['release_date'],'productUrl':'','image':'','manualUrl':'','kind':'Kit'}
  kits.append(target);targets=[target]
 for t in targets:
  if t['name']==t['nameJa']:
   t['name']=k['english_name'];enriched+=1
  t['code']=k.get('code','')
  if not t['manualUrl']:pending.append((t,route(k)))

def verify(pair):
 t,u=pair
 p=ROOT/'cache'/('info-'+t['id']+'.json')
 if p.exists():return t,json.loads(p.read_text())
 try:
  with urllib.request.urlopen(u,timeout=15) as r:
   s=r.read().decode('utf-8',errors='replace')
   # Info pages must actually include manual-image references.
   ok=bool(re.search(r'(manual|설명서|매뉴얼|取扱説明書)',s,re.I))
   result=u if ok else ''
 except Exception:result=''
 p.write_text(json.dumps(result));return t,result
print('Checking community manual pages:',len(pending),flush=True)
count=0
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as p:
 for i,(t,u) in enumerate(p.map(verify,pending),1):
  if u:t['communityUrl']=u;count+=1
  if i%100==0:print(f'Checked {i}/{len(pending)}',flush=True)
data['meta'].update({'totalRecords':len(kits),'communityManuals':count,'englishNamesEnriched':enriched,'communitySource':'https://www.dalong.net/reviews/about_e.htm'})
data['meta']['coverage']+=' Community entries and English names are supplemented from Dalong; community manuals are linked only when an information page responds and mentions a manual. This is a source snapshot, not a claim of exhaustive coverage.'
for k in kits:
 if any(x in k['name'].upper() for x in ['EXPANSION PARTS SET','EFFECT SET','WEAPON SET','FIN FUNNEL EFFECT','HYPER MEGA BAZOOKA LAUNCHER','DISPLAY BASE']):k['kind']='Accessory'
data['meta'].update({'officialManualLinks':sum(bool(k['manualUrl']) for k in kits),'communityManualLinks':sum(bool(k.get('communityUrl')) for k in kits),'linkedInstructions':sum(bool(k['manualUrl'] or k.get('communityUrl')) for k in kits)})
data['meta']['communityManuals']=data['meta']['communityManualLinks']
assert len({k['id'] for k in kits})==len(kits)
OUT.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
print(json.dumps(data['meta'],indent=2),flush=True)
