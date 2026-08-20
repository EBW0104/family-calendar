const $ = (s)=>document.querySelector(s);
const $$ = (s)=>[...document.querySelectorAll(s)];
const state={token:null,tokenExpiresAt:0,serverConnected:false,calendars:[],events:[],taskLists:{},photos:[],photoIndex:0,idleTimer:null,photoTimer:null,lastInteraction:Date.now()};

function fmtTime(d){return new Intl.DateTimeFormat([], {hour:'numeric',minute:'2-digit'}).format(d)}
function fmtDate(d){return new Intl.DateTimeFormat([], {weekday:'long',month:'long',day:'numeric'}).format(d)}
function ymd(d){
 const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
 return `${y}-${m}-${day}`;
}
function parseGoogleDate(v){
 if(!v)return new Date(0);
 if(/^\d{4}-\d{2}-\d{2}$/.test(v)){
  const [y,m,d]=v.split('-').map(Number);
  return new Date(y,m-1,d,0,0,0,0);
 }
 return new Date(v);
}
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
$('#saveSettingsBtn').addEventListener('click',()=>{localStorage.setItem('idleMinutes',$('#idleMinutes').value);localStorage.setItem('photoSeconds',$('#photoSeconds').value);resetIdleTimer();restartPhotoTimer()});
function loadSettingsIntoDialog(){ $('#idleMinutes').value=localStorage.getItem('idleMinutes')||'5'; $('#photoSeconds').value=localStorage.getItem('photoSeconds')||'20'; updatePhotoCount() }

function setStatus(text,good=false,bad=false){const el=$('#syncStatus');el.textContent=text;el.className=good?'status-good':bad?'status-bad':''}

async function ensureAccessToken(force=false){
 if(!force&&state.token&&Date.now()<state.tokenExpiresAt)return state.token;
 const res=await fetch('/api/auth/token',{credentials:'same-origin',cache:'no-store'});
 if(res.status===401){state.serverConnected=false;state.token=null;state.tokenExpiresAt=0;throw new Error('Google is not connected. Open Settings and tap Connect / Pair Google.');}
 if(!res.ok)throw new Error('Could not renew Google authorization.');
 const data=await res.json();
 state.serverConnected=true;state.token=data.access_token;state.tokenExpiresAt=Date.now()+(Number(data.expires_in||3600)-60)*1000;
 return state.token;
}

async function bootGoogle(){
 try{
  const res=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store'});
  const data=await res.json();
  state.serverConnected=!!data.connected;
  if(!state.serverConnected){setStatus('Google not paired',false,true);renderAll();return;}
  setStatus('Connected to Google',true);
  await ensureAccessToken(true);
  await refreshAll();
 }catch(e){console.error(e);setStatus(e.message||'Google connection check failed',false,true)}
}

$('#connectGoogleBtn').addEventListener('click',async()=>{
 const pairingKey=prompt('Enter the Family Display pairing key:');
 if(!pairingKey)return;
 try{
  const res=await fetch('/api/auth/pair',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({pairingKey})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||'Pairing failed.');
  if(data.authorizationUrl){location.href=data.authorizationUrl;return;}
  $('#settingsDialog').close();await bootGoogle();
 }catch(e){setStatus(e.message||'Pairing failed',false,true)}
});

$('#disconnectGoogleBtn').addEventListener('click',async()=>{
 await fetch('/api/auth/disconnect',{method:'POST',credentials:'same-origin'}).catch(()=>{});
 state.serverConnected=false;state.token=null;state.tokenExpiresAt=0;state.calendars=[];state.events=[];state.taskLists={};renderAll();setStatus('This iPad is disconnected from Google');
});

async function api(path,options={},retried=false){
 const token=await ensureAccessToken(false);
 const res=await fetch('https://www.googleapis.com'+path,{...options,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}});
 if(res.status===401&&!retried){state.token=null;state.tokenExpiresAt=0;await ensureAccessToken(true);return api(path,options,true)}
 if(!res.ok){const t=await res.text();throw new Error(t||('HTTP '+res.status))}if(res.status===204)return null;return res.json()
}

