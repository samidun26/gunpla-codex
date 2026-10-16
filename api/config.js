export function publicConfiguration(env) {
  const url=env.SUPABASE_URL?.trim(),key=(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY)?.trim();
  if(!url&&!key)return {enabled:false};
  if(!url||!key)throw new Error('Both Supabase settings are required.');
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('Invalid Supabase URL.');
  let publicKey=key.startsWith('sb_publishable_');
  if(key.startsWith('eyJ')) {
    try{publicKey=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon';}catch{publicKey=false;}
  }
  if(!publicKey)throw new Error('A publishable or anon key is required. Never use a service role or secret key here.');
  return {enabled:true,url:parsed.origin,publishableKey:key};
}

export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  try{return res.status(200).json(publicConfiguration(process.env));}
  catch{return res.status(503).json({error:'Shared collection configuration is incomplete or invalid.'});}
}
