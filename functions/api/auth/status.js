import {json, validSession} from './_utils.js';
export async function onRequestGet({request, env}) {
  const session=await validSession(request,env);
  const refresh=!!(await env.FAMILY_DISPLAY_KV.get('google_refresh_token'));
  return json({connected:session&&refresh,serverAuthorized:refresh});
}