async function refreshAll(){try{await ensureAccessToken();await Promise.all([loadCalendarsAndEvents(),loadTaskListsAndTasks()]);setStatus('Synced '+fmtTime(new Date()),true)}catch(e){console.error(e);setStatus(e.message||'Sync failed',false,true)}}
$('#refreshBtn').addEventListener('click',refreshAll);
setInterval(()=>{if(state.serverConnected)refreshAll()},5*60*1000);

function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function eventEnd(ev){return parseGoogleDate(ev.end?.dateTime||ev.end?.date||ev.start?.dateTime||ev.start?.date||0)}
function isAllDay(ev){return !!ev.start?.date&&!ev.start?.dateTime}
function eventOverlapsDay(ev,day){
 const ds=new Date(day); ds.setHours(0,0,0,0);
 const de=addDays(ds,1);
 return eventStart(ev)<de && eventEnd(ev)>ds;
}
state.calendarView='week';state.calendarCursor=new Date();

function calendarRange(){
 const c=state.calendarCursor;
 if(state.calendarView==='month'){const first=new Date(c.getFullYear(),c.getMonth(),1),s=startOfWeek(first),e=addDays(s,42);return[s,e]}
 if(state.calendarView==='agenda'){const s=new Date(c);s.setHours(0,0,0,0);return[s,addDays(s,30)]}
 const s=startOfWeek(c);return[s,addDays(s,7)]
}
async function loadCalendarsAndEvents(){
 const list=await api('/calendar/v3/users/me/calendarList?minAccessRole=reader');
 state.calendars=(list.items||[]).filter(c=>c.selected!==false);
 const [min,max]=calendarRange(),all=[];
 for(const cal of state.calendars){
  const p=new URLSearchParams({timeMin:min.toISOString(),timeMax:max.toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'250'});
  const data=await api('/calendar/v3/calendars/'+encodeURIComponent(cal.id)+'/events?'+p);
  for(const ev of(data.items||[]))all.push({...ev,_calendarId:cal.id,_calendarName:cal.summary||'Calendar',_color:cal.backgroundColor||'#64748b'});
 }
 state.events=all.sort((a,b)=>eventStart(a)-eventStart(b));renderCalendar()
}
function eventStart(ev){return parseGoogleDate(ev.start?.dateTime||ev.start?.date||0)}
function activeIds(){return new Set($$('#calendarFilters .active').map(b=>b.dataset.id))}
function renderCalendar(){
 const f=$('#calendarFilters'),old=new Set($$('#calendarFilters .active').map(b=>b.dataset.id)),had=f.children.length;f.innerHTML='';
 for(const c of state.calendars){const b=document.createElement('button');b.className='filter-chip '+(!had||old.has(c.id)?'active':'');b.dataset.id=c.id;b.textContent=c.summary||'Calendar';b.style.setProperty('--cal-color',c.backgroundColor||'#64748b');b.addEventListener('click',()=>{b.classList.toggle('active');renderCalendarEvents()});f.appendChild(b)}
 renderCalendarEvents()
}
function selectedEvents(){const ids=activeIds();return state.events.filter(e=>ids.has(e._calendarId))}
function pill(ev){const x=document.createElement('div');x.className='g-event';x.style.setProperty('--ec',ev._color);x.textContent=(isAllDay(ev)?'':fmtTime(eventStart(ev))+' ')+(ev.summary||'(No title)');x.title=(ev.summary||'')+' — '+ev._calendarName;return x}
function renderCalendarEvents(){
 const t=$('#calendarEvents');if(!state.token){t.className='calendar-surface empty-state';t.textContent='Connect Google in Settings to load calendars.';return}
 t.className='calendar-surface';t.innerHTML='';
 if(state.calendarView==='month')renderMonth(t);else if(state.calendarView==='agenda')renderAgenda(t);else renderWeek(t)
}
function renderWeek(t){
 const s=startOfWeek(state.calendarCursor),days=[0,1,2,3,4,5,6].map(i=>addDays(s,i)),last=days[6];
 $('#calendarRangeTitle').textContent=new Intl.DateTimeFormat([],{month:'short',day:'numeric'}).format(s)+' – '+new Intl.DateTimeFormat([],{month:'short',day:'numeric',year:'numeric'}).format(last);

 const w=document.createElement('div');w.className='week-cal';

 const h=document.createElement('div');h.className='week-head';h.innerHTML='<div></div>';
 days.forEach(d=>{
  const q=document.createElement('div');
  q.className='day-head'+(sameDay(d,new Date())?' today':'');
  q.innerHTML='<span>'+new Intl.DateTimeFormat([],{weekday:'short'}).format(d)+'</span><strong>'+d.getDate()+'</strong>';
  h.appendChild(q)
 });
 w.appendChild(h);

 const allDay=document.createElement('div');allDay.className='all-day-row';
 const label=document.createElement('div');label.className='all-day-label';label.textContent='All day';
 allDay.appendChild(label);
 days.forEach(d=>{
  const cell=document.createElement('div');cell.className='all-day-cell';
  selectedEvents()
   .filter(e=>isAllDay(e)&&eventOverlapsDay(e,d))
   .forEach(e=>cell.appendChild(pill(e)));
  allDay.appendChild(cell)
 });
 w.appendChild(allDay);

 const body=document.createElement('div');body.className='week-body';
 const hours=document.createElement('div');hours.className='hours';
 for(let i=0;i<24;i++){
  const a=document.createElement('div');
  a.textContent=i?new Intl.DateTimeFormat([],{hour:'numeric'}).format(new Date(2000,0,1,i)):'';
  hours.appendChild(a)
 }
 body.appendChild(hours);

 days.forEach(d=>{
  const col=document.createElement('div');
  col.className='day-col'+(sameDay(d,new Date())?' today-col':'');
  for(let i=0;i<24;i++){const l=document.createElement('div');l.className='hour-line';col.appendChild(l)}

  selectedEvents()
   .filter(e=>!isAllDay(e)&&eventOverlapsDay(e,d))
   .forEach(e=>{
    const dayStart=new Date(d);dayStart.setHours(0,0,0,0);
    const dayEnd=addDays(dayStart,1);
    const st=eventStart(e),en=eventEnd(e);
    const clippedStart=new Date(Math.max(st.getTime(),dayStart.getTime()));
    const clippedEnd=new Date(Math.min(en.getTime(),dayEnd.getTime()));
    const m=(clippedStart-dayStart)/60000;
    const dur=Math.max(30,(clippedEnd-clippedStart)/60000);
    const p=pill(e);p.classList.add('timed');
    p.style.top=(m/1440*100)+'%';
    p.style.height=(Math.min(dur,1440-m)/1440*100)+'%';
    col.appendChild(p)
   });

  if(sameDay(d,new Date())){
   const n=new Date(),l=document.createElement('div');l.className='now-line';
   l.style.top=((n.getHours()*60+n.getMinutes())/1440*100)+'%';
   col.appendChild(l)
  }
  body.appendChild(col)
 });
 w.appendChild(body);
 t.appendChild(w);
 setTimeout(()=>{body.scrollTop=Math.max(0,(new Date().getHours()-2)*60)},0)
}
function renderMonth(t){
 const c=state.calendarCursor,first=new Date(c.getFullYear(),c.getMonth(),1),s=startOfWeek(first);
 $('#calendarRangeTitle').textContent=new Intl.DateTimeFormat([],{month:'long',year:'numeric'}).format(first);

 const m=document.createElement('div');m.className='month-cal';
 ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(x=>{
  const h=document.createElement('div');h.className='month-head';h.textContent=x;m.appendChild(h)
 });

 for(let i=0;i<42;i++){
  const d=addDays(s,i),cell=document.createElement('div');
  cell.className='month-cell'+(d.getMonth()!=first.getMonth()?' outside':'')+(sameDay(d,new Date())?' today':'');
  const n=document.createElement('div');n.className='date-num';n.textContent=d.getDate();cell.appendChild(n);

  const es=selectedEvents()
   .filter(e=>eventOverlapsDay(e,d))
   .sort((a,b)=>{
    if(isAllDay(a)!==isAllDay(b)) return isAllDay(a)?-1:1;
    return eventStart(a)-eventStart(b);
   });

  es.slice(0,4).forEach(e=>{
   const p=pill(e);
   if(isAllDay(e)) p.classList.add('all-day-event');
   cell.appendChild(p)
  });

  if(es.length>4){
   const more=document.createElement('small');
   more.textContent='+'+(es.length-4)+' more';
   cell.appendChild(more)
  }
  m.appendChild(cell)
 }
 t.appendChild(m)
}
function renderAgenda(t){
 const s=new Date(state.calendarCursor);s.setHours(0,0,0,0);
 const limit=addDays(s,30);
 $('#calendarRangeTitle').textContent='Schedule · '+new Intl.DateTimeFormat([],{month:'long',year:'numeric'}).format(s);
 const a=document.createElement('div');a.className='agenda';

 const es=selectedEvents()
  .filter(e=>eventStart(e)<limit&&eventEnd(e)>s)
  .sort((a,b)=>{
   const da=eventStart(a),db=eventStart(b);
   if(sameDay(da,db)&&isAllDay(a)!==isAllDay(b)) return isAllDay(a)?-1:1;
   return da-db;
  });

 if(!es.length){t.className='calendar-surface empty-state';t.textContent='No events in this period.';return}

 let k='';
 es.forEach(e=>{
  const st=eventStart(e),en=eventEnd(e),dk=ymd(st);
  if(dk!==k){
   k=dk;
   const h=document.createElement('h3');
   h.textContent=fmtDate(st);
   a.appendChild(h);
  }

  const r=document.createElement('div');
  r.className='agenda-row';
  r.style.setProperty('--ec',e._color);

  let timeText='All day';
  if(!isAllDay(e)){
   timeText=fmtTime(st);
   if(en>st) timeText+=' – '+fmtTime(en);
  }else if(e.end?.date){
   const exclusiveEnd=parseGoogleDate(e.end.date);
   const lastDay=addDays(exclusiveEnd,-1);
   if(!sameDay(st,lastDay)){
    timeText='All day · through '+new Intl.DateTimeFormat([],{month:'short',day:'numeric'}).format(lastDay);
   }
  }

  const meta=[e._calendarName];
  if(e.location)meta.push(e.location);

  r.innerHTML=
   '<div class="agenda-time">'+escapeHtml(timeText)+'</div>'+
   '<div><strong>'+escapeHtml(e.summary||'(No title)')+'</strong>'+
   '<small>'+escapeHtml(meta.join(' • '))+'</small></div>';
  a.appendChild(r);
 });
 t.appendChild(a);
}
async function moveCal(n){if(state.calendarView==='month')state.calendarCursor=new Date(state.calendarCursor.getFullYear(),state.calendarCursor.getMonth()+n,1);else state.calendarCursor=addDays(state.calendarCursor,n*(state.calendarView==='week'?7:30));if(state.token)await loadCalendarsAndEvents();else renderCalendarEvents()}
$('#calPrevBtn').addEventListener('click',()=>moveCal(-1));$('#calNextBtn').addEventListener('click',()=>moveCal(1));$('#calTodayBtn').addEventListener('click',async()=>{state.calendarCursor=new Date();if(state.token)await loadCalendarsAndEvents();else renderCalendarEvents()});
$$('.cal-view').forEach(b=>b.addEventListener('click',async()=>{$$('.cal-view').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.calendarView=b.dataset.view;if(state.token)await loadCalendarsAndEvents();else renderCalendarEvents()}));

