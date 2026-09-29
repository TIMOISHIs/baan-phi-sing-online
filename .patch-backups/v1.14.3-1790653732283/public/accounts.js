/* Account UI uses server-owned HttpOnly cookies; no access tokens in browser storage. */
(()=>{
 const q=s=>document.querySelector(s);let config,profile,busy=false,stopped=false,friendData={friends:[],incoming:[],sent:[]},friendBusy=false;
 const status=t=>q('#accountStatus').textContent=t;
 async function api(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'เชื่อมต่อไม่ได้'),{status:r.status});return data}
 function paint(){
  const active=!!profile;
  q('#accountSignIn').classList.toggle('hidden',active);q('#accountProfile').classList.toggle('hidden',!active);
  q('#home .join-grid').classList.toggle('hidden',config.enabled&&!active);
  q('#accountChip').classList.toggle('hidden',!active);
  document.body.classList.toggle('has-account',active);
  if(!active)return;
  for(const el of document.querySelectorAll('[data-account-name]'))el.textContent=profile.display_name;
  for(const el of document.querySelectorAll('[data-account-avatar]')){el.src=profile.avatar;el.alt='รูปโปรไฟล์ '+profile.display_name}
  for(const el of document.querySelectorAll('[data-account-level]'))el.textContent='Lv. '+profile.progress.level;
  q('#accountXPText').textContent=`${profile.progress.current.toLocaleString()} / ${profile.progress.required.toLocaleString()} EXP · อีก ${profile.progress.remaining.toLocaleString()} ถึง Lv. ${profile.progress.level+1}`;
  q('#accountXP').value=profile.progress.current;q('#accountXP').max=profile.progress.required;
  q('#accountGames').textContent=profile.games_played+' เกม';q('#accountWins').textContent=profile.wins+' ครั้ง';
  q('#accountID').textContent='ID · '+profile.id;
  q('#createName').value=q('#joinName').value=profile.display_name;
  q('#createName').readOnly=q('#joinName').readOnly=true;
  q('#createName').closest('label').classList.add('hidden');q('#joinName').closest('label').classList.add('hidden');
 }
 function editor(){
  const d=q('#profileEditor');q('#profileName').value=profile?.display_name||'';q('#avatarOptions').replaceChildren();
  config.avatars.forEach((a,i)=>{const label=document.createElement('label'),input=document.createElement('input'),img=document.createElement('img'),name=document.createElement('span');input.type='radio';input.name='avatar';input.value=a.key;input.checked=profile?profile.avatar_key===a.key:i===0;img.src=a.art;img.alt=a.name;name.textContent=a.name;label.append(input,img,name);q('#avatarOptions').append(label)});
  q('#profileCancel').hidden=!profile;q('#profileError').textContent='';if(!d.open)d.showModal();
 }
 async function load(){const data=await api('/api/account/me');profile=data.profile;paint();if(!profile)editor();return profile}
 async function connect(){
  if(stopped)return;
  // A transient failure while checking the previous room must not prevent the
  // authenticated Socket.IO connection used by create/join room actions.
  try{
   const r=await api('/api/account/current-room');
   if(r.code)localStorage.setItem(roomKey,r.code);else localStorage.removeItem(roomKey);
  }catch{ /* Socket auth is the source of truth; retry room lookup later. */ }
  if(!socket.connected)socket.connect();
 }
 async function stats(){
  if(!profile){toast('เข้าสู่ระบบก่อนดูสถิติ');return}
  const box=document.createElement('div'),summary=document.createElement('p');summary.textContent=`เล่นจบ ${profile.games_played} เกม · อันดับ 1 ${profile.wins} ครั้ง · อัตราอันดับ 1 ${profile.games_played?Math.round(100*profile.wins/profile.games_played):0}%`;box.append(summary);
  try{const data=await api('/api/account/history');if(!data.matches.length){const p=document.createElement('p');p.textContent='ยังไม่มีผลการแข่งขัน เริ่มพิธีแรกของคุณได้เลย';box.append(p)}for(const m of data.matches){const row=document.createElement('p');row.textContent=`${new Date(m.created_at).toLocaleDateString('th-TH')} · อันดับ ${m.rank} · ${m.score} คะแนน · +${m.xp} EXP`;box.append(row)}openModal('สถิติของ '+profile.display_name,box)}catch(e){toast(e.message)}
 }
 async function friendApi(url,method='GET',body){const r=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'เชื่อมต่อไม่ได้'),{status:r.status});return data}
 function friendCard(item,{online=false,controls=[]}={}){
  const row=document.createElement('article');row.className='friend-card';
  const avatar=document.createElement('img');avatar.className='friend-avatar';avatar.src=item.avatar||'';avatar.alt='';
  const details=document.createElement('div');details.className='friend-details';const name=document.createElement('b');name.textContent=item.displayName;details.append(name);
  const sub=document.createElement('small');sub.textContent=item.id;details.append(sub);
  if(online){const presence=document.createElement('span');presence.className='friend-presence '+(item.online?'is-online':'');presence.textContent=item.online?'ออนไลน์':'ออฟไลน์';details.append(presence)}
  row.append(avatar,details);const actions=document.createElement('div');actions.className='friend-actions';for(const {label,run,primary=false}of controls){const b=document.createElement('button');b.type='button';b.textContent=label;b.className=primary?'primary':'secondary';b.onclick=run;actions.append(b)}if(controls.length)row.append(actions);return row
 }
 function fillFriendSection(selector,items,empty,make){const box=q(selector);box.replaceChildren();if(!items.length){const p=document.createElement('small');p.className='friend-empty';p.textContent=empty;box.append(p);return}for(const item of items)box.append(make(item))}
 function renderFriends(){
  q('#friendCode').textContent=profile?.id||'—';q('#friendCount').textContent=friendData.friends.length;q('#friendIncomingCount').textContent=friendData.incoming.length;q('#friendSentCount').textContent=friendData.sent.length;
  q('#friendNotice').textContent=String(friendData.incoming.length);q('#friendNotice').classList.toggle('hidden',!friendData.incoming.length);
  fillFriendSection('#friendList',friendData.friends,'ยังไม่มีเพื่อนที่เพิ่มไว้',p=>friendCard(p,{online:true}));
  fillFriendSection('#friendIncoming',friendData.incoming,'ไม่มีคำขอใหม่',p=>friendCard(p,{controls:[{label:'ยอมรับ',primary:true,run:()=>friendAction(`/api/friends/requests/${encodeURIComponent(p.requestId)}/accept`,'POST')},{label:'ปฏิเสธ',run:()=>friendAction(`/api/friends/requests/${encodeURIComponent(p.requestId)}`,'DELETE')}]}));
  fillFriendSection('#friendSent',friendData.sent,'ยังไม่มีคำขอที่รอตอบรับ',p=>friendCard(p,{controls:[{label:'ยกเลิก',run:()=>friendAction(`/api/friends/requests/${encodeURIComponent(p.requestId)}`,'DELETE')}]}));
 }
 async function loadFriends(silent=false){if(!profile)return;try{friendData=await friendApi('/api/friends');renderFriends();if(!silent)q('#friendsFeedback').textContent='สถานะออนไลน์อัปเดตอัตโนมัติ';}catch(e){if(!silent)q('#friendsFeedback').textContent=e.status===503?'ระบบเพื่อนยังไม่พร้อม กรุณาติดตั้งไฟล์ Supabase migration ก่อน':e.message}}
 async function friendAction(url,method,body){if(friendBusy)return;friendBusy=true;try{await friendApi(url,method,body);q('#friendsFeedback').textContent='อัปเดตเพื่อนแล้ว';await loadFriends(true)}catch(e){q('#friendsFeedback').textContent=e.message}finally{friendBusy=false}}
 async function searchFriends(query){
  const box=q('#friendSearchResults');box.replaceChildren();if(!query.trim())return;
  const pendingIds=new Set(friendData.sent.map(x=>x.id)),friendIds=new Set(friendData.friends.map(x=>x.id)),incomingIds=new Set(friendData.incoming.map(x=>x.id));
  try{const {results}=await friendApi('/api/friends/search?q='+encodeURIComponent(query.trim()));
   if(!results.length){const p=document.createElement('small');p.className='friend-empty';p.textContent='ไม่พบผู้เล่นที่ตรงกับคำค้น';box.append(p);return}
   for(const item of results){let label='ส่งคำขอ',disabled=false;if(friendIds.has(item.id)){label='เป็นเพื่อนแล้ว';disabled=true}else if(pendingIds.has(item.id)){label='ส่งคำขอแล้ว';disabled=true}else if(incomingIds.has(item.id)){label='มีคำขอเข้ามา · ดูด้านล่าง';disabled=true}
    const card=friendCard(item,{controls:[{label,primary:true,run:async()=>{try{await friendAction('/api/friends/requests','POST',{userId:item.id});await searchFriends(query)}catch(e){q('#friendsFeedback').textContent=e.message}},}]});const button=card.querySelector('.friend-actions button');button.disabled=disabled;box.append(card)}
  }catch(e){q('#friendsFeedback').textContent=e.status===503?'ระบบเพื่อนยังไม่พร้อม กรุณาติดตั้งไฟล์ Supabase migration ก่อน':e.message}
 }
 q('#friendsBtn').onclick=async()=>{if(!profile){toast('เข้าสู่ระบบด้วย Google ก่อนเพิ่มเพื่อน');return}q('#friendsDialog').showModal();q('#friendsFeedback').textContent='กำลังโหลดรายชื่อเพื่อน…';await loadFriends();q('#friendSearchInput').focus()};
 q('#friendsClose').onclick=()=>q('#friendsDialog').close();q('#friendsDialog').addEventListener('click',e=>{if(e.target===q('#friendsDialog'))q('#friendsDialog').close()});
 q('#copyFriendCode').onclick=async()=>{try{await navigator.clipboard.writeText(profile.id);q('#friendsFeedback').textContent='คัดลอกรหัสผู้เล่นแล้ว'}catch{q('#friendsFeedback').textContent='เลือกและคัดลอกรหัสผู้เล่นด้วยตนเองได้'}};
 q('#friendSearchForm').onsubmit=e=>{e.preventDefault();searchFriends(q('#friendSearchInput').value)};
 setInterval(()=>{if(q('#friendsDialog').open)loadFriends(true)},20000);
 q('#googleSignIn').onclick=()=>{location.href='/auth/google'};
 q('#accountStats').onclick=stats;q('#accountChip').onclick=stats;q('#lobbyStatsBtn').onclick=stats;
 q('#accountEdit').onclick=editor;
 q('#profileCancel').onclick=()=>q('#profileEditor').close();
 q('#profileEditor').addEventListener('cancel',e=>{if(!profile)e.preventDefault()});
 q('#profileForm').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;q('#profileSave').disabled=true;try{const data=await api('/api/account/profile',{displayName:q('#profileName').value,avatarKey:q('input[name="avatar"]:checked')?.value});profile=data.profile;paint();q('#profileEditor').close();await connect();status('พร้อมเข้าบ้านผีสิงแล้ว')}catch(e){q('#profileError').textContent=e.message}finally{busy=false;q('#profileSave').disabled=false}};
 q('#accountLogout').onclick=async()=>{if(!confirm('ออกจากระบบ? ถ้ามีเกมค้าง คุณกลับเข้าห้องเดิมได้เมื่อเข้าสู่ระบบอีกครั้ง'))return;try{await api('/api/account/logout',{});socket.disconnect();resetLocalRoom();location.href='/'}catch(e){toast(e.message)}};
 q('#shopBtn').onclick=()=>openModal('ร้านค้า', 'เร็ว ๆ นี้ · ของแต่งโปรไฟล์และรูปลักษณ์หมาก');
 q('#lobbyRulesBtn').onclick=()=>q('#homeHelpBtn').click();
 q('#lobbySoundBtn').onclick=()=>q('#settingsBtn').click();
 socket.on('profileUpdated',()=>load().catch(e=>toast(e.message)));
 socket.on('accountReplaced',()=>{stopped=true;toast('บัญชีนี้เปิดเล่นในอีกแท็บหรืออุปกรณ์แล้ว');status('กำลังเล่นบนอีกแท็บ ปิดแท็บนี้ได้เลย');socket.disconnect()});
 socket.on('accountExpired',async()=>{if(stopped)return;try{await load();socket.disconnect();await connect()}catch{status('กรุณาเข้าสู่ระบบใหม่');socket.disconnect();profile=null;state=null;mine=null;show('home');paint()}});
 socket.on('connect_error',e=>{status(e.message==='PROFILE_REQUIRED'?'กรุณาสร้างชื่อในเกมก่อน':'เชื่อมต่อห้องไม่ได้ กรุณารีเฟรชหรือล็อกอินใหม่')});
 async function boot(){
  try{config=await api('/api/account/config');q('#googleSignIn').disabled=!config.enabled;
   if(!config.enabled){q('#accountSignIn').classList.add('hidden');q('#home .join-grid').classList.remove('hidden');status('โหมดทดสอบ · ระบบบัญชียังไม่เปิดใช้งาน');socket.connect();return}
   q('#accountSignIn').classList.remove('hidden');q('#home .join-grid').classList.add('hidden');
   if(new URLSearchParams(location.search).get('login')==='failed'){status('เข้าสู่ระบบไม่สำเร็จ ลองกด Google อีกครั้ง');history.replaceState(null,'','/')}
   try{if(await load()){status('ยินดีต้อนรับกลับ');await connect()}}catch(e){if(e.status===401){status('เข้าสู่ระบบเพื่อเก็บเลเวลและสถิติ');paint()}else throw e}
  }catch(e){status(e.message+' · ลองรีเฟรชหน้าอีกครั้ง');q('#googleSignIn').disabled=true}
 }
 boot();
})();
