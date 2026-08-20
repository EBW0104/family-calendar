import {getCookie, clearCookie, makeSession, cookie, siteOrigin} from './_utils.js';

export async function onRequestGet({request, env}) {
  const u=new URL(request.url),code=u.searchParams.get('code'),state=u.searchParams.get('state'),err=u.searchParams.get('error');
  if(err)return new Response('Google authorization failed: '+err,{status:400});
  const cookieState=getCookie(request,'fd_oauth_state');
  if(!code || !state || state!==cookieState || await env.FAMILY_DISPLAY_KV.get('oauth_state:'+state)!=='1')return new Response('Invalid OAuth state.',{status:400});
  await env.FAMILY_DISPLAY_KV.delete('oauth_state:'+state);
  const redirectUri=siteOrigin(request,env)+'/api/auth/callback';
  const body=new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:'authorization_code'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  const data=await r.json();
  if(!r.ok)return new Response('Token exchange failed: '+JSON.stringify(data),{status:500});
  if(data.refresh_token)await env.FAMILY_DISPLAY_KV.put('google_refresh_token',data.refresh_token);
  const stored=await env.FAMILY_DISPLAY_KV.get('google_refresh_token');
  if(!stored)return new Response('Google did not return a refresh token. Revoke the app in your Google Account permissions and try pairing again.',{status:500});
  const sid=await makeSession(env);
  const headers=new Headers({location:'/?google=connected'});
  headers.append('set-cookie',cookie('fd_session',sid));
  headers.append('set-cookie',clearCookie('fd_oauth_state'));
  return new Response(null,{status:302,headers});
}
