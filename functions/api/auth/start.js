import {SCOPES, randomToken, siteOrigin, cookie} from './_utils.js';

export async function onRequestGet({request, env}) {
  const u=new URL(request.url),ticket=u.searchParams.get('ticket');
  if(!ticket || await env.FAMILY_DISPLAY_KV.get('pair_ticket:'+ticket)!=='1')return new Response('Invalid or expired pairing ticket.',{status:403});
  await env.FAMILY_DISPLAY_KV.delete('pair_ticket:'+ticket);
  const state=randomToken(24);
  await env.FAMILY_DISPLAY_KV.put('oauth_state:'+state,'1',{expirationTtl:600});
  const redirectUri=siteOrigin(request,env)+'/api/auth/callback';
  const p=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:redirectUri,response_type:'code',scope:SCOPES,access_type:'offline',prompt:'consent',include_granted_scopes:'true',state});
  return new Response(null,{status:302,headers:{location:'https://accounts.google.com/o/oauth2/v2/auth?'+p.toString(),'set-cookie':cookie('fd_oauth_state',state,600)}});
}
