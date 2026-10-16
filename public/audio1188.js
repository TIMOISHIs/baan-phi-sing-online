/* Local audio assets. Music and UI effects use the existing independent buses. */
const RECORDED_TRACKS={darkest_child:'/assets/audio1188/darkest-child.mp3',myst_moor:'/assets/audio1188/myst-on-the-moor.mp3'};
let recordedPlayer=null,recordedSource=null,recordedGeneration=0;
function stopRecordedTrack(){
  recordedGeneration++;
  if(recordedPlayer){recordedPlayer.onerror=null;recordedPlayer.pause();recordedPlayer.removeAttribute('src');recordedPlayer.load()}
}
function startRecordedTrack(key){
  const ctx=ensureAudio();if(!ctx||!RECORDED_TRACKS[key])return;
  if(!recordedPlayer){
    recordedPlayer=new Audio();recordedPlayer.loop=true;recordedPlayer.preload='none';
    recordedSource=ctx.createMediaElementSource(recordedPlayer);recordedSource.connect(ambientMaster);
  }
  const generation=recordedGeneration;
  const failed=()=>{if(generation!==recordedGeneration||!ambientEnabled||ambientTrack!==key)return;stopAmbient();toast('โหลดเพลงไม่สำเร็จ ลองเปิดเพลงอีกครั้งได้ค่ะ')};
  recordedPlayer.onerror=failed;recordedPlayer.src=RECORDED_TRACKS[key];
  try{recordedPlayer.play().catch(failed)}catch{failed()}
}
const UI_SOUND_FILES={click:'click',confirm:'confirm',cancel:'cancel'};
const uiSoundBuffers=new Map();let uiSoundsLoading=false,lastUISoundAt=-Infinity;
function loadUISounds(){
  if(uiSoundsLoading)return;const ctx=ensureAudio();if(!ctx)return;uiSoundsLoading=true;
  // Only preload after an interaction; a failed file never blocks game input.
  for(const [key,file] of Object.entries(UI_SOUND_FILES))fetch('/assets/audio1188/'+file+'.mp3')
    .then(r=>{if(!r.ok)throw Error('audio');return r.arrayBuffer()})
    .then(bytes=>ctx.decodeAudioData(bytes)).then(buffer=>uiSoundBuffers.set(key,buffer)).catch(()=>{});
}
function playUISound(kind='click'){
  try{
    const ctx=ensureAudio();if(!ctx||!sfxMaster)return;loadUISounds();
    const now=performance.now();if(now-lastUISoundAt<55)return;lastUISoundAt=now;
    if(sfxVolume===0||masterVolume===0||ctx.state!=='running')return;
    const buffer=uiSoundBuffers.get(kind);
    if(!buffer){tone(kind==='cancel'?330:kind==='confirm'?660:490,.08,.025,'sine',0,sfxMaster);return}
    const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=buffer;gain.gain.value=.28;
    src.connect(gain).connect(sfxMaster);src.onended=()=>{src.disconnect();gain.disconnect()};src.start();
  }catch{/* Sound failure must never interfere with a button action. */}
}
document.addEventListener('pointerdown',()=>{try{loadUISounds()}catch{}},{once:true,passive:true});
document.addEventListener('click',event=>{
  // Ignore programmatic .click() calls to avoid duplicate effects from delegated actions.
  if(!event.isTrusted)return;
  const button=event.target.closest?.('button');
  if(!button||button.disabled||button.getAttribute('aria-disabled')==='true'||button.id==='settingsTestSound')return;
  const label=(button.getAttribute('aria-label')||button.textContent||'').trim();
  const kind=/close|cancel/i.test(button.id)||/^(ปิด|ยกเลิก|ไม่ใช้|กลับ)|^[×✕]$/.test(label)?'cancel':
    button.matches('.primary,.ritual-card-choice')?'confirm':'click';
  playUISound(kind);
},true);
