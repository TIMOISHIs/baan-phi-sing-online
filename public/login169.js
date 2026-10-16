/* Decorative backgrounds for Login and Lobby; authentication is owned by accounts.js. */
(()=>{
 const home=document.querySelector('#home');if(!home)return;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 function addBackground(id,src,eligible){
  const video=document.createElement('video');video.id=id;
  video.autoplay=true;video.loop=true;video.muted=true;video.defaultMuted=true;video.playsInline=true;video.controls=false;video.preload='none';
  video.setAttribute('muted','');video.setAttribute('playsinline','');video.setAttribute('aria-hidden','true');video.tabIndex=-1;
  home.prepend(video);let failed=false,requested=false;
  const canPlay=()=>home.classList.contains('active')&&eligible()&&!motion.matches&&!document.hidden;
  const hide=()=>video.classList.remove('is-playing');
  video.addEventListener('error',()=>{failed=true;hide();video.pause()});
  video.addEventListener('playing',()=>{if(canPlay())video.classList.add('is-playing');else video.pause()});
  function sync(){
   if(!canPlay()||failed){video.pause();hide();return}
   if(!requested){video.src=src;requested=true}
   video.play().catch(()=>hide());
  }
  return sync;
 }
 const syncLogin=addBackground('loginBackgroundVideo','/assets/login169/background.mp4',()=>!document.body.classList.contains('has-account'));
 const syncLobby=addBackground('lobbyBackgroundVideo','/assets/lobby169/background.mp4',()=>document.body.classList.contains('has-account'));
 const sync=()=>{syncLogin();syncLobby()};
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
 new MutationObserver(sync).observe(home,{attributes:true,attributeFilter:['class']});
 motion.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);sync();
})();
