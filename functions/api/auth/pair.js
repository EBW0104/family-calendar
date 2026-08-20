import {json, randomToken, makeSession, cookie} from './_utils.js';

export async function onRequestPost({request, env}) {
  let body={}; try{body=await request.json()}catch{}
  if(!env.PAIRING_KEY || body.pairingKey!==env.PAIRING_KEY)return json({error:'Incorrect pairing key.'},403);
  const refresh=await env.FAMILY_DISPLAY_KV.get('google_refresh_token');
  if(refresh){
    const sid=await makeSession(env);
    return json({paired:true},200,{'set-cookie':cookie('fd_session',sid)});
  }
  const ticket=randomToken(24);
  await env.FAMILY_DISPLAY_KV.put('pair_ticket:'+ticket,'1',{expirationTtl:600});
  return json({authorizationUrl:'/api/auth/start?ticket='+encodeURIComponent(ticket)});
}
