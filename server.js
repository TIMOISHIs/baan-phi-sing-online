
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req,res)=>res.status(200).json({ok:true,build:"1.5"}));

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const ROOM_IDLE_TTL = 30 * 60 * 1000;

const DEFAULT_SETTINGS = Object.freeze({
  forcedMovement:true,
  sacrificeDraw:"onePerTurn",
  failedSacrifice:"bottom",
  equipmentBreak:"one"
});
const SETTING_OPTIONS = {
  forcedMovement:[true,false],
  sacrificeDraw:["onePerTurn","perIncense"],
  failedSacrifice:["bottom","remove"],
  equipmentBreak:["one","all"]
};
function normalizeSetting(key,value){
  const allowed=SETTING_OPTIONS[key];
  if(!allowed) return undefined;
  if(key==="forcedMovement"){
    const v=value===true||value==="true" ? true : value===false||value==="false" ? false : undefined;
    return allowed.includes(v)?v:undefined;
  }
  return allowed.includes(value)?value:undefined;
}

const CHARS = [
  { key:"khem", name:"เข้ม", role:"เข้มนักมวยเร่ร่อน", hp:10, slots:1, skillType:"force_move", skill:"ใช้ 3 ธูป: ใช้พลังกายแทนสติในตานั้น • เสีย HP ตาม Fear ของห้องปลายทาง" },
  { key:"poon", name:"พูน", role:"หมอผีสายดำ", hp:10, slots:1, skillType:"summon_boss", skill:"ใช้ 3 ธูป: ย้ายห้องพิธีกรรมมาอยู่ที่ตัว • HP -3" },
  { key:"yueang", name:"เยื้อง", role:"เสือสายย่อง", hp:10, slots:1, skillType:null, skill:"ความสามารถพิเศษยังไม่ล็อกในข้อมูล" },
  { key:"jai", name:"ใจ", role:"สาวสายอนามัย", hp:9, slots:1, skillType:"heal_all", skill:"ใช้ 3 ธูป: ฟื้น HP ทุกคน +2 • ตนเองรวมเป็น +3" },
  { key:"rueang", name:"เรือง", role:"ตำรวจหนุ่ม", hp:8, slots:2, skillType:null, skill:"ความสามารถพิเศษยังไม่ล็อกในข้อมูล" },
  { key:"det", name:"เดช", role:"หมอธรรม", hp:7, slots:2, skillType:null, skill:"ความสามารถพิเศษยังไม่ล็อกในข้อมูล" },
  { key:"kaew", name:"แก้ว", role:"เด็กผู้ลุ่มหลง", hp:6, slots:2, skillType:"move_to_friend", skill:"ใช้ 3 ธูป: เดินไปหาเพื่อน • เสีย HP -1 ต่อห้องที่ผ่าน" },
  { key:"aeng", name:"เอ๋ง", role:"หมาขี้กลัว", hp:5, slots:2, skillType:null, skill:"ดูการ์ดล่วงหน้า 4 ใบ เลือก 2 • ยังรอระบุว่าดูจากกองใด" },
  { key:"sisawat", name:"สีสวาด", role:"แมว", hp:4, slots:2, skillType:null, skill:"ฟื้นคืนชีพด้วย HP 4 เมื่อ HP = 0 • Flow การใช้กำลังออกแบบ" }
];

const ROOMS = [
  { id:"CURSE_ODD", name:"ห้องคำสาป", type:"คำสาป", fear:4, amu:true, effectId:"curse_discard", escapeRule:{kind:"bothOdd",label:"ทอยเลขคี่ทั้ง 2 ลูก"}, effectText:"ต้นเทิร์น: เสียเครื่องเซ่น 1 ชิ้น • หนีออก: ใช้ธูป 1 ดอก และทอยเลขคี่ทั้ง 2 ลูก" },
  { id:"CURSE_EVEN", name:"ห้องคำสาป", type:"คำสาป", fear:4, amu:true, effectId:"curse_discard", escapeRule:{kind:"bothEven",label:"ทอยเลขคู่ทั้ง 2 ลูก"}, effectText:"ต้นเทิร์น: เสียเครื่องเซ่น 1 ชิ้น • หนีออก: ใช้ธูป 1 ดอก และทอยเลขคู่ทั้ง 2 ลูก" },
  { id:"TRAP_LOW", name:"ห้องกับดัก", type:"กับดัก", fear:4, amu:true, effectId:"trap_hp1", escapeRule:{kind:"sumLE",value:5,label:"ทอยผลรวม 5 หรือต่ำกว่า"}, effectText:"ต้นเทิร์น: HP -1 • หนีออก: ใช้ธูป 1 ดอก และทอย 5-" },
  { id:"HALL", name:"โถงทางเดิน", type:"ปลอดภัย", fear:1, amu:true, effectId:"event_heal", effectText:"หากจั่วได้การ์ดเหตุการณ์ → HP +1 หลังเปิดการ์ด" },
  { id:"TRAP_HIGH", name:"ห้องกับดัก", type:"กับดัก", fear:4, amu:true, effectId:"trap_hp1", escapeRule:{kind:"sumGE",value:6,label:"ทอยผลรวม 6 ขึ้นไป"}, effectText:"ต้นเทิร์น: HP -1 • หนีออก: ใช้ธูป 1 ดอก และทอย 6+" },
  { id:"RITUAL_MYSTERY", name:"ห้องพิธีกรรมลึกลับ", type:"ลึกลับน่าค้นหา", fear:3, amu:true, sac:true, effectId:"ritual_mystery", effectText:"จั่วเครื่องเซ่นได้ของตำนาน(ชมพู) → จั่วเพิ่ม 2 • จั่วได้คุณไสย(ดำ) → HP -3" },
  { id:"SHRINE", name:"ห้องพระ", type:"ลึกลับน่าค้นหา", fear:3, amu:true, sac:true, effectId:"shrine_black", effectText:"จั่วเครื่องเซ่นได้คุณไสย(ดำ) → HP -2 และจั่วเพิ่ม 1" },
  { id:"BATHROOM", name:"ห้องน้ำ", type:"ปลอดภัย", fear:1, amu:true, effectId:"equip_free", effectText:"หากจั่วได้การ์ดสวมใส่ → สวมใส่ได้ทันทีโดยไม่เสียธูป หากมีช่องว่าง" },
  { id:"STORAGE", name:"ห้องเก็บของ", type:"ลึกลับน่าค้นหา", fear:3, amu:true, sac:true, effectId:"storage", effectText:"จั่วได้ ‘อาหารเซ่นผี’ → HP +1 • จั่วได้ของตำนาน(ชมพู) → ทิ้งเครื่องเซ่น 2 ชิ้น (ทริกเกอร์อาหารรอข้อมูล tag การ์ด)" },
  { id:"UNDER_STAIRS", name:"ห้องใต้บันได", type:"ลึกลับน่าค้นหา", fear:3, amu:true, sac:true, capacity:1, effectId:"under_stairs", effectText:"อยู่ได้ 1 คน • จั่วเครื่องเซ่นครั้งละ 2 ชิ้น แต่ HP -2" },
  { id:"BEDROOM", name:"ห้องนอน", type:"ลึกลับน่าค้นหา", fear:3, amu:true, sac:true, effectId:"bedroom", effectText:"จั่วได้ ‘ดอกไม้ธูปเทียน’ → จั่วเพิ่ม 1 • จั่วได้ ‘อาหารเซ่นไหว้’ → HP -1 (รอข้อมูล tag การ์ดเพื่อเปิดใช้ Trigger)" },
  { id:"OFFICE", name:"ห้องทำงาน", type:"ปลอดภัย", fear:1, amu:true, effectId:"event_pick_discard", effectText:"หากจั่วได้การ์ดเหตุการณ์ → เลือก Amulet 1 ใบจากกองทิ้งกลับขึ้นมือ" }
];

const AMULETS = [
  { id:"A0101", name:"มีดหมอ", type:"equip", fear:-1, desc:"Fear -1 เมื่อสวมใส่" },
  { id:"A0104", name:"ตะกรุดไม้", type:"equip", fear:-2, desc:"Fear -2 เมื่อสวมใส่" },
  { id:"A0112", name:"เกราะเพชร", type:"equip", fear:-2, desc:"ป้องกัน 2 HP • Fear -2" },
  { id:"A0201", name:"แคล้วคลาด", type:"spell", desc:"คาถาอาคม — ใช้ตามเงื่อนไขบนการ์ด" },
  { id:"A0302", name:"เอ๊อะ! ถือธูปจี้หลัง", type:"event", desc:"Event — แสดงผลทันที" },

  { id:"A0401", name:"น้ำมนต์ศักดิ์สิทธิ์", type:"heal_self", heal:1, desc:"HP +1" },
  { id:"A0404", name:"น้ำมนต์ศักดิ์สิทธิ์", type:"heal_self", heal:2, desc:"HP +2" },
  { id:"A0407", name:"ยาหอมราชโอสถ", type:"heal_room", heal:2, desc:"ผู้เล่นทุกคนในห้องเดียวกัน HP +2" },
  { id:"A0408", name:"ยาหอมแก้ว", type:"heal_adjacent", heal:1, desc:"ตัวเองและเพื่อนในระยะ 1 ห้อง HP +1" },
  { id:"A0410", name:"ยาฟื้นชีพโอสถ", type:"revive", reviveHp:1, range:"any", desc:"ชุบเพื่อนที่ HP = 0 ให้กลับมาที่ HP 1 • ไม่จำกัดระยะ" },
  { id:"A0411", name:"ยาหอมราชโอสถ", type:"heal_room", heal:2, desc:"ผู้เล่นทุกคนในห้องเดียวกัน HP +2" },
  { id:"A0412", name:"ยาฟื้นชีพโอสถ", type:"revive", reviveHp:1, range:"any", desc:"ชุบเพื่อนที่ HP = 0 ให้กลับมาที่ HP 1 • ไม่จำกัดระยะ" }
];

