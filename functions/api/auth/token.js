import {json, validSession} from './_utils.js';

export async function onRequestGet({request, env}) {
  if(!await validSession(request,env))return json({error:'Not paired'},401);
  const refresh=await env.FAMILY_DISPLAY_KV.get('google_refresh_token');
  if(!refresh)return json({error:'Google is not authorized'},401);
  const body=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:refresh,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  const data=await r.json();
  if(!r.ok)return json({error:'Google token refresh failed',details:data.error||'unknown_error'},502);
  return json({access_token:data.access_token,expires_in:data.expires_in||3600,token_type:data.token_type||'Bearer'});
}
