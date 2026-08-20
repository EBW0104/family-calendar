import {json, getCookie, clearCookie} from './_utils.js';
export async function onRequestPost({request, env}) {
  const id=getCookie(request,'fd_session');
  if(id)await env.FAMILY_DISPLAY_KV.delete('session:'+id);
  return json({ok:true},200,{'set-cookie':clearCookie('fd_session')});
}
