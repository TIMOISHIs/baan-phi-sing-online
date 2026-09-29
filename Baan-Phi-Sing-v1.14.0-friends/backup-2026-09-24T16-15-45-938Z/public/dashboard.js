/* Keep original control IDs and handlers; change only the in-game composition. */
(()=>{
 const q=s=>document.querySelector(s),make=(tag,cls,html='')=>{const e=document.createElement(tag);e.className=cls;e.innerHTML=html;return e};
 const hud=q('#game .hud'),table=q('#game .table'),left=q('#game .rail'),center=q('#game .board-zone'),right=q('#game .boss-column');
 hud.className='bps-header';table.className='bps-table';left.className='bps-party';center.className='bps-center';right.className='bps-spirit';
 hud.prepend(make('div','bps-brand','<b>บ้านผีสิง</b><small>v1.13.2</small>'));
 const online=make('span','bps-online');online.id='onlineCount';hud.insertBefore(online,q('#connectionState'));
 const settings=make('button','','⚙');settings.title='ตั้งค่าเสียง';settings.setAttribute('aria-label','ตั้งค่าเสียง');settings.onclick=()=>q('#settingsBtn').click();hud.insertBefore(settings,q('#gameLeaveBtn'));
 const profile=make('button','bps-profile','โปรไฟล์');profile.onclick=()=>q('#accountChip').click();hud.insertBefore(profile,settings);
 const music=make('label','bps-track','เลือกเพลงบรรยากาศ');music.append(q('#ambientTrack'));q('#soundSettings .sound-settings-actions').before(music);
 const top=q('.board-top');top.className='bps-board-heading';top.querySelector('small').textContent='คืนนี้… ไม่มีใครอยู่ลำพัง';
 const controls=q('.board-controls');controls.className='bps-move-controls';q('#escapeBtn').classList.remove('roll-legacy');
 const clock=make('div','bps-clock','<span id="matchElapsed">00:00</span><b>รอบ <span id="matchRound">1</span></b>');top.append(clock);
 const track=make('div','bps-ritual','<b>พิธีกรรม</b>');track.append(q('#bossSlots'),q('#curse').closest('.hud-stat'));
 const board=q('#board'),shell=make('div','bps-board-shell'),mapFrame=make('div','bps-map-frame'),decks=make('aside','bps-decks');board.before(track,shell);shell.append(mapFrame,decks);mapFrame.append(board);
 const piles=[...right.querySelectorAll('.deck-card')];piles[0].firstChild.textContent='✦ AMULET';piles[1].firstChild.textContent='◆ เครื่องเซ่น';decks.append(...piles);
 const discard=make('button','bps-discard','<span>▱</span><b>กองทิ้ง Amulet</b><small id="discardCount"></small>');discard.id='discardBtn';decks.append(discard);
 shell.after(controls,q('#message'));
 const ghost=q('.ghost-card');[...ghost.children].filter(n=>n.tagName==='SMALL'&&n.textContent==='พิธีที่ยังต้องทำ').forEach(n=>n.remove());
 const tabs=make('div','bps-tabs','<button id="ghostTab" role="tab" aria-selected="true" aria-controls="ghostPanel">วิญญาณ</button><button id="storyTab" role="tab" aria-selected="false" aria-controls="storyPanel">เรื่องราว</button>');tabs.setAttribute('role','tablist');right.prepend(tabs);ghost.id='ghostPanel';ghost.setAttribute('role','tabpanel');
 const story=make('article','bps-story hidden','<small>เรื่องเล่าคืนนี้</small><h2 id="storyName"></h2><p>เสียงฝีเท้าแว่วมาจากห้องที่ไม่มีใครอยู่ แสงเทียนเริ่มสั่น… คืนนี้ทุกคนต้องร่วมกันทำพิธี ก่อนที่คำสาปจะกลืนบ้านทั้งหลัง</p><small>บรรยากาศประกอบเกม · กติกาและผลคำสาปอยู่ในแท็บวิญญาณ</small>');story.id='storyPanel';story.setAttribute('role','tabpanel');ghost.after(story);
 const select=i=>{[ghost,story].forEach((e,j)=>e.classList.toggle('hidden',i!==j));[q('#ghostTab'),q('#storyTab')].forEach((e,j)=>{e.setAttribute('aria-selected',String(i===j));e.tabIndex=i===j?0:-1})};
 [q('#ghostTab'),q('#storyTab')].forEach((b,i)=>{b.onclick=()=>select(i);b.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();select(1-i);[q('#ghostTab'),q('#storyTab')][1-i].focus()}}});
 const footer=make('footer','bps-footer'),personal=q('.my-zone'),hand=q('#amuletDock'),actions=q('.actions-row');table.after(footer);footer.append(personal,hand,actions);
 personal.className='bps-personal';q('#characterCard').className='bps-character';const name=make('b','bps-my-name');name.id='personalName';q('#characterCard').prepend(name);
 q('.inventory').className='bps-inventory';const stats=make('div','bps-stats');[...hud.querySelectorAll('.hud-stat')].forEach(e=>stats.append(e));personal.append(stats);
 const dialog=(title,id)=>{const d=make('dialog','bps-dialog',`<header><h2>${title}</h2><button aria-label="ปิด">✕</button></header>`);d.id=id;document.body.append(d);d.querySelector('button').onclick=()=>d.close();return d};
 
 actions.className='bps-actions';const cluster=q('.action-cluster');cluster.className='bps-action-grid';const walk=q('#rollBtn');cluster.prepend(walk);
 const search=make('div','bps-search');q('#drawAmu').before(search);search.append(q('#drawAmu'),q('#drawSac'));
 const labels=[['rollBtn','➤','เดิน','ทอยฟรี'],['drawAmu','✦','จั่ว Amulet','1 AP'],['drawSac','◆','จั่วเครื่องเซ่น','1 AP'],['tradeBtn','⇄','แลกเปลี่ยน','1 AP'],['ritualBtn','♧','ทำพิธี','2 AP'],['skillBtn','✧','สกิลพิเศษ','3 AP']];
 labels.forEach(([id,icon,text,cost])=>{const b=q('#'+id);b.className='bps-action';b.innerHTML=`<i>${icon}</i><span>${text}</span><small>${cost}</small>`});
 q('#endBtn').parentElement.className='bps-end';q('#endBtn').className='bps-end-button';q('#endBtn').innerHTML='จบเทิร์น →';
 const ap=make('div','bps-ap','ธูปของเทิร์นนี้ <b id="actionPips"></b>');actions.prepend(ap);
 const discardDialog=dialog('กองทิ้ง Amulet','discardDialog'),gallery=make('div','bps-gallery');discardDialog.append(gallery);
 discard.onclick=()=>{gallery.replaceChildren();(state?.game?.amuletDiscard||[]).forEach(c=>{const card=make('article','');if(c.art){const img=document.createElement('img');img.src=c.art;img.alt=c.name;card.append(img)}const n=make('b',''),d=make('p','');n.textContent=c.name;d.textContent=[c.condition,c.desc||c.effect].filter(Boolean).join(' · ');card.append(n,d);gallery.append(card)});if(!gallery.children.length)gallery.textContent='ยังไม่มีการ์ดในกองทิ้ง';discardDialog.showModal()};

 // v1.13 inventory-first layout: personal card is always the local player.
 const profileCard=make('section','bps-own-profile');profileCard.id='ownProfile';profileCard.setAttribute('aria-label','โปรไฟล์ตัวละครของฉัน');profileCard.append(q('#characterCard'),q('.inventory-head'));top.firstElementChild.remove();
 const profileToggle=make('button','bps-local-profile-toggle','👤 โปรไฟล์ฉัน');profileToggle.type='button';profileToggle.setAttribute('aria-expanded','false');profileToggle.setAttribute('aria-controls','ownProfile');hud.insertBefore(profileToggle,q('.bps-profile')||settings);hud.insertBefore(profileCard,q('.bps-profile')||settings);
 const closeProfile=()=>{q('#game').classList.remove('profile-open');profileToggle.setAttribute('aria-expanded','false')};profileToggle.onclick=()=>{const open=!q('#game').classList.contains('profile-open');q('#game').classList.toggle('profile-open',open);profileToggle.setAttribute('aria-expanded',String(open))};document.addEventListener('pointerdown',e=>{if(!profileCard.contains(e.target)&&!profileToggle.contains(e.target))closeProfile()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeProfile()});
 const timer=make('b','bps-countdown','2:00');timer.id='turnCountdown';q('.turn-title').append(timer);
 const guide=q('#turnGuide');left.querySelector('.panel').after(guide);
 const oldLog=q('.log-panel'),logs=make('details','bps-log');logs.innerHTML='<summary>GAME LOG <span>เปิดดูเหตุการณ์</span></summary>';logs.append(q('#log'));oldLog.replaceWith(logs);
 const rules=make('details','bps-rules');rules.innerHTML='<summary>สัญลักษณ์และเงื่อนไขพิธีกรรม</summary>';q('#ghostRules').before(rules);rules.append(q('#ghostRules'),q('#bossHelpBtn'));
 // Move actual draw buttons onto decks; animation source .deck-card stays correct.
 [q('#drawAmu'),q('#drawSac')].forEach((b,i)=>{b.className='deck-card bps-draw-deck';b.replaceChildren(...piles[i].childNodes);const cost=make('small','','จั่ว · 1 ธูป');b.append(cost);piles[i].replaceWith(b)});search.remove();
 shell.append(actions);actions.classList.add('bps-action-rail');ap.remove();
 const boardCluster=make('div','bps-board-cluster');shell.append(boardCluster);boardCluster.append(mapFrame,decks,actions);
 const offerings=make('section','bps-offering-zone');offerings.innerHTML='<h3>กระเป๋าเครื่องเซ่น</h3>';offerings.append(q('.hand-title'),q('#sacHand'));
 const equipment=make('section','bps-equip-zone');equipment.innerHTML='<h3>กระเป๋าสวมใส่</h3>';equipment.append(q('.equip-row'));
 const status=make('section','bps-status-zone');status.innerHTML='<h3>สถานะของฉัน</h3>';status.append(stats);
 const bagToggle=make('button','bps-bag-toggle','<span>กระเป๋าและของที่ถือ</span><b aria-hidden="true">⌃</b>');bagToggle.type='button';bagToggle.setAttribute('aria-expanded','false');bagToggle.setAttribute('aria-controls','gameInventory');footer.id='gameInventory';footer.replaceChildren(bagToggle,offerings,hand,equipment,status);bagToggle.onclick=()=>{const open=!q('#game').classList.contains('bag-open');q('#game').classList.toggle('bag-open',open);bagToggle.setAttribute('aria-expanded',String(open));bagToggle.querySelector('b').textContent=open?'⌄':'⌃'};personal.remove();
 const icons={hp:['#ee7580','M12 20 3 11C-1 5 7 1 12 7C17 1 25 5 21 11Z'],actions:['#e2b45e','M6 21V8M12 21V5M18 21V8M4 23H20M6 3V1M12 2V0M18 3V1'],score:['#dfbd62','M12 2V22M17 6H9A4 4 0 0 0 9 14H15A4 4 0 0 1 15 22H6'],supportScore:['#bb96d5','M12 20 3 11C-1 5 7 1 12 7C17 1 25 5 21 11Z'],sanity:['#80b6c6','M8 20C2 20 1 12 5 10C2 4 8 1 12 5C16 1 22 4 19 10C23 12 22 20 16 20M12 5V22M6 12H10M14 16H19']};
 for(const [id,[color,d]] of Object.entries(icons)){const stat=q('#'+id).parentElement;if(stat.firstChild.nodeType===3)stat.firstChild.textContent='';const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('width','14');icon.setAttribute('height','14');icon.setAttribute('aria-hidden','true');icon.innerHTML=`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;stat.prepend(icon);}

 window.renderDashboard=()=>{if(!state?.game)return;const g=state.game;q('#personalName').textContent=`${playerMeta(mePublic()||mine).label} · ${mine?.name||''}`;profileToggle.textContent=`👤 ${playerMeta(mePublic()||mine).label} · ${mine?.name||''}`;profileToggle.title=`เปิดโปรไฟล์ตัวละคร ${mine?.name||''}`;q('#ownProfile').style.setProperty('--my-color',`var(--p${playerSeat(mePublic()||mine)})`);q('#onlineCount').textContent=`● ออนไลน์ ${state.players.filter(p=>p.connected).length}/${state.players.length}`;q('#matchRound').textContent=g.round||1;q('#storyName').textContent=g.ghost?.name||'';q('#discardCount').textContent=`${g.amuDiscardCount||0} ใบ`;q('#amuDeckCount').textContent=`${g.amuDeckCount||0} ใบ`;/* moved to local status */const unusedPips=`${g.actions}/3  ${'●'.repeat(Math.max(0,Math.min(3,g.actions)))}${'○'.repeat(Math.max(0,3-g.actions))}`;
 q('#playerList').querySelectorAll('.player-row').forEach((row,i)=>{const p=state.players[i];if(p?.char?.art){const img=document.createElement('img');img.src=p.char.art;img.alt=p.char.name;img.className='bps-party-art';row.prepend(img)}});for(let i=state.players.length;i<6;i++)q('#playerList').append(make('div','bps-empty',`P${i+1} · ที่นั่งว่าง`));q('#actions').textContent=isMyTurn()?g.actions:'—';q('#sanity').textContent=g.rescue?.playerId===myId()?g.rescue.sanity:(isMyTurn()?(g.sanity??'—'):'—');[q('#drawAmu'),q('#drawSac')].forEach(b=>b.classList.toggle('draw-ready',!b.disabled));updateElapsed()};
 function updateElapsed(){if(state?.phase!=='game')return;const s=Math.floor(Math.max(0,(serverClock.now()||0)-(state.game.startedAt||serverClock.now()||0))/1000);q('#matchElapsed').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
 setInterval(updateElapsed,1000);window.addEventListener('resize',()=>{if(state?.phase==='game')renderPrivate()});
})();