const SACRIFICES = [
  { name:"ดอกบัว", color:"green", icon:"◆", boss:2, end:1 },
  { name:"หมาก", color:"green", icon:"◆", boss:2, end:1 },
  { name:"เทียน", color:"green", icon:"◆", boss:2, end:1 },
  { name:"สายสิญจ์", color:"green", icon:"◆", boss:2, end:1 },
  { name:"เหล้าขาว", color:"blue", icon:"■", boss:3, end:2 },
  { name:"ดอกดาวเรือง", color:"blue", icon:"■", boss:3, end:2 },
  { name:"พระเครื่อง", color:"pink", icon:"⬟", boss:4, end:3 },
  { name:"ผ้า 3 สี", color:"pink", icon:"⬟", boss:4, end:3 },
  { name:"น้ำมันพราย", color:"black", icon:"⬢", boss:6, end:-3 },
  { name:"หุ่นพยนต์", color:"black", icon:"⬢", boss:6, end:-3 }
];

const GHOSTS = [
  {
    id:"ghost-prai-mon",
    name:"ผีพรายมนต์",
    tier:"III",
    fear:6,
    position:3,
    passive:{kind:"totalEquals",value:8,label:"ผลรวมเต๋าได้ 8"},
    passiveText:"พรายมนต์สะกดใจ: เมื่อผลรวมเต๋าได้ 8 → Curse +1 • ครบ 6 Curse ทุกคน HP -1 แล้วรีเซ็ต",
    need:{green:4,blue:2},
    dice:{
      green:{op:">=",value:6,label:"6+"},
      blue:{op:"<=",value:7,label:"7-"}
    },
    counterText:{
      green:"พลาด: ผู้ทำพิธี HP -1 • ผู้เล่นอื่นในห้องเดียวกัน HP -1",
      blue:"พลาด: ผู้ทำพิธี HP -2 • ถูกหลอกไปห้องกับดัก • ผู้เล่นอื่นในห้องเดิม HP -1"
    }
  },
  {
    id:"ghost-pret-to",
    name:"ผีเปรตโต",
    tier:"III",
    fear:6,
    position:3,
    passive:{kind:"dieIncludes",values:[1,6],label:"ลูกเต๋ามีหน้า 1 หรือ 6"},
    passiveText:"เสียงโหยหวนหวีดร้อง: เมื่อลูกเต๋ามีหน้า 1 หรือ 6 → Curse +1 • ครบ 6 Curse ทุกคน HP -1 แล้วรีเซ็ต",
    need:{green:3,blue:2,pink:1},
    dice:{
      green:{op:"<=",value:8,label:"8-"},
      blue:{op:">=",value:8,label:"8+"},
      pink:{op:"<=",value:5,label:"5-"}
    },
    counterText:{
      green:"พลาด: ผู้ทำพิธี HP -1 • ผู้เล่นอื่นในห้องเดียวกัน HP -1",
      blue:"พลาด: ผู้ทำพิธี HP -2 • ถูกส่งไปห้องกับดัก • ผู้เล่นอื่นในห้องเดิม HP -1",
      pink:"พลาด: ผู้ทำพิธี HP -3 • ผู้เล่นอื่นในห้องเดียวกัน HP -2 • จุด Teleport ยังรอยืนยันชื่อห้อง"
    }
  }
];

