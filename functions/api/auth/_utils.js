export const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks';

export function json(data, status=200, extraHeaders={}) {
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extraHeaders}});
}

export function randomToken(bytes=24) {
  const a=new Uint8Array(bytes); crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export function getCookie(request, name) {
  const raw=request.headers.get('cookie')||'';
  for(const part of raw.split(';')){
    const [k,...v]=part.trim().split('=');
    if(k===name)return decodeURIComponent(v.join('='));
  }
  return null;
}

export function cookie(name,value,maxAge=31536000) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function validSession(request, env) {
  const id=getCookie(request,'fd_session');
  if(!id)return false;
  return (await env.FAMILY_DISPLAY_KV.get('session:'+id))==='1';
}

export async function makeSession(env) {
  const id=randomToken(32);
  await env.FAMILY_DISPLAY_KV.put('session:'+id,'1',{expirationTtl:31536000});
  return id;
}

export function siteOrigin(request, env) {
  if(env.PUBLIC_BASE_URL)return String(env.PUBLIC_BASE_URL).replace(/\/$/,'');
  return new URL(request.url).origin;
}
