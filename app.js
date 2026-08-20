const $ = (s)=>document.querySelector(s);
const $$ = (s)=>[...document.querySelectorAll(s)];
const state={token:null,tokenExpiresAt:0,tokenClient:null,calendars:[],events:[],taskLists:{},photos:[],photoIndex:0,idleTimer:null,photoTimer:null,lastInteraction:Date.now()};
const scopes='https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks';

function fmtTime(d){return new Intl.DateTimeFormat([], {hour:'numeric',minute:'2-digit'}).format(d)}
function fmtDate(d){return new Intl.DateTimeFormat([], {weekday:'long',month:'long',day:'numeric'}).format(d)}
function ymd(d){return d.toISOString().slice(0,10)}
function startOfWeek(d=new Date()){const x=new Date(d);const day=x.getDay();x.setHours(0,0,0,0);x.setDate(x.getDate()-day);return x}
function endOfWeek(d=new Date()){const x=startOfWeek(d);x.setDate(x.getDate()+7);return x}

function updateClock(){const d=new Date();$('#clock').textContent=fmtTime(d);$('#dateText').textContent=fmtDate(d)}
setInterval(updateClock,1000);updateClock();

function showDashboard(){ $('#idleView').classList.add('hidden'); $('#dashboard').classList.remove('hidden'); noteInteraction(); }
function showIdle(){ $('#dashboard').classList.add('hidden'); $('#idleView').classList.remove('hidden'); rotatePhoto(); }
$('#idleView').addEventListener('click',showDashboard);

function noteInteraction(){state.lastInteraction=Date.now();resetIdleTimer()}
['click','touchstart','keydown'].forEach(ev=>document.addEventListener(ev,e=>{if(!$('#dashboard').classList.contains('hidden')) noteInteraction()},{passive:true}));
function resetIdleTimer(){clearTimeout(state.idleTimer);const mins=Number(localStorage.getItem('idleMinutes')||5);state.idleTimer=setTimeout(showIdle,mins*60*1000)}

$$('.tab').forEach(btn=>btn.addEventListener('click',()=>{$$('.tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active');$$('.page').forEach(x=>x.classList.remove('active-page'));$('#'+btn.dataset.page).classList.add('active-page')}));

$('#settingsBtn').addEventListener('click',()=>{loadSettingsIntoDialog();$('#settingsDialog').showModal()});
$('#saveSettingsBtn').addEventListener('click',(e)=>{localStorage.setItem('googleClientId',$('#clientIdInput').value.trim());localStorage.setItem('idleMinutes',$('#idleMinutes').value);localStorage.setItem('photoSeconds',$('#photoSeconds').value);resetIdleTimer();restartPhotoTimer()});
function loadSettingsIntoDialog(){ $('#clientIdInput').value=localStorage.getItem('googleClientId')||''; $('#idleMinutes').value=localStorage.getItem('idleMinutes')||'5'; $('#photoSeconds').value=localStorage.getItem('photoSeconds')||'20'; updatePhotoCount() }

function setStatus(text,good=false,bad=false){const el=$('#syncStatus');el.textContent=text;el.className=good?'status-good':bad?'status-bad':''}

