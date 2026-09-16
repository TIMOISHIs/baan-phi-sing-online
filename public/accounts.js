/* Account UI uses server-owned HttpOnly cookies; no access tokens in browser storage. */
(()=>{
 const q=s=>document.querySelector(s);let config,profile,busy=false,stopped=false;
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
 async function connect(){if(stopped)return;const r=await api('/api/account/current-room');if(r.code)localStorage.setItem(roomKey,r.code);else localStorage.removeItem(roomKey);if(!socket.connected)socket.connect()}
 async function stats(){
  if(!profile){toast('เข้าสู่ระบบก่อนดูสถิติ');return}
  const box=document.createElement('div'),summary=document.createElement('p');summary.textContent=`เล่นจบ ${profile.games_played} เกม · อันดับ 1 ${profile.wins} ครั้ง · อัตราอันดับ 1 ${profile.games_played?Math.round(100*profile.wins/profile.games_played):0}%`;box.append(summary);
  try{const data=await api('/api/account/history');if(!data.matches.length){const p=document.createElement('p');p.textContent='ยังไม่มีผลการแข่งขัน เริ่มพิธีแรกของคุณได้เลย';box.append(p)}for(const m of data.matches){const row=document.createElement('p');row.textContent=`${new Date(m.created_at).toLocaleDateString('th-TH')} · อันดับ ${m.rank} · ${m.score} คะแนน · +${m.xp} EXP`;box.append(row)}openModal('สถิติของ '+profile.display_name,box)}catch(e){toast(e.message)}
 }
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
