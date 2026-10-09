/* Shared presentation, original controls and their listeners are retained. */
(()=>{
 const q=s=>document.querySelector(s),home=q('#home'),room=q('#lobby');
 const bar=document.createElement('div');bar.className='night-topbar';bar.setAttribute('aria-label','ค่าเงินและเมนู Lobby');
 const currencies=q('#home .lobby-currencies'),quick=q('#home .rpg-quick');if(!currencies||!quick)return;
 bar.append(currencies,quick);home.append(bar);
 const roomBar=document.createElement('div');roomBar.className='night-topbar';roomBar.setAttribute('aria-label','ค่าเงินและเมนูห้อง');
 const roomMoney=document.createElement('div');roomMoney.className='lobby-currencies';roomMoney.setAttribute('aria-label','สกุลเงิน');
 const wallet=q('#roomWallet'),gold=q('#lobby .room-gold');gold.classList.add('lobby-gold');roomMoney.append(wallet,gold);
 const roomQuick=document.createElement('nav');roomQuick.className='rpg-quick';roomQuick.setAttribute('aria-label','เมนูห้อง');
 for(const original of [...quick.children].slice(0,4)){
  const button=original.cloneNode(true);button.removeAttribute('id');button.onclick=()=>original.click();roomQuick.append(button);
 }
 for(const [id,source,label] of [['roomSoundBtn','lobbySoundBtn','ตั้งค่า'],['lobbyLeaveBtn','lobbyLogoutBtn','ออกจากห้อง']]){
  const button=q('#'+id);button.innerHTML=q('#'+source).innerHTML;button.setAttribute('aria-label',label);button.dataset.tip=label;roomQuick.append(button);
 }
 roomBar.append(roomMoney,roomQuick);q('#lobby .room-header').append(roomBar);
 const v=q('.bps-brand small');if(v)v.textContent='v1.16.4';
})();