function initGoogleClient(){const id=(localStorage.getItem('googleClientId')||$('#clientIdInput').value||'').trim();if(!id){setStatus('Add your Google OAuth Client ID in Settings',false,true);return false}if(!window.google?.accounts?.oauth2){setStatus('Google sign-in library is still loading',false,true);return false}state.tokenClient=google.accounts.oauth2.initTokenClient({client_id:id,scope:scopes,callback:async(resp)=>{if(resp.error){setStatus('Google connection failed: '+resp.error,false,true);return}state.token=resp.access_token;state.tokenExpiresAt=Date.now()+(Number(resp.expires_in||3600)-60)*1000;setStatus('Connected to Google',true);await refreshAll()}});return true}
$('#connectGoogleBtn').addEventListener('click',()=>{localStorage.setItem('googleClientId',$('#clientIdInput').value.trim());if(initGoogleClient()) state.tokenClient.requestAccessToken({prompt:'consent'})});
$('#disconnectGoogleBtn').addEventListener('click',()=>{if(state.token&&window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(state.token,()=>{});state.token=null;state.tokenExpiresAt=0;state.calendars=[];state.events=[];state.taskLists={};renderAll();setStatus('Disconnected from Google')});

async function api(path,options={}){if(!state.token||Date.now()>=state.tokenExpiresAt) throw new Error('Google authorization expired. Tap Settings → Connect Google again.');const res=await fetch('https://www.googleapis.com'+path,{...options,headers:{'Authorization':'Bearer '+state.token,'Content-Type':'application/json',...(options.headers||{})}});if(!res.ok){const t=await res.text();throw new Error(t||('HTTP '+res.status))}if(res.status===204)return null;return res.json()}

async function refreshAll(){try{await Promise.all([loadCalendarsAndEvents(),loadTaskListsAndTasks()]);setStatus('Synced '+fmtTime(new Date()),true)}catch(e){console.error(e);setStatus(e.message||'Sync failed',false,true)}}
$('#refreshBtn').addEventListener('click',refreshAll);
setInterval(()=>{if(state.token&&Date.now()<state.tokenExpiresAt)refreshAll()},5*60*1000);

async function loadCalendarsAndEvents(){const list=await api('/calendar/v3/users/me/calendarList?minAccessRole=reader');state.calendars=(list.items||[]).filter(c=>c.selected!==false);const now=new Date();const max=new Date(now);max.setDate(max.getDate()+14);const all=[];for(const cal of state.calendars){const p=new URLSearchParams({timeMin:now.toISOString(),timeMax:max.toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'100'});const data=await api('/calendar/v3/calendars/'+encodeURIComponent(cal.id)+'/events?'+p);for(const ev of (data.items||[])) all.push({...ev,_calendarId:cal.id,_calendarName:cal.summary||'Calendar',_color:cal.backgroundColor||'#64748b'})}state.events=all.sort((a,b)=>eventStart(a)-eventStart(b));renderCalendar()}
function eventStart(ev){return new Date(ev.start?.dateTime||ev.start?.date||0)}
function renderCalendar(){const filters=$('#calendarFilters');filters.innerHTML='';for(const c of state.calendars){const b=document.createElement('button');b.className='filter-chip active';b.textContent=c.summary||'Calendar';b.dataset.id=c.id;b.addEventListener('click',()=>{b.classList.toggle('active');renderCalendarEvents()});filters.appendChild(b)}renderCalendarEvents()}
function renderCalendarEvents(){const activeIds=new Set($$('#calendarFilters .active').map(b=>b.dataset.id));const target=$('#calendarEvents');const items=state.events.filter(e=>activeIds.has(e._calendarId));if(!items.length){target.className='event-list empty-state';target.textContent=state.token?'No upcoming events in the selected calendars.':'Connect Google in Settings to load calendars.';return}target.className='event-list';target.innerHTML='';for(const ev of items){const start=eventStart(ev);const allDay=!!ev.start?.date&&!ev.start?.dateTime;const row=document.createElement('div');row.className='event';row.innerHTML=`<div class="event-time">${allDay?'All day':escapeHtml(fmtTime(start))}</div><div><div class="event-title">${escapeHtml(ev.summary||'(No title)')}</div><div class="event-meta">${escapeHtml(fmtDate(start))}${ev.location?' • '+escapeHtml(ev.location):''}</div></div><div class="cal-chip">${escapeHtml(ev._calendarName)}</div>`;target.appendChild(row)}}

async function loadTaskListsAndTasks(){const lists=await api('/tasks/v1/users/@me/lists?maxResults=100');state.taskLists={};for(const wanted of ['Family','Emily Daily','Eric','Shopping']){let list=(lists.items||[]).find(x=>x.title===wanted);if(!list){list=await api('/tasks/v1/users/@me/lists',{method:'POST',body:JSON.stringify({title:wanted})})}const tasks=await api('/tasks/v1/lists/'+encodeURIComponent(list.id)+'/tasks?showCompleted=false&showHidden=false&maxResults=100');state.taskLists[wanted]={...list,tasks:(tasks.items||[]).filter(t=>t.status!=='completed')}}renderTasks()}
function taskDate(t){return t.due?new Date(t.due):null}
function renderTasks(){renderList('Family','#familyTasks',t=>{const d=taskDate(t);return d&&d>=startOfWeek()&&d<endOfWeek()},true);renderList('Emily Daily','#emilyTasks',t=>{const d=taskDate(t);return !d||ymd(d)===ymd(new Date())},false);renderList('Eric','#ericTasks',()=>true,true);renderList('Shopping','#shoppingTasks',()=>true,false)}
function renderList(name,selector,filter,showDue){const el=$(selector);const list=state.taskLists[name];if(!list){el.innerHTML='<div class="empty-state">Connect Google to load tasks.</div>';return}let tasks=(list.tasks||[]).filter(filter);tasks.sort((a,b)=>{const ad=taskDate(a)?.getTime()??Number.MAX_SAFE_INTEGER;const bd=taskDate(b)?.getTime()??Number.MAX_SAFE_INTEGER;return ad-bd});if(!tasks.length){el.innerHTML='<div class="empty-state">Nothing here.</div>';return}el.innerHTML='';for(const t of tasks){const row=document.createElement('label');row.className='task';const cb=document.createElement('input');cb.type='checkbox';cb.addEventListener('change',()=>completeTask(name,t.id,row));const wrap=document.createElement('div');const title=document.createElement('div');title.className='task-title';title.textContent=t.title||'(Untitled)';wrap.appendChild(title);if(showDue){const due=taskDate(t);const d=document.createElement('div');d.className='task-due'+(due&&due<new Date().setHours(0,0,0,0)?' overdue':'');d.textContent=due?(due<new Date().setHours(0,0,0,0)?'Overdue • ':'Due ')+fmtDate(due):'No due date';wrap.appendChild(d)}row.append(cb,wrap);el.appendChild(row)}}
async function completeTask(listName,taskId,row){try{const list=state.taskLists[listName];await api('/tasks/v1/lists/'+encodeURIComponent(list.id)+'/tasks/'+encodeURIComponent(taskId),{method:'PATCH',body:JSON.stringify({status:'completed'})});row.remove();await loadTaskListsAndTasks()}catch(e){setStatus(e.message,false,true)}}

$$('.add-task').forEach(btn=>btn.addEventListener('click',()=>openTaskDialog(btn.dataset.list)));
function openTaskDialog(name){$('#taskListName').value=name;$('#taskTitle').value='';$('#taskDue').value='';$('#taskDialogTitle').textContent=name==='Shopping'?'Add shopping item':'Add to '+name;const help=$('#taskHelp');if(name==='Eric'){help.textContent='Eric tasks require an expiration/due date.';$('#taskDue').required=true}else if(name==='Emily Daily'){help.textContent='If no date is selected, the task is treated as a daily item for today.';$('#taskDue').required=false;$('#taskDue').value=ymd(new Date())}else{help.textContent='';$('#taskDue').required=false}$('#taskDialog').showModal()}
$('#taskForm').addEventListener('submit',async(e)=>{e.preventDefault();const name=$('#taskListName').value,title=$('#taskTitle').value.trim(),due=$('#taskDue').value;if(!title)return;if(name==='Eric'&&!due){$('#taskHelp').textContent='Please choose an expiration/due date for Eric.';return}try{const list=state.taskLists[name];if(!list)throw new Error('Connect Google first.');const payload={title};if(due)payload.due=new Date(due+'T12:00:00Z').toISOString();await api('/tasks/v1/lists/'+encodeURIComponent(list.id)+'/tasks',{method:'POST',body:JSON.stringify(payload)});$('#taskDialog').close();await loadTaskListsAndTasks()}catch(err){setStatus(err.message,false,true)}});

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('FamilyDisplayDB',1);req.onupgradeneeded=()=>{req.result.createObjectStore('photos',{keyPath:'id',autoIncrement:true})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function loadPhotos(){try{const db=await openDB();const tx=db.transaction('photos','readonly');const req=tx.objectStore('photos').getAll();state.photos=await new Promise((r,j)=>{req.onsuccess=()=>r(req.result||[]);req.onerror=()=>j(req.error)});updatePhotoCount();rotatePhoto()}catch(e){console.warn(e)}}
$('#photoInput').addEventListener('change',async(e)=>{const files=[...e.target.files];if(!files.length)return;const db=await openDB();const tx=db.transaction('photos','readwrite');const store=tx.objectStore('photos');for(const f of files)store.add({blob:f,name:f.name});await new Promise((r,j)=>{tx.oncomplete=r;tx.onerror=()=>j(tx.error)});await loadPhotos();restartPhotoTimer()});
$('#clearPhotosBtn').addEventListener('click',async()=>{const db=await openDB();const tx=db.transaction('photos','readwrite');tx.objectStore('photos').clear();await new Promise(r=>tx.oncomplete=r);state.photos=[];$('#idlePhoto').style.display='none';updatePhotoCount()});
function updatePhotoCount(){$('#photoCount').textContent=state.photos.length?`${state.photos.length} photo${state.photos.length===1?'':'s'} selected.`:'No photos selected yet.'}
let currentPhotoUrl=null;function rotatePhoto(){if(!state.photos.length){$('#idlePhoto').style.display='none';return}const p=state.photos[state.photoIndex%state.photos.length];state.photoIndex++;if(currentPhotoUrl)URL.revokeObjectURL(currentPhotoUrl);currentPhotoUrl=URL.createObjectURL(p.blob);$('#idlePhoto').src=currentPhotoUrl;$('#idlePhoto').style.display='block'}
function restartPhotoTimer(){clearInterval(state.photoTimer);const sec=Number(localStorage.getItem('photoSeconds')||20);state.photoTimer=setInterval(()=>{if(!$('#idleView').classList.contains('hidden'))rotatePhoto()},sec*1000)}

function renderAll(){renderCalendar();renderTasks()}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
window.addEventListener('load',()=>{loadPhotos();restartPhotoTimer();resetIdleTimer();setTimeout(()=>{if(localStorage.getItem('googleClientId')) initGoogleClient()},900)});