let nextCardId = 1;
const uidCard = c => ({...c, uid:`c${nextCardId++}`});
const cloneCards = (arr, times=1) => {
  const out=[];
  for(let i=0;i<times;i++) arr.forEach(c=>out.push(uidCard(c)));
  return out;
};
const shuffle = (arr) => {
  arr=[...arr];
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
};
const roll2 = () => {
  const a=1+Math.floor(Math.random()*6);
  const b=1+Math.floor(Math.random()*6);
  return {a,b,total:a+b};
};
const makeCode = () => {
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code="";
  do{
    code="";
    for(let i=0;i<5;i++) code+=alphabet[Math.floor(Math.random()*alphabet.length)];
  } while(rooms.has(code));
  return code;
};
const safeName = n => String(n||"ผู้เล่น").trim().slice(0,18) || "ผู้เล่น";
const safeChatText = t => String(t||"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,180);
const safeToken = t => {
  t=String(t||"").trim();
  return /^[A-Za-z0-9_-]{12,120}$/.test(t) ? t : randomUUID();
};
const neighbors = i => {
  const r=Math.floor(i/3), c=i%3, out=[];
  [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{
    const rr=r+dr,cc=c+dc;
    if(rr>=0&&rr<3&&cc>=0&&cc<3) out.push(rr*3+cc);
  });
  return out;
};
const playerBySocket = (room, socketId) => room.players.find(p=>p.socketId===socketId);
const active = room => room.players[room.game?.turn || 0];
const currentGhost = room => room.game?.ghost || GHOSTS[0];

function roomAt(room, i){
  if(room.game && i===room.game.bossIndex){
    const ghost=currentGhost(room);
    return { id:"BOSS", name:"เขตพิธีกรรม", type:"BOSS", fear:ghost.fear, boss:true, effectText:`ห้องของ ${ghost.name} • ใช้ทำพิธีปราบผี` };
  }
  return room.game?.rooms?.[i] || null;
}
function equipmentFear(player){
  return player.equip.reduce((n,c)=>n+(Number(c.fear)||0),0);
}
function addLog(room, text){
  room.log.push({at:Date.now(), text});
  if(room.log.length>120) room.log.shift();
}
function setHp(room,player,value,reason="HP เปลี่ยน"){
  if(!player||player.hp==null)return 0;
  const before=Number(player.hp)||0,max=Number(player.char?.hp)||Infinity;
  const after=Math.max(0,Math.min(max,Number(value)||0));
  player.hp=after;
  const delta=after-before;
  if(delta&&player.socketId)io.to(player.socketId).emit("hpFx",{delta,hp:after,maxHp:Number.isFinite(max)?max:null,reason});
  return delta;
}
function changeHp(room,player,delta,reason){return setHp(room,player,(Number(player?.hp)||0)+(Number(delta)||0),reason)}
function freshStats(settings){
  return {
    startedAt:Date.now(), endedAt:null, durationMs:null,
    settings:{...(settings||DEFAULT_SETTINGS)},
    turns:0, moveRolls:0,
    escape:{attempts:0,success:0,fail:0},
    draws:{amulet:0,sacrifice:0,byColor:{green:0,blue:0,pink:0,black:0}},
    rituals:{attempts:0,success:0,fail:0,byColor:{
      green:{attempts:0,success:0,fail:0},
      blue:{attempts:0,success:0,fail:0},
      pink:{attempts:0,success:0,fail:0},
      black:{attempts:0,success:0,fail:0}
    }},
    curse:{stacks:0,bursts:0,maxSeen:0},
    deaths:0,revives:0,
    trades:{offers:0,accepted:0,rejected:0},
    skillsUsed:0,equipmentBreaks:0,
    roomVisits:{}
  };
}
function finishStats(room){
  const st=room.game?.stats;
  if(!st) return;
  if(!st.endedAt) st.endedAt=Date.now();
  st.durationMs=Math.max(0,st.endedAt-st.startedAt);
}
function bumpRoomVisit(room,index){
  const r=roomAt(room,index),st=room.game?.stats;
  if(!r||!st) return;
  const key=r.id||r.name;
  st.roomVisits[key]=(st.roomVisits[key]||0)+1;
}
function recordDice(room,p,d,kind){
  const g=room.game;
  g.diceSeq=(g.diceSeq||0)+1;
  g.lastDiceEvent={seq:g.diceSeq,a:d.a,b:d.b,total:d.total,kind,playerId:p.id,playerName:p.name};
  io.to(room.code).emit("diceFx",g.lastDiceEvent);
}
function revealCard(room,p,card,zone,reason="draw"){
  if(!room?.game||!card)return;
  const g=room.game;
  g.cardSeq=(g.cardSeq||0)+1;
  io.to(room.code).emit("cardReveal",{
    seq:g.cardSeq,
    zone,
    reason,
    playerId:p?.id||null,
    playerName:p?.name||"ผู้เล่น",
    card:{
      uid:card.uid||null,
      name:card.name||"การ์ด",
      type:card.type||null,
      color:card.color||null,
      desc:card.desc||null,
      boss:card.boss??null,
      end:card.end??null
    }
  });
}
function publicSnapshot(room){
  const g=room.game;
  return {
    code:room.code,
    phase:room.phase,
    hostId:room.hostId,
    settings:{...room.settings},
    characters:CHARS.map(c=>({key:c.key,name:c.name,role:c.role,hp:c.hp,slots:c.slots,skill:c.skill,skillType:c.skillType})),
    players:room.players.map((p,i)=>({
      id:p.id,
      name:p.name,
      seat:p.seat || i+1,
      characterKey:p.characterKey || null,
      connected:!!p.socketId,
      char:p.char || null,
      hp:p.hp ?? null,
      score:p.score || 0,
      pos:p.pos ?? null,
      dead:(p.hp??1)<=0,
      amuCount:p.amu?.length || 0,
      sacCount:p.sac?.length || 0,
      equip:p.equip?.map(c=>({uid:c.uid,name:c.name,type:c.type,desc:c.desc})) || [],
      isTurn:g ? i===g.turn : false
    })),
    game:g ? {
      turn:g.turn,
      bossIndex:g.bossIndex,
      rooms:g.rooms,
      actions:g.actions,
      sanity:g.sanity,
      lastDice:g.lastDice,
      rolled:g.rolled,
      moved:g.moved,
      mustMove:g.mustMove,
      legal:g.legal,
      sacDrawn:g.sacDrawn,
      traded:g.traded,
      escapeRequired:g.escapeRequired,
      moveOptional:!!g.moveOptional,
      escapeRule:g.escapeRule || null,
      escapeAttempts:g.escapeAttempts || 0,
      curse:g.curse,
      bossDone:g.bossDone,
      ghost:g.ghost,
      pendingRoomEffect:g.pendingRoomEffect || null,
      amuDiscardCount:g.amuDiscard?.length || 0,
      diceSeq:g.diceSeq||0,
      lastDiceEvent:g.lastDiceEvent||null,
      stats:g.stats||null
    } : null,
    log:room.log.slice(-50),
    chat:(room.chat||[]).slice(-50),
    result:room.result || null,
    trade:room.trade ? {
      id:room.trade.id,
      fromId:room.trade.fromId,
      toId:room.trade.toId,
      giveScore:room.trade.giveScore,
      askScore:room.trade.askScore,
      askCardCount:room.trade.askCardCount,
      giveCards:room.trade.giveCards.map(c=>({uid:c.uid,name:c.name,zone:c.zone,color:c.color||null,type:c.type||null}))
    } : null
  };
}
function privateSnapshot(room, socketId){
  const p=playerBySocket(room,socketId);
  if(!p) return null;
  return {
    id:p.id,
    name:p.name,
    seat:p.seat || 1,
    sessionToken:p.token,
    amu:p.amu || [],
    sac:p.sac || [],
    equip:p.equip || [],
    score:p.score || 0,
    hp:p.hp ?? null,
    char:p.char || null
  };
}
function emitRoom(room){
  room.updatedAt=Date.now();
  io.to(room.code).emit("state", publicSnapshot(room));
  room.players.forEach(p=>{
    if(p.socketId) io.to(p.socketId).emit("privateState", privateSnapshot(room,p.socketId));
  });
}
function fail(socket,msg){ socket.emit("errorMessage", msg); }

function applyCurse(room,dice){
  const ghost=currentGhost(room);
  const rule=ghost.passive||{};
  let trigger=false;
  if(rule.kind==="totalEquals") trigger=dice.total===rule.value;
  if(rule.kind==="dieIncludes") trigger=(rule.values||[]).includes(dice.a)||(rule.values||[]).includes(dice.b);
  if(!trigger) return;
  room.game.curse++;
  if(room.game.stats){
    room.game.stats.curse.stacks++;
    room.game.stats.curse.maxSeen=Math.max(room.game.stats.curse.maxSeen,room.game.curse);
  }
  addLog(room,`${ghost.name} Passive (${rule.label}) → Curse +1`);
  if(room.game.curse>=6){
    if(room.game.stats) room.game.stats.curse.bursts++;
    room.players.forEach(p=>changeHp(room,p,-1,`Curse ครบ 6 → HP -1`));
    room.game.curse=0;
    addLog(room,`Curse ครบ 6 → ผู้เล่นทุกคน HP -1 • Curse รีเซ็ต 0`);
  }
}

function markNewDeaths(room){
  room.players.forEach(p=>{
    if(p.hp<=0 && !p.deadAnnounced){
      p.hp=0;
      p.deadAnnounced=true;
      if(room.game?.stats) room.game.stats.deaths++;
      addLog(room,`${p.name} HP เหลือ 0 → เสียชีวิตและรอการชุบ`);
    }
  });
}
function checkDefeat(room){
  if(room.phase!=="game") return false;
  if(room.players.length && room.players.every(p=>p.hp<=0)){
    room.phase="defeat";
    finishStats(room);
    room.result={
      defeat:true,
      rows:room.players.map(p=>({
        id:p.id,name:p.name,char:p.char?.name||"",ritual:p.score||0,
        hand:(p.sac||[]).reduce((n,c)=>n+(Number(c.end)||0),0),
        total:(p.score||0)+(p.sac||[]).reduce((n,c)=>n+(Number(c.end)||0),0),
        winner:false
      }))
    };
    addLog(room,"ผู้เล่นทุกคนเสียชีวิต → จบเกมแบบพ่ายแพ้");
    return true;
  }
  return false;
}
function nextAliveIndex(room, fromIndex){
  const n=room.players.length;
  for(let step=1;step<=n;step++){
    const idx=(fromIndex+step)%n;
    if(room.players[idx].hp>0) return idx;
  }
  return null;
}
function advanceToNextAlive(room){
  if(checkDefeat(room)) return;
  const next=nextAliveIndex(room,room.game.turn);
  if(next===null){ checkDefeat(room); return; }
  room.game.turn=next;
  beginTurn(room);
}
function resolveDeathsAfterAction(room, activePlayerId){
  markNewDeaths(room);
  if(checkDefeat(room)) return true;
  const ap=active(room);
  if(ap && ap.id===activePlayerId && ap.hp<=0){
    advanceToNextAlive(room);
    return true;
  }
  return false;
}
function revivePlayer(room,target,hp=1,source="การ์ดชุบชีวิต"){
  setHp(room,target,Math.max(1,Math.min(target.char.hp,Number(hp)||1)),`${source} → ชุบชีวิต`);
  target.deadAnnounced=false;
  if(room.game?.stats) room.game.stats.revives++;
  addLog(room,`${target.name} ถูกชุบด้วย ${source} → HP ${target.hp}`);
}

function canEnter(room, player, index){
  const target=roomAt(room,index);
  if(!target) return false;
  if(target.capacity===1){
    const occupied=room.players.some(p=>p.id!==player.id && p.pos===index && p.hp>0);
    if(occupied) return false;
  }
  return true;
}
function queueSacrificeDiscard(room, player, count, reason){
  const actual=Math.min(count, player.sac.length);
  if(actual<=0){ addLog(room,`${player.name}: ${reason} แต่ไม่มีเครื่องเซ่นให้เสีย`); return; }
  room.game.pendingRoomEffect={
    id:`re${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    type:"discardSacrifice", playerId:player.id, count:actual, reason
  };
  addLog(room,`${player.name}: ${reason} → ต้องเลือกทิ้งเครื่องเซ่น ${actual} ชิ้น`);
}
function drawExtraSacrifices(room, player, count, reason){
  let got=0;
  for(let i=0;i<count;i++){
    const c=room.game.sacDeck.shift();
    if(!c) break;
    if(player.sac.length>=7){ room.game.sacDeck.push(c); continue; }
    player.sac.push(c); got++;
    revealCard(room,player,c,"sacrifice",reason);
  }
  addLog(room,`${player.name}: ${reason} → จั่วเครื่องเซ่นเพิ่ม ${got} ชิ้น (โบนัสไม่ Chain Effect)`);
}
function applySacrificeRoomEffect(room, player, card){
  const r=roomAt(room,player.pos);
  if(!r) return;
  if(r.effectId==="ritual_mystery"){
    if(card.color==="pink") drawExtraSacrifices(room,player,2,"ของตำนานในห้องพิธีกรรมลึกลับ");
    if(card.color==="black") { changeHp(room,player,-3,"จั่วคุณไสยในห้องพิธีกรรมลึกลับ"); addLog(room,`${player.name}: จั่วคุณไสยในห้องพิธีกรรมลึกลับ → HP -3`); }
  }
  if(r.effectId==="shrine_black" && card.color==="black"){
    changeHp(room,player,-2,"จั่วคุณไสยในห้องพระ");
    addLog(room,`${player.name}: จั่วคุณไสยในห้องพระ → HP -2`);
    drawExtraSacrifices(room,player,1,"ผลห้องพระ");
  }
  if(r.effectId==="storage" && card.color==="pink"){
    queueSacrificeDiscard(room,player,2,"จั่วของตำนานในห้องเก็บของ");
  }
}
function escapeSuccess(rule,d){
  if(!rule) return true;
  if(rule.kind==="bothOdd") return d.a%2===1 && d.b%2===1;
  if(rule.kind==="bothEven") return d.a%2===0 && d.b%2===0;
  if(rule.kind==="sumLE") return d.total<=rule.value;
  if(rule.kind==="sumGE") return d.total>=rule.value;
  return false;
}
function ghostComplete(room){
  const ghost=currentGhost(room);
  return Object.entries(ghost.need).every(([color,count])=>(room.game.bossDone[color]||0)>=count);
}
function firstTrap(room){
  return room.game.rooms.findIndex(r=>r.type==="กับดัก");
}
function damagePlayersInRoom(room,pos,exceptId,amount,reason="โดนผลกระทบในห้องเดียวกัน"){
  room.players.forEach(x=>{
    if(x.id!==exceptId && x.hp>0 && x.pos===pos) changeHp(room,x,-amount,reason);
  });
}
function applyGhostCounter(room,p,color){
  const ghost=currentGhost(room);
  const originalPos=p.pos;
  if(ghost.id==="ghost-prai-mon"){
    if(color==="green"){
      changeHp(room,p,-1,`${ghost.name} สวนกลับสีเขียว`);
      damagePlayersInRoom(room,originalPos,p.id,1,`${ghost.name} สวนกลับใส่ผู้เล่นในห้องเดียวกัน`);
      addLog(room,`${ghost.name} สวนกลับสีเขียว → ${p.name} HP -1 • ผู้เล่นอื่นในห้องเดียวกัน HP -1`);
    }
    if(color==="blue"){
      changeHp(room,p,-2,`${ghost.name} สวนกลับสีฟ้า`);
      damagePlayersInRoom(room,originalPos,p.id,1,`${ghost.name} สวนกลับใส่ผู้เล่นในห้องเดียวกัน`);
      const idx=firstTrap(room);
      if(idx>=0) p.pos=idx;
      addLog(room,`${ghost.name} สวนกลับสีฟ้า → ${p.name} HP -2${idx>=0?" และถูกหลอกไปห้องกับดัก":""} • ผู้เล่นอื่นในห้องเดียวกัน HP -1`);
    }
  }
  if(ghost.id==="ghost-pret-to"){
    if(color==="green"){
      changeHp(room,p,-1,`${ghost.name} สวนกลับสีเขียว`);
      damagePlayersInRoom(room,originalPos,p.id,1,`${ghost.name} สวนกลับใส่ผู้เล่นในห้องเดียวกัน`);
      addLog(room,`${ghost.name} สวนกลับสีเขียว → ${p.name} HP -1 • ผู้เล่นอื่นในห้องเดียวกัน HP -1`);
    }
    if(color==="blue"){
      changeHp(room,p,-2,`${ghost.name} สวนกลับสีฟ้า`);
      damagePlayersInRoom(room,originalPos,p.id,1,`${ghost.name} สวนกลับใส่ผู้เล่นในห้องเดียวกัน`);
      const idx=firstTrap(room);
      if(idx>=0) p.pos=idx;
      addLog(room,`${ghost.name} สวนกลับสีฟ้า → ${p.name} HP -2${idx>=0?" และถูกส่งไปห้องกับดัก":""} • ผู้เล่นอื่นในห้องเดียวกัน HP -1`);
    }
    if(color==="pink"){
      changeHp(room,p,-3,`${ghost.name} สวนกลับสีชมพู`);
      damagePlayersInRoom(room,originalPos,p.id,2,`${ghost.name} สวนกลับใส่ผู้เล่นในห้องเดียวกัน`);
      addLog(room,`${ghost.name} สวนกลับสีชมพู → ${p.name} HP -3 • ผู้เล่นอื่นในห้องเดียวกัน HP -2 • เป้าหมาย Teleport บนการ์ดยังรอยืนยันชื่อห้อง จึงยังไม่ย้ายตำแหน่งใน V0.7`);
    }
  }
}

function computeResults(room){
  finishStats(room);
  const rows=room.players.map(p=>({
    id:p.id,name:p.name,char:p.char?.name||"",ritual:p.score,
    hand:p.sac.reduce((n,c)=>n+(Number(c.end)||0),0),
    total:p.score+p.sac.reduce((n,c)=>n+(Number(c.end)||0),0)
  })).sort((a,b)=>b.total-a.total);
  const best=rows[0]?.total ?? 0;
  room.result={
    ghost:currentGhost(room).name,
    stats:room.game?.stats||null,
    rows:rows.map(x=>({...x,winner:x.total===best}))
  };
}

function beginTurn(room){
  if(checkDefeat(room)) return;
  const g=room.game;
  let p=active(room);

  if(p.hp<=0){
    markNewDeaths(room);
    const next=nextAliveIndex(room,g.turn);
    if(next===null){ checkDefeat(room); return; }
    g.turn=next;
    p=active(room);
  }

  if(g.stats) g.stats.turns++;
  g.actions=3; g.sanity=null; g.lastDice=null; g.rolled=false; g.moved=false;
  g.mustMove=false; g.moveOptional=false; g.legal=[]; g.sacDrawn=false; g.traded=false;
  g.escapeRequired=false; g.escapeRule=null; g.escapeAttempts=0;

  const r=roomAt(room,p.pos);
  if(r?.effectId==="trap_hp1"){
    changeHp(room,p,-1,`เริ่มเทิร์นใน ${r.name}`);
    addLog(room,`${p.name} เริ่มเทิร์นใน ${r.name} → HP -1`);
  }
  if(r?.effectId==="curse_discard" && p.hp>0){
    queueSacrificeDiscard(room,p,1,`ต้นเทิร์นใน ${r.name}`);
  }
  if(r?.escapeRule && p.hp>0){
    g.escapeRequired=true;
    g.escapeRule=r.escapeRule;
    addLog(room,`${p.name} ติดอยู่ใน ${r.name} → ต้องใช้ 1 ธูปต่อครั้งเพื่อหนี (${r.escapeRule.label})`);
  }

  markNewDeaths(room);
  if(checkDefeat(room)) return;

  if(p.hp<=0){
    const next=nextAliveIndex(room,g.turn);
    if(next!==null){
      g.turn=next;
      beginTurn(room);
    }
  }
}

function startRoom(room){
  const map=shuffle(ROOMS).slice(0,9);
  const ghost=shuffle(GHOSTS)[0];
  const bossIndex=ghost.position;

  const used=new Set();
  room.players.forEach(p=>{
    const picked=CHARS.find(c=>c.key===p.characterKey);
    if(picked && !used.has(picked.key)){ p.char=picked; used.add(picked.key); }
    else p.char=null;
  });
  const remaining=shuffle(CHARS.filter(c=>!used.has(c.key)));
  room.players.forEach(p=>{
    if(!p.char){ p.char=remaining.shift(); p.characterKey=p.char.key; }
  });

  room.players.forEach((p,i)=>{
    p.hp=p.char.hp;
    p.deadAnnounced=false;
    p.score=0;
    p.pos=bossIndex;
    p.equip=[];
    p.sac=[];
    p.amu=shuffle(AMULETS.filter(x=>x.type!=="event").map(uidCard)).slice(0,3);
  });
  room.game={
    turn:0, rooms:map, bossIndex, actions:3, sanity:null,lastDice:null,
    rolled:false,moved:false,mustMove:false,moveOptional:false,legal:[],sacDrawn:false,traded:false,
    curse:0,bossDone:{green:0,blue:0,pink:0,black:0}, pendingRoomEffect:null,
    ghost, escapeRequired:false, escapeRule:null, escapeAttempts:0,
    diceSeq:0,lastDiceEvent:null,cardSeq:0,stats:freshStats(room.settings),
    amuDeck:shuffle(cloneCards(AMULETS,4)), amuDiscard:[],
    sacDeck:shuffle(cloneCards(SACRIFICES,6)), sacDiscard:[]
  };
  room.phase="game";
  addLog(room,`เริ่มเกม ${room.players.length} คน`);
  addLog(room,`สุ่ม Ghost: ${ghost.name} → ใช้ตำแหน่งบนการ์ด ช่อง ${bossIndex+1}`);
  addLog(room,"ผู้เล่นทุกคนเริ่มที่ Boss Room และได้รับ Amulet คนละ 3 ใบ");
  beginTurn(room);
}

function checkHost(socket,room){
  const p=playerBySocket(room,socket.id);
  if(!p || room.hostId!==p.id){ fail(socket,"เฉพาะ Host เท่านั้น"); return false; }
  return true;
}
function checkTurn(socket,room){
  if(room.phase!=="game"){ fail(socket,"เกมยังไม่เริ่ม"); return null; }
  const p=playerBySocket(room,socket.id);
  if(!p || active(room)?.id!==p.id){ fail(socket,"ยังไม่ถึงเทิร์นของคุณ"); return null; }
  if(room.game?.pendingRoomEffect){ fail(socket,"ต้อง Resolve Effect ของห้องก่อน"); return null; }
  return p;
}

function transferHostAfterLeave(room,oldHostId){
  if(room.hostId!==oldHostId) return;
  const next=room.players.find(x=>x.socketId)||room.players[0]||null;
  room.hostId=next?.id||null;
  if(next) addLog(room,`${next.name} ได้เป็น Host แทน`);
}
function removePlayerFromRoom(room,p,socket,{intentional=true}={}){
  const idx=room.players.findIndex(x=>x.id===p.id);
  if(idx<0) return;
  const wasHost=room.hostId===p.id;
  const wasActive=room.phase==="game"&&room.game&&room.players[room.game.turn]?.id===p.id;
  if(room.trade&&(room.trade.fromId===p.id||room.trade.toId===p.id)){
    room.trade=null;if(room.game) room.game.traded=true;
    addLog(room,`Trade ถูกยกเลิกเพราะ ${p.name} ออกจากห้อง`);
  }
  room.players.splice(idx,1);
  if(socket){socket.leave(room.code);socket.data.roomCode=null;}
  if(intentional) addLog(room,`${p.name} ออกจากห้อง`);
  if(room.players.length===0){rooms.delete(room.code);return;}
  if(wasHost) transferHostAfterLeave(room,p.id);
  if(room.phase==="game"&&room.game){
    if(wasActive){
      room.game.turn=idx%room.players.length;
      if(!checkDefeat(room)) beginTurn(room);
    }else if(idx<room.game.turn){room.game.turn=Math.max(0,room.game.turn-1);}
  }
}

function cardFromPlayer(p,uid){
  const az=p.amu.findIndex(c=>c.uid===uid);
  if(az>=0) return {zone:"amu",index:az,card:p.amu[az]};
  const sz=p.sac.findIndex(c=>c.uid===uid);
  if(sz>=0) return {zone:"sac",index:sz,card:p.sac[sz]};
  return null;
}
function removeCard(p, ref){
  if(ref.zone==="amu") return p.amu.splice(ref.index,1)[0];
  return p.sac.splice(ref.index,1)[0];
}
function addCardToZone(p, zone, card){
  if(zone==="amu"){
    if(p.amu.length>=5) return false;
    p.amu.push(card);
  }else{
    if(p.sac.length>=7) return false;
    p.sac.push(card);
  }
  return true;
}

io.on("connection", socket=>{
  socket.on("createRoom", ({name,sessionToken})=>{
    const code=makeCode();
    const token=safeToken(sessionToken);
    const p={id:randomUUID(),socketId:socket.id,token,name:safeName(name),seat:1,characterKey:null};
    const room={
      code,hostId:p.id,phase:"lobby",players:[],log:[],chat:[],trade:null,updatedAt:Date.now(),
      settings:{...DEFAULT_SETTINGS}
    };
    room.players.push(p);
    rooms.set(code,room);
    socket.join(code);
    socket.data.roomCode=code;
    addLog(room,`${p.name} สร้างห้อง ${code}`);
    emitRoom(room);
  });

  socket.on("joinRoom", ({code,name,sessionToken})=>{
    code=String(code||"").toUpperCase().trim();
    const room=rooms.get(code);
    if(!room) return fail(socket,"ไม่พบ Room Code นี้");
    const token=safeToken(sessionToken);

    const existing=room.players.find(p=>p.token===token);
    if(existing){
      existing.socketId=socket.id;
      if(name) existing.name=safeName(name);
      socket.join(code);socket.data.roomCode=code;
      addLog(room,`${existing.name} กลับเข้าห้อง`);
      emitRoom(room);return;
    }

    if(room.phase!=="lobby") return fail(socket,"เกมเริ่มไปแล้ว — ใช้ Session เดิมเพื่อกลับเข้าห้อง");
    if(room.players.length>=4) return fail(socket,"V1.5 เปิดเทสสูงสุด 4 คนก่อน");
    if(room.players.some(p=>p.socketId===socket.id)) return;
    const seat=[1,2,3,4].find(n=>!room.players.some(x=>(x.seat||0)===n)) || Math.min(4,room.players.length+1);
    const p={id:randomUUID(),socketId:socket.id,token,name:safeName(name),seat,characterKey:null};
    room.players.push(p);
    socket.join(code);
    socket.data.roomCode=code;
    addLog(room,`${p.name} เข้าห้อง`);
    emitRoom(room);
  });

  socket.on("resumeRoom", ({code,sessionToken})=>{
    code=String(code||"").toUpperCase().trim();
    const room=rooms.get(code);
    if(!room){ socket.emit("resumeFailed",{reason:"room_not_found"}); return; }
    const token=String(sessionToken||"").trim();
    const p=room.players.find(x=>x.token===token);
    if(!p){ socket.emit("resumeFailed",{reason:"session_not_found"}); return; }
    const wasOffline=!p.socketId;
    p.socketId=socket.id;
    socket.join(code);socket.data.roomCode=code;
    if(wasOffline) addLog(room,`${p.name} เชื่อมต่อกลับเข้าห้อง`);
    emitRoom(room);
  });

  socket.on("leaveRoom", ()=>{
    const code=socket.data.roomCode;
    const room=rooms.get(code);
    if(!room){socket.data.roomCode=null;socket.emit("leftRoom",{ok:true,code:null});return;}
    const p=playerBySocket(room,socket.id);
    if(!p){socket.leave(code);socket.data.roomCode=null;socket.emit("leftRoom",{ok:true,code});return;}
    const oldCode=room.code;
    removePlayerFromRoom(room,p,socket,{intentional:true});
    socket.emit("leftRoom",{ok:true,code:oldCode});
    const stillThere=rooms.get(oldCode);if(stillThere) emitRoom(stillThere);
  });

  socket.on("chatMessage", ({text})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=playerBySocket(room,socket.id); if(!p) return;
    const now=Date.now();
    if(now-(socket.data.lastChatAt||0)<450) return;
    text=safeChatText(text); if(!text) return;
    socket.data.lastChatAt=now;
    const msg={id:randomUUID(),at:now,playerId:p.id,seat:p.seat||1,name:p.name,text};
    room.chat=room.chat||[];room.chat.push(msg);if(room.chat.length>80)room.chat.shift();
    io.to(room.code).emit("chatMessage",msg);
  });

  socket.on("selectCharacter", ({key=null})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    if(room.phase!=="lobby") return fail(socket,"เลือกตัวละครได้เฉพาะก่อนเริ่มเกม");
    const p=playerBySocket(room,socket.id); if(!p) return;
    if(key===null||key==="random"){
      p.characterKey=null;
      addLog(room,`${p.name} เลือกสุ่มตัวละคร`);
      emitRoom(room); return;
    }
    const c=CHARS.find(x=>x.key===key);
    if(!c) return fail(socket,"ไม่พบตัวละครนี้");
    if(room.players.some(x=>x.id!==p.id&&x.characterKey===key)) return fail(socket,"ตัวละครนี้มีคนเลือกแล้ว");
    p.characterKey=key;
    addLog(room,`${p.name} เลือก ${c.name}`);
    emitRoom(room);
  });

  socket.on("updateSettings", ({key,value})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    if(!checkHost(socket,room)) return;
    if(room.phase!=="lobby") return fail(socket,"เปลี่ยน Playtest Settings ได้ก่อนเริ่มเกมเท่านั้น");
    const normalized=normalizeSetting(key,value);
    if(normalized===undefined) return fail(socket,"Setting ไม่ถูกต้อง");
    room.settings[key]=normalized;
    addLog(room,`Host เปลี่ยน Setting: ${key} = ${String(normalized)}`);
    emitRoom(room);
  });

  socket.on("startGame", ()=>{
    const room=rooms.get(socket.data.roomCode);
    if(!room || !checkHost(socket,room)) return;
    if(room.players.length<1) return fail(socket,"ต้องมีผู้เล่นอย่างน้อย 1 คน");
    if(room.players.some(p=>!p.socketId)) return fail(socket,"มีผู้เล่น Offline อยู่ — รอให้กลับเข้าห้องก่อนเริ่ม");
    startRoom(room);
    emitRoom(room);
  });

  socket.on("escapeRoom", ()=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game;
    if(!g.escapeRequired||!g.escapeRule) return fail(socket,"ตอนนี้ไม่ต้องทอยหนีห้อง");
    if(g.actions<1) return fail(socket,"ธูปไม่พอสำหรับหนีห้อง");
    g.actions--;
    g.escapeAttempts=(g.escapeAttempts||0)+1;
    if(g.stats) g.stats.escape.attempts++;
    const d=roll2(); g.lastDice=d;
    recordDice(room,p,d,"escape");
    applyCurse(room,d);
    if(resolveDeathsAfterAction(room,p.id)){ emitRoom(room); return; }
    if(escapeSuccess(g.escapeRule,d)){
      if(g.stats) g.stats.escape.success++;
      g.escapeRequired=false;
      addLog(room,`${p.name} ใช้ 1 ธูปทอยหนี ${d.a}+${d.b}=${d.total} → สำเร็จ`);
    }else{
      if(g.stats) g.stats.escape.fail++;
      addLog(room,`${p.name} ใช้ 1 ธูปทอยหนี ${d.a}+${d.b}=${d.total} → ไม่สำเร็จ${g.actions>0?" • ต้องลองอีกครั้ง":" • ธูปหมด อยู่ห้องเดิมจนจบตา"}`);
    }
    emitRoom(room);
  });

  socket.on("roll", ()=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game;
    if(g.escapeRequired) return fail(socket,"ต้องหนีออกจากห้องพิเศษก่อน");
    if(g.rolled || p.hp<=0) return fail(socket,"ทอยไม่ได้ตอนนี้");
    const d=roll2(); g.rolled=true; g.lastDice=d;
    if(g.stats) g.stats.moveRolls++;
    recordDice(room,p,d,"move");
    applyCurse(room,d);
    if(resolveDeathsAfterAction(room,p.id)){ emitRoom(room); return; }
    const currentFear=roomAt(room,p.pos).fear;
    const fear=Math.max(0,currentFear+equipmentFear(p));
    g.sanity=Math.max(0,d.total-fear);
    g.legal=neighbors(p.pos).filter(i=>roomAt(room,i).fear<=g.sanity && canEnter(room,p,i));
    if(g.legal.length){
      if(room.settings.forcedMovement) g.mustMove=true;
      else g.moveOptional=true;
    }else{
      g.moved=true;
    }
    addLog(room,`${p.name} ทอย ${d.a}+${d.b}=${d.total} • Fear ${fear} → สติ ${g.sanity}`);
    emitRoom(room);
  });

  socket.on("move", ({index})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game, i=Number(index);
    if(!(g.mustMove||g.moveOptional) || !g.legal.includes(i)) return fail(socket,"เดินไปห้องนี้ไม่ได้");
    p.pos=i; g.mustMove=false; g.moveOptional=false; g.moved=true; g.legal=[];
    bumpRoomVisit(room,i);
    addLog(room,`${p.name} เดินเข้า ${roomAt(room,i).name}`);
    emitRoom(room);
  });

  socket.on("stayInRoom", ()=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game;
    if(!g.moveOptional) return fail(socket,"ตอนนี้เลือกอยู่ห้องเดิมไม่ได้");
    g.moveOptional=false; g.moved=true; g.legal=[];
    addLog(room,`${p.name} เลือกอยู่ ${roomAt(room,p.pos).name} ต่อ (Optional Movement)`);
    emitRoom(room);
  });

  socket.on("drawAmulet", ()=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game;
    if(!g.moved||g.actions<1) return fail(socket,"จั่ว Amulet ไม่ได้");
    const c=g.amuDeck.shift();
    if(!c) return fail(socket,"กอง Amulet หมด");
    g.actions--;
    if(g.stats) g.stats.draws.amulet++;
    revealCard(room,p,c,"amulet","draw");
    const currentRoom=roomAt(room,p.pos);
    if(c.type==="event"){
      changeHp(room,p,-1,`Event ${c.name}`);
      g.amuDiscard.push(c);
      addLog(room,`${p.name} จั่ว Event ${c.name} → V0.6 placeholder Event HP -1`);
      if(resolveDeathsAfterAction(room,p.id)){ emitRoom(room); return; }
      if(currentRoom?.effectId==="event_heal"){
        changeHp(room,p,1,`${currentRoom.name}: จั่ว Event`);
        addLog(room,`${currentRoom.name}: จั่ว Event → HP +1`);
      }
      if(currentRoom?.effectId==="event_pick_discard" && g.amuDiscard.length && p.amu.length<5){
        g.pendingRoomEffect={id:`re${Date.now()}`,type:"pickAmuletDiscard",playerId:p.id,reason:"ห้องทำงาน",options:g.amuDiscard.map(x=>({uid:x.uid,name:x.name,type:x.type,desc:x.desc}))};
        addLog(room,`${currentRoom.name}: เลือก Amulet 1 ใบจากกองทิ้ง`);
      }
    }else if(currentRoom?.effectId==="equip_free" && c.type==="equip" && p.equip.length<Math.min(2,p.char.slots)){
      p.equip.push(c);
      addLog(room,`${p.name} จั่ว ${c.name} ในห้องน้ำ → สวมใส่ทันทีฟรี`);
    }else{
      p.amu.push(c);
      addLog(room,`${p.name} จั่ว Amulet 1 ใบ`);
      if(p.amu.length>5){
        g.pendingRoomEffect={
          id:`amu-overflow-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
          type:"discardAmuletOverflow",
          playerId:p.id,
          reason:"Amulet Hand เต็ม — เลือกเก็บ 5 ใบ",
          count:1,
          newUid:c.uid,
          options:p.amu.map(x=>({uid:x.uid,name:x.name,type:x.type,desc:x.desc}))
        };
        addLog(room,`${p.name} มี Amulet 6 ใบชั่วคราว → ต้องเลือกทิ้ง 1 ใบ`);
      }
    }
    emitRoom(room);
  });

  socket.on("drawSacrifice", ()=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game, r=roomAt(room,p.pos);
    const limited=room.settings.sacrificeDraw==="onePerTurn";
    if(!g.moved||g.actions<1||(limited&&g.sacDrawn)||!r.sac||p.sac.length>=7) return fail(socket,"จั่วเครื่องเซ่นไม่ได้");
    g.actions--;
    if(limited) g.sacDrawn=true;
    const drawCount=r.effectId==="under_stairs" ? 2 : 1;
    const drawn=[];
    for(let i=0;i<drawCount;i++){
      const c=g.sacDeck.shift();
      if(!c) break;
      if(p.sac.length>=7){ g.sacDeck.push(c); continue; }
      p.sac.push(c); drawn.push(c);
      revealCard(room,p,c,"sacrifice","draw");
    }
    if(!drawn.length) return fail(socket,"กองเครื่องเซ่นหมดหรือมือเต็ม");
    if(g.stats){
      g.stats.draws.sacrifice+=drawn.length;
      drawn.forEach(c=>{if(g.stats.draws.byColor[c.color]!==undefined) g.stats.draws.byColor[c.color]++;});
    }
    addLog(room,`${p.name} จั่วเครื่องเซ่น ${drawn.length} ใบ`);
    if(r.effectId==="under_stairs"){
      changeHp(room,p,-2,"ห้องใต้บันได");
      addLog(room,`ห้องใต้บันได → HP -2`);
    }
    drawn.forEach(c=>{ if(!g.pendingRoomEffect && p.hp>0) applySacrificeRoomEffect(room,p,c); });
    if(resolveDeathsAfterAction(room,p.id)){ emitRoom(room); return; }
    emitRoom(room);
  });

  socket.on("equip", ({uid})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game;
    const ref=cardFromPlayer(p,uid);
    if(!ref || ref.zone!=="amu" || ref.card.type!=="equip") return fail(socket,"การ์ดนี้สวมใส่ไม่ได้");
    if(!g.moved||g.actions<1||p.equip.length>=Math.min(2,p.char.slots)) return fail(socket,"สวมใส่ไม่ได้");
    g.actions--;
    const card=removeCard(p,ref); p.equip.push(card);
    addLog(room,`${p.name} สวม ${card.name}`);
    emitRoom(room);
  });

  socket.on("unequip", ({uid})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game;
    const idx=p.equip.findIndex(c=>c.uid===uid);
    if(idx<0||!g.moved||g.actions<1||p.amu.length>=5) return fail(socket,"ถอดอุปกรณ์ไม่ได้");
    g.actions--; p.amu.push(p.equip.splice(idx,1)[0]);
    addLog(room,`${p.name} ถอดอุปกรณ์`);
    emitRoom(room);
  });

  socket.on("useHeal", ({uid})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game;
    const ref=cardFromPlayer(p,uid);
    if(!ref||ref.zone!=="amu"||!["heal_self","heal_room","heal_adjacent"].includes(ref.card.type)||!g.moved||g.actions<1){
      return fail(socket,"ใช้การ์ดรักษาไม่ได้");
    }
    g.actions--;
    const card=removeCard(p,ref);
    const amount=Number(card.heal)||1;

    if(card.type==="heal_self"){
      changeHp(room,p,amount,`ใช้ ${card.name}`);
      addLog(room,`${p.name} ใช้ ${card.name} → HP +${amount}`);
    }
    if(card.type==="heal_room"){
      const targets=room.players.filter(x=>x.hp>0 && x.pos===p.pos);
      targets.forEach(x=>changeHp(room,x,amount,`${p.name} ใช้ ${card.name}`));
      addLog(room,`${p.name} ใช้ ${card.name} → ผู้เล่นที่ยังมีชีวิตในห้องเดียวกัน HP +${amount}`);
    }
    if(card.type==="heal_adjacent"){
      const validRooms=new Set([p.pos,...neighbors(p.pos)]);
      const targets=room.players.filter(x=>x.hp>0 && validRooms.has(x.pos));
      targets.forEach(x=>changeHp(room,x,amount,`${p.name} ใช้ ${card.name}`));
      addLog(room,`${p.name} ใช้ ${card.name} → ตัวเองและเพื่อนระยะ 1 ห้อง HP +${amount}`);
    }
    g.amuDiscard.push(card);
    emitRoom(room);
  });

  socket.on("useRevive", ({uid,targetId})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game;
    const ref=cardFromPlayer(p,uid);
    const target=room.players.find(x=>x.id===targetId);
    if(!ref||ref.zone!=="amu"||ref.card.type!=="revive"||!g.moved||g.actions<1) return fail(socket,"ใช้การ์ดชุบชีวิตไม่ได้");
    if(!target||target.hp>0||target.id===p.id) return fail(socket,"ต้องเลือกเพื่อนที่เสียชีวิต");
    g.actions--;
    const card=removeCard(p,ref);
    revivePlayer(room,target,card.reviveHp||1,card.name);
    g.amuDiscard.push(card);
    emitRoom(room);
  });

  socket.on("skill", ({targetId=null,index=null}={})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game;
    if(g.actions<3||p.hp<=0) return fail(socket,"ใช้ Skill ไม่ได้");
    if(!p.char.skillType) return fail(socket,"สกิลตัวละครนี้ยังไม่ล็อก Logic ใน V0.8");
    if(g.stats) g.stats.skillsUsed++;

    if(p.char.skillType==="heal_all"){
      if(!g.moved) return fail(socket,"ต้อง Resolve การเดินก่อนใช้สกิลนี้");
      room.players.forEach(x=>{ if(x.hp>0) changeHp(room,x,2,`${p.name} ใช้สกิลใจ`); });
      changeHp(room,p,1,`${p.name} ใช้สกิลใจ (โบนัสตัวเอง)`);
      g.actions=0;
      addLog(room,`${p.name} ใช้สกิลใจ → ผู้เล่นที่ยังมีชีวิต HP +2 • ตัวเองรวม +3`);
    }

    if(p.char.skillType==="summon_boss"){
      g.actions=0;
      changeHp(room,p,-3,"ใช้สกิลพูน");
      g.bossIndex=p.pos;
      g.rolled=true; g.moved=true; g.mustMove=false; g.moveOptional=false; g.legal=[]; g.escapeRequired=false;
      addLog(room,`${p.name} ใช้สกิลพูน → ย้ายห้องพิธีกรรมมาอยู่ที่ตัว • HP -3`);
      if(resolveDeathsAfterAction(room,p.id)){ emitRoom(room); return; }
    }

    if(p.char.skillType==="force_move"){
      if(g.escapeRequired) return fail(socket,"ต้องหนีห้องคำสาป/กับดักก่อน");
      if(g.rolled||g.moved) return fail(socket,"สกิลเข้มต้องใช้แทนการเดินปกติ");
      const idx=Number(index);
      if(!neighbors(p.pos).includes(idx)||!canEnter(room,p,idx)) return fail(socket,"เลือกได้เฉพาะห้องติดกัน");
      const target=roomAt(room,idx);
      g.actions=0;
      changeHp(room,p,-target.fear,`ใช้สกิลเข้ม → Fear ${target.fear}`);
      p.pos=idx;
      g.rolled=true; g.moved=true; g.mustMove=false; g.moveOptional=false; g.legal=[];
      addLog(room,`${p.name} ใช้พลังกายแทนสติ → ไป ${target.name} และเสีย HP ${target.fear}`);
      if(resolveDeathsAfterAction(room,p.id)){ emitRoom(room); return; }
    }

    if(p.char.skillType==="move_to_friend"){
      if(g.escapeRequired) return fail(socket,"ต้องหนีห้องคำสาป/กับดักก่อน");
      if(g.rolled||g.moved) return fail(socket,"สกิลแก้วต้องใช้แทนการเดินปกติ");
      const target=room.players.find(x=>x.id===targetId&&x.id!==p.id&&x.hp>0);
      if(!target) return fail(socket,"เลือกเพื่อนที่ยังมีชีวิต");
      const r1=Math.floor(p.pos/3),c1=p.pos%3,r2=Math.floor(target.pos/3),c2=target.pos%3;
      const distance=Math.abs(r1-r2)+Math.abs(c1-c2);
      g.actions=0;
      changeHp(room,p,-distance,`ใช้สกิลแก้ว → เดินผ่าน ${distance} ห้อง`);
      p.pos=target.pos;
      g.rolled=true; g.moved=true; g.mustMove=false; g.moveOptional=false; g.legal=[];
      addLog(room,`${p.name} ใช้สกิลแก้ว → ไปหา ${target.name} ผ่าน ${distance} ห้อง • HP -${distance}`);
      if(resolveDeathsAfterAction(room,p.id)){ emitRoom(room); return; }
    }

    emitRoom(room);
  });

  socket.on("ritual", ({uid})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game, r=roomAt(room,p.pos);
    if(!g.moved||g.actions<2||!r.boss) return fail(socket,"ทำพิธีไม่ได้");
    const ref=cardFromPlayer(p,uid);
    if(!ref||ref.zone!=="sac") return fail(socket,"ต้องเลือกเครื่องเซ่น");
    const c=ref.card;
    const ghost=currentGhost(room);
    if(!ghost.need[c.color]) return fail(socket,"ผีตัวนี้ไม่ต้องการเครื่องเซ่นสีนี้");
    if((g.bossDone[c.color]||0)>=ghost.need[c.color]) return fail(socket,"สีนี้ครบแล้ว");
    g.actions-=2;
    if(g.stats){
      g.stats.rituals.attempts++;
      if(g.stats.rituals.byColor[c.color]) g.stats.rituals.byColor[c.color].attempts++;
    }
    const d=roll2(); g.lastDice=d;
    recordDice(room,p,d,"ritual");
    applyCurse(room,d);
    if(resolveDeathsAfterAction(room,p.id)){ emitRoom(room); return; }
    const rule=ghost.dice[c.color];
    const ok=rule.op===">="?d.total>=rule.value:d.total<=rule.value;
    removeCard(p,ref);
    if(ok){
      if(g.stats){
        g.stats.rituals.success++;
        if(g.stats.rituals.byColor[c.color]) g.stats.rituals.byColor[c.color].success++;
      }
      g.bossDone[c.color]++; p.score+=c.boss;
      addLog(room,`${p.name} ใช้ ${c.name} • ทอย ${d.total} → สำเร็จ +${c.boss} คะแนน`);
    }else{
      if(g.stats){
        g.stats.rituals.fail++;
        if(g.stats.rituals.byColor[c.color]) g.stats.rituals.byColor[c.color].fail++;
      }
      if(room.settings.failedSacrifice==="remove"){
        g.sacDiscard.push(c);
        addLog(room,`${p.name} ทำพิธีพลาด • ${c.name} ออกจากเกมสำหรับ Session นี้`);
      }else{
        g.sacDeck.push(c);
        addLog(room,`${p.name} ทำพิธีพลาด • ${c.name} กลับใต้กอง`);
      }
      applyGhostCounter(room,p,c.color);
      if(p.equip.length){
        if(room.settings.equipmentBreak==="all"){
          const broken=p.equip.splice(0,p.equip.length);
          if(g.stats) g.stats.equipmentBreaks+=broken.length;
          addLog(room,`อุปกรณ์ของ ${p.name} แตกทั้งหมด: ${broken.map(x=>x.name).join(", ")}`);
        }else{
          const broken=p.equip.shift();
          if(g.stats) g.stats.equipmentBreaks++;
          addLog(room,`อุปกรณ์ของ ${p.name} แตก 1 ชิ้น: ${broken.name}`);
        }
      }
    }
    io.to(room.code).emit("ritualFx",{
      playerName:p.name,ghostName:ghost.name,cardName:c.name,color:c.color,
      dice:d,success:ok,score:ok?c.boss:0
    });
    if(!ok && resolveDeathsAfterAction(room,p.id)){ emitRoom(room); return; }
    if(ghostComplete(room)){
      room.phase="result";
      computeResults(room);
      addLog(room,`ปราบ ${ghost.name} สำเร็จ → จบเกม`);
    }
    emitRoom(room);
  });

  socket.on("resolveRoomEffect", ({uids=[],uid=null})=>{
    const room=rooms.get(socket.data.roomCode); if(!room||!room.game?.pendingRoomEffect) return;
    const p=playerBySocket(room,socket.id), pending=room.game.pendingRoomEffect;
    if(!p||pending.playerId!==p.id) return fail(socket,"Effect นี้ไม่ใช่ของคุณ");
    if(pending.type==="discardSacrifice"){
      const chosen=[...new Set(Array.isArray(uids)?uids:[])];
      if(chosen.length!==pending.count) return fail(socket,`ต้องเลือกเครื่องเซ่น ${pending.count} ชิ้น`);
      const refs=chosen.map(x=>cardFromPlayer(p,x));
      if(refs.some(r=>!r||r.zone!=="sac")) return fail(socket,"เลือกเครื่องเซ่นไม่ถูกต้อง");
      [...refs].sort((a,b)=>b.index-a.index).forEach(ref=>{
        const c=removeCard(p,ref); room.game.sacDeck.push(c);
      });
      addLog(room,`${p.name} Resolve ${pending.reason} → เครื่องเซ่น ${pending.count} ชิ้นกลับใต้กอง`);
      room.game.pendingRoomEffect=null;
    }else if(pending.type==="pickAmuletDiscard"){
      const idx=room.game.amuDiscard.findIndex(c=>c.uid===uid);
      if(idx<0) return fail(socket,"ไม่พบการ์ดในกองทิ้ง");
      if(p.amu.length>=5) return fail(socket,"Amulet Hand เต็ม");
      const [c]=room.game.amuDiscard.splice(idx,1); p.amu.push(c);
      addLog(room,`${p.name} เลือก ${c.name} จากกองทิ้งขึ้นมือ`);
      room.game.pendingRoomEffect=null;
    }else if(pending.type==="discardAmuletOverflow"){
      const idx=p.amu.findIndex(c=>c.uid===uid);
      if(idx<0) return fail(socket,"ไม่พบ Amulet ที่เลือก");
      if(p.amu.length<=5) return fail(socket,"Amulet Hand ไม่เกินขีดจำกัดแล้ว");
      const [c]=p.amu.splice(idx,1);
      room.game.amuDiscard.push(c);
      addLog(room,`${p.name} เลือกทิ้ง ${c.name} → Amulet Hand เหลือ ${p.amu.length}/5`);
      room.game.pendingRoomEffect=null;
    }
    emitRoom(room);
  });

  socket.on("hostSkipTurn", ()=>{
    const room=rooms.get(socket.data.roomCode); if(!room||room.phase!=="game") return;
    if(!checkHost(socket,room)) return;
    const skipped=active(room);
    addLog(room,`Host ใช้ Emergency Skip → ข้ามเทิร์นของ ${skipped?.name||"ผู้เล่น"}`);
    advanceToNextAlive(room);
    emitRoom(room);
  });

  socket.on("endTurn", ()=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    if(room.game.mustMove) return fail(socket,"ยังต้องเดินก่อน");
    if(room.game.moveOptional) return fail(socket,"เลือกเดินหรืออยู่ห้องเดิมก่อน");
    if(room.game.escapeRequired && room.game.actions>0) return fail(socket,"ยังมีธูปเหลือ ต้องพยายามหนีห้องพิเศษก่อน");
    advanceToNextAlive(room);
    emitRoom(room);
  });

  socket.on("tradeOffer", ({toId,giveUids=[],giveScore=0,askScore=0,askCardCount=0})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game;
    if(!g.moved||g.traded||room.trade) return fail(socket,"Trade ไม่ได้ตอนนี้");
    const target=room.players.find(x=>x.id===toId);
    if(!target||target.pos!==p.pos||target.hp<=0) return fail(socket,"Trade ได้เฉพาะคนที่อยู่ห้องเดียวกัน");
    giveScore=Math.max(0,Math.floor(Number(giveScore)||0));
    askScore=Math.max(0,Math.floor(Number(askScore)||0));
    askCardCount=Math.max(0,Math.min(2,Math.floor(Number(askCardCount)||0)));
    if(giveScore>p.score) return fail(socket,"คะแนนที่เสนอมากกว่าคะแนนที่มี");
    const refs=[];
    for(const uid of [...new Set(giveUids)].slice(0,3)){
      const ref=cardFromPlayer(p,uid);
      if(!ref) return fail(socket,"มีการ์ดในข้อเสนอที่ไม่ถูกต้อง");
      refs.push(ref);
    }
    if(g.stats) g.stats.trades.offers++;
    room.trade={
      id:`t${Date.now()}`, fromId:p.id,toId:target.id,giveScore,askScore,askCardCount,
      giveCards:refs.map(r=>({uid:r.card.uid,name:r.card.name,zone:r.zone,color:r.card.color,type:r.card.type}))
    };
    addLog(room,`${p.name} ส่ง Trade Offer ให้ ${target.name}`);
    emitRoom(room);
  });

  socket.on("tradeReject", ()=>{
    const room=rooms.get(socket.data.roomCode); if(!room||!room.trade) return;
    const p=playerBySocket(room,socket.id);
    if(!p||room.trade.toId!==p.id) return fail(socket,"คุณไม่ใช่ผู้รับ Trade นี้");
    const from=room.players.find(x=>x.id===room.trade.fromId);
    if(room.game?.stats) room.game.stats.trades.rejected++;
    addLog(room,`${p.name} ปฏิเสธ Trade จาก ${from?.name||"ผู้เล่น"}`);
    room.trade=null; room.game.traded=true;
    emitRoom(room);
  });

  socket.on("tradeAccept", ({returnUids=[]})=>{
    const room=rooms.get(socket.data.roomCode); if(!room||!room.trade) return;
    const t=room.trade;
    const target=playerBySocket(room,socket.id);
    const from=room.players.find(x=>x.id===t.fromId);
    if(!target||target.id!==t.toId||!from) return fail(socket,"Trade นี้ไม่ถูกต้อง");
    if(target.score<t.askScore||from.score<t.giveScore) return fail(socket,"คะแนนไม่พอสำหรับ Trade");
    if(returnUids.length!==t.askCardCount) return fail(socket,`ต้องเลือกการ์ดตอบกลับ ${t.askCardCount} ใบ`);
    const giveRefs=t.giveCards.map(x=>cardFromPlayer(from,x.uid));
    if(giveRefs.some(x=>!x)) return fail(socket,"การ์ดฝั่งผู้เสนอเปลี่ยนไปแล้ว");
    const returnRefs=returnUids.map(uid=>cardFromPlayer(target,uid));
    if(returnRefs.some(x=>!x)) return fail(socket,"การ์ดตอบกลับไม่ถูกต้อง");

    const incomingAmuToTarget=giveRefs.filter(r=>r.zone==="amu").length;
    const incomingSacToTarget=giveRefs.filter(r=>r.zone==="sac").length;
    const outgoingAmuFromTarget=returnRefs.filter(r=>r.zone==="amu").length;
    const outgoingSacFromTarget=returnRefs.filter(r=>r.zone==="sac").length;
    if(target.amu.length-outgoingAmuFromTarget+incomingAmuToTarget>5) return fail(socket,"Amulet Hand ผู้รับจะเกิน 5 ใบ");
    if(target.sac.length-outgoingSacFromTarget+incomingSacToTarget>7) return fail(socket,"เครื่องเซ่นผู้รับจะเกิน 7 ใบ");
    if(from.amu.length-incomingAmuToTarget+outgoingAmuFromTarget>5) return fail(socket,"Amulet Hand ผู้เสนอจะเกิน 5 ใบ");
    if(from.sac.length-incomingSacToTarget+outgoingSacFromTarget>7) return fail(socket,"เครื่องเซ่นผู้เสนอจะเกิน 7 ใบ");

    // remove descending by zone index to keep indexes valid
    [...giveRefs].sort((a,b)=>b.index-a.index).forEach(ref=>removeCard(from,ref));
    [...returnRefs].sort((a,b)=>b.index-a.index).forEach(ref=>removeCard(target,ref));
    t.giveCards.forEach(x=>{
      const card = x.zone==="amu" ? AMULETS.find(c=>c.name===x.name) : SACRIFICES.find(c=>c.name===x.name);
      const original = giveRefs.find(r=>r.card.uid===x.uid)?.card || uidCard(card);
      addCardToZone(target,x.zone,original);
    });
    returnRefs.forEach(ref=>addCardToZone(from,ref.zone,ref.card));
    from.score = from.score - t.giveScore + t.askScore;
    target.score = target.score + t.giveScore - t.askScore;
    if(room.game?.stats) room.game.stats.trades.accepted++;
    addLog(room,`${target.name} ยอมรับ Trade กับ ${from.name}`);
    room.trade=null; room.game.traded=true;
    emitRoom(room);
  });

  socket.on("disconnect", ()=>{
    const code=socket.data.roomCode;
    const room=rooms.get(code);
    if(!room) return;
    const p=playerBySocket(room,socket.id);
    if(p) p.socketId=null;
    room.updatedAt=Date.now();
    addLog(room,`${p?.name||"ผู้เล่น"} หลุดการเชื่อมต่อ — เก็บที่นั่งไว้ให้ Reconnect`);
    emitRoom(room);

    if(p && room.phase==="lobby" && room.hostId===p.id){
      setTimeout(()=>{
        const latest=rooms.get(code);
        if(!latest || latest.phase!=="lobby") return;
        const oldHost=latest.players.find(x=>x.id===latest.hostId);
        if(oldHost?.socketId) return;
        const next=latest.players.find(x=>x.socketId);
        if(next){
          latest.hostId=next.id;
          addLog(latest,`${next.name} ได้เป็น Host แทน เพราะ Host เดิม Offline`);
          emitRoom(latest);
        }
      },30000);
    }
  });
});

setInterval(()=>{
  const now=Date.now();
  for(const [code,room] of rooms){
    const live=room.players.some(p=>p.socketId);
    if(!live && now-(room.updatedAt||now)>ROOM_IDLE_TTL) rooms.delete(code);
  }
},60000).unref();

server.listen(PORT, "0.0.0.0", ()=>console.log(`บ้านผีสิง V1.5 listening on :${PORT}`));