async function loadTaskListsAndTasks(){const lists=await api('/tasks/v1/users/@me/lists?maxResults=100');state.taskLists={};for(const wanted of ['Family','Emily Daily','Eric','Shopping']){let list=(lists.items||[]).find(x=>x.title===wanted);if(!list){list=await api('/tasks/v1/users/@me/lists',{method:'POST',body:JSON.stringify({title:wanted})})}const tasks=await api('/tasks/v1/lists/'+encodeURIComponent(list.id)+'/tasks?showCompleted=true&showHidden=true&maxResults=100');state.taskLists[wanted]={...list,tasks:(tasks.items||[])}}renderTasks()}
function taskDate(t){
 if(!t.due)return null;
 const d=new Date(t.due);
 return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
}
function renderTasks(){renderList('Family','#familyTasks',t=>{const d=taskDate(t);return d&&d>=startOfWeek()&&d<endOfWeek()},true);renderList('Emily Daily','#emilyTasks',t=>{const d=taskDate(t);return !d||ymd(d)===ymd(new Date())},false);renderList('Eric','#ericTasks',()=>true,true);renderList('Shopping','#shoppingTasks',()=>true,false)}
function renderList(name,selector,filter,showDue){
 const el=$(selector),list=state.taskLists[name];
 if(!list){el.innerHTML='<div class="empty-state">Connect Google to load tasks.</div>';return}
 let tasks=(list.tasks||[]).filter(filter);
 tasks.sort((a,b)=>{
  const ac=a.status==='completed',bc=b.status==='completed';
  if(ac!==bc)return ac?1:-1;
  const today=new Date();today.setHours(0,0,0,0);
  const ad=(taskDate(a)||(name==='Eric'?today:null))?.getTime()??Number.MAX_SAFE_INTEGER;
  const bd=(taskDate(b)||(name==='Eric'?today:null))?.getTime()??Number.MAX_SAFE_INTEGER;
  return ad-bd;
 });
 if(!tasks.length){el.innerHTML='<div class="empty-state">Nothing here.</div>';return}
 el.innerHTML='';
 for(const t of tasks){
  const completed=t.status==='completed';
  const row=document.createElement('label');
  row.className='task'+(completed?' task-completed':'');
  const cb=document.createElement('input');
  cb.type='checkbox';
  cb.checked=completed;
  cb.addEventListener('change',()=>setTaskCompleted(name,t.id,cb.checked));
  const wrap=document.createElement('div');
  const title=document.createElement('div');
  title.className='task-title';
  title.textContent=t.title||'(Untitled)';
  wrap.appendChild(title);
  if(showDue){
   const due=taskDate(t);
   const d=document.createElement('div');
   d.className='task-due'+(!completed&&due&&due<new Date().setHours(0,0,0,0)?' overdue':'');
   if(due){
    d.textContent=(!completed&&due<new Date().setHours(0,0,0,0)?'Overdue • ':'Due ')+fmtDate(due);
   }else if(name==='Eric'){
    d.textContent='Today • Daily';
   }else{
    d.textContent='No due date';
   }
   wrap.appendChild(d);
  }
  row.append(cb,wrap);
  el.appendChild(row);
 }
}
async function setTaskCompleted(listName,taskId,completed){
 try{
  const list=state.taskLists[listName];
  await api('/tasks/v1/lists/'+encodeURIComponent(list.id)+'/tasks/'+encodeURIComponent(taskId),{
   method:'PATCH',
   body:JSON.stringify({status:completed?'completed':'needsAction'})
  });
  await loadTaskListsAndTasks();
 }catch(e){setStatus(e.message,false,true)}
}

