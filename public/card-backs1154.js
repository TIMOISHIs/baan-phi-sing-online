/* Reuse the actual draw buttons and live counter nodes; no game rules changed. */
(()=>{
 for(const [id,countId,label,file] of [['drawAmu','amuDeckCount','AMULET','amulet'],['drawSac','sacDeckCount','เครื่องเซ่น','sacrifice']]){
  const button=document.getElementById(id),count=document.getElementById(countId);
  if(!button||!count||button.classList.contains('art-deck'))continue;
  const art=document.createElement('img');art.src='/assets/card-backs/'+file+'.png';art.alt='';art.draggable=false;art.className='deck-back-image';
  const title=document.createElement('span');title.className='deck-back-title';title.textContent=label;
  const footer=document.createElement('span');footer.className='deck-back-info';
  const cost=document.createElement('small');cost.textContent='จั่ว · 1 ธูป';
  footer.append(count,cost);button.replaceChildren(art,title,footer);button.classList.add('art-deck');button.setAttribute('aria-label','จั่ว '+label+' ใช้ 1 ธูป');button.title='จั่ว '+label+' · 1 ธูป';
 }
 const version=document.querySelector('.bps-brand small');if(version)version.textContent='v1.15.4';
})();
