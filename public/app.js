const socket=io();
const $=s=>document.querySelector(s);
const show=id=>["home","lobby","game","result"].forEach(x=>$("#"+x).classList.toggle("active",x===id));
const tokenKey="bpsSessionTokenV09",roomKey="bpsRoomCodeV13",legacyRoomKey="bpsRoomCodeV09";
const makeToken=()=>globalThis.crypto?.randomUUID?.().replaceAll("-","")||`${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
let sessionToken=localStorage.getItem(tokenKey)||makeToken();
localStorage.setItem(tokenKey,sessionToken);
let state=null,mine=null,tutorialShown=false;
let createAfterLeave=false,leavingRoom=false;
let audioCtx=null,ambientMaster=null,sfxMaster=null,trackNodes=[],trackTimers=[];
let ambientEnabled=localStorage.getItem("bpsAmbientV14")==="1" || localStorage.getItem("bpsAmbientV13")==="1";
let ambientVolume=Math.max(0,Math.min(1,Number(localStorage.getItem("bpsAmbientVolV14")||localStorage.getItem("bpsAmbientVolV13")||0.24)));
let ambientTrack=localStorage.getItem("bpsAmbientTrackV14")||"haunted";
const TRACK_NAMES={haunted:"บ้านร้าง",candle:"พิธีเทียนดับ",redrain:"คืนฝนแดง"};
const PLAYER_META={
  1:{label:"P1",name:"แดงอิฐ"},2:{label:"P2",name:"ฟ้าน้ำมนต์"},3:{label:"P3",name:"ทองธูป"},4:{label:"P4",name:"ม่วงคุณไสย"},
  5:{label:"P5",name:"เขียวตะเคียน"},6:{label:"P6",name:"ชมพูเครื่องเซ่น"}
};
let diceAnimating=false,queuedState=null,queuedPrivateState=null,queuedHpEvents=[];
let hpFxBusy=false;const hpFxQueue=[];
let moveFxTimer=null,turnFxTimer=null,turnHandoffQueueTimer=null;
const TURN_TRANSITION_MS=1900,TURN_ALERT_MS=60000;
let turnTransitionActive=false,turnTimerRaf=null,turnTimerStart=0,turnTimerProgress=0,turnTimerPlayerId=null,turnTimerAlerted=false;
let ritualRollSelection=null,rollRequestPending=false;
let chatRoomCode=null,chatSeenIds=new Set(),chatUnread=0;
function playerSeat(p){return Math.max(1,Math.min(6,Number(p?.seat)||((state?.players||[]).findIndex(x=>x.id===p?.id)+1)||1))}
function playerMeta(p){return PLAYER_META[playerSeat(p)]||PLAYER_META[1]}

function artMarkup(url,cls="card-art-img",alt="art"){return url?`<img class="${cls}" src="${url}" alt="${alt}">`:""}
function conditionLabel(c){return typeof c?.condition==="object"?(c.condition?.label||""):String(c?.condition||"")}

function toast(t){const e=$("#toast");e.textContent=t;e.classList.remove("hidden");setTimeout(()=>e.classList.add("hidden"),2600)}
function closeModal(){$("#modal").classList.add("hidden");setTimeout(updateRollFocus,30)}
function openModal(title,node){$("#rollFocus")?.classList.add("hidden");$("#modalTitle").textContent=title;$("#modalBody").innerHTML="";if(typeof node==="string")$("#modalBody").textContent=node;else $("#modalBody").appendChild(node);$("#modal").classList.remove("hidden")}
function activePlayer(){return state?.players?.[state.game?.turn||0]}
function myId(){return mine?.id||null}
function mePublic(){return state?.players?.find(p=>p.id===myId())}
function roomAt(i){if(!state?.game)return null;if(i===state.game.bossIndex)return {id:"BOSS",name:state.game.bossName||"เขตเซ่นสังเวย",type:"พิธีกรรม",fear:state.game.ghost?.fear||6,boss:true,art:state.game.bossArt||null,effectText:`ห้องของ ${state.game.ghost?.name||"ผี"} • ใช้ทำพิธีปราบผี`};return state.game.rooms[i]}
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
function ensureAudio(){
  if(!audioCtx){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return null;
    audioCtx=new AC();
    ambientMaster=audioCtx.createGain();ambientMaster.gain.value=0.0001;ambientMaster.connect(audioCtx.destination);
    sfxMaster=audioCtx.createGain();sfxMaster.gain.value=0.55;sfxMaster.connect(audioCtx.destination);
  }
  if(audioCtx.state==="suspended") audioCtx.resume().catch(()=>{});
  return audioCtx;
}
function updateAmbientUI(){
  const label=ambientEnabled?`🔊 ${TRACK_NAMES[ambientTrack]||"เพลง"} ON`:"🎵 เปิดเพลง";
  [$("#ambientToggle"),$("#audioBtn")].forEach(b=>{if(b){b.textContent=label;b.classList.toggle("active",ambientEnabled)}});
  if($("#ambientVolume"))$("#ambientVolume").value=String(Math.round(ambientVolume*100));
  if($("#ambientTrack"))$("#ambientTrack").value=ambientTrack;
}
function clearTrack(){
  trackTimers.forEach(t=>clearTimeout(t));trackTimers=[];
  trackNodes.forEach(n=>{try{n.stop?.()}catch{} try{n.disconnect?.()}catch{}});trackNodes=[];
}
function makeNoiseSource(ctx,seconds=6){
  const len=Math.floor(ctx.sampleRate*seconds),buf=ctx.createBuffer(1,len,ctx.sampleRate),data=buf.getChannelData(0);let last=0;
  for(let i=0;i<len;i++){const white=Math.random()*2-1;last=last*0.986+white*0.014;data[i]=last*0.85;}
  const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;return src;
}
function tone(freq,duration=1.2,volume=0.025,type="sine",when=0,target=ambientMaster){
  const ctx=ensureAudio();if(!ctx||!target)return;
  const now=ctx.currentTime+when,o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
  o.type=type;o.frequency.value=freq;f.type="lowpass";f.frequency.value=1500;
  g.gain.setValueAtTime(0.0001,now);g.gain.exponentialRampToValueAtTime(Math.max(0.0002,volume),now+0.04);
  g.gain.exponentialRampToValueAtTime(0.0001,now+duration);
  o.connect(f).connect(g).connect(target);o.start(now);o.stop(now+duration+0.05);
}
function loopPhrase(notes,stepMs,vol=0.022,type="triangle"){
  let i=0;
  const tick=()=>{
    if(!ambientEnabled)return;
    const n=notes[i%notes.length];i++;
    if(n) tone(n,Math.max(.55,stepMs/1000*.82),vol,type);
    trackTimers.push(setTimeout(tick,stepMs));
  };
  tick();
}
function addDrone(freqs,level=0.05){
  const ctx=ensureAudio();if(!ctx||!ambientMaster)return;
  const bus=ctx.createGain(),filter=ctx.createBiquadFilter();bus.gain.value=level;filter.type="lowpass";filter.frequency.value=220;bus.connect(filter).connect(ambientMaster);
  trackNodes.push(bus,filter);
  freqs.forEach((freq,i)=>{
    const o=ctx.createOscillator(),g=ctx.createGain(),lfo=ctx.createOscillator(),lg=ctx.createGain();
    o.type=i%2?"triangle":"sine";o.frequency.value=freq;g.gain.value=i?0.25:0.38;lfo.frequency.value=.025+i*.012;lg.gain.value=.6+i*.25;
    lfo.connect(lg).connect(o.detune);o.connect(g).connect(bus);o.start();lfo.start();trackNodes.push(o,g,lfo,lg);
  });
}
function addWind(freq=430,level=.1){
  const ctx=ensureAudio();if(!ctx||!ambientMaster)return;
  const src=makeNoiseSource(ctx,8),filter=ctx.createBiquadFilter(),gain=ctx.createGain();filter.type="bandpass";filter.frequency.value=freq;filter.Q.value=.45;gain.gain.value=level;
  src.connect(filter).connect(gain).connect(ambientMaster);src.start();trackNodes.push(src,filter,gain);
}
function scheduleHaunt(){
  if(!ambientEnabled||ambientTrack!=="haunted")return;
  const choices=[174.61,196,207.65,233.08,261.63],freq=choices[Math.floor(Math.random()*choices.length)]*(Math.random()<.18?.5:1);
  tone(freq,5+Math.random()*2,.018+Math.random()*.014,Math.random()<.5?"sine":"triangle");
  trackTimers.push(setTimeout(scheduleHaunt,6000+Math.random()*8000));
}
function startSelectedTrack(){
  clearTrack();
  if(!ambientEnabled)return;
  ensureAudio();
  if(ambientTrack==="haunted"){
    addDrone([43.65,65.41],.05);addWind(430,.11);scheduleHaunt();
  }else if(ambientTrack==="candle"){
    addDrone([55,82.41],.045);addWind(760,.045);
    loopPhrase([220,261.63,293.66,261.63,233.08,196,220,null],1150,.025,"triangle");
    loopPhrase([110,null,null,123.47,null,null,98,null],2300,.018,"sine");
  }else{
    addDrone([46.25,69.3],.05);addWind(1150,.085);
    loopPhrase([185,220,207.65,164.81,185,246.94,220,null],820,.021,"triangle");
    loopPhrase([92.5,null,82.41,null,103.83,null,92.5,null],1640,.02,"sine");
  }
}
async function startAmbient(){
  const ctx=ensureAudio();if(!ctx){toast("Browser นี้ไม่รองรับ Web Audio");return;}
  try{await ctx.resume()}catch{}
  ambientEnabled=true;
  localStorage.setItem("bpsAmbientV14","1");
  ambientMaster.gain.setTargetAtTime(Math.max(.0001,ambientVolume),ctx.currentTime,.08);
  startSelectedTrack();updateAmbientUI();
}
function stopAmbient(){
  ambientEnabled=false;localStorage.setItem("bpsAmbientV14","0");clearTrack();
  if(ambientMaster&&audioCtx)ambientMaster.gain.setTargetAtTime(.0001,audioCtx.currentTime,.08);
  updateAmbientUI();
}
function toggleAmbient(){ambientEnabled?stopAmbient():startAmbient()}
function setAmbientVolume(value){
  ambientVolume=Math.max(0,Math.min(1,Number(value)/100));localStorage.setItem("bpsAmbientVolV14",String(ambientVolume));
  if(ambientMaster&&audioCtx&&ambientEnabled)ambientMaster.gain.setTargetAtTime(Math.max(.0001,ambientVolume),audioCtx.currentTime,.05);
}
function setAmbientTrack(value){
  if(!TRACK_NAMES[value])return;
  ambientTrack=value;localStorage.setItem("bpsAmbientTrackV14",value);updateAmbientUI();
  if(ambientEnabled)startSelectedTrack();
}
function playDiceTick(strength=.04){
  const ctx=ensureAudio();if(!ctx||ctx.state!=="running"||!sfxMaster)return;
  const now=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
  o.type="triangle";o.frequency.value=900+Math.random()*1100;f.type="highpass";f.frequency.value=650;
  g.gain.setValueAtTime(strength,now);g.gain.exponentialRampToValueAtTime(.0001,now+.055);
  o.connect(f).connect(g).connect(sfxMaster);o.start(now);o.stop(now+.07);
}
function playDiceRollSound(durationMs=2100){
  const started=performance.now();
  const tick=()=>{
    if(performance.now()-started>=durationMs)return;
    playDiceTick(.025+Math.random()*.035);
    setTimeout(tick,70+Math.random()*85);
  };
  tick();
}
function playCardFlipSound(){
  const ctx=ensureAudio();if(!ctx||ctx.state!=="running"||!sfxMaster)return;
  tone(520,.12,.018,"triangle",0,sfxMaster);tone(780,.16,.012,"sine",.05,sfxMaster);
}
function playHpSound(delta){
  const ctx=ensureAudio();if(!ctx||ctx.state!=="running"||!sfxMaster)return;
  if(delta<0){tone(115,.25,.065,"sawtooth",0,sfxMaster);tone(78,.32,.045,"triangle",.04,sfxMaster)}
  else{tone(440,.18,.035,"sine",0,sfxMaster);tone(659.25,.28,.03,"sine",.1,sfxMaster);tone(880,.3,.02,"triangle",.18,sfxMaster)}
}
function playStepSound(){
  const ctx=ensureAudio();if(!ctx||ctx.state!=="running"||!sfxMaster)return;
  tone(145,.08,.035,"triangle",0,sfxMaster);tone(118,.09,.03,"triangle",.14,sfxMaster);
}
function playTurnSound(isMine=false){
  const ctx=ensureAudio();if(!ctx||ctx.state!=="running"||!sfxMaster)return;
  const now=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
  o.type="sawtooth";o.frequency.setValueAtTime(155,now);o.frequency.exponentialRampToValueAtTime(420,now+.42);f.type="lowpass";f.frequency.value=900;
  g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.022,now+.03);g.gain.exponentialRampToValueAtTime(.0001,now+.48);
  o.connect(f).connect(g).connect(sfxMaster);o.start(now);o.stop(now+.5);
  tone(isMine?523.25:392,.18,.028,"triangle",.42,sfxMaster);tone(isMine?783.99:587.33,.34,.025,"sine",.55,sfxMaster);
}
function playTurnTimeWarningSound(){
  const ctx=ensureAudio();if(!ctx||ctx.state!=="running"||!sfxMaster)return;
  tone(659.25,.16,.022,"sine",0,sfxMaster);tone(783.99,.18,.018,"triangle",.17,sfxMaster);tone(659.25,.22,.015,"sine",.35,sfxMaster);
}
function paintTurnTimer(){
  const ap=activePlayer(),seat=playerSeat(ap),meta=PLAYER_META[seat]||PLAYER_META[1],angle=`${Math.max(0,Math.min(1,turnTimerProgress))*360}deg`;
  const hud=$("#turnEnergyRing");if(hud){hud.style.setProperty("--turn-angle",angle);hud.style.setProperty("--pcolor",`var(--p${seat})`);hud.classList.toggle("timer-full",turnTimerProgress>=1)}
  document.querySelectorAll(".turn-timer-ring").forEach(el=>{el.style.setProperty("--turn-angle",angle);el.classList.toggle("timer-full",turnTimerProgress>=1)});
}
function stopTurnTimer({reset=true}={}){
  if(turnTimerRaf)cancelAnimationFrame(turnTimerRaf);turnTimerRaf=null;turnTimerStart=0;turnTimerPlayerId=null;turnTimerAlerted=false;if(reset)turnTimerProgress=0;paintTurnTimer();
}
function startTurnTimer(p){
  stopTurnTimer();if(!p||state?.phase!=="game")return;turnTimerPlayerId=p.id;turnTimerStart=performance.now();
  const tick=()=>{
    if(state?.phase!=="game"||activePlayer()?.id!==turnTimerPlayerId){stopTurnTimer();return}
    turnTimerProgress=Math.min(1,(performance.now()-turnTimerStart)/TURN_ALERT_MS);paintTurnTimer();
    if(turnTimerProgress>=1){
      if(!turnTimerAlerted){turnTimerAlerted=true;if(turnTimerPlayerId===myId())playTurnTimeWarningSound()}
      turnTimerRaf=null;return;
    }
    turnTimerRaf=requestAnimationFrame(tick);
  };
  paintTurnTimer();turnTimerRaf=requestAnimationFrame(tick);
}
function hpReason(prev,next,name){
  const lastAt=Math.max(0,...((prev?.log||[]).map(x=>Number(x.at)||0)));
  const fresh=(next?.log||[]).filter(x=>(Number(x.at)||0)>lastAt);
  const candidate=[...fresh].reverse().find(x=>String(x.text||"").includes(name)||/HP|สวนกลับ|Curse|ฟื้น|ชุบ|Event|ห้อง/.test(String(x.text||"")))||fresh.at(-1);
  return candidate?.text||"สถานะ HP เปลี่ยน";
}
function queueHpFx(delta,reason=""){
  if(!delta)return;hpFxQueue.push({delta,reason});if(!hpFxBusy)showNextHpFx();
}
function showNextHpFx(){
  if(cardRevealBusy){hpFxBusy=false;setTimeout(showNextHpFx,220);return}
  const e=hpFxQueue.shift();if(!e){hpFxBusy=false;return}hpFxBusy=true;
  const box=$("#hpFx"),card=$("#hpFxCard"),icon=$("#hpFxIcon");
  card.className=`hp-fx-card ${e.delta<0?"damage":"heal"}`;
  icon.innerHTML=e.delta<0?'<i></i><i></i><i></i>':'<span>❤</span><em>✦</em>';
  $("#hpFxValue").textContent=`HP ${e.delta>0?"+":""}${e.delta}`;
  $("#hpFxReason").textContent=e.reason;
  box.classList.remove("hidden","hp-pop");void box.offsetWidth;box.classList.add("hp-pop");playHpSound(e.delta);
  setTimeout(()=>{box.classList.add("hidden");hpFxBusy=false;showNextHpFx()},1450);
}
function showMoveFx(p,pos){
  if(pos==null||!state?.game)return;const meta=playerMeta(p),room=roomAt(pos),tile=document.querySelector(`[data-room-index="${pos}"]`);
  if(tile){tile.classList.remove("move-arrive");void tile.offsetWidth;tile.classList.add("move-arrive",`pcolor-${playerSeat(p)}`);setTimeout(()=>tile.classList.remove("move-arrive",`pcolor-${playerSeat(p)}`),950)}
  clearTimeout(moveFxTimer);$("#moveFxPawn").textContent=meta.label;$("#moveFxPawn").className=`pcolor-${playerSeat(p)}`;$("#moveFxText").textContent=`${p.name} → ${room?.name||"ห้องใหม่"}`;$("#moveFx").classList.remove("hidden","move-pop");void $("#moveFx").offsetWidth;$("#moveFx").classList.add("move-pop");playStepSound();moveFxTimer=setTimeout(()=>$("#moveFx").classList.add("hidden"),1050);
}
function showTurnHandoff(p,isMine=false){
  if(!p)return;clearTimeout(turnFxTimer);stopTurnTimer();turnTransitionActive=true;
  const meta=playerMeta(p),box=$("#turnFx"),seat=$("#turnFxSeat"),copy=$(".turn-fx-copy");
  seat.textContent=meta.label;seat.className=`turn-fx-seat pcolor-${playerSeat(p)}`;copy.style.setProperty("--pcolor",`var(--p${playerSeat(p)})`);
  $("#turnFxText").textContent=isMine?"ถึงเทิร์นคุณแล้ว!":`ถึงเทิร์น ${p.name}`;$("#turnFxChar").textContent=`${meta.label} · ${p.char?.name||"ยังไม่เลือกตัวละคร"}`;
  box.classList.remove("hidden","turn-pop","turn-slide");void box.offsetWidth;box.classList.add("turn-slide");playTurnSound(isMine);
  turnFxTimer=setTimeout(()=>{box.classList.add("hidden");box.classList.remove("turn-slide");turnTransitionActive=false;render();if(state?.phase==="game"&&activePlayer()?.id===p.id)startTurnTimer(p);},TURN_TRANSITION_MS);
}
function presentationBusy(){
  return !!(diceAnimating||cardRevealBusy||hpFxBusy||!$("#ritualFx")?.classList.contains("hidden")||!$("#moveFx")?.classList.contains("hidden"));
}
function queueTurnHandoff(p,isMine=false,delay=90){
  if(!p)return;clearTimeout(turnHandoffQueueTimer);const targetId=p.id;
  const attempt=()=>{
    if(state?.phase!=="game"||activePlayer()?.id!==targetId)return;
    if(presentationBusy()){turnHandoffQueueTimer=setTimeout(attempt,180);return}
    showTurnHandoff(activePlayer(),activePlayer()?.id===myId());
  };
  turnHandoffQueueTimer=setTimeout(attempt,delay);
}
function setChatCollapsed(collapsed){
  const dock=$("#chatDock");if(!dock)return;dock.classList.toggle("collapsed",collapsed);$("#chatChevron").textContent=collapsed?"▲":"▼";localStorage.setItem("bpsChatCollapsedV15",collapsed?"1":"0");if(!collapsed){chatUnread=0;updateChatUnread();setTimeout(()=>$("#chatInput")?.focus(),50)}
}
function updateChatUnread(){const e=$("#chatUnread");if(!e)return;e.textContent=String(chatUnread);e.classList.toggle("hidden",chatUnread<=0)}
function resetChat(roomCode=null){chatRoomCode=roomCode;chatSeenIds=new Set();chatUnread=0;if($("#chatMessages"))$("#chatMessages").innerHTML="";updateChatUnread()}
function appendChatMessage(msg,{fromSnapshot=false}={}){
  if(!msg?.id||chatSeenIds.has(msg.id))return;chatSeenIds.add(msg.id);
  const wrap=$("#chatMessages");if(!wrap)return;const row=document.createElement("div"),meta=PLAYER_META[Math.max(1,Math.min(4,Number(msg.seat)||1))];row.className=`chat-message pcolor-${Number(msg.seat)||1}`;
  const head=document.createElement("div"),badge=document.createElement("span"),name=document.createElement("b"),time=document.createElement("small"),body=document.createElement("p");badge.className="chat-seat";badge.textContent=meta?.label||`P${msg.seat||1}`;name.textContent=msg.name||"ผู้เล่น";time.textContent=new Date(msg.at||Date.now()).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"});head.append(badge,name,time);body.textContent=msg.text||"";row.append(head,body);wrap.appendChild(row);while(wrap.children.length>60)wrap.firstChild.remove();wrap.scrollTop=wrap.scrollHeight;
  const collapsed=$("#chatDock")?.classList.contains("collapsed");if(!fromSnapshot&&collapsed&&msg.playerId!==myId()){chatUnread++;updateChatUnread()}
}
function syncChatFromState(s){
  if(chatRoomCode!==s?.code)resetChat(s?.code||null);(s?.chat||[]).forEach(msg=>appendChatMessage(msg,{fromSnapshot:true}));
}
function applyIncomingState(s){
  const prev=state,previousPhase=prev?.phase||null,id=myId();
  const moved=[];
  if(prev?.phase==="game"&&s?.phase==="game"){
    (s.players||[]).forEach(p=>{const old=prev.players?.find(x=>x.id===p.id);if(old&&old.pos!=null&&p.pos!=null&&old.pos!==p.pos)moved.push(p)});
  }
  const prevTurnId=prev?.phase==="game"?prev.players?.[prev.game?.turn||0]?.id:null;
  const nextTurnId=s?.phase==="game"?s.players?.[s.game?.turn||0]?.id:null;
  const prevTurnSeq=Number(prev?.game?.stats?.turns)||0,nextTurnSeq=Number(s?.game?.stats?.turns)||0;
  const turnChanged=!!prevTurnId&&!!nextTurnId&&(prevTurnId!==nextTurnId||prevTurnSeq!==nextTurnSeq);
  const enteringGame=(previousPhase==="lobby"||previousPhase==="ghostSelect")&&s.phase==="game";
  const resumingGame=!prev&&s.phase==="game";
  if(turnChanged||enteringGame||resumingGame){turnTransitionActive=true;stopTurnTimer();ritualRollSelection=null;hideRollFocus();}
  state=s;persistSession();syncChatFromState(s);render();
  if(moved.length)setTimeout(()=>moved.forEach((p,i)=>setTimeout(()=>showMoveFx(p,p.pos),i*180)),60);
  if(turnChanged){const ap=s.players?.[s.game?.turn||0];queueTurnHandoff(ap,ap?.id===id,90)}
  if(enteringGame){hideGhostSelectionOverlay();if(previousPhase==="lobby")setTimeout(openSetupReveal,420);else{const ap=s.players?.[s.game?.turn||0];queueTurnHandoff(ap,ap?.id===id,520)}}
  else if(resumingGame){const ap=s.players?.[s.game?.turn||0];queueTurnHandoff(ap,ap?.id===id,180)}
}
function flushDiceQueues(kind=null){
  diceAnimating=false;const s=queuedState,p=queuedPrivateState,h=[...queuedHpEvents];queuedState=null;queuedPrivateState=null;queuedHpEvents=[];if(s)applyIncomingState(s);if(p){mine=p;persistSession();render()}const fire=()=>h.forEach(e=>queueHpFx(e.delta,e.reason||"HP เปลี่ยน"));if(kind==="ritual"&&h.length)setTimeout(fire,1900);else fire();
}
migrateLegacyRoom();

$("#createForm").addEventListener("submit",e=>{e.preventDefault();socket.emit("createRoom",{name:$("#createName").value,sessionToken})});
$("#joinForm").addEventListener("submit",e=>{e.preventDefault();socket.emit("joinRoom",{name:$("#joinName").value,code:$("#joinCode").value,sessionToken})});
$("#startBtn").onclick=()=>socket.emit("startGame");
$("#copyCodeBtn").onclick=async()=>{try{await navigator.clipboard.writeText(state.code);toast(`Copy ${state.code} แล้ว`)}catch{toast(`Room Code: ${state.code}`)}};
$("#randomCharBtn").onclick=()=>runCharacterRandom();
$("#confirmCharBtn").onclick=()=>socket.emit("confirmCharacter");
$("#releaseCharBtn").onclick=()=>socket.emit("releaseCharacter");
$("#readyBtn").onclick=()=>{const me=state?.players?.find(p=>p.id===myId());socket.emit("setReady",{ready:!me?.ready});};
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
$("#ambientTrack").onchange=e=>setAmbientTrack(e.target.value);
$("#chatToggle").onclick=()=>setChatCollapsed(!$("#chatDock").classList.contains("collapsed"));
$("#chatForm").addEventListener("submit",e=>{e.preventDefault();const input=$("#chatInput"),text=input.value.trim();if(!text||!state?.code)return;socket.emit("chatMessage",{text});input.value="";input.focus()});
$("#stayBtn").onclick=()=>socket.emit("stayInRoom");
$("#escapeBtn").onclick=()=>socket.emit("escapeRoom");
$("#rollBtn").onclick=()=>socket.emit("roll");
$("#rollFocusBtn").onclick=()=>{
  if(rollRequestPending||!state?.game||!isMyTurn())return;const mode=$("#rollFocus")?.dataset.mode;rollRequestPending=true;hideRollFocus();ensureAudio();
  if(mode==="ritual"&&ritualRollSelection){const pick=ritualRollSelection;ritualRollSelection=null;socket.emit("ritual",{uid:pick.uid});return}
  if(mode==="escape"){socket.emit("escapeRoom");return}
  socket.emit("roll");
};
$("#rollFocusCancel").onclick=()=>{ritualRollSelection=null;rollRequestPending=false;updateRollFocus()};
$("#finishSanityBtn").onclick=()=>socket.emit("finishSanityDecision");
$("#drawAmu").onclick=()=>socket.emit("drawAmulet");
$("#drawSac").onclick=()=>socket.emit("drawSacrifice");
$("#skillBtn").onclick=()=>{
  const t=mine?.char?.skillType;if(!t)return;
  if(t==="self_revive"){socket.emit("skill",{});return;}
  if(t==="draw_five_stop_event"||t==="heal_all_living"){socket.emit("skill",{});return;}
  if(t==="move_to_friend_hp2"){
    const box=document.createElement("div");box.innerHTML=`<p class="muted">เลือกเพื่อน 1 คน • ย้ายไปหาทันที และตัวเอง HP -2</p>`;
    state.players.filter(x=>x.id!==myId()&&!x.dead).forEach(x=>{const b=document.createElement("button");b.className="modal-option";b.innerHTML=`<b>${x.name} · ${x.char?.name||""}</b><span>${roomAt(x.pos)?.name||""}</span>`;b.onclick=()=>{socket.emit("skill",{targetId:x.id});closeModal()};box.appendChild(b)});openModal("Skill — เด็กเนิร์ด",box);return;
  }
  if(t==="remote_ritual_hp3"){
    const g=state.game,eligible=(mine.sac||[]).filter(c=>(g.ghost?.need?.[c.color]||0)>(g.bossDone?.[c.color]||0));if(!eligible.length){toast("ไม่มีเครื่องเซ่นสีที่ผีต้องการ");return;}
    const box=document.createElement("div");box.innerHTML=`<p class="muted">เลือกเครื่องเซ่นเพื่อท้าดวลผีจากห้องไหนก็ได้ • ใช้ธูป 3 • หลัง Resolve HP -3</p>`;eligible.forEach(c=>{const b=document.createElement("button");b.className=`modal-option ${c.color}`;b.innerHTML=`<b>${c.name}</b><span>${c.group||c.color} · ตีผี ${c.boss}</span>`;b.onclick=()=>{socket.emit("skill",{uid:c.uid});closeModal()};box.appendChild(b)});openModal("Skill — หมอผีดำ",box);return;
  }
  if(t==="free_any_trap_curse"){
    const targets=state.players.filter(x=>!x.dead&&["คำสาป","กับดัก"].includes(roomAt(x.pos)?.type));if(!targets.length){toast("ยังไม่มีใครติดห้องคำสาป/กับดัก");return;}const box=document.createElement("div");box.innerHTML=`<p class="muted">เลือกตัวเองหรือเพื่อนที่ติดคำสาป/กับดัก • ปลดฟรีทั่วกระดาน</p>`;targets.forEach(x=>{const b=document.createElement("button");b.className="modal-option";b.innerHTML=`<b>${x.id===myId()?"ตัวเอง · ":""}${x.name}</b><span>${roomAt(x.pos)?.name||""}</span>`;b.onclick=()=>{socket.emit("skill",{targetId:x.id});closeModal()};box.appendChild(b)});openModal("Skill — หมอธรรม",box);return;
  }
  if(t==="peek_four_choose_two"){
    const box=document.createElement("div");box.innerHTML=`<p class="muted">เลือกว่าจะดู Amulet บนสุดหรือล่างสุด 4 ใบ แล้วค่อยเลือกเก็บ 2 ใบ</p>`;for(const [side,label] of [["top","ดูบนสุด 4 ใบ"],["bottom","ดูล่างสุด 4 ใบ"]]){const b=document.createElement("button");b.className="modal-option";b.textContent=label;b.onclick=()=>{socket.emit("skill",{side});closeModal()};box.appendChild(b)}openModal("Skill — หมาวัด",box);return;
  }
  if(t==="remote_help"){
    const cards=(mine.amu||[]).filter(c=>c.category==="ช่วยเหลือ");if(!cards.length){toast("ไม่มีการ์ดช่วยเหลือบนมือ");return;}const box=document.createElement("div");box.innerHTML=`<p class="muted">เลือกเพื่อน แล้วเลือกการ์ดช่วยเหลือ 1 ใบ • ใช้ได้แม้อยู่คนละห้อง</p>`;const sel=document.createElement("select");sel.className="skill-target-select";state.players.filter(x=>x.id!==myId()).forEach(x=>{const o=document.createElement("option");o.value=x.id;o.textContent=`${x.name} · ${x.dead?"เสียชีวิต":roomAt(x.pos)?.name||""}`;sel.appendChild(o)});box.appendChild(sel);cards.forEach(c=>{const b=document.createElement("button");b.className="modal-option";b.innerHTML=`${artMarkup(c.art,"option-art",c.name)}<b>${c.name}</b><span>${c.desc||""}</span>`;b.onclick=()=>{socket.emit("skill",{targetId:sel.value,uid:c.uid});closeModal()};box.appendChild(b)});openModal("Skill — แมวจร",box);return;
  }
};
$("#homeHelpBtn").onclick=openHowToPlay;
$("#lobbyHelpBtn").onclick=openHowToPlay;
$("#helpBtn").onclick=openHowToPlay;
$("#roomRulesBtn").onclick=openRoomRules;
$("#bossHelpBtn").onclick=openBossHelp;
$("#endBtn").onclick=()=>socket.emit("endTurn");
$("#closeModal").onclick=()=>{if(state?.game?.pendingRoomEffect?.playerId===myId()){toast("ต้องเลือก/Resolve ให้เสร็จก่อน");return;}if(state?.game?.pendingRitual?.playerId===myId()){toast("ต้องยืนยันผลพิธีก่อนค่ะ");return;}closeModal()};

socket.on("errorMessage",msg=>{rollRequestPending=false;toast(msg);setTimeout(updateRollFocus,40)});
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
  resetLocalRoom();resetChat(null);state=null;mine=null;leavingRoom=false;closeModal();show("home");if($("#createName"))$("#createName").value=oldName;toast("ออกจากห้องแล้ว");
  if(createAfterLeave){createAfterLeave=false;setTimeout(()=>socket.emit("createRoom",{name:oldName,sessionToken}),80);}
});

socket.on("state",s=>{
  if(diceAnimating&&state?.phase==="game"&&s?.phase==="game"){queuedState=s;return;}
  applyIncomingState(s);
});
socket.on("privateState",p=>{if(diceAnimating&&state?.phase==="game"){queuedPrivateState=p;return;}const oldPreview=mine?.characterPreviewKey||null;mine=p;persistSession();render();if(state?.phase==="lobby"&&p?.characterPreviewKey&&p.characterPreviewKey!==oldPreview)setTimeout(()=>showCharacterPreviewReveal(p.characterPreviewKey),120);});
socket.on("chatMessage",msg=>appendChatMessage(msg));
socket.on("ghostRandomStarted",()=>{if(state?.phase==="ghostSelect")setTimeout(runGhostCycleAnimation,80)});
socket.on("ghostReveal",e=>{if(e?.ghost)revealFinalGhost(e.ghost)});
socket.on("gameStartCountdown",e=>runGameStartCountdown(e));
socket.on("hpFx",e=>{if(diceAnimating){queuedHpEvents.push(e);return}const fire=()=>queueHpFx(e.delta,e.reason||"HP เปลี่ยน");if(/สวนกลับ|ดูดเลือด/.test(e.reason||""))setTimeout(fire,2600);else fire()});
socket.on("cardReveal",enqueueCardReveal);
socket.on("diceFx",e=>{rollRequestPending=false;showDiceFx(e)});
socket.on("ritualFx",showRitualFx);
socket.on("spellFx",e=>toast(`${e.playerName} ใช้ ${e.name} • ${e.success?"สำเร็จ":"ไม่สำเร็จ"} (${e.dice?.total??"?"} / ${e.condition||"?"})`));


let ghostRandomAnimating=false,ghostCycleTimers=[];
function clearGhostCycleTimers(){ghostCycleTimers.forEach(clearTimeout);ghostCycleTimers=[]}
function ghostSymbol(c){return({green:"◆",blue:"■",pink:"⬟",black:"⬢"})[c]||"•"}
function ghostNeedText(g){return Object.entries(g?.need||{}).filter(([,n])=>n>0).map(([c,n])=>`${ghostSymbol(c)} ${n}`).join("  ")}
function ensureGhostSelectionOverlay(){let box=$("#ghostSelectOverlay");if(box)return box;box=document.createElement("div");box.id="ghostSelectOverlay";box.className="ghost-select-overlay hidden";box.innerHTML=`<div class="ghost-select-shell"><div class="ghost-select-eyebrow">THE HAUNTING BEGINS</div><h1>คืนนี้จะเจอผีตัวไหน?</h1><p class="ghost-select-note">ผีมีทั้งหมด 9 ใบ • สุ่มครั้งเดียวและล็อกทันที</p><div id="ghostSelectGrid" class="ghost-select-grid"></div><div class="ghost-select-footer"><p id="ghostSelectStatus">รอ Host กดสุ่มผี</p><button id="ghostRandomBtn" class="primary ghost-random-button">👻 สุ่มผี</button></div><div id="ghostFinalReveal" class="ghost-final-reveal hidden"></div></div>`;document.body.appendChild(box);box.querySelector("#ghostRandomBtn").onclick=()=>{if(!ghostRandomAnimating){ensureAudio();socket.emit("randomGhost")}};return box}
function hideGhostSelectionOverlay(){const b=$("#ghostSelectOverlay");if(b)b.classList.add("hidden");clearGhostCycleTimers();clearGhostStartCountdown();ghostRandomAnimating=false}
function renderGhostSelection(){if(state?.phase!=="ghostSelect")return;const o=ensureGhostSelectionOverlay();o.classList.remove("hidden");const grid=o.querySelector("#ghostSelectGrid"),btn=o.querySelector("#ghostRandomBtn"),status=o.querySelector("#ghostSelectStatus"),selected=state.ghostSelection?.selectedId,locked=state.ghostSelection?.locked;grid.innerHTML="";(state.ghosts||[]).forEach(g=>{const c=document.createElement("div");c.className=`ghost-pick-card ${selected===g.id?"ghost-selected":""}`;c.dataset.ghostId=g.id;c.innerHTML=`<div class="ghost-pick-art">${artMarkup(g.art,"ghost-art-img",g.name)||"<span>GHOST ART</span>"}</div><div class="ghost-pick-copy"><small>${g.tier||"GHOST"}</small><b>${g.name}</b><em>${g.archetype||""}</em><div class="ghost-pick-need">${ghostNeedText(g)}</div></div>`;grid.appendChild(c)});btn.style.display=isHost()?"inline-flex":"none";btn.disabled=!!locked||ghostRandomAnimating;btn.textContent=locked?"👻 สุ่มแล้ว":ghostRandomAnimating?"👻 กำลังสุ่ม...":"👻 สุ่มผี";status.textContent=locked?`ล็อกแล้ว: ${(state.ghosts||[]).find(g=>g.id===selected)?.name||"ผี"}`:isHost()?"กดสุ่มได้ครั้งเดียว • ไม่มี Reroll":"รอ Host กดสุ่มผี"}
function runGhostCycleAnimation(){const o=ensureGhostSelectionOverlay(),cards=[...o.querySelectorAll(".ghost-pick-card")];if(!cards.length)return;clearGhostCycleTimers();ghostRandomAnimating=true;const delays=[65,65,70,75,80,90,105,120,145,175,215,270],status=o.querySelector("#ghostSelectStatus");if(status)status.textContent="กำลังเรียกวิญญาณ...";let t=0;delays.forEach((d,i)=>{t+=d;ghostCycleTimers.push(setTimeout(()=>{cards.forEach(x=>x.classList.remove("ghost-cycle-active"));cards[i%cards.length].classList.add("ghost-cycle-active");try{tone(150+(i%9)*20,.055,.014,"triangle",0,sfxMaster)}catch{}},t))})}
function revealFinalGhost(g){clearGhostCycleTimers();ghostRandomAnimating=false;const o=ensureGhostSelectionOverlay(),r=o.querySelector("#ghostFinalReveal");o.querySelectorAll(".ghost-pick-card").forEach(c=>{c.classList.remove("ghost-cycle-active");c.classList.toggle("ghost-selected",c.dataset.ghostId===g.id)});r.innerHTML=`<div class="ghost-final-card v182-ghost-showcase"><div class="ghost-final-art">${artMarkup(g.art,"ghost-art-img",g.name)||"GHOST ART"}</div><div class="ghost-final-showcase-copy"><div class="ghost-final-kicker">คืนนี้เจอ</div><h2>${g.name}</h2><span>${g.tier||""} · ${g.archetype||""}</span></div></div>`;r.classList.remove("hidden");void r.offsetWidth;r.classList.add("ghost-reveal-pop");try{tone(82,.55,.035,"sawtooth",0,sfxMaster);tone(196,.5,.024,"sine",.25,sfxMaster)}catch{}}
let ghostStartCountdownTimer=null,ghostStartCountdownLast=null;
function clearGhostStartCountdown(){
  if(ghostStartCountdownTimer){clearInterval(ghostStartCountdownTimer);ghostStartCountdownTimer=null}
  ghostStartCountdownLast=null;
  const c=$("#ghostStartCountdown");if(c)c.remove();
}
function runGameStartCountdown(e={}){
  clearGhostStartCountdown();
  const o=ensureGhostSelectionOverlay();o.classList.remove("hidden");
  const reveal=o.querySelector("#ghostFinalReveal");if(reveal)reveal.classList.add("hidden");
  const c=document.createElement("div");c.id="ghostStartCountdown";c.className="ghost-start-countdown";
  c.innerHTML=`<div class="ghost-countdown-inner"><div class="ghost-countdown-kicker">GET READY</div><b id="ghostCountdownNumber" class="ghost-countdown-number">5</b><div id="ghostCountdownLabel" class="ghost-countdown-label">เกมจะเริ่มใน</div><span class="ghost-countdown-sub">ทุกคนเตรียมตัว • เทิร์นจะเริ่มหลังนับถอยหลัง</span></div>`;
  o.appendChild(c);
  const startAt=Number(e.startAt)||Date.now()+5000,num=c.querySelector("#ghostCountdownNumber"),label=c.querySelector("#ghostCountdownLabel");
  const tick=()=>{
    const ms=startAt-Date.now(),left=Math.max(0,Math.ceil(ms/1000));
    const shown=left>0?String(left):"เกมเริ่ม!";
    if(shown!==ghostStartCountdownLast){
      ghostStartCountdownLast=shown;num.textContent=shown;num.classList.remove("pulse");void num.offsetWidth;num.classList.add("pulse");
      if(left>0){label.textContent="เกมจะเริ่มใน";try{tone(240+left*28,.11,.026,"triangle",0,sfxMaster)}catch{}}
      else{label.textContent="ลุย!";try{tone(392,.18,.034,"triangle",0,sfxMaster);tone(523.25,.24,.028,"sine",.08,sfxMaster)}catch{}}
    }
  };
  tick();ghostStartCountdownTimer=setInterval(tick,120);
}

function render(){
  if(!state)return;
  if(state.phase==="lobby"){hideGhostSelectionOverlay();show("lobby");renderLobby();return}
  if(state.phase==="ghostSelect"){show("lobby");renderLobby();renderGhostSelection();return}
  if(state.phase==="result"||state.phase==="defeat"){hideGhostSelectionOverlay();show("result");renderResult();return}
  hideGhostSelectionOverlay();show("game");renderGame();
}
let charRandomAnimating=false;
function playCharacterRevealSound(){try{ensureAudio();if(sfxMaster){tone(392,.14,.024,"triangle",0,sfxMaster);tone(523.25,.18,.026,"sine",.12,sfxMaster);tone(783.99,.28,.020,"sine",.25,sfxMaster)}}catch{}}
function characterByKey(key){return (state?.characters||[]).find(c=>c.key===key)||null}
function showCharacterPreviewReveal(key){
  if(!key||state?.phase!=="lobby")return;const c=characterByKey(key);if(!c)return;
  const box=document.createElement("div");box.className="char-reveal-stage";box.innerHTML=`<div class="char-reveal-glow"></div><div class="char-reveal-card"><div class="char-reveal-kicker">CHARACTER PREVIEW</div><div class="char-reveal-art">${artMarkup(c.art,"character-art-img",c.name)||"CHARACTER ART"}</div><h2>${c.name}</h2><span>${c.role}</span><div class="char-reveal-stats"><b>♥ ${c.hp}</b><b>Equip ${c.slots}</b></div><p>${c.skill}</p><small>ยังไม่ล็อกตัวละคร • สามารถสุ่มใหม่หรือเลือกใบอื่นได้</small></div>`;
  const ok=document.createElement("button");ok.className="primary char-reveal-close";ok.textContent="ดูตัวละครนี้";ok.onclick=()=>closeModal();box.appendChild(ok);playCharacterRevealSound();openModal("สุ่มได้ตัวละคร",box);
}
function runCharacterRandom(){
  if(charRandomAnimating||state?.phase!=="lobby")return;const me=state.players.find(p=>p.id===myId());if(!me)return;
  if(me.ready){toast("กด Unready ก่อนเปลี่ยนตัวละคร");return}if(me.characterConfirmed){toast("กด “เปลี่ยนตัวละคร” ก่อนสุ่มใหม่");return}
  const claimed=new Set(state.players.filter(p=>p.id!==myId()&&p.characterConfirmed&&p.characterKey).map(p=>p.characterKey));const eligible=(state.characters||[]).filter(c=>!claimed.has(c.key));if(!eligible.length){toast("ไม่มีตัวละครว่างแล้ว");return}
  charRandomAnimating=true;renderLobby();const keys=eligible.map(c=>c.key),delays=[65,65,65,65,70,70,75,75,85,95,110,125,145,170,210,260];let step=0;
  const flash=()=>{document.querySelectorAll(".char-pick").forEach(el=>el.classList.remove("random-flash"));const key=keys[step%keys.length],t=document.querySelector(`.char-pick[data-char-key="${key}"]`);if(t)t.classList.add("random-flash");if(step<delays.length-1){const d=delays[step];step++;setTimeout(flash,d)}else setTimeout(()=>{document.querySelectorAll(".char-pick").forEach(el=>el.classList.remove("random-flash"));charRandomAnimating=false;socket.emit("selectCharacter",{key:"random"})},300)};flash();
}
function renderLobby(){
  $("#roomCode").textContent=state.code;$("#lobbyPlayers").innerHTML="";
  state.players.forEach(p=>{const chosen=state.characters?.find(c=>c.key===p.characterKey),seat=playerSeat(p),meta=playerMeta(p),d=document.createElement("div");d.className=`lobby-player pcolor-${seat} ${p.ready?"is-ready":""}`;let status="กำลังเลือกตัวละคร";if(p.characterConfirmed&&chosen)status=`${chosen.name} · ${p.ready?"✓ Ready":"ยืนยันแล้ว"}`;d.innerHTML=`<span><i class="lobby-seat">${meta.label}</i>${p.id===state.hostId?"👑 ":""}${p.name}${p.connected?"":" <em>Offline</em>"}</span><small>${p.id===myId()?`${meta.name} · คุณ · `:""}${status}</small>`;$("#lobbyPlayers").appendChild(d)});
  const me=state.players.find(p=>p.id===myId()),previewKey=mine?.characterPreviewKey||null,taken=new Set(state.players.filter(p=>p.id!==myId()&&p.characterConfirmed&&p.characterKey).map(p=>p.characterKey));$("#characterGrid").innerHTML="";
  (state.characters||[]).forEach(c=>{const isPreview=previewKey===c.key,isConfirmed=me?.characterConfirmed&&me?.characterKey===c.key,isTaken=taken.has(c.key),b=document.createElement("button");b.dataset.charKey=c.key;b.className="char-pick "+(isPreview?"selected preview ":"")+(isConfirmed?"confirmed ":"")+(isTaken?"taken ":"");b.disabled=isTaken||!!me?.ready||!!me?.characterConfirmed||charRandomAnimating;b.innerHTML=`${isTaken?'<span class="char-taken-label">ถูกเลือกแล้ว</span>':""}${isConfirmed?'<span class="char-confirmed-label">✓ ยืนยันแล้ว</span>':""}<div class="mini-character-card char-theme-${c.key}"><div class="mini-char-head"><span class="incense-badge">🕯3</span><div><b>${c.name}</b><small>${c.role}</small></div><span class="hp-badge">♥ ${c.hp}</span></div><div class="char-pick-art">${artMarkup(c.art,"character-art-img",c.name)||`<span>${c.name}</span><small>CHARACTER ART</small>`}</div><div class="mini-char-foot"><b>ใช้ธูป 3 ดอก</b><p>${c.skill.replace(/^ใช้ธูป 3 ดอก:\s*/,"")}</p><small>Equip ${c.slots} ช่อง</small></div></div>`;b.onclick=()=>{if(!charRandomAnimating)socket.emit("selectCharacter",{key:c.key})};$("#characterGrid").appendChild(b)});
  const preview=characterByKey(previewKey),confirmed=characterByKey(me?.characterKey);if(me?.ready&&confirmed)$("#charSelectionStatus").innerHTML=`🔒 <b>${confirmed.name}</b> พร้อมแล้ว`;else if(me?.characterConfirmed&&confirmed)$("#charSelectionStatus").innerHTML=`✓ ยืนยัน <b>${confirmed.name}</b> แล้ว · กด Ready เมื่อพร้อม`;else if(preview)$("#charSelectionStatus").innerHTML=`กำลังดู <b>${preview.name}</b> · สุ่มใหม่ได้จนกว่าจะยืนยัน`;else $("#charSelectionStatus").textContent="เลือกเองหรือกดสุ่มตัวละครได้";
  $("#randomCharBtn").disabled=!!me?.ready||!!me?.characterConfirmed||charRandomAnimating;$("#randomCharBtn").textContent=charRandomAnimating?"🎲 กำลังสุ่ม...":"🎲 สุ่มตัวละคร";$("#confirmCharBtn").disabled=!previewKey||!!me?.characterConfirmed||!!me?.ready||charRandomAnimating;$("#releaseCharBtn").disabled=(!previewKey&&!me?.characterConfirmed)||!!me?.ready||charRandomAnimating;$("#readyBtn").disabled=(!me?.characterConfirmed&&!me?.ready)||charRandomAnimating;$("#readyBtn").classList.toggle("ready-active",!!me?.ready);$("#readyBtn").textContent=me?.ready?"✓ Ready แล้ว · กดเพื่อ Unready":"Ready";
  const allReady=state.players.length>0&&state.players.every(p=>p.connected&&p.characterConfirmed&&p.characterKey&&p.ready);$("#startBtn").style.display=isHost()?"inline-block":"none";$("#startBtn").disabled=isHost()?!allReady:true;const pending=state.players.filter(p=>!p.connected||!p.characterConfirmed||!p.characterKey||!p.ready);$("#hostNote").textContent=isHost()?(allReady?"ทุกคนพร้อมแล้ว ✦ Host เริ่มเกมได้":`รอ: ${pending.map(p=>p.name).join(", ")} ยืนยันตัวละคร + Ready ให้ครบ`):(me?.ready?"พร้อมแล้ว · รอ Host เริ่มเกม":"เลือกตัวละคร → ยืนยัน → Ready");
  const st=state.settings||{};$("#settingForced").value=String(st.forcedMovement!==false);$("#settingSacDraw").value=st.sacrificeDraw||"onePerTurn";$("#settingFailedSac").value=st.failedSacrifice||"bottom";$("#settingBreak").value=st.equipmentBreak||"one";["#settingForced","#settingSacDraw","#settingFailedSac","#settingBreak"].forEach(id=>$(id).disabled=!isHost());$("#playtestSettings").classList.toggle("read-only",!isHost());$("#settingsSummary").textContent=settingsText(st);
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
  const ok=document.createElement("button");ok.className="primary setup-enter";ok.textContent="เข้าไปในบ้าน";ok.onclick=()=>{closeModal();const ap=activePlayer();queueTurnHandoff(ap,ap?.id===myId(),90)};box.appendChild(ok);
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
  return {project:"บ้านผีสิง",build:"V1.8.2",room:state?.code||null,ghost:state?.game?.ghost?.name||state?.result?.ghost||null,
    players:(state?.players||[]).map(p=>({name:p.name,character:p.char?.name||null,money:p.score,hp:p.hp,dead:p.dead})),
    settings:state?.settings||null,result:state?.result||null,stats:currentStats(),log:state?.log||[],exportedAt:new Date().toISOString()};
}
function downloadReport(){
  const blob=new Blob([JSON.stringify(reportPayload(),null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=`baan-phi-sing-playtest-${state?.code||"room"}.json`;
  document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
}
let diceTimer=null,ritualTimer=null,diceAnimTimer=null,cardRevealBusy=false;
const cardRevealQueue=[];
function enqueueCardReveal(e){
  cardRevealQueue.push(e);
  if(!cardRevealBusy)showNextCardReveal();
}
function showNextCardReveal(){
  const e=cardRevealQueue.shift();
  if(!e){cardRevealBusy=false;return}
  cardRevealBusy=true;
  const box=$("#cardRevealFx"),card=$("#cardRevealCard"),c=e.card||{};
  card.className="card-reveal-card";
  card.classList.add(e.zone==="sacrifice"?`reveal-${c.color||"green"}`:"reveal-amulet");
  $("#cardRevealZone").textContent=e.zone==="sacrifice"?"SACRIFICE DRAW":(e.reason==="play"?"AMULET USED":"AMULET DRAW");
  $("#cardRevealName").textContent=c.name||"การ์ด";
  const meta=e.zone==="sacrifice"
    ? `${c.color||""}${c.boss!=null?` • ตีผี +${c.boss}`:""}${c.end!=null?` • จบเกม ${c.end>=0?"+":""}${c.end}`:""}`
    : `${c.category||c.type||"Amulet"}${c.condition?` • ${c.condition}`:""}${(c.desc||c.effect)?` • ${c.desc||c.effect}`:""}`;
  $("#cardRevealMeta").textContent=meta;
  $("#cardRevealPlayer").textContent=`${e.playerName||"ผู้เล่น"} จั่วได้`;
  box.classList.remove("hidden","card-pop");void box.offsetWidth;box.classList.add("card-pop");playCardFlipSound();
  setTimeout(()=>{
    box.classList.add("card-out");
    setTimeout(()=>{box.classList.add("hidden");box.classList.remove("card-out");cardRevealBusy=false;showNextCardReveal()},280);
  },1750);
}
function showDiceFx(e){
  rollRequestPending=false;ritualRollSelection=null;hideRollFocus();diceAnimating=true;queuedState=null;queuedPrivateState=null;queuedHpEvents=[];
  const box=$("#diceFx"),aEl=$("#dieA"),bEl=$("#dieB"),total=$("#diceFxTotal");
  $("#diceFxPlayer").textContent=e.playerName||"";
  $("#diceFxKind").textContent=e.kind==="ritual"?"ทอยทำพิธี":e.kind==="escape"?"ทอยหนีห้อง":"ทอยเดิน";
  box.classList.remove("hidden","pop","dice-result");box.classList.add("dice-rolling");
  clearTimeout(diceTimer);clearInterval(diceAnimTimer);
  const start=performance.now(),rollMs=2100;
  playDiceRollSound(rollMs);
  diceAnimTimer=setInterval(()=>{
    aEl.textContent=1+Math.floor(Math.random()*6);
    bEl.textContent=1+Math.floor(Math.random()*6);
    total.textContent="กำลังทอย…";
  },85);
  setTimeout(()=>{
    clearInterval(diceAnimTimer);
    aEl.textContent=e.a;bEl.textContent=e.b;total.textContent=`รวม ${e.total}`;
    box.classList.remove("dice-rolling");box.classList.add("dice-result");
    playDiceTick(.075);setTimeout(()=>playDiceTick(.055),100);
    flushDiceQueues(e.kind);
    diceTimer=setTimeout(()=>box.classList.add("hidden"),1600);
  },rollMs);
}
function showRitualFx(e){
  clearTimeout(ritualTimer);
  const box=$("#ritualFx"),card=$("#ritualFxCard");
  card.className="ritual-fx-card";
  $("#ritualFxTitle").textContent="กำลังเทียบผลพิธี…";
  $("#ritualFxDice").textContent=`🎲 เต๋าดิบ ${e.dice.a} + ${e.dice.b} = ${e.dice.total}`;
  $("#ritualFxText").textContent=`${e.cardName} • เงื่อนไขผี ${e.ruleLabel||"?"}`;
  box.classList.remove("hidden","ritual-pop");void box.offsetWidth;box.classList.add("ritual-pop");
  setTimeout(()=>{$("#ritualFxDice").textContent=`🎲 ${e.dice.total} ${e.modifier?`${e.modifier>0?"+":""}${e.modifier}`:"+ 0"} = ${e.finalTotal}`;$("#ritualFxText").textContent=`ผลสุดท้าย ${e.finalTotal} • ต้อง ${e.ruleLabel||"ตามการ์ดผี"}`;},850);
  setTimeout(()=>{$("#ritualFxTitle").textContent=e.success?"พิธีสำเร็จ ✦":"ผีสวนกลับ";card.classList.toggle("success",!!e.success);card.classList.toggle("fail",!e.success);$("#ritualFxText").textContent=e.success?`${e.playerName} ชนะเงื่อนไข ${e.ruleLabel} • เงิน +${e.score}`:`${e.playerName} ไม่ผ่าน ${e.ruleLabel} • ${e.counterText||"รับผลสวนกลับตามการ์ดผี"}`;},1850);
  ritualTimer=setTimeout(()=>box.classList.add("hidden"),3900);
}
function hideRollFocus(){
  const box=$("#rollFocus");if(!box)return;box.classList.add("hidden");box.classList.remove("ritual-armed");
}
function armRitualRoll(card,rule){
  ritualRollSelection={uid:card.uid,name:card.name,color:card.color,ruleLabel:rule?.label||"ตามการ์ดผี"};rollRequestPending=false;updateRollFocus();
}
function updateRollFocus(){
  const box=$("#rollFocus"),btn=$("#rollFocusBtn"),hint=$("#rollFocusHint"),kick=$("#rollFocusKicker"),cancel=$("#rollFocusCancel");
  if(!box||!state||state.phase!=="game"||!mine||!isMyTurn()||turnTransitionActive||diceAnimating||rollRequestPending||!$("#modal").classList.contains("hidden")){hideRollFocus();return}
  const g=state.game,mp=mePublic();
  if(mp?.dead||g.pendingRoomEffect||g.pendingRitual||g.sanityDecision||g.mustMove||g.moveOptional){hideRollFocus();return}
  let mode=null;
  if(ritualRollSelection){
    const room=mp?.pos!=null?roomAt(mp.pos):null;
    if(!g.moved||g.actions<2||!room?.boss){ritualRollSelection=null;hideRollFocus();return}
    mode="ritual";kick.textContent="RITUAL ROLL";btn.textContent=`🎲 ทอยทำพิธี`;hint.textContent=`${ritualRollSelection.name} • ต้อง ${ritualRollSelection.ruleLabel}`;cancel.classList.remove("hidden");box.classList.add("ritual-armed");
  }else if(g.escapeRequired&&g.actions>0){
    mode="escape";kick.textContent="ESCAPE ROLL";btn.textContent="🎲 ทอยหนีห้อง · 1🕯";hint.textContent=g.escapeRule?.label||"ทอยตามเงื่อนไขห้อง";cancel.classList.add("hidden");box.classList.remove("ritual-armed");
  }else if(!g.rolled){
    mode="move";kick.textContent="YOUR ROLL";btn.textContent="🎲 ทอยเพื่อเดิน";hint.textContent="ทอย 2 ลูก แล้วค่อยคำนวณ Fear / สติ";cancel.classList.add("hidden");box.classList.remove("ritual-armed");
  }
  if(!mode){hideRollFocus();return}
  box.dataset.mode=mode;btn.disabled=false;box.classList.remove("hidden");
}
let lastPendingRitualId=null;
function renderGame(){
  const ap=activePlayer(), mp=mePublic(), g=state.game;
  $("#turnPlayer").textContent=ap?`${ap.name} · ${ap.char?.name||""}`:"—";
  $("#hp").textContent=mine?.char?`${mine.hp}/${mine.char.hp}`:"—";
  $("#actions").textContent=`${g.actions}/3`;
  $("#score").textContent=mine?.score??0;
  $("#sanity").textContent=g.sanity??"—";
  $("#curse").textContent=`${g.curse}/6`;

  $("#playerList").innerHTML="";
  state.players.forEach(p=>{const seat=playerSeat(p),meta=playerMeta(p),d=document.createElement("div");d.className=`player-row pcolor-${seat} `+(p.isTurn?"turn ":"")+(p.dead?"dead ":"")+(p.connected?"":"offline");d.innerHTML=`<b><span class="player-color-dot"></span>${meta.label} · ${p.dead?"☠️ ":""}${p.name} · ${p.char?.name||"—"}${p.connected?"":" · Offline"}${p.isTurn?'<span class="turn-timer-ring"><i></i></span>':""}</b><small>❤️ ${p.hp}/${p.char?.hp} · 💰 ${p.score} · ${p.pos!==null?roomAt(p.pos).name:"—"} · มือ ${p.amuCount+p.sacCount} ใบ${p.dead?" · รอชุบชีวิต":""}</small>`;$("#playerList").appendChild(d)});
  paintTurnTimer();

  $("#log").innerHTML="";
  state.log.forEach(x=>{const d=document.createElement("div");d.textContent="• "+x.text;$("#log").appendChild(d)});
  $("#log").scrollTop=$("#log").scrollHeight;

  $("#board").innerHTML="";
  for(let i=0;i<9;i++){
    const r=roomAt(i),b=document.createElement("button");
    const style=r.boss?"boss":(r.type==="คำสาป"?"curse":(r.type==="กับดัก"?"trap":(r.type==="ปลอดภัย"||r.type==="ธรรมดา"?"safe":"mystery")));
    b.className=`room room-${style} ${r.boss?"boss":""}`;
    b.dataset.roomIndex=String(i);
    if(!g.sanityDecision&&(g.mustMove||g.moveOptional))b.classList.add(g.legal.includes(i)?"legal":"illegal");
    const pawns=state.players.map(p=>p.pos===i?`<span class="pawn pcolor-${playerSeat(p)} ${p.dead?"pawn-dead":""}">P${playerSeat(p)}</span>`:"").join("");
    b.innerHTML=`<div class="room-top"><div><b>${r.boss?"👻 ":""}${r.name}</b><small>${r.type}</small></div><span class="fear-badge">${r.fear}</span></div><div class="room-art">${artMarkup(r.art,"room-art-img",r.name)|| (r.boss?"BOSS":"ROOM")}</div><div class="room-bottom">${r.effectText?`<span>${r.effectText.split("•")[0]}</span>`:"<span>คลิกเพื่อดู Effect</span>"}<div class="pawns">${pawns}</div></div>`;
    b.onclick=()=>{
      if(isMyTurn()&&(g.mustMove||g.moveOptional)&&g.legal.includes(i)) socket.emit("move",{index:i});
      else openRoomInfo(r,i);
    };
    $("#board").appendChild(b);
  }
  if(!isMyTurn())$("#message").textContent=`รอ ${ap?.name||"ผู้เล่น"} เล่นเทิร์น`;
  else if(mp?.dead&&mine?.char?.skillType==="self_revive")$("#message").textContent="พ่อไกรล้มอยู่ — เทิร์นนี้ใช้ Skill 3🕯 เพื่อฟื้น HP +3 ได้";
  else if(mp?.dead)$("#message").textContent="คุณเสียชีวิต — รอเพื่อนมาชุบชีวิต";
  else if(g.pendingRoomEffect && g.pendingRoomEffect.playerId===myId())$("#message").textContent=g.pendingRoomEffect.type==="negativeReaction"?"⚠️ มีผลลบกำลังเกิด — การ์ดคาถาป้องกันถูก Highlight ให้เลือกใช้":"ต้อง Resolve Effect ก่อนทำ Action ต่อ";
  else if(g.pendingRitual)$("#message").textContent=g.pendingRitual.playerId===myId()?"กำลังทำพิธี — เลือก Modifier แล้วค่อยดูผล":"กำลังรอผู้เล่น Resolve พิธี";
  else if(g.escapeRequired)$("#message").textContent=`ติดอยู่ในห้องพิเศษ — ใช้ 1 ธูปทอยหนี (${g.escapeRule?.label||"ตามเงื่อนไขห้อง"})`;
  else if(!g.rolled)$("#message").textContent="ถึงเทิร์นคุณ — ทอยเต๋า 2 ลูก หรือเลือกใช้สกิลที่ใช้แทนการเดิน";
  else if(g.sanityDecision)$("#message").textContent=`เต๋า ${g.lastDice?.total??"?"} • Fear ${g.moveFear??"?"} → สติ ${g.sanity} • การ์ดค่าสติบนมือกำลัง Highlight — ใช้เพิ่มหรือกดเดินต่อ`;
  else if(g.mustMove)$("#message").textContent=`สติ ${g.sanity} — ต้องเลือกห้องข้างเคียงที่เข้าได้`;
  else if(g.moveOptional)$("#message").textContent=`สติ ${g.sanity} — เลือกเดินไปห้องกรอบเขียว หรืออยู่ห้องเดิม`;
  else $("#message").textContent=`ใช้ธูปได้ ${g.actions} ดอก — จั่ว / สวมใส่ / Trade / ทำพิธี / Skill`;

  const ghost=g.ghost||{};
  $("#ghostName").textContent=ghost.name||"—";
  $("#ghostFear").textContent=`Fear ${ghost.fear??6}`;
  $("#ghostPassive").textContent=ghost.passiveText||"";
  $("#ghostArt").innerHTML=artMarkup(ghost.art,"ghost-art-img",ghost.name)||`${ghost.tier||""}<br>${ghost.name||"GHOST"}`;
  $("#bossSlots").innerHTML="";
  const symbols={green:"◆",blue:"■",pink:"⬟",black:"⬢"};
  Object.entries(ghost.need||{}).forEach(([c,n])=>{for(let i=0;i<n;i++){const s=document.createElement("span");s.className=`slot slot-${c} `+(i<(g.bossDone[c]||0)?"done":"");s.textContent=symbols[c]||"◆";$("#bossSlots").appendChild(s)}});
  $("#ghostRules").innerHTML="";
  Object.entries(ghost.dice||{}).forEach(([c,rule])=>{
    const d=document.createElement("div");
    d.innerHTML=`<b>${symbols[c]||"◆"} ${rule.label||""}</b><small>${c==="green"?"เขียว":c==="blue"?"ฟ้า":c==="pink"?"ชมพู":"ดำ"}</small><p>${ghost.counterText?.[c]||""}</p>`;
    $("#ghostRules").appendChild(d)
  });

  if($("#amuDeckCount"))$("#amuDeckCount").textContent=`จั่ว ${g.amuDeckCount??g.deckCounts?.amuletDraw??0} • ทิ้ง ${g.amuDiscardCount??g.deckCounts?.amuletDiscard??0}`;
  if($("#sacDeckCount"))$("#sacDeckCount").textContent=`เหลือ ${g.sacDeckCount??g.deckCounts?.sacrificeDraw??0} ใบ`;
  renderPrivate();

  const pendingMine=!!(g.pendingRoomEffect && g.pendingRoomEffect.playerId===myId());
  const ritualLocked=!!g.pendingRitual;
  const deadSelfRevive=isMyTurn()&&mp?.dead&&mine?.char?.skillType==="self_revive";
  const canAct=isMyTurn()&&(!mp?.dead||deadSelfRevive)&&!pendingMine&&!ritualLocked&&!turnTransitionActive&&!diceAnimating;
  $("#finishSanityBtn").style.display=(isMyTurn()&&g.sanityDecision)?"inline-block":"none";
  $("#finishSanityBtn").disabled=!isMyTurn()||!g.sanityDecision;
  $("#stayBtn").style.display=g.moveOptional?"inline-block":"none";
  $("#stayBtn").disabled=!canAct||!g.moveOptional;
  $("#escapeBtn").style.display=g.escapeRequired?"inline-block":"none";
  $("#escapeBtn").disabled=!canAct||!g.escapeRequired||g.actions<1;
  $("#rollBtn").disabled=!canAct||g.escapeRequired||g.rolled;
  $("#drawAmu").disabled=!canAct||!g.moved||g.actions<1;
  const myRoom=mp?.pos!=null?roomAt(mp.pos):null;
  const sacLimited=(state.settings?.sacrificeDraw||"onePerTurn")==="onePerTurn";
  $("#drawSac").disabled=!canAct||!g.moved||g.actions<1||(sacLimited&&g.sacDrawn)||!myRoom?.sac||(mine?.sac?.length||0)>=7;
  const skillType=mine?.char?.skillType;
  const preMoveSkill=["move_to_friend_hp2"].includes(skillType);
  const afterMoveSkill=["draw_five_stop_event","heal_all_living","peek_four_choose_two","remote_help"].includes(skillType);
  let skillDisabled=!canAct||g.actions<3||!skillType;
  if(skillType==="self_revive") skillDisabled=skillDisabled||!mp?.dead;
  else if(preMoveSkill) skillDisabled=skillDisabled||g.rolled||g.moved||g.escapeRequired;
  else if(afterMoveSkill) skillDisabled=skillDisabled||!g.moved;
  $("#skillBtn").disabled=skillDisabled;
  $("#ritualBtn").disabled=!canAct||!g.moved||g.actions<2||!myRoom?.boss||!(mine?.sac||[]).some(c=>(g.ghost?.need?.[c.color]||0)>(g.bossDone[c.color]||0));
  $("#tradeBtn").disabled=!canAct||!g.moved||g.traded||!!state.trade||!state.players.some(p=>p.id!==myId()&&p.pos===mp?.pos&&!p.dead);
  $("#endBtn").disabled=!canAct||g.sanityDecision||g.mustMove||g.moveOptional||(g.escapeRequired&&g.actions>0);
  renderTurnGuide({ap,mp,g,myRoom,pendingMine,canAct});

  if(!tutorialShown && mine && !localStorage.getItem("bpsSeenTutorialV10")){
    tutorialShown=true;localStorage.setItem("bpsSeenTutorialV10","1");
    setTimeout(openHowToPlay,350);
  }

  if(state.trade)renderTradeNotice();
  if(g.pendingRoomEffect && g.pendingRoomEffect.playerId===myId()) renderPendingRoomEffect(g.pendingRoomEffect);
  if(g.pendingRitual) renderPendingRitual(g.pendingRitual);
  updateRollFocus();
}
function renderPrivate(){
  if(!mine)return;
  $("#charName").textContent=mine.char?.name||"—";$("#charRole").textContent=mine.char?.role||"—";$("#charSkill").textContent=mine.char?.skill||"";if($("#charArt"))$("#charArt").innerHTML=artMarkup(mine.char?.art,"character-art-img",mine.char?.name)||"CHARACTER ART";
  const mp=mePublic(),seat=playerSeat(mp||mine),meta=PLAYER_META[seat]||PLAYER_META[1];
  $("#myRoom").textContent=mp?.pos!=null?roomAt(mp.pos).name:"—";$("#limits").textContent=`${mine.sac.length}/7`;$("#amuletCount").textContent=`${mine.amu.length}/5`;$("#myPawnColor").textContent=meta.label;$("#myPawnColor").className=`my-pawn-color pcolor-${seat}`;$("#myPawnLabel").textContent=`${meta.name} · ตัวเดินของคุณ`;
  const eq=equipmentStatsLocal();
  $("#equipStats").innerHTML=`<span>⚔️ ปรับเต๋าพิธี ±${eq.attack}</span><span>🛡️ กันผี ${eq.defense}</span><span>👁 Fear ${eq.fear>0?"+":""}${eq.fear}</span>${eq.lifeSteal?`<span>❤ ดูดเลือด +${eq.lifeSteal}</span>`:""}`;
  $("#equip").innerHTML="";
  for(let i=0;i<Math.min(2,mine.char?.slots||0);i++){
    const c=mine.equip[i],b=document.createElement("button");b.className="equip";b.textContent=c?c.name:`Equip ${i+1}`;b.disabled=!c;if(c)b.onclick=()=>openAmuletCard(c,{equipped:true});$("#equip").appendChild(b)
  }
  $("#amuHand").innerHTML="";
  const cards=mine.amu||[],n=cards.length;
  cards.forEach((c,i)=>{
    const b=document.createElement("button"),offset=i-(n-1)/2;
    const react=state?.game?.pendingRoomEffect?.type==="negativeReaction"&&state.game.pendingRoomEffect.playerId===myId()&&state.game.pendingRoomEffect.options?.some(o=>o.uid===c.uid);
    b.className=`game-card amulet-card amu-type-${c.type} ${state?.game?.sanityDecision&&c.type==="sanity"&&isMyTurn()?"sanity-ready":""} ${react?"negative-ready":""}`;
    b.style.setProperty("--fan-x",`${offset*62}px`);b.style.setProperty("--fan-rot",`${offset*6.5}deg`);b.style.setProperty("--fan-y",`${Math.abs(offset)*5}px`);b.style.zIndex=String(20+i);
    const sanityTxt=c.type==="sanity"?(c.sanityChoices||[]).map(v=>`${v>0?"+":""}${v}`).join(" / "):"";b.innerHTML=`<b>${c.name||c.category||"Amulet"}</b><small>${c.category||amuletTypeLabel(c)}</small><div class="art amulet-art">${artMarkup(c.art,"amulet-art-img",c.name)||(sanityTxt||"✦")}</div><small>${c.desc||c.effect||"แตะเพื่ออ่าน"}</small>`;
    b.onclick=()=>openAmuletCard(c);$("#amuHand").appendChild(b)
  });
  $("#sacHand").innerHTML="";
  mine.sac.forEach(c=>{const b=document.createElement("button");b.className=`game-card ${c.color}`;b.innerHTML=`<b>${c.name}</b><small>${c.group||c.color}</small><div class="art sacrifice-art">${artMarkup(c.art,"sacrifice-art-img",c.name)}</div><small>ตีผี ${c.boss} · จบเกม ${c.end>=0?"+":""}${c.end}</small>`;b.onclick=()=>openModal(c.name,`ตีผี ${c.boss} • ตอนจบ ${c.end>=0?"+":""}${c.end}`);$("#sacHand").appendChild(b)});
}
function equipmentStatsLocal(){
  return (mine?.equip||[]).reduce((a,c)=>{a.attack+=Number(c.attackMod)||0;a.defense+=c.wardOnce?1:(Number(c.defense)||0);a.fear+=Number(c.fear)||0;a.lifeSteal+=Number(c.lifeSteal)||0;return a},{attack:0,defense:0,fear:0,lifeSteal:0});
}
function amuletTypeLabel(c){
  if(c.category)return c.category;const map={equip:"สวมใส่",spell:"คาถาอาคม",event:"เหตุการณ์",heal_self:"ช่วยเหลือ",heal_room:"ช่วยเหลือ",heal_range:"ช่วยเหลือ",revive:"ช่วยเหลือ",sanity:"เรียกสติ"};return map[c.type]||"Amulet";
}
function canUseAmulet(c,{equipped=false}={}){
  const g=state?.game,mp=mePublic();if(!g||!isMyTurn()||turnTransitionActive||diceAnimating)return false;
  if(mp?.dead)return mine?.char?.skillType==="self_revive"?false:false;
  if(equipped)return g.moved&&g.actions>=1&&(mine?.amu?.length||0)<5;
  if(c.type==="sanity")return !!g.sanityDecision&&g.actions>=1;
  if(c.type==="equip")return g.moved&&g.actions>=1&&(mine?.equip?.length||0)<Math.min(2,mine?.char?.slots||0);
  if(["heal_self","heal_room","heal_range","revive"].includes(c.type))return g.moved&&g.actions>=1;
  if(c.type==="spell"){
    if(["protect_all","protect_ghost"].includes(c.spellEffect))return false;
    return g.actions>=1&&!g.pendingRitual;
  }
  return false;
}
function openAmuletCard(c,{equipped=false}={}){
  const box=document.createElement("div");box.className=`amulet-detail amu-detail-${c.type}`;
  const stats=[];if(c.attackMod)stats.push(`⚔️ ปรับผลพิธี ±${c.attackMod}`);if(c.wardOnce)stats.push(`🛡️ กันผี 1 ครั้งแล้วทิ้ง`);if(c.fear)stats.push(`👁 Fear ${c.fear}`);
  if(c.type==="sanity"&&c.sanityChoices?.length)stats.push(`🧠 ${c.sanityChoices.map(v=>`${v>0?"+":""}${v}`).join(" หรือ ")}`);
  const cond=conditionLabel(c);
  box.innerHTML=`<div class="amulet-detail-card"><small>${amuletTypeLabel(c)} · ${c.id||""}</small><h2>${c.name||amuletTypeLabel(c)}</h2><div class="amulet-detail-art">${artMarkup(c.art,"amulet-detail-img",c.name)||"✦"}</div>${cond?`<div class="amulet-rule"><b>เงื่อนไข</b><p>ทอย ${cond}</p></div>`:""}<div class="amulet-rule"><b>Effect</b><p>${c.desc||c.effect||"อ่านตามข้อความบนการ์ด"}</p></div>${stats.length?`<div class="amulet-stats">${stats.map(x=>`<span>${x}</span>`).join("")}</div>`:""}</div>`;
  if(canUseAmulet(c,{equipped})){
    if(c.type==="sanity"&&!equipped){
      const row=document.createElement("div");row.className="sanity-choice-row";(c.sanityChoices||[]).forEach(delta=>{const b=document.createElement("button");b.className="primary";b.textContent=`ใช้ ${delta>0?"+":""}${delta} สติ · 1🕯`;b.onclick=()=>{socket.emit("useSanity",{uid:c.uid,delta});closeModal()};row.appendChild(b)});box.appendChild(row);
    }else{
      const use=document.createElement("button");use.className="primary card-use-confirm";
      use.textContent=equipped?"ถอดการ์ด · 1🕯":c.type==="equip"?"สวมใส่ · 1🕯":c.type==="spell"?"ใช้คาถา · 1🕯":c.type==="revive"?"เลือกเพื่อนที่จะชุบ · 1🕯":"ใช้การ์ด · 1🕯";
      use.onclick=()=>{
        if(equipped)socket.emit("unequip",{uid:c.uid});
        else if(c.type==="equip")socket.emit("equip",{uid:c.uid});
        else if(["heal_self","heal_room","heal_range"].includes(c.type))socket.emit("useHeal",{uid:c.uid});
        else if(c.type==="revive"){closeModal();openRevive(c);return;}
        else if(c.type==="spell")socket.emit("castSpell",{uid:c.uid});
        closeModal();
      };box.appendChild(use);
    }
  }
  openModal(c.name||amuletTypeLabel(c),box);
}
function openCharacterCard(){
  if(!mine?.char)return;const c=mine.char,eq=equipmentStatsLocal(),box=document.createElement("div");box.className="character-detail";
  box.innerHTML=`<div class="character-detail-card"><small>CHARACTER · ${PLAYER_META[playerSeat(mePublic()||mine)]?.label||""}</small><h2>${c.name}</h2><p>${c.role||""}</p><div class="character-detail-art">${artMarkup(c.art,"character-art-img",c.name)||"CHARACTER ART"}</div><div class="amulet-rule"><b>ความสามารถ</b><p>${c.skill||"ยังไม่มีข้อมูลความสามารถ"}</p></div><div class="amulet-stats"><span>❤️ HP ${mine.hp}/${c.hp}</span><span>🎒 Equip ${mine.equip.length}/${c.slots}</span><span>⚔️ ±${eq.attack}</span><span>🛡️ ${eq.defense}</span><span>👁 Fear ${eq.fear>0?"+":""}${eq.fear}</span></div></div>`;
  openModal(`ตัวละคร — ${c.name}`,box);
}
function roomTypeLabel(r){
  return r.boss?"Boss Room":r.type||"Room";
}
function openRoomInfo(r,index=null){
  const wrap=document.createElement("div");wrap.className="room-info";
  wrap.innerHTML=`<div class="room-info-card ${r.boss?"boss-info":""}">
    <div class="room-info-head"><div><b>${r.name}</b><small>${roomTypeLabel(r)}</small></div><span>Fear ${r.fear}</span></div>
    <div class="room-info-art">${artMarkup(r.art,"room-info-art-img",r.name)||(r.boss?"GHOST ROOM":"ROOM ART")}</div>
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
    <div class="howto-step"><b>1 · ทอยเดิน</b><p>ทอยเต๋า 2 ลูก → หัก Fear ของห้องปัจจุบันหลังรวมผลของสวมใส่ → ถ้ามีการ์ดค่าสติจะได้เลือกใช้ก่อนเปิดห้องที่เดินได้</p></div>
    <div class="howto-step"><b>2 · ${forced?"ต้องย้ายห้อง":"เลือกย้ายหรืออยู่เดิม"}</b><p>ห้องข้างเคียงที่ Fear ≤ สติจะเป็นทางที่เข้าได้ • ${forced?"ถ้ามีทาง ระบบบังคับให้เดิน 1 ห้อง":"เลือกเดิน 1 ห้องหรือกดอยู่ห้องเดิมได้"} (บน/ล่าง/ซ้าย/ขวา)</p></div>
    <div class="howto-step"><b>3 · ใช้ธูป 3 ดอก</b><p>จั่ว Amulet 1 ดอก · สวม/ถอด 1 ดอก · ${sacRule} · ตีผี 2 ดอก · Skill 3 ดอก</p></div>
    <div class="howto-step"><b>4 · ฟาร์มแล้วต่อรอง</b><p>Amulet เก็บได้สูงสุด 5 ใบ ถ้าเกินให้เลือกทิ้งลงกองทิ้ง · เมื่อกองจั่วหมดจะสับกองทิ้งขึ้นใหม่ · เครื่องเซ่น 7 ใบ · Trade ฟรี 1 ครั้ง/เทิร์นกับคนห้องเดียวกัน</p></div>
    <div class="howto-step"><b>5 · ปราบผี</b><p>เข้าห้อง Boss ให้ได้ → เลือกเครื่องเซ่นที่ตรงสี → ทอยผ่านเกณฑ์ของสีนั้น → ปิด Symbol และรับ 💰 เงินตามค่าบนเครื่องเซ่น</p></div>
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
  if(mp?.dead&&mine?.char?.skillType==="self_revive"){set("พ่อไกรยังกลับมาได้","HP 0 แต่สกิลพ่อไกรใช้ได้ตอนตาย • กด Skill 3🕯 เพื่อฟื้น HP +3",2);return}
  if(mp?.dead){set("รอการชุบชีวิต","HP ของคุณเป็น 0 ผู้เล่นคนอื่นต้องใช้การ์ดที่ชุบชีวิตได้",0);return}
  if(pendingMine){set("Resolve Room Effect ก่อน","Effect ของห้องยังทำงานไม่เสร็จ เลือกการ์ด/ผลลัพธ์ในหน้าต่างที่เปิดอยู่",2);return}
  if(g.pendingRitual){set("กำลังเทียบผลพิธี",g.pendingRitual.playerId===myId()?`เต๋าดิบ ${g.pendingRitual.dice.total} • ของสวมใส่ปรับได้ ±${g.pendingRitual.attackMax} • เลือก Modifier แล้ว Confirm`:`รอ ${g.pendingRitual.playerName} เลือก Modifier`,2);return}
  if(g.escapeRequired){set("หนีห้องก่อน",`ใช้ปุ่ม “ทอยหนีห้อง” ครั้งละ 1 ธูป • เงื่อนไข: ${g.escapeRule?.label||"ตามการ์ดห้อง"}`,0);return}
  if(g.sanityDecision){set("จะปรับค่าสติไหม?",`สติฐาน ${g.sanityBase} • โบนัสที่ใช้แล้ว +${g.sanityBonus||0} • การ์ดเรียกสติกำลังเรืองแสง เลือกเพิ่ม/ลดตามหน้าการ์ดได้ ใบละ 1 ธูป แล้วกด “เดินต่อด้วยค่าสตินี้”`,1);return}
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
  const note=document.createElement("p");note.className="muted";note.textContent=`${card.name}: เลือกเพื่อนที่ HP = 0 • ชุบเป็น ${card.reviveHp||2} HP • ไม่จำกัดห้อง`;box.appendChild(note);
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
    b.innerHTML=`<strong>${c.icon} ${c.name}</strong><span>ต้องทอย ${rule?.label||"?"} · สำเร็จได้เงิน ${c.boss}</span><small>${ghost.counterText?.[c.color]||"พลาด → รับผลสวนกลับตามการ์ดผี"}</small>`;
    b.onclick=()=>{closeModal();armRitualRoll(c,rule)};
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
  const grid=document.createElement("div");grid.className="trade-grid";grid.innerHTML=`<label>💰 เงินที่ให้<input id="giveScore" type="number" min="0" value="0"></label><label>💰 เงินที่ขอ<input id="askScore" type="number" min="0" value="0"></label><label>ขอการ์ดกลับกี่ใบ<input id="askCards" type="number" min="0" max="2" value="0"></label>`;wrap.appendChild(grid);
  const send=document.createElement("button");send.className="primary";send.textContent="ส่ง Trade Offer";send.onclick=()=>{const uids=[...wrap.querySelectorAll('input[type="checkbox"]:checked')].slice(0,3).map(x=>x.value);socket.emit("tradeOffer",{toId:targetSel.value,giveUids:uids,giveScore:Number($("#giveScore").value),askScore:Number($("#askScore").value),askCardCount:Number($("#askCards").value)});closeModal()};wrap.appendChild(send);
  openModal("🤝 ใจแลกใจ",wrap);
};
function renderTradeNotice(){
  const t=state.trade;if(!t)return;
  if(t.toId===myId()){
    const from=state.players.find(p=>p.id===t.fromId),box=document.createElement("div");
    const p=document.createElement("p");p.textContent=`${from?.name} เสนอ Trade: ให้ ${t.giveCards.map(c=>c.name).join(", ")||"ไม่มีการ์ด"} + เงิน ${t.giveScore} • ขอเงิน ${t.askScore} และการ์ด ${t.askCardCount} ใบ`;box.appendChild(p);
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
  const note=document.createElement("p");note.className="muted";note.textContent=pending.reason||"Effect ห้อง";box.appendChild(note);

  if(pending.type==="negativeReaction"){
    const help=document.createElement("div");help.className="negative-reaction-callout";help.innerHTML=`<b>⚠️ ผลลบกำลังจะเกิด</b><p>${pending.reason||"ผลลบ"}</p><small>มีคาถาที่ใช้ได้ • ต้องเสีย 1 ธูปและทอยให้ผ่านเงื่อนไข ถ้าพลาดการ์ดพังและยังรับผลลบตามเดิม</small>`;box.appendChild(help);
    (pending.options||[]).forEach(c=>{const b=document.createElement("button");b.className="modal-option reaction-spell-option";b.innerHTML=`${artMarkup(c.art,"option-art",c.name)}<b>✨ ${c.name}</b><span>ทอย ${conditionLabel(c)||"ตามเงื่อนไข"} • ${c.effect||"ป้องกันผลลบ"} • 1🕯</span>`;b.onclick=()=>{ensureAudio();socket.emit("resolveRoomEffect",{uid:c.uid});closeModal()};box.appendChild(b)});
    const pass=document.createElement("button");pass.className="secondary";pass.textContent="ไม่ใช้คาถา — รับผลลบ";pass.onclick=()=>{socket.emit("resolveRoomEffect",{uid:"pass"});closeModal()};box.appendChild(pass);
  }

  else if(pending.type==="discardSacrifice"){
    const help=document.createElement("p");help.className="muted";help.textContent=`เลือกเครื่องเซ่น ${pending.count} ชิ้นเพื่อส่งกลับใต้กอง`;box.appendChild(help);
    (mine.sac||[]).forEach(c=>{const lab=document.createElement("label");lab.className="trade-card-check";lab.innerHTML=`<input type="checkbox" value="${c.uid}"><span>${c.name}<small style="display:block;color:#9c978c">${c.color}</small></span>`;box.appendChild(lab)});
    const ok=document.createElement("button");ok.className="primary";ok.textContent="Resolve Effect";ok.onclick=()=>{const ids=[...box.querySelectorAll('input:checked')].map(x=>x.value);if(ids.length!==pending.count){toast(`ต้องเลือก ${pending.count} ใบ`);return;}socket.emit("resolveRoomEffect",{uids:ids});closeModal()};box.appendChild(ok);
  }

  else if(pending.type==="discardAmuletOverflow"){
    const need=Math.max(1,Number(pending.count)||1);
    const help=document.createElement("p");help.className="muted";help.textContent=`มือ Amulet เกิน 5 ใบ — เลือกทิ้ง ${need} ใบลงกองทิ้ง`;box.appendChild(help);
    (mine.amu||[]).forEach(c=>{const lab=document.createElement("label");lab.className="trade-card-check overflow-choice";lab.innerHTML=`<input type="checkbox" value="${c.uid}"><span>${c.name}<small style="display:block;color:#9c978c">${c.category||c.type||"Amulet"}${c.uid===pending.newUid?" • ใบที่เพิ่งจั่ว":""}</small></span>`;box.appendChild(lab)});
    const ok=document.createElement("button");ok.className="primary";ok.textContent=`ทิ้ง ${need} ใบ`;ok.onclick=()=>{const ids=[...box.querySelectorAll('input:checked')].map(x=>x.value);if(ids.length!==need){toast(`ต้องเลือก ${need} ใบ`);return;}socket.emit("resolveRoomEffect",{uids:ids});closeModal()};box.appendChild(ok);
  }

  else if(pending.type==="officePickDiscard"){
    if(!(pending.options||[]).length){const x=document.createElement("p");x.textContent="กองทิ้งว่าง";box.appendChild(x)}
    (pending.options||[]).forEach(c=>{const b=document.createElement("button");b.className="modal-option";b.innerHTML=`${artMarkup(c.art,"option-art",c.name)}<b>${c.name}</b><small>${c.category||c.type||"Amulet"}</small><span>${c.desc||""}</span>`;b.onclick=()=>{socket.emit("resolveRoomEffect",{uid:c.uid});closeModal()};box.appendChild(b)});
  }

  else if(pending.type==="eventRollMoney"){
    const b=document.createElement("button");b.className="primary";b.textContent="🎲 ทอยเต๋า 2 ลูกให้เพื่อน";b.onclick=()=>{ensureAudio();socket.emit("resolveRoomEffect",{});closeModal()};box.appendChild(b);
  }

  else if(pending.type==="eventReviveAny"){
    (pending.options||[]).forEach(o=>{const b=document.createElement("button");b.className="modal-option";b.innerHTML=`<b>☠️ ${o.name}</b><span>${o.char||""} • ชุบเป็น HP 1</span>`;b.onclick=()=>{socket.emit("resolveRoomEffect",{uid:o.id});closeModal()};box.appendChild(b)});
  }

  else if(["spellMoveAny","spellMoveDiagonal","eventFreeCurseMove","eventMoveTwo"].includes(pending.type)){
    const help=document.createElement("p");help.className="muted";help.textContent=pending.type==="eventFreeCurseMove"?"เลือกห้องข้างเคียง 1 ช่องเพื่อออกจากห้องคำสาปทันที":"เลือกห้องปลายทาง";box.appendChild(help);
    (pending.options||[]).forEach(o=>{const b=document.createElement("button");b.className="modal-option";b.innerHTML=`<b>${o.name}</b><span>Fear ${o.fear??"-"}</span>`;b.onclick=()=>{socket.emit("resolveRoomEffect",{uid:o.index});closeModal()};box.appendChild(b)});
  }

  else if(pending.type==="skillPeekChoose"){
    const need=Math.min(2,(pending.options||[]).length);
    const help=document.createElement("p");help.className="muted";help.textContent=`การ์ด ${pending.side==="top"?"บนสุด":"ล่างสุด"} ที่เปิดมา • เลือกเก็บ ${need} ใบ แล้วใบที่เหลือกลับด้านเดิมตามลำดับ`;box.appendChild(help);
    const grid=document.createElement("div");grid.className="peek-card-grid";
    (pending.options||[]).forEach(c=>{const lab=document.createElement("label");lab.className="peek-card-choice";lab.innerHTML=`<input type="checkbox" value="${c.uid}"><div>${artMarkup(c.art,"peek-card-art",c.name)}<b>${c.name}</b><small>${c.category||c.type||"Amulet"}</small><span>${c.desc||""}</span></div>`;grid.appendChild(lab)});box.appendChild(grid);
    const ok=document.createElement("button");ok.className="primary";ok.textContent=`ยืนยันเลือก ${need} ใบ`;ok.onclick=()=>{const ids=[...grid.querySelectorAll('input:checked')].map(x=>x.value);if(ids.length!==need){toast(`ต้องเลือก ${need} ใบ`);return;}socket.emit("resolveRoomEffect",{uids:ids});closeModal()};box.appendChild(ok);
  }

  else if(pending.type==="chooseBrokenEquip"){
    const help=document.createElement("p");help.className="muted";help.textContent="เลือกอุปกรณ์ 1 ชิ้นที่หลุด/แตกจาก Event — การ์ดจะลงกองทิ้ง Amulet";box.appendChild(help);
    (mine.equip||[]).forEach(c=>{const b=document.createElement("button");b.className="modal-option";b.innerHTML=`<b>${c.name}</b><span>${c.desc||""}</span>`;b.onclick=()=>{socket.emit("resolveRoomEffect",{uid:c.uid});closeModal()};box.appendChild(b)});
  }

  else{
    const p=document.createElement("p");p.textContent="Effect นี้กำลังรอการ Resolve";box.appendChild(p);
  }

  const titles={
    negativeReaction:"ใช้คาถาป้องกันไหม?",
    discardAmuletOverflow:"Amulet Hand เต็ม",
    officePickDiscard:"ห้องทำงาน — เลือกจากกองทิ้ง",
    eventRollMoney:"เหยยย! — ฝากเพื่อนทอย",
    eventReviveAny:"ทาดา! — เลือกคนที่จะชุบ",
    eventFreeCurseMove:"เพล้ง! — หลุดจากคำสาป",
    skillPeekChoose:"หมาวัด — เลือก 2 ใบ",
    spellMoveAny:"คาถา — เลือกห้องปลายทาง",
    spellMoveDiagonal:"คาถา — เดินทะแยง"
  };
  openModal(titles[pending.type]||"Resolve Effect",box);
}

function renderPendingRitual(pending){
  if(!pending||pending.id===lastPendingRitualId)return;lastPendingRitualId=pending.id;
  const box=document.createElement("div");box.className="ritual-resolve";
  const modMax=Number(pending.attackMax)||0,rule=pending.rule||{};
  box.innerHTML=`<div class="ritual-resolve-card"><small>RITUAL CHECK</small><h2>${pending.cardName}</h2><div class="ritual-equation"><span>🎲 ${pending.dice.a}+${pending.dice.b}</span><b>= ${pending.dice.total}</b></div><p>ผีต้องการ <strong>${rule.label||"?"}</strong></p><div class="ritual-equip-readout">⚔️ ของสวมใส่ปรับผลได้ ±${modMax} · 🛡️ ป้องกัน ${pending.equipment?.defense||0}</div></div>`;
  if(pending.playerId===myId()){
    const choose=document.createElement("div");choose.className="ritual-modifier-picker";const label=document.createElement("p");label.textContent=modMax?"เลือก Modifier จากของสวมใส่ แล้วค่อยยืนยันผล":"ไม่มีโบนัสโจมตีจากของสวมใส่ — กดยืนยันเพื่อดูผล";choose.appendChild(label);
    const row=document.createElement("div");row.className="modifier-row";const options=Array.isArray(pending.modifierOptions)&&pending.modifierOptions.length?pending.modifierOptions:[0];options.forEach((m,idx)=>{const lab=document.createElement("label");lab.className="modifier-choice";lab.innerHTML=`<input type="radio" name="ritualModifier" value="${m}" ${m===0?"checked":""}><span>${m>0?"+":""}${m}</span>`;row.appendChild(lab)});choose.appendChild(row);
    const preview=document.createElement("div");preview.className="ritual-preview";preview.textContent=`ผลสุดท้าย ${pending.dice.total} • ต้อง ${rule.label||"?"}`;choose.appendChild(preview);
    row.addEventListener("change",()=>{const m=Number(row.querySelector('input:checked')?.value||0);preview.textContent=`ผลสุดท้าย ${pending.dice.total} ${m?`${m>0?"+":""}${m}`:"+ 0"} = ${pending.dice.total+m} • ต้อง ${rule.label||"?"}`});
    const ok=document.createElement("button");ok.className="primary";ok.textContent="ยืนยัน Modifier แล้วดูผล";ok.onclick=()=>{const m=Number(row.querySelector('input:checked')?.value||0);socket.emit("resolveRitual",{modifier:m});closeModal();};choose.appendChild(ok);box.appendChild(choose);
  }else{const wait=document.createElement("p");wait.className="muted";wait.textContent=`รอ ${pending.playerName} เลือก Modifier จากอุปกรณ์…`;box.appendChild(wait)}
  openModal(`ทำพิธี — ${pending.playerName}`,box);
}
function renderResult(){
  $("#results").innerHTML="";
  const defeated=state.phase==="defeat"||state.result?.defeat;
  $("#resultEyebrow").textContent=defeated?"ALL PLAYERS DOWN":"GHOST DEFEATED";
  $("#resultTitle").textContent=defeated?"บ้านนี้กลืนทุกคนไปแล้ว":"ปราบผีสำเร็จ";
  $("#resultText").textContent=defeated?"ผู้เล่นทุกคน HP เหลือ 0 — เกมจบทันที":"คะแนนจากเงิน + คะแนนเครื่องเซ่นบนมือ";
  const rows=state.result?.rows||[];
  rows.forEach(p=>{const d=document.createElement("div");d.className="result-player "+(p.winner?"winner":"");d.innerHTML=`<span>${p.winner?"🏆 ":""}${p.name} · ${p.char}</span><b>${p.total} คะแนน <small style="display:block;color:#9c978c">เงิน ${p.ritual} + เครื่องเซ่น ${p.hand}</small></b>`;$("#results").appendChild(d)});
  $("#resultStats").innerHTML="";
  $("#resultStats").appendChild(statsNode());
}

$("#characterCard").onclick=openCharacterCard;
$("#characterCard").onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openCharacterCard()}};

// Unlock Web Audio on the first real gesture. If music was enabled before, resume the selected track.
document.addEventListener("pointerdown",()=>{
  ensureAudio();
  if(ambientEnabled)startAmbient();
},{once:true,capture:true});
$("#amuletDock").classList.toggle("collapsed",localStorage.getItem("bpsAmuletCollapsedV16")==="1");
$("#amuletDockToggle").onclick=()=>{const d=$("#amuletDock");d.classList.toggle("collapsed");localStorage.setItem("bpsAmuletCollapsedV16",d.classList.contains("collapsed")?"1":"0")};
setChatCollapsed(localStorage.getItem("bpsChatCollapsedV15")!=="0");
updateAmbientUI();
