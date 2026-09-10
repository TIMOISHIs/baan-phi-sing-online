const socket=io();
const $=s=>document.querySelector(s);
const show=id=>["home","lobby","game","result"].forEach(x=>$("#"+x).classList.toggle("active",x===id));
const tokenKey="bpsSessionTokenV09",roomKey="bpsRoomCodeV13",legacyRoomKey="bpsRoomCodeV09";
const makeToken=()=>globalThis.crypto?.randomUUID?.().replaceAll("-","")||`${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
let sessionToken=localStorage.getItem(tokenKey)||makeToken();
localStorage.setItem(tokenKey,sessionToken);
let state=null,mine=null,tutorialShown=false;
let createAfterLeave=false,leavingRoom=false;
let audioCtx=null,ambientMaster=null,ambientNodes=[],ambientTimer=null;
let ambientEnabled=localStorage.getItem("bpsAmbientV13")==="1";
let ambientVolume=Math.max(0,Math.min(1,Number(localStorage.getItem("bpsAmbientVolV13")||0.24)));

function toast(t){const e=$("#toast");e.textContent=t;e.classList.remove("hidden");setTimeout(()=>e.classList.add("hidden"),2600)}
function closeModal(){$("#modal").classList.add("hidden")}
function openModal(title,node){$("#modalTitle").textContent=title;$("#modalBody").innerHTML="";if(typeof node==="string")$("#modalBody").textContent=node;else $("#modalBody").appendChild(node);$("#modal").classList.remove("hidden")}
function activePlayer(){return state?.players?.[state.game?.turn||0]}
function myId(){return mine?.id||null}
function mePublic(){return state?.players?.find(p=>p.id===myId())}
function roomAt(i){if(!state?.game)return null;if(i===state.game.bossIndex)return {id:"BOSS",name:"เขตพิธีกรรม",type:"BOSS",fear:state.game.ghost?.fear||6,boss:true,effectText:`ห้องของ ${state.game.ghost?.name||"ผี"} • ใช้ทำพิธีปราบผี`};return state.game.rooms[i]}
function isMyTurn(){return !!myId()&&activePlayer()?.id===myId()}
function isHost(){return !!myId()&&state?.hostId===myId()}
function persistSession(){
  if(mine?.sessionToken){sessionToken=mine.sessionToken;localStorage.setItem(tokenKey,sessionToken)}
  if(state?.code&&mine?.id){localStorage.setItem(roomKey,state.code);localStorage.removeItem(legacyRoomKey)}
}

function resetLocalRoom(){
  localStorage.removeItem(roomKey);localStorage.removeItem(legacyRoomKey);
}
function leaveCurrentRoom({newRoom=false}={}){
  if(leavingRoom)return;
  const warning=state?.phase==="game"?"ออกจากเกมนี้เลยไหม? ที่นั่งของคุณจะถูกนำออกจากห้อง และผู้เล่นที่เหลือจะเล่นต่อได้":"ออกจากห้องนี้ไหม?";
  if(state&&!confirm(warning))return;
  createAfterLeave=!!newRoom;leavingRoom=true;
  if(!state?.code){resetLocalRoom();state=null;mine=null;leavingRoom=false;show("home");return;}
  socket.emit("leaveRoom");
}
function migrateLegacyRoom(){const legacy=localStorage.getItem(legacyRoomKey);if(legacy&&!localStorage.getItem(roomKey))localStorage.setItem(roomKey,legacy)}
function updateAmbientUI(){
  const label=ambientEnabled?"🔊 เสียงหลอน ON":"🎵 เปิดเสียงหลอน";
  [$("#ambientToggle"),$("#audioBtn")].forEach(b=>{if(b){b.textContent=label;b.classList.toggle("active",ambientEnabled)}});
  if($("#ambientVolume"))$("#ambientVolume").value=String(Math.round(ambientVolume*100));
}
function createNoiseSource(ctx){
  const len=Math.floor(ctx.sampleRate*8),buf=ctx.createBuffer(1,len,ctx.sampleRate),data=buf.getChannelData(0);let last=0;
  for(let i=0;i<len;i++){const white=Math.random()*2-1;last=last*0.985+white*0.015;data[i]=last*0.75;}
  const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;return src;
}
function scheduleHauntTone(){
  if(!ambientEnabled||!audioCtx||!ambientMaster)return;
  const ctx=audioCtx,now=ctx.currentTime,choices=[174.61,196,207.65,233.08,261.63],freq=choices[Math.floor(Math.random()*choices.length)]*(Math.random()<0.18?0.5:1);
  const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();o.type=Math.random()<0.55?"sine":"triangle";o.frequency.value=freq;f.type="lowpass";f.frequency.value=900;
  g.gain.setValueAtTime(0.0001,now);g.gain.exponentialRampToValueAtTime(0.018+Math.random()*0.02,now+0.8);g.gain.exponentialRampToValueAtTime(0.0001,now+5+Math.random()*3);
  o.connect(f).connect(g).connect(ambientMaster);o.start(now);o.stop(now+9);ambientTimer=setTimeout(scheduleHauntTone,6500+Math.random()*9500);
}
async function startAmbient(){
  if(!audioCtx){
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC){toast("Browser นี้ไม่รองรับ Web Audio");return;}
    audioCtx=new AC();ambientMaster=audioCtx.createGain();ambientMaster.gain.value=ambientVolume;ambientMaster.connect(audioCtx.destination);
    const droneBus=audioCtx.createGain(),droneFilter=audioCtx.createBiquadFilter();droneBus.gain.value=0.05;droneFilter.type="lowpass";droneFilter.frequency.value=180;droneBus.connect(droneFilter).connect(ambientMaster);
    [43.65,65.41].forEach((freq,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain(),lfo=audioCtx.createOscillator(),lg=audioCtx.createGain();o.type=i?"triangle":"sine";o.frequency.value=freq;g.gain.value=i?0.32:0.42;lfo.frequency.value=i?0.041:0.027;lg.gain.value=i?1.2:0.8;lfo.connect(lg).connect(o.detune);o.connect(g).connect(droneBus);o.start();lfo.start();ambientNodes.push(o,g,lfo,lg);});
    const wind=createNoiseSource(audioCtx),windFilter=audioCtx.createBiquadFilter(),windGain=audioCtx.createGain();windFilter.type="bandpass";windFilter.frequency.value=430;windFilter.Q.value=0.45;windGain.gain.value=0.12;wind.connect(windFilter).connect(windGain).connect(ambientMaster);wind.start();ambientNodes.push(wind,windFilter,windGain);
  }
  await audioCtx.resume();ambientEnabled=true;localStorage.setItem("bpsAmbientV13","1");ambientMaster.gain.setTargetAtTime(Math.max(0.0001,ambientVolume),audioCtx.currentTime,0.08);clearTimeout(ambientTimer);scheduleHauntTone();updateAmbientUI();
}
function stopAmbient(){ambientEnabled=false;localStorage.setItem("bpsAmbientV13","0");clearTimeout(ambientTimer);ambientTimer=null;if(ambientMaster&&audioCtx)ambientMaster.gain.setTargetAtTime(0.0001,audioCtx.currentTime,0.08);updateAmbientUI()}
function toggleAmbient(){ambientEnabled?stopAmbient():startAmbient()}
function setAmbientVolume(value){ambientVolume=Math.max(0,Math.min(1,Number(value)/100));localStorage.setItem("bpsAmbientVolV13",String(ambientVolume));if(ambientMaster&&audioCtx&&ambientEnabled)ambientMaster.gain.setTargetAtTime(Math.max(0.0001,ambientVolume),audioCtx.currentTime,0.05)}
migrateLegacyRoom();

$("#createForm").addEventListener("submit",e=>{e.preventDefault();socket.emit("createRoom",{name:$("#createName").value,sessionToken})});
$("#joinForm").addEventListener("submit",e=>{e.preventDefault();socket.emit("joinRoom",{name:$("#joinName").value,code:$("#joinCode").value,sessionToken})});
$("#startBtn").onclick=()=>socket.emit("startGame");
$("#copyCodeBtn").onclick=async()=>{try{await navigator.clipboard.writeText(state.code);toast(`Copy ${state.code} แล้ว`)}catch{toast(`Room Code: ${state.code}`)}};
$("#randomCharBtn").onclick=()=>socket.emit("selectCharacter",{key:"random"});
$("#settingForced").onchange=e=>socket.emit("updateSettings",{key:"forcedMovement",value:e.target.value});
$("#settingSacDraw").onchange=e=>socket.emit("updateSettings",{key:"sacrificeDraw",value:e.target.value});
$("#settingFailedSac").onchange=e=>socket.emit("updateSettings",{key:"failedSacrifice",value:e.target.value});
$("#settingBreak").onchange=e=>socket.emit("updateSettings",{key:"equipmentBreak",value:e.target.value});
$("#statsBtn").onclick=()=>openStats();
$("#downloadReportBtn").onclick=()=>downloadReport();
$("#lobbyLeaveBtn").onclick=()=>leaveCurrentRoom();
$("#gameLeaveBtn").onclick=()=>leaveCurrentRoom();
$("#resultHomeBtn").onclick=()=>leaveCurrentRoom();
$("#resultNewRoomBtn").onclick=()=>leaveCurrentRoom({newRoom:true});
$("#ambientToggle").onclick=toggleAmbient;
$("#audioBtn").onclick=toggleAmbient;
$("#ambientVolume").oninput=e=>setAmbientVolume(e.target.value);
$("#stayBtn").onclick=()=>socket.emit("stayInRoom");
$("#escapeBtn").onclick=()=>socket.emit("escapeRoom");
$("#rollBtn").onclick=()=>socket.emit("roll");
$("#drawAmu").onclick=()=>socket.emit("drawAmulet");
$("#drawSac").onclick=()=>socket.emit("drawSacrifice");
$("#skillBtn").onclick=()=>{
  const t=mine?.char?.skillType;
  if(!t)return;
  if(t==="heal_all"||t==="summon_boss"){socket.emit("skill",{});return;}
  if(t==="force_move"){
    const mp=mePublic(),idx=mp?.pos;
    const r=Math.floor(idx/3),c=idx%3,choices=[];
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{const rr=r+dr,cc=c+dc;if(rr>=0&&rr<3&&cc>=0&&cc<3)choices.push(rr*3+cc)});
    const box=document.createElement("div");
    const note=document.createElement("p");note.className="muted";note.textContent="เข้มใช้พลังกายแทนสติ: เลือกห้องติดกัน แล้วเสีย HP ตาม Fear ของห้องนั้น";box.appendChild(note);
    choices.forEach(i=>{const rm=roomAt(i);const b=document.createElement("button");b.className="modal-option";b.textContent=`${rm.name} • Fear ${rm.fear} → HP -${rm.fear}`;b.onclick=()=>{socket.emit("skill",{index:i});closeModal()};box.appendChild(b)});
    openModal("Skill — เข้ม",box);return;
  }
  if(t==="move_to_friend"){
    const box=document.createElement("div");
    const note=document.createElement("p");note.className="muted";note.textContent="แก้วเดินไปหาเพื่อนโดยตรง • V0.7 คิดระยะด้วยจำนวนห้องแบบบน/ล่าง/ซ้าย/ขวา และเสีย HP -1 ต่อห้องที่ผ่าน";box.appendChild(note);
    state.players.filter(p=>p.id!==myId()&&!p.dead).forEach(p=>{const b=document.createElement("button");b.className="modal-option";b.textContent=`ไปหา ${p.name} · ${roomAt(p.pos).name}`;b.onclick=()=>{socket.emit("skill",{targetId:p.id});closeModal()};box.appendChild(b)});
    openModal("Skill — แก้ว",box);return;
  }
};
$("#homeHelpBtn").onclick=openHowToPlay;
$("#lobbyHelpBtn").onclick=openHowToPlay;
$("#helpBtn").onclick=openHowToPlay;
$("#roomRulesBtn").onclick=openRoomRules;
$("#bossHelpBtn").onclick=openBossHelp;
$("#endBtn").onclick=()=>socket.emit("endTurn");
$("#closeModal").onclick=closeModal;

socket.on("errorMessage",toast);
socket.on("connect",()=>{
  const c=localStorage.getItem(roomKey);
  if(c) socket.emit("resumeRoom",{code:c,sessionToken});
  const el=$("#connectionState");if(el){el.textContent="● Online";el.className="connection-state online"}
});
socket.on("disconnect",()=>{
  const el=$("#connectionState");if(el){el.textContent="● Reconnecting…";el.className="connection-state offline"}
});
socket.on("resumeFailed",()=>{resetLocalRoom();state=null;mine=null;show("home");});
socket.on("leftRoom",()=>{
  const oldName=mine?.name||$("#createName")?.value||"ติม";
  resetLocalRoom();state=null;mine=null;leavingRoom=false;closeModal();show("home");if($("#createName"))$("#createName").value=oldName;toast("ออกจากห้องแล้ว");
  if(createAfterLeave){createAfterLeave=false;setTimeout(()=>socket.emit("createRoom",{name:oldName,sessionToken}),80);}
});

socket.on("state",s=>{
  const previous=state?.phase||null;
  state=s;persistSession();render();
  if(previous==="lobby"&&s.phase==="game") setTimeout(openSetupReveal,420);
});
socket.on("privateState",p=>{mine=p;persistSession();render()});
socket.on("diceFx",showDiceFx);
socket.on("ritualFx",showRitualFx);

function render(){
  if(!state)return;
  if(state.phase==="lobby"){show("lobby");renderLobby();return}
  if(state.phase==="result"||state.phase==="defeat"){show("result");renderResult();return}
  show("game");renderGame();
}
function renderLobby(){
  $("#roomCode").textContent=state.code;
  $("#lobbyPlayers").innerHTML="";
  state.players.forEach(p=>{
    const chosen=state.characters?.find(c=>c.key===p.characterKey);
    const d=document.createElement("div");d.className="lobby-player";
    d.innerHTML=`<span>${p.id===state.hostId?"👑 ":""}${p.name}${p.connected?"":" <em>Offline</em>"}</span><small>${p.id===myId()?"คุณ · ":""}${chosen?`เลือก ${chosen.name}`:"สุ่มตัวละคร"}</small>`;
    $("#lobbyPlayers").appendChild(d)
  });
  const me=state.players.find(p=>p.id===myId());
  const taken=new Set(state.players.filter(p=>p.id!==myId()&&p.characterKey).map(p=>p.characterKey));
  $("#characterGrid").innerHTML="";
  (state.characters||[]).forEach(c=>{
    const b=document.createElement("button");
    b.className="char-pick "+(me?.characterKey===c.key?"selected ":"")+(taken.has(c.key)?"taken":"");
    b.disabled=taken.has(c.key);
    b.innerHTML=`<div class="mini-character-card char-theme-${c.key}">
      <div class="mini-char-head"><span class="incense-badge">🕯3</span><div><b>${c.name}</b><small>${c.role}</small></div><span class="hp-badge">♥ ${c.hp}</span></div>
      <div class="char-pick-art"><span>${c.name}</span><small>CHARACTER ART</small></div>
      <div class="mini-char-foot"><b>ใช้ธูป 3 ดอก</b><p>${c.skill.replace(/^ใช้ 3 ธูป:\s*/,"")}</p><small>Equip ${c.slots} ช่อง</small></div>
    </div>`;
    b.onclick=()=>socket.emit("selectCharacter",{key:c.key});
    $("#characterGrid").appendChild(b)
  });
  $("#startBtn").style.display=isHost()?"inline-block":"none";
  $("#hostNote").textContent=isHost()?"คุณเป็น Host — ตัวที่ไม่เลือกจะสุ่มให้อัตโนมัติ":"รอ Host เริ่มเกม";

  const st=state.settings||{};
  $("#settingForced").value=String(st.forcedMovement!==false);
  $("#settingSacDraw").value=st.sacrificeDraw||"onePerTurn";
  $("#settingFailedSac").value=st.failedSacrifice||"bottom";
  $("#settingBreak").value=st.equipmentBreak||"one";
  ["#settingForced","#settingSacDraw","#settingFailedSac","#settingBreak"].forEach(id=>$(id).disabled=!isHost());
  $("#playtestSettings").classList.toggle("read-only",!isHost());
  $("#settingsSummary").textContent=settingsText(st);
}
function settingsText(st=state?.settings||{}){
  return [
    st.forcedMovement===false?"เดิน: เลือกอยู่ห้องเดิมได้":"เดิน: บังคับย้ายถ้ามีทาง",
    st.sacrificeDraw==="perIncense"?"เครื่องเซ่น: จั่วได้ตามธูป":"เครื่องเซ่น: 1 ครั้ง/เทิร์น",
    st.failedSacrifice==="remove"?"ตีพลาด: เครื่องเซ่นออกจากเกม":"ตีพลาด: เครื่องเซ่นกลับใต้กอง",
    st.equipmentBreak==="all"?"ของแตก: ทั้งหมด":"ของแตก: 1 ชิ้น"
  ].join(" • ");
}
function openSetupReveal(){
  if(!state?.game)return;
  const g=state.game,ghost=g.ghost||{},box=document.createElement("div");
  const row=Math.floor(g.bossIndex/3)+1,col=(g.bossIndex%3)+1;
  box.className="setup-reveal";
  box.innerHTML=`<div class="setup-ghost">
      <small>คืนนี้เจอ</small><h2>${ghost.name||"ผี"}</h2>
      <span>Boss Room · แถว ${row} ช่อง ${col} · Fear ${ghost.fear||6}</span>
    </div>
    <div class="setup-notes">
      <div><b>ทุกคนเริ่มที่ห้องผี</b><span>ออกไปฟาร์มเครื่องเซ่น/Amulet แล้วค่อยกลับมาทำพิธี</span></div>
      <div><b>Amulet เริ่มต้น 3 ใบ</b><span>มือสูงสุด 5 · เครื่องเซ่นสูงสุด 7</span></div>
      <div><b>Setting เกมนี้</b><span>${settingsText(state.settings)}</span></div>
    </div>`;
  const ok=document.createElement("button");ok.className="primary setup-enter";ok.textContent="เข้าไปในบ้าน";ok.onclick=closeModal;box.appendChild(ok);
  openModal("เริ่มการสำรวจ",box);
}
function fmtDuration(ms){
  ms=Math.max(0,Number(ms)||0);
  const sec=Math.floor(ms/1000),m=Math.floor(sec/60),s=sec%60;
  return `${m}:${String(s).padStart(2,"0")}`;
}
function currentStats(){return state?.game?.stats||state?.result?.stats||null}
function statsNode(){
  const st=currentStats(),box=document.createElement("div");
  if(!st){box.textContent="ยังไม่มีข้อมูล Playtest";return box}
  const duration=st.endedAt?st.durationMs:Date.now()-st.startedAt;
  const items=[
    ["เวลา",fmtDuration(duration)],["Turns",st.turns],["ทอยเดิน",st.moveRolls],
    ["พิธีสำเร็จ",`${st.rituals.success}/${st.rituals.attempts}`],["ตีพลาด",st.rituals.fail],
    ["Curse ระเบิด",st.curse.bursts],["ตาย",st.deaths],["ชุบ",st.revives],
    ["Trade",`${st.trades.accepted}/${st.trades.offers}`],["Skill",st.skillsUsed],
    ["ของแตก",st.equipmentBreaks],["หนีสำเร็จ",`${st.escape.success}/${st.escape.attempts}`]
  ];
  const grid=document.createElement("div");grid.className="stats-grid";
  items.forEach(([k,v])=>{const d=document.createElement("div");d.className="stat-tile";d.innerHTML=`<small>${k}</small><b>${v}</b>`;grid.appendChild(d)});box.appendChild(grid);
  const sec=document.createElement("div");sec.className="stats-section";sec.innerHTML="<h4>เครื่องเซ่นที่จั่ว</h4>";
  const colors=document.createElement("div");colors.className="color-stats";
  [["green","เขียว"],["blue","ฟ้า"],["pink","ชมพู"],["black","ดำ"]].forEach(([c,n])=>{const e=document.createElement("span");e.className=`color-pill ${c}`;e.textContent=`${n} ${st.draws.byColor[c]||0}`;colors.appendChild(e)});
  sec.appendChild(colors);box.appendChild(sec);
  const exp=document.createElement("button");exp.className="secondary";exp.textContent="⬇️ Export JSON ตอนนี้";exp.onclick=downloadReport;box.appendChild(exp);
  if(isHost()&&state?.phase==="game"){
    const skip=document.createElement("button");skip.className="host-emergency";skip.textContent="Host: Emergency Skip Turn";skip.onclick=hostSkip;box.appendChild(skip);
  }
  return box;
}
function openStats(){openModal("📊 Playtest Stats",statsNode())}
function reportPayload(){
  return {project:"บ้านผีสิง",build:"V1.3",room:state?.code||null,ghost:state?.game?.ghost?.name||state?.result?.ghost||null,
    players:(state?.players||[]).map(p=>({name:p.name,character:p.char?.name||null,score:p.score,hp:p.hp,dead:p.dead})),
    settings:state?.settings||null,result:state?.result||null,stats:currentStats(),log:state?.log||[],exportedAt:new Date().toISOString()};
}
function downloadReport(){
  const blob=new Blob([JSON.stringify(reportPayload(),null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=`baan-phi-sing-playtest-${state?.code||"room"}.json`;
  document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
}
let diceTimer=null,ritualTimer=null;
function showDiceFx(e){
  const box=$("#diceFx");
  $("#dieA").textContent=e.a;$("#dieB").textContent=e.b;$("#diceFxTotal").textContent=`รวม ${e.total}`;
  $("#diceFxPlayer").textContent=e.playerName||"";
  $("#diceFxKind").textContent=e.kind==="ritual"?"ทอยทำพิธี":e.kind==="escape"?"ทอยหนีห้อง":"ทอยเดิน";
  box.classList.remove("hidden","pop");void box.offsetWidth;box.classList.add("pop");
  clearTimeout(diceTimer);diceTimer=setTimeout(()=>box.classList.add("hidden"),1100);
}
function showRitualFx(e){
  const box=$("#ritualFx"),card=$("#ritualFxCard");
  card.classList.toggle("success",!!e.success);card.classList.toggle("fail",!e.success);
  $("#ritualFxTitle").textContent=e.success?"พิธีสำเร็จ":"ผีสวนกลับ";
  $("#ritualFxDice").textContent=`🎲 ${e.dice.a} + ${e.dice.b} = ${e.dice.total}`;
  $("#ritualFxText").textContent=e.success?`${e.playerName} ใช้ ${e.cardName} สำเร็จ • +${e.score} คะแนน`:`${e.playerName} ใช้ ${e.cardName} ไม่สำเร็จ`;
  box.classList.remove("hidden","ritual-pop");void box.offsetWidth;box.classList.add("ritual-pop");
  clearTimeout(ritualTimer);ritualTimer=setTimeout(()=>box.classList.add("hidden"),1800);
}

function renderGame(){
  const ap=activePlayer(), mp=mePublic(), g=state.game;
  $("#turnPlayer").textContent=ap?`${ap.name} · ${ap.char?.name||""}`:"—";
  $("#hp").textContent=mine?.char?`${mine.hp}/${mine.char.hp}`:"—";
  $("#actions").textContent=`${g.actions}/3`;
  $("#score").textContent=mine?.score??0;
  $("#sanity").textContent=g.sanity??"—";
  $("#curse").textContent=`${g.curse}/6`;

  $("#playerList").innerHTML="";
  state.players.forEach(p=>{const d=document.createElement("div");d.className="player-row "+(p.isTurn?"turn ":"")+(p.dead?"dead ":"")+(p.connected?"":"offline");d.innerHTML=`<b>${p.dead?"☠️ ":""}${p.name} · ${p.char?.name||"—"}${p.connected?"":" · Offline"}</b><small>❤️ ${p.hp}/${p.char?.hp} · 🏅 ${p.score} · ${p.pos!==null?roomAt(p.pos).name:"—"} · มือ ${p.amuCount+p.sacCount} ใบ${p.dead?" · รอชุบชีวิต":""}</small>`;$("#playerList").appendChild(d)});

  $("#log").innerHTML="";
  state.log.forEach(x=>{const d=document.createElement("div");d.textContent="• "+x.text;$("#log").appendChild(d)});
  $("#log").scrollTop=$("#log").scrollHeight;

  $("#board").innerHTML="";
  for(let i=0;i<9;i++){
    const r=roomAt(i),b=document.createElement("button");
    const style=r.boss?"boss":(r.type==="คำสาป"?"curse":(r.type==="กับดัก"?"trap":(r.type==="ปลอดภัย"||r.type==="ธรรมดา"?"safe":"mystery")));
    b.className=`room room-${style} ${r.boss?"boss":""}`;
    if(g.mustMove||g.moveOptional)b.classList.add(g.legal.includes(i)?"legal":"illegal");
    const pawns=state.players.map((p,j)=>p.pos===i?`<span class="pawn ${p.dead?"pawn-dead":""}">P${j+1}</span>`:"").join("");
    b.innerHTML=`<div class="room-top"><div><b>${r.boss?"👻 ":""}${r.name}</b><small>${r.type}</small></div><span class="fear-badge">${r.fear}</span></div><div class="room-art">${r.boss?"BOSS":"ROOM"}</div><div class="room-bottom">${r.effectText?`<span>${r.effectText.split("•")[0]}</span>`:"<span>คลิกเพื่อดู Effect</span>"}<div class="pawns">${pawns}</div></div>`;
    b.onclick=()=>{
      if(isMyTurn()&&(g.mustMove||g.moveOptional)&&g.legal.includes(i)) socket.emit("move",{index:i});
      else openRoomInfo(r,i);
    };
    $("#board").appendChild(b);
  }
  if(!isMyTurn())$("#message").textContent=`รอ ${ap?.name||"ผู้เล่น"} เล่นเทิร์น`;
  else if(mp?.dead)$("#message").textContent="คุณเสียชีวิต — รอเพื่อนมาชุบชีวิต";
  else if(g.pendingRoomEffect && g.pendingRoomEffect.playerId===myId())$("#message").textContent="ต้อง Resolve Effect ของห้องก่อนทำ Action ต่อ";
  else if(g.escapeRequired)$("#message").textContent=`ติดอยู่ในห้องพิเศษ — ใช้ 1 ธูปทอยหนี (${g.escapeRule?.label||"ตามเงื่อนไขห้อง"})`;
  else if(!g.rolled)$("#message").textContent="ถึงเทิร์นคุณ — ทอยเต๋า 2 ลูก หรือเลือกใช้สกิลที่ใช้แทนการเดิน";
  else if(g.mustMove)$("#message").textContent=`สติ ${g.sanity} — ต้องเลือกห้องข้างเคียงที่เข้าได้`;
  else if(g.moveOptional)$("#message").textContent=`สติ ${g.sanity} — เลือกเดินไปห้องกรอบเขียว หรืออยู่ห้องเดิม`;
  else $("#message").textContent=`ใช้ธูปได้ ${g.actions} ดอก — จั่ว / สวมใส่ / Trade / ทำพิธี / Skill`;

  const ghost=g.ghost||{};
  $("#ghostName").textContent=ghost.name||"—";
  $("#ghostFear").textContent=`Fear ${ghost.fear??6}`;
  $("#ghostPassive").textContent=ghost.passiveText||"";
  $("#ghostArt").innerHTML=`${ghost.tier||""}<br>${ghost.name||"GHOST"}`;
  $("#bossSlots").innerHTML="";
  const symbols={green:"◆",blue:"■",pink:"⬟",black:"⬢"};
  Object.entries(ghost.need||{}).forEach(([c,n])=>{for(let i=0;i<n;i++){const s=document.createElement("span");s.className=`slot slot-${c} `+(i<(g.bossDone[c]||0)?"done":"");s.textContent=symbols[c]||"◆";$("#bossSlots").appendChild(s)}});
  $("#ghostRules").innerHTML="";
  Object.entries(ghost.dice||{}).forEach(([c,rule])=>{
    const d=document.createElement("div");
    d.innerHTML=`<b>${symbols[c]||"◆"} ${rule.label||""}</b><small>${c==="green"?"เขียว":c==="blue"?"ฟ้า":c==="pink"?"ชมพู":"ดำ"}</small><p>${ghost.counterText?.[c]||""}</p>`;
    $("#ghostRules").appendChild(d)
  });

  renderPrivate();

  const pendingMine=!!(g.pendingRoomEffect && g.pendingRoomEffect.playerId===myId());
  const canAct=isMyTurn()&&!mp?.dead&&!pendingMine;
  $("#stayBtn").style.display=g.moveOptional?"inline-block":"none";
  $("#stayBtn").disabled=!canAct||!g.moveOptional;
  $("#escapeBtn").style.display=g.escapeRequired?"inline-block":"none";
  $("#escapeBtn").disabled=!canAct||!g.escapeRequired||g.actions<1;
  $("#rollBtn").disabled=!canAct||g.escapeRequired||g.rolled;
  $("#drawAmu").disabled=!canAct||!g.moved||g.actions<1||(mine?.amu?.length||0)>=5;
  const myRoom=mp?.pos!=null?roomAt(mp.pos):null;
  const sacLimited=(state.settings?.sacrificeDraw||"onePerTurn")==="onePerTurn";
  $("#drawSac").disabled=!canAct||!g.moved||g.actions<1||(sacLimited&&g.sacDrawn)||!myRoom?.sac||(mine?.sac?.length||0)>=7;
  const skillType=mine?.char?.skillType;
  const movementSkill=["force_move","move_to_friend","summon_boss"].includes(skillType);
  $("#skillBtn").disabled=!canAct||g.actions<3||!skillType||(movementSkill?(g.rolled||g.moved||g.escapeRequired):!g.moved);
  $("#ritualBtn").disabled=!canAct||!g.moved||g.actions<2||!myRoom?.boss||!(mine?.sac||[]).some(c=>(g.ghost?.need?.[c.color]||0)>(g.bossDone[c.color]||0));
  $("#tradeBtn").disabled=!canAct||!g.moved||g.traded||!!state.trade||!state.players.some(p=>p.id!==myId()&&p.pos===mp?.pos&&!p.dead);
  $("#endBtn").disabled=!canAct||g.mustMove||g.moveOptional||(g.escapeRequired&&g.actions>0);
  renderTurnGuide({ap,mp,g,myRoom,pendingMine,canAct});

  if(!tutorialShown && mine && !localStorage.getItem("bpsSeenTutorialV10")){
    tutorialShown=true;localStorage.setItem("bpsSeenTutorialV10","1");
    setTimeout(openHowToPlay,350);
  }

  if(state.trade)renderTradeNotice();
  if(g.pendingRoomEffect && g.pendingRoomEffect.playerId===myId()) renderPendingRoomEffect(g.pendingRoomEffect);
}
function renderPrivate(){
  if(!mine)return;
  $("#charName").textContent=mine.char?.name||"—";$("#charRole").textContent=mine.char?.role||"—";$("#charSkill").textContent=mine.char?.skill||"";
  const mp=mePublic();$("#myRoom").textContent=mp?.pos!=null?roomAt(mp.pos).name:"—";$("#limits").textContent=`Amulet ${mine.amu.length}/5 · เครื่องเซ่น ${mine.sac.length}/7`;
  $("#equip").innerHTML="";
  for(let i=0;i<Math.min(2,mine.char?.slots||0);i++){const c=mine.equip[i];const b=document.createElement("button");b.className="equip";b.textContent=c?c.name:`Equip ${i+1}`;b.disabled=!c||!isMyTurn();if(c)b.onclick=()=>socket.emit("unequip",{uid:c.uid});$("#equip").appendChild(b)}
  $("#amuHand").innerHTML="";
  mine.amu.forEach(c=>{const b=document.createElement("button");b.className="game-card amulet-card";b.innerHTML=`<b>${c.name}</b><small>${c.type}</small><div class="art amulet-art"></div><small>${c.desc||""}</small>`;b.onclick=()=>{if(c.type==="equip")socket.emit("equip",{uid:c.uid});else if(["heal_self","heal_room","heal_adjacent"].includes(c.type))socket.emit("useHeal",{uid:c.uid});else if(c.type==="revive")openRevive(c);else openModal(c.name,c.desc||"")};$("#amuHand").appendChild(b)});
  $("#sacHand").innerHTML="";
  mine.sac.forEach(c=>{const b=document.createElement("button");b.className=`game-card ${c.color}`;b.innerHTML=`<b>${c.name}</b><small>${c.color}</small><div class="art"></div><small>ตีผี +${c.boss} · จบเกม ${c.end>=0?"+":""}${c.end}</small>`;b.onclick=()=>openModal(c.name,`ตีผี +${c.boss} • ตอนจบ ${c.end>=0?"+":""}${c.end}`);$("#sacHand").appendChild(b)});
}
function roomTypeLabel(r){
  return r.boss?"Boss Room":r.type||"Room";
}
function openRoomInfo(r,index=null){
  const wrap=document.createElement("div");wrap.className="room-info";
  wrap.innerHTML=`<div class="room-info-card ${r.boss?"boss-info":""}">
    <div class="room-info-head"><div><b>${r.name}</b><small>${roomTypeLabel(r)}</small></div><span>Fear ${r.fear}</span></div>
    <div class="room-info-art">${r.boss?"GHOST ROOM":"ROOM ART"}</div>
    <div class="room-info-effect"><small>EFFECT</small><p>${r.effectText||"ไม่มี Effect ที่ระบุ"}</p></div>
  </div>`;
  if(index!==null){
    const people=state.players.filter(p=>p.pos===index);
    const p=document.createElement("p");p.className="muted";p.textContent=`ผู้เล่นในห้อง: ${people.length?people.map(x=>x.name+(x.dead?" (ตาย)":"")).join(", "):"ไม่มี"}`;wrap.appendChild(p)
  }
  openModal(r.name,wrap);
}
function openRoomRules(){
  if(!state?.game)return;
  const box=document.createElement("div");box.className="rules-list";
  state.game.rooms.forEach((r,i)=>{
    if(i===state.game.bossIndex)return;
    const b=document.createElement("button");b.className="rule-room";b.innerHTML=`<b>${r.name}</b><span>Fear ${r.fear}</span><small>${r.effectText||r.type}</small>`;b.onclick=()=>openRoomInfo(r,i);box.appendChild(b)
  });
  const boss=roomAt(state.game.bossIndex),b=document.createElement("button");b.className="rule-room boss-rule";b.innerHTML=`<b>👻 ${boss.name}</b><span>Fear ${boss.fear}</span><small>${boss.effectText}</small>`;b.onclick=()=>openRoomInfo(boss,state.game.bossIndex);box.appendChild(b);
  openModal("▦ ห้องในบ้านเกมนี้",box);
}
function openHowToPlay(){
  const box=document.createElement("div");box.className="howto";
  const forced=state?.settings?.forcedMovement!==false;
  const sacRule=state?.settings?.sacrificeDraw==="perIncense"?"จั่วเครื่องเซ่นซ้ำได้ถ้ามีธูปและมือไม่เต็ม":"จั่วเครื่องเซ่นได้สูงสุด 1 ครั้ง/เทิร์น";
  box.innerHTML=`
    <div class="howto-step"><b>1 · ทอยเดิน</b><p>ทอยเต๋า 2 ลูก → หัก Fear ของห้องปัจจุบันและผลของสวมใส่ → ได้ “สติ”</p></div>
    <div class="howto-step"><b>2 · ${forced?"ต้องย้ายห้อง":"เลือกย้ายหรืออยู่เดิม"}</b><p>ห้องข้างเคียงที่ Fear ≤ สติจะเป็นทางที่เข้าได้ • ${forced?"ถ้ามีทาง ระบบบังคับให้เดิน 1 ห้อง":"เลือกเดิน 1 ห้องหรือกดอยู่ห้องเดิมได้"} (บน/ล่าง/ซ้าย/ขวา)</p></div>
    <div class="howto-step"><b>3 · ใช้ธูป 3 ดอก</b><p>จั่ว Amulet 1 ดอก · สวม/ถอด 1 ดอก · ${sacRule} · ตีผี 2 ดอก · Skill 3 ดอก</p></div>
    <div class="howto-step"><b>4 · ฟาร์มแล้วต่อรอง</b><p>Amulet ถือสูงสุด 5 ใบ · เครื่องเซ่น 7 ใบ · Trade ฟรี 1 ครั้ง/เทิร์นกับคนห้องเดียวกัน</p></div>
    <div class="howto-step"><b>5 · ปราบผี</b><p>เข้าห้อง Boss ให้ได้ → เลือกเครื่องเซ่นที่ตรงสี → ทอยผ่านเกณฑ์ของสีนั้น → ปิด Symbol และรับคะแนน</p></div>
    <div class="howto-step danger"><b>☠️ ระวัง</b><p>HP = 0 จะตายและรอชุบ · ผีสะสม Curse ครบ 6 จะสร้างความเสียหายแล้วรีเซ็ต</p></div>`;
  openModal("วิธีเล่นแบบ 60 วินาที",box);
}
function openBossHelp(){
  const g=state?.game,ghost=g?.ghost;if(!ghost)return;
  const box=document.createElement("div");box.className="boss-guide";
  const intro=document.createElement("p");intro.innerHTML=`<b>${ghost.name}</b> อยู่ใน Boss Room Fear ${ghost.fear}. เครื่องเซ่นที่ต้องใช้ทั้งหมดแสดงเป็น Symbol บนการ์ด`;box.appendChild(intro);
  const symbols={green:"◆ เขียว",blue:"■ ฟ้า",pink:"⬟ ชมพู",black:"⬢ ดำ"};
  Object.entries(ghost.need||{}).forEach(([c,n])=>{
    const d=document.createElement("div");d.className=`boss-guide-row ${c}`;
    d.innerHTML=`<b>${symbols[c]||c} × ${n}</b><span>ทอย ${ghost.dice?.[c]?.label||"?"}</span><small>${ghost.counterText?.[c]||""}</small>`;
    box.appendChild(d)
  });
  openModal(`วิธีปราบ ${ghost.name}`,box);
}
function renderTurnGuide({ap,mp,g,myRoom,pendingMine,canAct}){
  const title=$("#guideTitle"),text=$("#guideText"),steps=$("#guideSteps");
  const set=(t,x,activeStep)=>{
    title.textContent=t;text.textContent=x;
    steps.innerHTML=["ทอย/หนี","เดิน","ใช้ธูป","ส่งเทิร์น"].map((s,i)=>`<span class="${i===activeStep?"active":i<activeStep?"done":""}">${i+1} ${s}</span>`).join("");
  };
  if(!isMyTurn()){set(`รอ ${ap?.name||"เพื่อน"}`,`ตอนนี้เป็นเทิร์นของ ${ap?.name||"ผู้เล่นอื่น"} ดูแผนที่และวางแผนการ์ดของเราไว้ก่อนได้`,0);return}
  if(mp?.dead){set("รอการชุบชีวิต","HP ของคุณเป็น 0 ผู้เล่นคนอื่นต้องใช้การ์ดที่ชุบชีวิตได้",0);return}
  if(pendingMine){set("Resolve Room Effect ก่อน","Effect ของห้องยังทำงานไม่เสร็จ เลือกการ์ด/ผลลัพธ์ในหน้าต่างที่เปิดอยู่",2);return}
  if(g.escapeRequired){set("หนีห้องก่อน",`ใช้ปุ่ม “ทอยหนีห้อง” ครั้งละ 1 ธูป • เงื่อนไข: ${g.escapeRule?.label||"ตามการ์ดห้อง"}`,0);return}
  if(!g.rolled){set("ทอยเต๋าเพื่อเดิน","กดทอยเต๋า 2 ลูกก่อน หรือถ้าตัวละครมีสกิลแทนการเดินสามารถเลือกใช้สกิลได้",0);return}
  if(g.mustMove){set("เลือกห้องกรอบเขียว",`สติ ${g.sanity} • ต้องเดินไปห้องข้างเคียงที่ระบบไฮไลต์ให้`,1);return}
  if(g.moveOptional){set("เดินหรืออยู่ห้องเดิม",`สติ ${g.sanity} • เลือกห้องกรอบเขียว หรือกด “อยู่ห้องเดิม” ก่อนใช้ธูป`,1);return}
  if(g.actions<=0){set("ธูปหมดแล้ว","ไม่มี Action เหลือ กดส่งเทิร์นให้เพื่อนได้เลย",3);return}
  if(myRoom?.boss && !(document.querySelector("#ritualBtn")?.disabled)){set("พร้อมลองปราบผี","มีเครื่องเซ่นที่ผีต้องการและธูปพอ — จะทำพิธีเลย หรือจัดของก่อนก็ได้",2);return}
  const canSacAgain=state.settings?.sacrificeDraw==="perIncense"||!g.sacDrawn;
  if(myRoom?.sac && canSacAgain && (mine?.sac?.length||0)<7){
    set("ห้องนี้ฟาร์มเครื่องเซ่นได้",state.settings?.sacrificeDraw==="perIncense"?"จั่วเครื่องเซ่นได้ตราบใดที่ยังมีธูป • ระวัง Effect ห้อง":"จั่วเครื่องเซ่นได้ 1 ครั้งในเทิร์นนี้ • การจั่วอาจ Trigger Effect ห้อง",2);return
  }
  set("เลือก Action ของเทิร์นนี้",`เหลือธูป ${g.actions} ดอก • จั่ว Amulet / สวมใส่ / Trade / Skill / ทำพิธี ตามสถานการณ์`,2);
}
function hostSkip(){
  if(confirm("Emergency Skip ใช้เฉพาะตอน Playtest ติดบั๊ก/ผู้เล่นหลุดจริง ๆ นะ ข้ามเทิร์นปัจจุบันเลยไหม?")) socket.emit("hostSkipTurn");
}

function openRevive(card){
  const dead=state.players.filter(p=>p.dead&&p.id!==myId());
  if(!dead.length){toast("ตอนนี้ยังไม่มีเพื่อนที่ต้องชุบ");return}
  const box=document.createElement("div");
  const note=document.createElement("p");note.className="muted";note.textContent="ยาฟื้นชีพโอสถ: เลือกเพื่อนที่ HP = 0 • ชุบได้จากทุกห้อง";box.appendChild(note);
  dead.forEach(p=>{const b=document.createElement("button");b.className="modal-option";b.textContent=`☠️ ${p.name} · ${p.char?.name||""} · ${p.pos!==null?roomAt(p.pos).name:""}`;b.onclick=()=>{socket.emit("useRevive",{uid:card.uid,targetId:p.id});closeModal()};box.appendChild(b)});
  openModal("ชุบชีวิตเพื่อน",box);
}

$("#ritualBtn").onclick=()=>{
  const g=state.game,box=document.createElement("div"),ghost=g.ghost||{};
  const intro=document.createElement("div");intro.className="ritual-help";
  intro.innerHTML=`<b>ใช้ 2 ธูป</b><span>เลือกเครื่องเซ่น 1 ใบที่ตรง Symbol ที่ยังเหลือ แล้วทอยเต๋า 2 ลูกตามเกณฑ์สี</span>`;
  box.appendChild(intro);
  (mine?.sac||[]).filter(c=>(ghost.need?.[c.color]||0)>(g.bossDone[c.color]||0)).forEach(c=>{
    const rule=ghost.dice?.[c.color];
    const b=document.createElement("button");b.className=`modal-option ritual-option ${c.color}`;
    b.innerHTML=`<strong>${c.icon} ${c.name}</strong><span>ต้องทอย ${rule?.label||"?"} · สำเร็จ +${c.boss} คะแนน</span><small>${ghost.counterText?.[c.color]||"พลาด → รับผลสวนกลับตามการ์ดผี"}</small>`;
    b.onclick=()=>{socket.emit("ritual",{uid:c.uid});closeModal()};
    box.appendChild(b)
  });
  openModal(`ทำพิธี — ${ghost.name||"ผี"}`,box);
};
$("#tradeBtn").onclick=()=>{
  const mp=mePublic(),targets=state.players.filter(p=>p.id!==myId()&&p.pos===mp?.pos&&!p.dead);
  const wrap=document.createElement("div");
  const targetSel=document.createElement("select");targetSel.id="tradeTarget";targetSel.style.width="100%";targetSel.style.padding="10px";targetSel.style.marginBottom="10px";targetSel.style.background="#101212";targetSel.style.color="white";targetSel.style.border="1px solid #343736";targetSel.style.borderRadius="9px";
  targets.forEach(p=>{const o=document.createElement("option");o.value=p.id;o.textContent=p.name;targetSel.appendChild(o)});wrap.appendChild(targetSel);
  const giveTitle=document.createElement("p");giveTitle.textContent="ของที่คุณเสนอ (เลือกได้สูงสุด 3 ใบ)";wrap.appendChild(giveTitle);
  [...(mine?.amu||[]).map(c=>({...c,zone:"Amulet"})),...(mine?.sac||[]).map(c=>({...c,zone:"เครื่องเซ่น"}))].forEach(c=>{const lab=document.createElement("label");lab.className="trade-card-check";lab.innerHTML=`<input type="checkbox" value="${c.uid}"><span>${c.name}<small style="display:block;color:#9c978c">${c.zone}</small></span>`;wrap.appendChild(lab)});
  const grid=document.createElement("div");grid.className="trade-grid";grid.innerHTML=`<label>คะแนนที่ให้<input id="giveScore" type="number" min="0" value="0"></label><label>คะแนนที่ขอ<input id="askScore" type="number" min="0" value="0"></label><label>ขอการ์ดกลับกี่ใบ<input id="askCards" type="number" min="0" max="2" value="0"></label>`;wrap.appendChild(grid);
  const send=document.createElement("button");send.className="primary";send.textContent="ส่ง Trade Offer";send.onclick=()=>{const uids=[...wrap.querySelectorAll('input[type="checkbox"]:checked')].slice(0,3).map(x=>x.value);socket.emit("tradeOffer",{toId:targetSel.value,giveUids:uids,giveScore:Number($("#giveScore").value),askScore:Number($("#askScore").value),askCardCount:Number($("#askCards").value)});closeModal()};wrap.appendChild(send);
  openModal("🤝 ใจแลกใจ",wrap);
};
function renderTradeNotice(){
  const t=state.trade;if(!t)return;
  if(t.toId===myId()){
    const from=state.players.find(p=>p.id===t.fromId),box=document.createElement("div");
    const p=document.createElement("p");p.textContent=`${from?.name} เสนอ Trade: ให้ ${t.giveCards.map(c=>c.name).join(", ")||"ไม่มีการ์ด"} + ${t.giveScore} คะแนน • ขอ ${t.askScore} คะแนน และการ์ด ${t.askCardCount} ใบ`;box.appendChild(p);
    const selected=document.createElement("div");selected.dataset.returnCards="1";
    if(t.askCardCount>0){const label=document.createElement("p");label.textContent=`เลือกการ์ดตอบกลับ ${t.askCardCount} ใบ`;selected.appendChild(label);[...(mine?.amu||[]),...(mine?.sac||[])].forEach(c=>{const lab=document.createElement("label");lab.className="trade-card-check";lab.innerHTML=`<input type="checkbox" value="${c.uid}"><span>${c.name}</span>`;selected.appendChild(lab)});box.appendChild(selected)}
    const accept=document.createElement("button");accept.className="primary";accept.textContent="Accept";accept.onclick=()=>{const ids=[...selected.querySelectorAll('input:checked')].map(x=>x.value);socket.emit("tradeAccept",{returnUids:ids});closeModal()};box.appendChild(accept);
    const reject=document.createElement("button");reject.className="secondary";reject.style.marginLeft="7px";reject.textContent="Reject";reject.onclick=()=>{socket.emit("tradeReject");closeModal()};box.appendChild(reject);
    if($("#modal").classList.contains("hidden"))openModal("มี Trade Offer ถึงคุณ",box);
  }
}
let lastRoomEffectId=null;
function renderPendingRoomEffect(pending){
  if(!pending || pending.id===lastRoomEffectId || !mine) return;
  lastRoomEffectId=pending.id;
  const box=document.createElement("div");
  const note=document.createElement("p"); note.textContent=pending.reason||"Effect ห้อง"; box.appendChild(note);
  if(pending.type==="discardSacrifice"){
    const help=document.createElement("p"); help.className="muted"; help.textContent=`เลือกเครื่องเซ่น ${pending.count} ชิ้นเพื่อส่งกลับใต้กอง`; box.appendChild(help);
    (mine.sac||[]).forEach(c=>{const lab=document.createElement("label");lab.className="trade-card-check";lab.innerHTML=`<input type="checkbox" value="${c.uid}"><span>${c.name}<small style="display:block;color:#9c978c">${c.color}</small></span>`;box.appendChild(lab)});
    const ok=document.createElement("button");ok.className="primary";ok.textContent="Resolve Effect";ok.onclick=()=>{const ids=[...box.querySelectorAll('input:checked')].map(x=>x.value); if(ids.length!==pending.count){toast(`ต้องเลือก ${pending.count} ใบ`);return;} socket.emit("resolveRoomEffect",{uids:ids}); closeModal();};box.appendChild(ok);
  }else if(pending.type==="pickAmuletDiscard"){
    const help=document.createElement("p");help.className="muted";help.textContent="เลือก Amulet 1 ใบจากกองทิ้งกลับขึ้นมือ";box.appendChild(help);
    (pending.options||[]).forEach(c=>{const b=document.createElement("button");b.className="modal-option";b.textContent=`${c.name} • ${c.type}`;b.onclick=()=>{socket.emit("resolveRoomEffect",{uid:c.uid});closeModal()};box.appendChild(b)});
  }
  openModal("Room Effect",box);
}

function renderResult(){
  $("#results").innerHTML="";
  const defeated=state.phase==="defeat"||state.result?.defeat;
  $("#resultEyebrow").textContent=defeated?"ALL PLAYERS DOWN":"GHOST DEFEATED";
  $("#resultTitle").textContent=defeated?"บ้านนี้กลืนทุกคนไปแล้ว":"ปราบผีสำเร็จ";
  $("#resultText").textContent=defeated?"ผู้เล่นทุกคน HP เหลือ 0 — เกมจบทันที":"คะแนนจากพิธี + คะแนนเครื่องเซ่นบนมือ";
  const rows=state.result?.rows||[];
  rows.forEach(p=>{const d=document.createElement("div");d.className="result-player "+(p.winner?"winner":"");d.innerHTML=`<span>${p.winner?"🏆 ":""}${p.name} · ${p.char}</span><b>${p.total} คะแนน <small style="display:block;color:#9c978c">พิธี ${p.ritual} + มือ ${p.hand}</small></b>`;$("#results").appendChild(d)});
  $("#resultStats").innerHTML="";
  $("#resultStats").appendChild(statsNode());
}

// Resume a previously enabled ambience after the next real user gesture (browser autoplay policy).
document.addEventListener("pointerdown",()=>{if(ambientEnabled)startAmbient()},{once:true,capture:true});
updateAmbientUI();