$$('.add-task').forEach(btn=>btn.addEventListener('click',()=>openTaskDialog(btn.dataset.list)));
function openTaskDialog(name){$('#taskListName').value=name;$('#taskTitle').value='';$('#taskDue').value='';$('#taskDialogTitle').textContent=name==='Shopping'?'Add shopping item':'Add to '+name;const help=$('#taskHelp');if(name==='Eric'){help.textContent='Due date is optional. If left blank, this task is treated as a today/daily task.';$('#taskDue').required=false}else if(name==='Emily Daily'){help.textContent='If no date is selected, the task is treated as a daily item for today.';$('#taskDue').required=false;$('#taskDue').value=ymd(new Date())}else{help.textContent='';$('#taskDue').required=false}$('#taskDialog').showModal()}
$('#taskForm').addEventListener('submit',async(e)=>{e.preventDefault();const name=$('#taskListName').value,title=$('#taskTitle').value.trim(),due=$('#taskDue').value;if(!title)return;try{const list=state.taskLists[name];if(!list)throw new Error('Connect Google first.');const payload={title};if(due)payload.due=new Date(due+'T12:00:00Z').toISOString();await api('/tasks/v1/lists/'+encodeURIComponent(list.id)+'/tasks',{method:'POST',body:JSON.stringify(payload)});$('#taskDialog').close();await loadTaskListsAndTasks()}catch(err){setStatus(err.message,false,true)}});

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('FamilyDisplayDB',1);req.onupgradeneeded=()=>{req.result.createObjectStore('photos',{keyPath:'id',autoIncrement:true})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function loadPhotos(){try{const db=await openDB();const tx=db.transaction('photos','readonly');const req=tx.objectStore('photos').getAll();state.photos=await new Promise((r,j)=>{req.onsuccess=()=>r(req.result||[]);req.onerror=()=>j(req.error)});updatePhotoCount();rotatePhoto()}catch(e){console.warn(e)}}
$('#photoInput').addEventListener('change',async(e)=>{const files=[...e.target.files];if(!files.length)return;const db=await openDB();const tx=db.transaction('photos','readwrite');const store=tx.objectStore('photos');for(const f of files)store.add({blob:f,name:f.name});await new Promise((r,j)=>{tx.oncomplete=r;tx.onerror=()=>j(tx.error)});await loadPhotos();restartPhotoTimer()});
$('#clearPhotosBtn').addEventListener('click',async()=>{const db=await openDB();const tx=db.transaction('photos','readwrite');tx.objectStore('photos').clear();await new Promise(r=>tx.oncomplete=r);state.photos=[];$('#idlePhoto').style.display='none';updatePhotoCount()});
function updatePhotoCount(){$('#photoCount').textContent=state.photos.length?`${state.photos.length} photo${state.photos.length===1?'':'s'} selected.`:'No photos selected yet.'}
let currentPhotoUrl=null;function rotatePhoto(){if(!state.photos.length){$('#idlePhoto').style.display='none';return}const p=state.photos[state.photoIndex%state.photos.length];state.photoIndex++;if(currentPhotoUrl)URL.revokeObjectURL(currentPhotoUrl);currentPhotoUrl=URL.createObjectURL(p.blob);$('#idlePhoto').src=currentPhotoUrl;$('#idlePhoto').style.display='block'}
function restartPhotoTimer(){clearInterval(state.photoTimer);const sec=Number(localStorage.getItem('photoSeconds')||20);state.photoTimer=setInterval(()=>{if(!$('#idleView').classList.contains('hidden'))rotatePhoto()},sec*1000)}

function renderAll(){renderCalendar();renderTasks()}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=20260820-5').catch(console.warn);
window.addEventListener('load',()=>{loadPhotos();restartPhotoTimer();resetIdleTimer();bootGoogle()});
