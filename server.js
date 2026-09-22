
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { randomUUID } = require("crypto");
const {createAccounts}=require("./lib/accounts.cjs");
const {awards}=require("./lib/progression.cjs");

const CARD_ART = require("./public/assets/cards/manifest.json");
const artUrl = entry => entry?.file ? `/assets/cards/${entry.file}` : null;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req,res)=>res.status(200).json({ok:true,build:"1.12.0",amuletCards:63,sacrificeCards:54,ghosts:9,autoEndAtZero:true}));

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const ROOM_IDLE_TTL = 30 * 60 * 1000;

const DEFAULT_SETTINGS = Object.freeze({
  allowDuplicateCharacters:true,
  forcedMovement:true,
  sacrificeDraw:"onePerTurn",
  failedSacrifice:"bottom",
  equipmentBreak:"one"
});
const SETTING_OPTIONS = {
  allowDuplicateCharacters:[true,false],
  forcedMovement:[true,false],
  sacrificeDraw:["onePerTurn","perIncense"],
  failedSacrifice:["bottom","remove"],
  equipmentBreak:["one","all"]
};
function normalizeSetting(key,value){
  const allowed=SETTING_OPTIONS[key];
  if(!allowed) return undefined;
  if(key==="forcedMovement"||key==="allowDuplicateCharacters"){
    const v=value===true||value==="true" ? true : value===false||value==="false" ? false : undefined;
    return allowed.includes(v)?v:undefined;
  }
  return allowed.includes(value)?value:undefined;
}

const CHARS = [
  { key:"por-krai", name:"พ่อไกร", role:"สายแทงค์", hp:10, slots:3, skillType:"self_revive", skill:"ใช้ธูป 3 ดอก: ฟื้น HP +3 • ใช้ได้เมื่อ HP 0 ตอนถึงเทิร์นตัวเอง" },
  { key:"mae-mali", name:"แม่มะลิ", role:"สายต้น", hp:7, slots:2, skillType:"draw_five_stop_event", skill:"ใช้ธูป 3 ดอก: จั่ว Amulet สูงสุด 5 ใบ • ถ้าเจอ Event ให้ Resolve แล้วหยุดทันที" },
  { key:"doctor", name:"หมอสาว", role:"สายฮีล", hp:9, slots:2, skillType:"heal_all_living", skill:"ใช้ธูป 3 ดอก: เพื่อนที่ยังมีชีวิตทุกคน HP +1 ไม่จำกัดระยะ • ตัวเอง HP -3" },
  { key:"nerd", name:"เด็กเนิร์ด", role:"สายติม", hp:7, slots:2, skillType:"move_to_friend_hp2", skill:"ใช้ธูป 3 ดอก: เลือกวาร์ปไปหาเพื่อน 1 คน • ตัวเอง HP -2" },
  { key:"black-shaman", name:"หมอผีดำ", role:"สายตี", hp:8, slots:2, skillType:"remote_ritual_hp3", skill:"ใช้ธูป 3 ดอก: ท้าดวลผีจากห้องไหนก็ได้ • เลือกเครื่องเซ่นและทอยตามปกติ • HP -3" },
  { key:"mor-tham", name:"หมอธรรม", role:"สายซัพ", hp:7, slots:2, skillType:"free_any_trap_curse", skill:"ใช้ธูป 3 ดอก: ปลดตัวเองหรือเพื่อนจากห้องคำสาป/กับดักได้ทั่วกระดาน" },
  { key:"temple-dog", name:"หมาวัด", role:"สายคุ้ย", hp:7, slots:2, skillType:"peek_four_choose_two", skill:"ใช้ธูป 3 ดอก: เลือกดูบนสุดหรือล่างสุด 4 ใบ แล้วเลือกเก็บ 2 ใบ • อีก 2 ใบคืนด้านเดิมตามลำดับ" },
  { key:"stray-cat", name:"แมวจร", role:"สายส่ง", hp:1, slots:2, skillType:"remote_help", skill:"ใช้ธูป 3 ดอก: ใช้การ์ดหมวดช่วยเหลือ 1 ใบให้เพื่อนคนใดก็ได้ ไม่จำกัดห้อง" }
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
  { id:"STORAGE", name:"ห้องเก็บของ", type:"ลึกลับน่าค้นหา", fear:3, amu:true, sac:true, effectId:"storage", effectText:"จั่วได้ ‘อาหารเซ่นผี’ → HP +1 • จั่วได้ ‘สิ่งปลุกเสก’(ชมพู) → ทิ้งเครื่องเซ่น 2 ชิ้น" },
  { id:"UNDER_STAIRS", name:"ห้องใต้บันได", type:"ลึกลับน่าค้นหา", fear:3, amu:true, sac:true, capacity:1, effectId:"under_stairs", effectText:"อยู่ได้ 1 คน • จั่วเครื่องเซ่นครั้งละ 2 ชิ้น แต่ HP -2" },
  { id:"BEDROOM", name:"ห้องนอน", type:"ลึกลับน่าค้นหา", fear:3, amu:true, sac:true, effectId:"bedroom", effectText:"จั่วได้ ‘ดอกไม้ธูปเทียน’ → จั่วเพิ่ม 1 • จั่วได้ ‘อาหารเซ่นผี’ → HP -1" },
  { id:"OFFICE", name:"ห้องทำงาน", type:"ปลอดภัย", fear:1, amu:true, effectId:"event_pick_discard", effectText:"หากจั่วได้การ์ดเหตุการณ์ → เลือก Amulet 1 ใบจากกองทิ้ง" }
];

const AMULETS = [
  // สวมใส่ 12
  {id:"E01",category:"สวมใส่",name:"มีดหมอ",type:"equip",fear:-1,attackMod:1,breakOnAttackFail:true,desc:"โจมตี +1/-1 • ทิ้งเมื่อโจมตีไม่สำเร็จ"},
  {id:"E02",category:"สวมใส่",name:"มีดหมอ",type:"equip",fear:-1,attackMod:1,breakOnAttackFail:true,desc:"โจมตี +1/-1 • ทิ้งเมื่อโจมตีไม่สำเร็จ"},
  {id:"E03",category:"สวมใส่",name:"มีดหมอ",type:"equip",fear:-1,attackMod:1,breakOnAttackFail:true,desc:"โจมตี +1/-1 • ทิ้งเมื่อโจมตีไม่สำเร็จ"},
  {id:"E04",category:"สวมใส่",name:"ยันต์กันผี",type:"equip",fear:-2,wardOnce:true,desc:"ป้องกันการโจมตีจากผี 1 ครั้ง • ทิ้งเมื่อป้องกันสำเร็จ"},
  {id:"E05",category:"สวมใส่",name:"ยันต์กันผี",type:"equip",fear:-2,wardOnce:true,desc:"ป้องกันการโจมตีจากผี 1 ครั้ง • ทิ้งเมื่อป้องกันสำเร็จ"},
  {id:"E06",category:"สวมใส่",name:"ยันต์กันผี",type:"equip",fear:-2,wardOnce:true,desc:"ป้องกันการโจมตีจากผี 1 ครั้ง • ทิ้งเมื่อป้องกันสำเร็จ"},
  {id:"E07",category:"สวมใส่",name:"เกราะเพชร",type:"equip",fear:-2,wardOnce:true,desc:"ป้องกันการโจมตีจากผี 1 ครั้ง • ทิ้งเมื่อป้องกันสำเร็จ"},
  {id:"E08",category:"สวมใส่",name:"เกราะเพชร",type:"equip",fear:-2,wardOnce:true,desc:"ป้องกันการโจมตีจากผี 1 ครั้ง • ทิ้งเมื่อป้องกันสำเร็จ"},
  {id:"E09",category:"สวมใส่",name:"เกราะเพชร",type:"equip",fear:-2,wardOnce:true,desc:"ป้องกันการโจมตีจากผี 1 ครั้ง • ทิ้งเมื่อป้องกันสำเร็จ"},
  {id:"E10",category:"สวมใส่",name:"ดาบศักดิ์สิทธิ์ 7 ป่าช้า",type:"equip",fear:-3,attackMod:2,breakOnAttackFail:true,desc:"โจมตี +2/-2 • ทิ้งเมื่อโจมตีไม่สำเร็จ"},
  {id:"E11",category:"สวมใส่",name:"ดาบศักดิ์สิทธิ์ 7 ป่าช้า",type:"equip",fear:-3,attackMod:2,breakOnAttackFail:true,desc:"โจมตี +2/-2 • ทิ้งเมื่อโจมตีไม่สำเร็จ"},
  {id:"E12",category:"สวมใส่",name:"ดาบศักดิ์สิทธิ์ 7 ป่าช้า",type:"equip",fear:-3,attackMod:2,breakOnAttackFail:true,desc:"โจมตี +2/-2 • ทิ้งเมื่อโจมตีไม่สำเร็จ"},

  // คาถาอาคม 9
  {id:"S01",category:"คาถาอาคม",name:"แคล้วคลาด",type:"spell",spellEffect:"protect_all",condition:{op:"<=",value:8,label:"8-"},effect:"ป้องกันผลลบทุกประเภท 1 Effect"},
  {id:"S02",category:"คาถาอาคม",name:"คาถาบังตามะมา มะโม",type:"spell",spellEffect:"go_anywhere",condition:{op:">=",value:8,label:"8+"},effect:"ไปที่ไหนก็ได้ โดยข้าม Fear/ค่าสติ"},
  {id:"S03",category:"คาถาอาคม",name:"ช่วยลูกด้วย",type:"spell",spellEffect:"protect_ghost",condition:{op:"<=",value:9,label:"9-"},effect:"พ่อแก้ว แม่แก้ว • ป้องกันการโจมตีจากผี 1 ครั้ง"},
  {id:"S04",category:"คาถาอาคม",name:"อยู่ยงคงกระพัน",type:"spell",spellEffect:"protect_all",condition:{op:">=",value:7,label:"7+"},effect:"ป้องกันผลลบทุกประเภท 1 Effect"},
  {id:"S05",category:"คาถาอาคม",name:"บูชาลูกกรอก ประสิทธิโชคปิดตาพาล",type:"spell",spellEffect:"diagonal_move",condition:{op:"<=",value:7,label:"7-"},effect:"เดินทางทะแยงมุมได้ โดยข้าม Fear/ค่าสติ"},
  {id:"S06",category:"คาถาอาคม",name:"บูชาลูกกรอก ประสิทธิโชคปิดตาพาล",type:"spell",spellEffect:"diagonal_move",condition:{op:"<=",value:7,label:"7-"},effect:"เดินทางทะแยงมุมได้ โดยข้าม Fear/ค่าสติ"},
  {id:"S07",category:"คาถาอาคม",name:"เมตตามหานิยม",type:"spell",spellEffect:"escape_special",condition:{op:"<=",value:10,label:"10-"},effect:"หลุดจากคำสาปและกับดักทันที"},
  {id:"S08",category:"คาถาอาคม",name:"เมตตามหานิยม",type:"spell",spellEffect:"escape_special",condition:{op:"<=",value:10,label:"10-"},effect:"หลุดจากคำสาปและกับดักทันที"},
  {id:"S09",category:"คาถาอาคม",name:"ช่วยลูกด้วย",type:"spell",spellEffect:"protect_ghost",condition:{op:"<=",value:9,label:"9-"},effect:"พ่อแก้ว แม่แก้ว • ป้องกันการโจมตีจากผี 1 ครั้ง"},

  // ช่วยเหลือ 18
  {id:"H01",category:"ช่วยเหลือ",name:"น้ำมนต์ผ้าป่า",type:"heal_self",heal:1,desc:"เพิ่มเลือด +1"},{id:"H02",category:"ช่วยเหลือ",name:"น้ำมนต์ผ้าป่า",type:"heal_self",heal:1,desc:"เพิ่มเลือด +1"},{id:"H03",category:"ช่วยเหลือ",name:"น้ำมนต์ผ้าป่า",type:"heal_self",heal:1,desc:"เพิ่มเลือด +1"},
  {id:"H04",category:"ช่วยเหลือ",name:"น้ำมนต์ถังพร้อมอาบ",type:"heal_self",heal:2,desc:"เพิ่มเลือด +2"},{id:"H05",category:"ช่วยเหลือ",name:"น้ำมนต์ถังพร้อมอาบ",type:"heal_self",heal:2,desc:"เพิ่มเลือด +2"},{id:"H06",category:"ช่วยเหลือ",name:"น้ำมนต์ถังพร้อมอาบ",type:"heal_self",heal:2,desc:"เพิ่มเลือด +2"},
  {id:"H07",category:"ช่วยเหลือ",name:"น้ำมนต์พร้อมดื่มวัดดัง",type:"heal_self",heal:3,desc:"เพิ่มเลือด +3"},{id:"H08",category:"ช่วยเหลือ",name:"น้ำมนต์พร้อมดื่มวัดดัง",type:"heal_self",heal:3,desc:"เพิ่มเลือด +3"},
  {id:"H09",category:"ช่วยเหลือ",name:"เครื่องหอมอโรมา",type:"heal_room",heal:1,desc:"ผู้เล่นที่ยังมีชีวิตทุกคนในห้องเดียวกัน เลือด +1"},{id:"H10",category:"ช่วยเหลือ",name:"เครื่องหอมอโรมา",type:"heal_room",heal:1,desc:"ผู้เล่นที่ยังมีชีวิตทุกคนในห้องเดียวกัน เลือด +1"},
  {id:"H11",category:"ช่วยเหลือ",name:"ระฆังเรียกสติ",type:"heal_range",heal:1,range:1,desc:"ตัวเองและเพื่อนใกล้เคียง เลือด +1 • ระยะ 1 ช่อง"},{id:"H12",category:"ช่วยเหลือ",name:"ระฆังเรียกสติ",type:"heal_range",heal:1,range:1,desc:"ตัวเองและเพื่อนใกล้เคียง เลือด +1 • ระยะ 1 ช่อง"},
  {id:"H13",category:"ช่วยเหลือ",name:"ยาฟื้นชีพโอสถ",type:"revive",reviveHp:1,range:"any",desc:"ฟื้นเพื่อนที่หมดพลัง เลือด +1 • ไม่จำกัดช่อง"},{id:"H14",category:"ช่วยเหลือ",name:"ยาฟื้นชีพโอสถ",type:"revive",reviveHp:1,range:"any",desc:"ฟื้นเพื่อนที่หมดพลัง เลือด +1 • ไม่จำกัดช่อง"},
  {id:"H15",category:"ช่วยเหลือ",name:"เครื่องหอมอโรมา",type:"heal_room",heal:2,desc:"ผู้เล่นที่ยังมีชีวิตทุกคนในห้องเดียวกัน เลือด +2"},{id:"H16",category:"ช่วยเหลือ",name:"เครื่องหอมอโรมา",type:"heal_room",heal:2,desc:"ผู้เล่นที่ยังมีชีวิตทุกคนในห้องเดียวกัน เลือด +2"},
  {id:"H17",category:"ช่วยเหลือ",name:"ยาหอมจันทร์",type:"heal_range",heal:1,range:2,desc:"ตัวเองและเพื่อนใกล้เคียง เลือด +1 • ระยะ 2 ช่อง"},{id:"H18",category:"ช่วยเหลือ",name:"ยาหอมจันทร์",type:"heal_range",heal:1,range:2,desc:"ตัวเองและเพื่อนใกล้เคียง เลือด +1 • ระยะ 2 ช่อง"},

  // เรียกสติ 12
  {id:"M01",category:"เรียกสติ",name:"นั่งสมาธิ",type:"sanity",sanityChoices:[1],desc:"เพิ่มค่าสติ +1"},{id:"M02",category:"เรียกสติ",name:"นั่งสมาธิ",type:"sanity",sanityChoices:[1],desc:"เพิ่มค่าสติ +1"},
  {id:"M03",category:"เรียกสติ",name:"นั่งสมาธิ",type:"sanity",sanityChoices:[-1],desc:"เพิ่มค่าสติ -1"},{id:"M04",category:"เรียกสติ",name:"นั่งสมาธิ",type:"sanity",sanityChoices:[-1],desc:"เพิ่มค่าสติ -1"},
  {id:"M05",category:"เรียกสติ",name:"เพ่งสมาธิ",type:"sanity",sanityChoices:[-1,1],desc:"ปรับค่าสติ -1 หรือ +1"},{id:"M06",category:"เรียกสติ",name:"เพ่งสมาธิ",type:"sanity",sanityChoices:[-1,1],desc:"ปรับค่าสติ -1 หรือ +1"},
  {id:"M07",category:"เรียกสติ",name:"นั่งสมาธิ",type:"sanity",sanityChoices:[2],desc:"เพิ่มค่าสติ +2"},{id:"M08",category:"เรียกสติ",name:"นั่งสมาธิ",type:"sanity",sanityChoices:[2],desc:"เพิ่มค่าสติ +2"},
  {id:"M09",category:"เรียกสติ",name:"นั่งสมาธิ",type:"sanity",sanityChoices:[-2],desc:"เพิ่มค่าสติ -2"},{id:"M10",category:"เรียกสติ",name:"นั่งสมาธิ",type:"sanity",sanityChoices:[-2],desc:"เพิ่มค่าสติ -2"},
  {id:"M11",category:"เรียกสติ",name:"เพ่งสมาธิ",type:"sanity",sanityChoices:[-2,2],desc:"ปรับค่าสติ -2 หรือ +2"},{id:"M12",category:"เรียกสติ",name:"เพ่งสมาธิ",type:"sanity",sanityChoices:[-2,2],desc:"ปรับค่าสติ -2 หรือ +2"},

  // เหตุการณ์ 12
  {id:"V01",category:"เหตุการณ์",name:"เฮ้ยยย!!",type:"event",eventId:"to_trap",desc:"เพิ่งรู้ว่าที่เกาะอยู่..ไม่ใช่หลังเพื่อน! • วิ่งไปที่ห้องกับดัก"},
  {id:"V02",category:"เหตุการณ์",name:"เอ๊อะ!",type:"event",eventId:"left_hp2",desc:"ถือธูปจี้หลังเพื่อน • คุณและเพื่อนฝั่งซ้าย เลือด -2"},
  {id:"V03",category:"เหตุการณ์",name:"ไหลนอง",type:"event",eventId:"break_equip",desc:"กลัวจนฉี่ราด! • ถอดอุปกรณ์ที่สวมใส่อยู่ 1 ชิ้น"},
  {id:"V04",category:"เหตุการณ์",name:"สุดแสบ!",type:"event",eventId:"skip_turn",desc:"ขูดเลขเสี้ยนตำ • หยุดนั่งพันแผล 1 เทิร์น"},
  {id:"V05",category:"เหตุการณ์",name:"ว๊บ!",type:"event",eventId:"to_curse",desc:"โดนสิง! เผลอขานรับเสียงเรียกแปลก ๆ • เดินไปที่ห้องคำสาป"},
  {id:"V06",category:"เหตุการณ์",name:"ฟุ่บ!",type:"event",eventId:"right_and_self_hp2",desc:"ลื่นเครื่องเซ่นหัวทิ่ม ขาฟาดปากเพื่อน • คุณและเพื่อนฝั่งขวา เลือด -2"},
  {id:"V07",category:"เหตุการณ์",name:"เหยยย!",type:"event",eventId:"next_player_roll_money",desc:"วิ่งตัดหน้า เขาว่าจะได้ลาภลอย • คนถัดไปกดทอย คุณได้เงินเท่าผลรวม"},
  {id:"V08",category:"เหตุการณ์",name:"อู้ว อ้าว ว้าว!",type:"event",eventId:"room_money5",desc:"สมบัติชัด ๆ • ทุกคนในห้องได้เงิน 5"},
  {id:"V09",category:"เหตุการณ์",name:"แหมะ!",type:"event",eventId:"ritual_heal_all",desc:"ยันต์ปลิวติดหน้า • ทุกคนเลือด +2 เมื่อมีคนทำพิธี ยกเว้นคนตาย"},
  {id:"V10",category:"เหตุการณ์",name:"เพล้ง!",type:"event",eventId:"free_curse_move",desc:"คนในห้องคำสาปหลุดพ้น และเลือกเดินออก 1 ช่อง"},
  {id:"V11",category:"เหตุการณ์",name:"0997997789",type:"event",eventId:"noop",desc:"เบอร์หลวงพ่อ • ไร้ประโยชน์"},
  {id:"V12",category:"เหตุการณ์",name:"ทาดา!",type:"event",eventId:"revive_any",desc:"เจอเครื่องปั๊มหัวใจ • ชุบชีวิต 1 คนที่ HP 1"}
];

const SACRIFICES = [
  {name:'ธูป',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'ธูป',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'ธูป',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'ธูป',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'ธูป',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'ธูป',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'เทียน',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'เทียน',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'เทียน',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'เทียน',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'เทียน',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'เทียน',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'ดอกบัว',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'ดอกบัว',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'ดอกบัว',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'ดอกบัว',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'ดอกบัว',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'ดอกบัว',color:'green',icon:'◆',boss:2,end:1,group:'ดอกไม้ธูปเทียน'},
  {name:'แกงเขียวหวาน',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'แกงขาไก่',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'ข้าวสวย',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'เหล้าขาว',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'น้ำเปล่า',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'น้ำแดง',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'ยาสูบ',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'หมาก',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'หัวหอม',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'ข้าวต้มมัด',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'กล้วย',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'ขนมเข่ง',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'ฝอยทอง',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'แอปเปิ้ล',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'ส้ม',color:'blue',icon:'■',boss:4,end:2,group:'อาหารเซ่นผี'},
  {name:'มาลัย',color:'pink',icon:'⬟',boss:6,end:3,group:'สิ่งปลุกเสก'},
  {name:'พระขาว',color:'pink',icon:'⬟',boss:6,end:3,group:'สิ่งปลุกเสก'},
  {name:'พระพุทธรูป',color:'pink',icon:'⬟',boss:6,end:3,group:'สิ่งปลุกเสก'},
  {name:'หุ่นนางรำ',color:'pink',icon:'⬟',boss:6,end:3,group:'สิ่งปลุกเสก'},
  {name:'ตา-ยาย',color:'pink',icon:'⬟',boss:6,end:3,group:'สิ่งปลุกเสก'},
  {name:'น้ำมนต์',color:'pink',icon:'⬟',boss:6,end:3,group:'สิ่งปลุกเสก'},
  {name:'ชุดนางรำ',color:'pink',icon:'⬟',boss:6,end:3,group:'สิ่งปลุกเสก'},
  {name:'ม้า',color:'pink',icon:'⬟',boss:6,end:3,group:'สิ่งปลุกเสก'},
  {name:'ไม้ตะเคียน',color:'pink',icon:'⬟',boss:6,end:3,group:'สิ่งปลุกเสก'},
  {name:'ไฟประดับ',color:'pink',icon:'⬟',boss:6,end:3,group:'สิ่งปลุกเสก'},
  {name:'ผ้าสามสี',color:'pink',icon:'⬟',boss:6,end:3,group:'สิ่งปลุกเสก'},
  {name:'ตุ๊กตา',color:'pink',icon:'⬟',boss:6,end:3,group:'สิ่งปลุกเสก'},
  {name:'บาตรแตก',color:'black',icon:'⬢',boss:8,end:-4,group:'คุณไสย'},
  {name:'น้ำมันพราย',color:'black',icon:'⬢',boss:8,end:-4,group:'คุณไสย'},
  {name:'เชือกขาด',color:'black',icon:'⬢',boss:8,end:-4,group:'คุณไสย'},
  {name:'ผ้าห่อศพ',color:'black',icon:'⬢',boss:8,end:-4,group:'คุณไสย'},
  {name:'หุ่นพยนต์',color:'black',icon:'⬢',boss:8,end:-4,group:'คุณไสย'},
  {name:'ตะปูตอกฝาโรง',color:'black',icon:'⬢',boss:8,end:-4,group:'คุณไสย'},
  {name:'เงินปากผี',color:'black',icon:'⬢',boss:8,end:-4,group:'คุณไสย'},
  {name:'ดินโปร่ง',color:'black',icon:'⬢',boss:8,end:-4,group:'คุณไสย'},
  {name:'ไม้แตก',color:'black',icon:'⬢',boss:8,end:-4,group:'คุณไสย'}
];

const GHOSTS = [
{id:"ghost-occult-master",name:"ผีจอมขมังเวทย์",tier:"สายคำสาป",archetype:"Curse Control",fear:6,position:4,need:{green:2,blue:2,pink:1,black:1},dice:{green:{op:"<=",value:9,label:"9-"},blue:{op:">=",value:6,label:"6+"},pink:{op:">=",value:7,label:"7+"},black:{op:">=",value:8,label:"8+"}},curseTrigger:{kind:"totalEquals",value:8,label:"ผลรวมเต๋า = 8"},curseText:"ผลรวมเต๋า = 8 → Curse +1",counterText:{green:"พลาด: HP -1",blue:"พลาด: HP -1 • Curse +1",pink:"พลาด: HP -2 • Curse +1",black:"พลาด: HP -2 • Curse +2"}},
{id:"ghost-treasure-guard",name:"ผีเฝ้าสมบัติ",tier:"สายทรัพย์",archetype:"Money Pressure",fear:5,position:0,need:{green:2,blue:2,pink:2},dice:{green:{op:"<=",value:9,label:"9-"},blue:{op:">=",value:6,label:"6+"},pink:{op:">=",value:8,label:"8+"},black:{op:">=",value:8,label:"8+"}},curseTrigger:{kind:"dieIncludes",values:[1],label:"มีลูกเต๋าหน้า 1"},curseText:"มีลูกเต๋าหน้า 1 → เสียเงิน 1 • ถ้าไม่มีเงิน HP -1",counterText:{green:"พลาด: เงิน -1",blue:"พลาด: เงิน -1 • ถ้าไม่มีเงิน HP -1",pink:"พลาด: เงิน -2 • ถ้าไม่มีเงิน HP -1",black:"พลาด: เงิน -2"}},
{id:"ghost-pob-jaothi",name:"ปอบเจ้าที่",tier:"สายโจมตี",archetype:"HP Drain",fear:6,position:8,need:{green:3,blue:2,black:1},dice:{green:{op:"<=",value:9,label:"9-"},blue:{op:">=",value:6,label:"6+"},pink:{op:">=",value:7,label:"7+"},black:{op:">=",value:8,label:"8+"}},curseTrigger:{kind:"totalEquals",value:7,label:"ผลรวมเต๋า = 7"},curseText:"ผลรวมเต๋า = 7 → ผู้ทอย HP -1",counterText:{green:"พลาด: HP -1",blue:"พลาด: HP -2",pink:"พลาด: HP -2",black:"พลาด: HP -3"}},
{id:"ghost-pregnant",name:"ผีตายทั้งกลม",tier:"สายหมู่",archetype:"Splash Damage",fear:6,position:2,need:{green:2,blue:2,pink:2},dice:{green:{op:"<=",value:9,label:"9-"},blue:{op:">=",value:6,label:"6+"},pink:{op:">=",value:7,label:"7+"},black:{op:">=",value:8,label:"8+"}},curseTrigger:{kind:"dieIncludes",values:[6],label:"มีลูกเต๋าหน้า 6"},curseText:"มีลูกเต๋าหน้า 6 → ผู้ทอยและเพื่อนในห้องเดียวกัน HP -1",counterText:{green:"พลาด: ผู้ทำพิธี HP -1",blue:"พลาด: ทุกคนในห้อง HP -1",pink:"พลาด: ผู้ทำพิธี HP -2 • คนอื่นในห้อง HP -1",black:"พลาด: ทุกคนในห้อง HP -2"}},
{id:"ghost-oil-pillar",name:"เสาตกน้ำมัน",tier:"สายปั่นทาง",archetype:"Movement Disruption",fear:5,position:6,need:{green:2,blue:3,pink:1},dice:{green:{op:"<=",value:9,label:"9-"},blue:{op:">=",value:6,label:"6+"},pink:{op:">=",value:7,label:"7+"},black:{op:">=",value:8,label:"8+"}},curseTrigger:{kind:"doubles",label:"ลูกเต๋าออกเลขเหมือนกัน"},curseText:"เต๋าออกเลขเหมือนกัน → ถูกผลักไปห้องติดกันแบบสุ่ม",counterText:{green:"พลาด: ถูกผลักไปห้องติดกัน",blue:"พลาด: HP -1 • ถูกผลักไปห้องติดกัน",pink:"พลาด: HP -2 • ถูกผลักไปห้องติดกัน",black:"พลาด: HP -2 • ถูกผลักออกจาก Boss Room"}},
{id:"ghost-headless",name:"ผีหัวขาด",tier:"สายหลงทาง",archetype:"Position Shuffle",fear:6,position:1,need:{green:3,blue:1,pink:1,black:1},dice:{green:{op:"<=",value:9,label:"9-"},blue:{op:">=",value:6,label:"6+"},pink:{op:">=",value:7,label:"7+"},black:{op:">=",value:8,label:"8+"}},curseTrigger:{kind:"dieIncludes",values:[2],label:"มีลูกเต๋าหน้า 2"},curseText:"มีลูกเต๋าหน้า 2 → Curse +1",counterText:{green:"พลาด: ย้ายออกจาก Boss Room แบบสุ่ม",blue:"พลาด: HP -1 • ย้ายห้องแบบสุ่ม",pink:"พลาด: HP -2 • ย้ายห้องแบบสุ่ม",black:"พลาด: HP -2 • ถูกส่งไปอีกมุมของบ้าน"}},
{id:"ghost-widow",name:"ผีแม่หม้าย",tier:"สายโดดเดี่ยว",archetype:"Isolation",fear:5,position:3,need:{green:2,blue:2,pink:1,black:1},dice:{green:{op:"<=",value:9,label:"9-"},blue:{op:">=",value:6,label:"6+"},pink:{op:">=",value:7,label:"7+"},black:{op:">=",value:8,label:"8+"}},curseTrigger:{kind:"totalEquals",value:9,label:"ผลรวมเต๋า = 9"},curseText:"ผลรวมเต๋า = 9 → ถ้ามีหลายคนในห้องเดียวกัน ทุกคนในห้อง HP -1",counterText:{green:"พลาด: HP -1",blue:"พลาด: ถ้ามีเพื่อนในห้อง ทุกคน HP -1",pink:"พลาด: HP -2 • เพื่อนในห้อง HP -1",black:"พลาด: ทุกคนในห้อง HP -2"}},
{id:"ghost-kumarn",name:"กุมารทอง",tier:"สายขโมย",archetype:"Resource Thief",fear:5,position:5,need:{green:3,blue:2,pink:1},dice:{green:{op:"<=",value:9,label:"9-"},blue:{op:">=",value:6,label:"6+"},pink:{op:">=",value:7,label:"7+"},black:{op:">=",value:8,label:"8+"}},curseTrigger:{kind:"totalEquals",value:5,label:"ผลรวมเต๋า = 5"},curseText:"ผลรวมเต๋า = 5 → เงิน -1 • ถ้าไม่มีเงิน เสีย Amulet 1 ใบ",counterText:{green:"พลาด: เงิน -1",blue:"พลาด: เงิน -1 หรือเสีย Amulet 1 ใบ",pink:"พลาด: เงิน -2 หรือเสีย Amulet 1 ใบ",black:"พลาด: เงิน -2 • HP -1"}},
{id:"ghost-wanderer",name:"ผีเร่ร่อน",tier:"สายหลอกทาง",archetype:"Misdirection",fear:5,position:7,need:{green:2,blue:2,pink:2},dice:{green:{op:"<=",value:9,label:"9-"},blue:{op:">=",value:6,label:"6+"},pink:{op:">=",value:7,label:"7+"},black:{op:">=",value:8,label:"8+"}},curseTrigger:{kind:"totalEquals",value:6,label:"ผลรวมเต๋า = 6"},curseText:"ผลรวมเต๋า = 6 → ผู้ทอยถูกพาไปห้องติดกันแบบสุ่ม",counterText:{green:"พลาด: ย้ายไปห้องติดกัน",blue:"พลาด: HP -1 • ย้ายไปห้องติดกัน",pink:"พลาด: HP -1 • ย้ายไปห้องแบบสุ่ม",black:"พลาด: HP -2 • ย้ายไปห้องแบบสุ่ม"}}
];
const CURSE_EFFECTS={
  "ghost-occult-master":"ผู้เล่นที่ยังมีชีวิตทุกคน HP -1",
  "ghost-treasure-guard":"ผู้ทอยเสียเงิน 1 • ถ้าไม่มีเงิน HP -1",
  "ghost-pob-jaothi":"ผู้ทอย HP -1",
  "ghost-pregnant":"ผู้ทอยและเพื่อนในห้องเดียวกัน HP -1",
  "ghost-oil-pillar":"ผู้ทอยถูกผลักไปห้องติดกันแบบสุ่ม",
  "ghost-headless":"ผู้เล่นที่ยังมีชีวิตทุกคน HP -1",
  "ghost-widow":"ถ้าผู้ทอยอยู่กับคนอื่น ทุกคนในห้องนั้น HP -1",
  "ghost-kumarn":"ผู้ทอยเสียเงิน 1 • ถ้าไม่มีเงินเสีย Amulet 1 ใบ • ถ้าไม่มีทั้งสอง HP -1",
  "ghost-wanderer":"ผู้ทอยถูกพาไปห้องติดกันแบบสุ่ม"
};
for(const ghost of GHOSTS){
  ghost.curseEffectText=CURSE_EFFECTS[ghost.id];
  ghost.curseText=`${ghost.curseTrigger.label} → Curse +1 • 3/6 เตือน • 6/6: ${ghost.curseEffectText}`;
}

require('./lib/balance.cjs')(CHARS,GHOSTS,AMULETS);
// V1.8 artwork mapping from the authoritative Figma/PDF export.
ROOMS.forEach((c,i)=>{ c.art=artUrl(CARD_ART.room?.[i]); });
CHARS.forEach((c,i)=>{ c.art=artUrl(CARD_ART.character?.[i]); });
GHOSTS.forEach((c,i)=>{ c.art=artUrl(CARD_ART.ghost?.[i]); });
const BOSS_ART=artUrl(CARD_ART.room?.[12]);
const amuGroups={E:"equip",S:"spell",H:"help",M:"sanity",V:"event"};
const amuCounters={equip:0,spell:0,help:0,sanity:0,event:0};
AMULETS.forEach(c=>{
  const group=amuGroups[String(c.id||"")[0]];
  if(!group)return;
  c.art=artUrl(CARD_ART.amulet?.[group]?.[amuCounters[group]++]);
});
const sacCounters={green:0,blue:0,pink:0,black:0};
SACRIFICES.forEach(c=>{ c.art=artUrl(CARD_ART.sacrifice?.[c.color]?.[sacCounters[c.color]++]); });

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
    return { id:"BOSS", name:"เขตเซ่นสังเวย", type:"พิธีกรรม", fear:ghost.fear, boss:true, art:BOSS_ART, effectText:`ห้องของ ${ghost.name} • ใช้ทำพิธีปราบผี` };
  }
  return room.game?.rooms?.[i] || null;
}
function equipmentFear(player){
  return (player?.equip||[]).reduce((n,c)=>n+(Number(c.fear)||0),0);
}
function equipmentAttack(player){
  return (player?.equip||[]).reduce((n,c)=>n+(Number(c.attackMod)||0),0);
}
function equipmentAttackOptions(player){
  let values=new Set([0]);
  for(const c of (player?.equip||[])){
    const n=Math.max(0,Number(c.attackMod)||0); if(!n) continue;
    const next=new Set(); for(const base of values){next.add(base-n);next.add(base);next.add(base+n);} values=next;
  }
  return [...values].sort((a,b)=>a-b);
}
function equipmentDefense(player){
  return (player?.equip||[]).filter(c=>c.wardOnce).length;
}
function equipmentLifeSteal(player){
  return (player?.equip||[]).reduce((n,c)=>n+(Number(c.lifeSteal)||0),0);
}
function equipmentSummary(player){
  return {fear:equipmentFear(player),attack:equipmentAttack(player),defense:equipmentDefense(player),lifeSteal:equipmentLifeSteal(player)};
}
function returnAmuletToBottom(room,card,reason="ใช้การ์ดแล้ว"){
  if(!card||!room?.game)return;
  room.game.amuDiscard=room.game.amuDiscard||[];
  room.game.amuDiscard.push(card);
  addLog(room,`${card.name} → กองทิ้ง Amulet (${reason})`);
}
function drawAmuletFromDeck(room){
  const g=room?.game;if(!g)return null;
  if(!g.amuDeck.length && (g.amuDiscard||[]).length){
    g.amuDeck=shuffle(g.amuDiscard);g.amuDiscard=[];
    addLog(room,`กองจั่ว Amulet หมด → สับกองทิ้ง ${g.amuDeck.length} ใบเป็นกองใหม่`);
  }
  return g.amuDeck.shift()||null;
}
function canRecoverToHand(card){return !!card && card.type!=="event";}
function queueOfficeDiscardPick(room,p,{force=false}={}){
  const g=room?.game;if(!g||!p)return false;
  if(!force && roomAt(room,p.pos)?.effectId!=="event_pick_discard")return false;
  const options=(g.amuDiscard||[]).filter(canRecoverToHand).map(c=>({uid:c.uid,name:c.name,type:c.type,category:c.category,desc:c.desc||c.effect||"",art:c.art||null}));
  g.officePickAfterPending=null;
  if(!options.length){addLog(room,`ห้องทำงาน: ไม่มี Amulet ที่หยิบเข้ามือได้ (ไม่รวม Event)`);return false;}
  g.pendingRoomEffect={id:`office-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,type:"officePickDiscard",playerId:p.id,reason:"ห้องทำงาน: เลือก 1 ใบจากกองทิ้ง Amulet",options};
  addLog(room,`ห้องทำงาน → ${p.name} เลือก 1 ใบจากกองทิ้ง Amulet`);
  return true;
}
function maybeQueueDeferredOfficePick(room){
  const g=room?.game;if(!g||g.pendingRoomEffect||!g.officePickAfterPending)return false;
  const p=room.players.find(x=>x.id===g.officePickAfterPending);g.officePickAfterPending=null;
  if(!p||p.hp<=0)return false;
  return queueOfficeDiscardPick(room,p,{force:true});
}
function ghostDamage(room,player,amount,reason){
  amount=Math.max(0,Number(amount)||0);
  if(amount<=0)return 0;
  if((player?.guardGhost||0)>0){
    player.guardGhost--;
    addLog(room,`${player.name}: คาถากันผีป้องกัน ${reason} ได้`);
    if(player.socketId)io.to(player.socketId).emit("hpFx",{delta:0,hp:player.hp,maxHp:player.char?.hp||null,reason:`คาถากันผี • ${reason}`,blocked:true});
    return 0;
  }
  if((player?.guardAll||0)>0){
    player.guardAll--;
    addLog(room,`${player.name}: คาถาป้องกันผลลบป้องกัน ${reason} ได้`);
    if(player.socketId)io.to(player.socketId).emit("hpFx",{delta:0,hp:player.hp,maxHp:player.char?.hp||null,reason:`คาถาป้องกันผลลบ • ${reason}`,blocked:true});
    return 0;
  }
  const wardIndex=(player?.equip||[]).findIndex(c=>c.wardOnce);
  if(wardIndex>=0){
    const [ward]=player.equip.splice(wardIndex,1);
    returnAmuletToBottom(room,ward,"ป้องกันการโจมตีจากผีสำเร็จ");
    if(room.game?.stats)room.game.stats.equipmentBreaks++;
    addLog(room,`${player.name}: ${ward.name} ป้องกัน ${reason} ได้ทั้งหมด แล้วถูกทิ้ง`);
    if(player.socketId)io.to(player.socketId).emit("hpFx",{delta:0,hp:player.hp,maxHp:player.char?.hp||null,reason:`${ward.name} ป้องกันการโจมตีจากผี`,blocked:true});
    return 0;
  }
  changeHp(room,player,-amount,reason);
  return amount;
}
function addLog(room,text,extra={}){
  const g=room.game,actor=g?active(room):null;
  const players=(room.players||[]).map(p=>({id:p.id,name:p.name,hp:p.hp??null,score:p.score||0,pos:p.pos??null}));
  const changes=[];
  for(const p of players){const before=room._logPlayers?.find(x=>x.id===p.id);if(!before)continue;
    for(const [key,label] of [["hp","HP"],["score","เงิน"],["pos","ตำแหน่งห้อง"]]){
      if(before[key]!==p[key]&&before[key]!=null&&p[key]!=null)changes.push({player:p.name,field:label,before:key==="pos"?before[key]+1:before[key],after:key==="pos"?p[key]+1:p[key]});
    }
  }
  const cards=[...AMULETS,...SACRIFICES].filter(c=>c.name&&String(text).includes(c.name));
  const unique=[...new Map(cards.map(c=>[c.name,c])).values()].map(c=>({name:c.name,type:c.type||c.color,desc:c.desc||c.effect||"",condition:typeof c.condition==="object"?c.condition.label:c.condition||"",art:c.art||null}));
  room.log.push({id:`log-${room.logSeq=(room.logSeq||0)+1}`,at:Date.now(),text,
    details:{actor:actor?.name||null,room:actor?.pos!=null?roomAt(room,actor.pos)?.name:null,curse:g?.curse??null,changes,cards:unique,...extra}});
  room._logPlayers=players;
  if(room.log.length>120)room.log.shift();
}
function setHp(room,player,value,reason="HP เปลี่ยน"){
  if(!player||player.hp==null)return 0;
  const before=Number(player.hp)||0,max=Number(player.char?.hp)||Infinity;
  const after=Math.max(0,Math.min(max,Number(value)||0));
  player.hp=after;
  const delta=after-before;
  if(delta)addLog(room,`${player.name}: ${reason} → HP ${before} → ${after}`,{reason,affected:player.name});
  if(delta&&player.socketId)io.to(player.socketId).emit("hpFx",{delta,hp:after,maxHp:Number.isFinite(max)?max:null,reason});
  return delta;
}
function addSupport(room,actor,target,amount,reason){
  amount=Math.max(0,Math.floor(amount));
  if(!actor||!target||actor.id===target.id||!amount)return 0;
  actor.supportScore=(actor.supportScore||0)+amount;
  addLog(room,`${actor.name}: ช่วย ${target.name} → ซัพพอร์ต +${amount} • ${reason}`,{support:{actorId:actor.id,targetId:target.id,amount,reason}});
  return amount;
}
function healFriend(room,actor,target,amount,reason){
  if(target.hp<=0)return 0;
  const healed=changeHp(room,target,amount,reason);
  addSupport(room,actor,target,Math.max(0,healed),reason);return healed;
}
function reviveFriend(room,actor,target,hp,reason){
  if(target.hp>0)return;
  revivePlayer(room,target,hp,reason);
  const round=Math.floor((room.game.stats?.turns||1)-1)/Math.max(1,room.players.length)|0;
  const key=target.id+':'+round;
  room.game.supportRevives=room.game.supportRevives||{};
  if(!room.game.supportRevives[key]){room.game.supportRevives[key]=true;addSupport(room,actor,target,3,reason);}
}
function changeHp(room,player,delta,reason){
  delta=Number(delta)||0;
  if(delta<0 && (player?.guardAll||0)>0 && !/ค่าพลังสกิล|ค่าใช้สกิล/.test(String(reason||""))){
    player.guardAll--;
    addLog(room,`${player.name}: คาถาป้องกันผลลบ → ยกเลิก ${reason}`);
    if(player.socketId)io.to(player.socketId).emit("hpFx",{delta:0,hp:player.hp,maxHp:player.char?.hp||null,reason:`คาถาป้องกันผลลบ • ${reason}`,blocked:true});
    return 0;
  }
  return setHp(room,player,(Number(player?.hp)||0)+delta,reason);
}
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
  g.lastDiceEvent={seq:g.diceSeq,at:Date.now(),matchId:room.accountMatchId,roomCode:room.code,a:d.a,b:d.b,total:d.total,kind,playerId:p.id,playerName:p.name};
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
      category:card.category||null,
      condition:card.condition||null,
      effect:card.effect||null,
      color:card.color||null,
      desc:card.desc||null,
      sanityBonus:card.sanityBonus??null,
      attackMod:card.attackMod??null,
      defense:card.defense??null,
      fear:card.fear??null,
      lifeSteal:card.lifeSteal??null,
      boss:card.boss??null,
      end:card.end??null,
      art:card.art||null
    }
  });
}
function publicSnapshot(room){
  const g=room.game;
  return {
    code:room.code,
    serverNow:Date.now(),
    phase:room.phase,
    hostId:room.hostId,
    settings:{...room.settings},
    characters:CHARS.map(c=>({key:c.key,name:c.name,role:c.role,hp:c.hp,slots:c.slots,skill:c.skill,skillType:c.skillType,art:c.art||null})),
    ghosts:GHOSTS.map(g=>({id:g.id,name:g.name,tier:g.tier,archetype:g.archetype,fear:g.fear,position:g.position,need:g.need,dice:g.dice,art:g.art||null,curseText:g.curseText,counterText:g.counterText})),
    ghostSelection:room.ghostSelection||null,
    players:room.players.map((p,i)=>({
      id:p.id,
      name:p.name,
      seat:p.seat || i+1,
      characterKey:p.characterKey || null,
      characterConfirmed:!!p.characterConfirmed,
      ready:!!p.ready,
      connected:!!p.socketId,
      char:p.char || null,
      hp:p.hp ?? null,
      supportScore:p.supportScore||0,
      score:p.score || 0,
      pos:p.pos ?? null,
      dead:(p.hp??1)<=0,
      amuCount:p.amu?.length || 0,
      sacCount:p.sac?.length || 0,
      equip:p.equip?.map(c=>({uid:c.uid,name:c.name,type:c.type,desc:c.desc,art:c.art||null,fear:c.fear||0,attackMod:c.attackMod||0,defense:c.defense||0,lifeSteal:c.lifeSteal||0,wardOnce:!!c.wardOnce,breakOnAttackFail:!!c.breakOnAttackFail})) || [],
      equipStats:equipmentSummary(p),
      isTurn:g ? i===g.turn : false
    })),
    game:g ? {
      matchId:room.accountMatchId,startedAt:g.startedAt,turnStartedAt:g.turnStartedAt,round:g.round||1,
      amuletDiscard:(g.amuDiscard||[]).map(c=>({...c})),
      turn:g.turn,
      bossIndex:g.bossIndex,
      bossArt:BOSS_ART,
      bossName:"เขตเซ่นสังเวย",
      rooms:g.rooms,
      actions:g.actions,
      sanity:g.sanity,
      lastDice:g.lastDice,
      rolled:g.rolled,
      moved:g.moved,
      mustMove:g.mustMove,
      legal:g.legal,
      lastMove:g.lastMove||null,
      movementPreview:g.sanityDecision&&active(room)?movementOptions(room,active(room)):{legal:[],distances:{},range:0},
      sacDrawn:g.sacDrawn,
      traded:g.traded,
      escapeRequired:g.escapeRequired,
      moveOptional:!!g.moveOptional,
      escapeRule:g.escapeRule || null,
      escapeAttempts:g.escapeAttempts || 0,
      curse:g.curse,
      curseResolving:!!g.curseResolving,
      curseResolveAt:g.curseResolveAt||null,
      bossDone:g.bossDone,
      ghost:g.ghost,
      pendingRoomEffect:g.pendingRoomEffect || null,
      sanityBase:g.sanityBase??null,
      sanityBonus:g.sanityBonus||0,
      sanityDecision:!!g.sanityDecision,
      moveFear:g.moveFear??null,
      movementRange:g.movementRange||0,
      moveDistances:g.moveDistances||{},
      pendingRitual:g.pendingRitual||null,
      diceSeq:g.diceSeq||0,
      lastDiceEvent:g.lastDiceEvent||null,
      deckCounts:{amuletDraw:g.amuDeck?.length||0,amuletDiscard:g.amuDiscard?.length||0,sacrificeDraw:g.sacDeck?.length||0},
      amuDeckCount:g.amuDeck?.length||0,
      amuDiscardCount:g.amuDiscard?.length||0,
      sacDeckCount:g.sacDeck?.length||0,
      sacDiscardCount:g.sacDiscard?.length||0,
      stats:g.stats||null
    } : null,
    log:room.log.slice(-120),
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
    catHelp:room.game?.catHelp?.playerId===p.id?room.game.catHelp:null,
    sessionToken:p.token,
    amu:p.amu || [],
    sac:p.sac || [],
    equip:p.equip || [],
    score:p.score || 0,
    hp:p.hp ?? null,
    char:p.char || null,
    characterPreviewKey:p.characterPreviewKey || null,
    characterConfirmed:!!p.characterConfirmed,
    ready:!!p.ready
  };
}
function shouldAutoEndTurn(room){
  if(room.phase!=="game"||!room.game)return false;
  const g=room.game;if(g.actions>0)return false;
  if(g.catHelp||g.curseDiscardQueue?.length||g.curseResolving||g.pendingRitual||g.pendingRoomEffect||g.sanityDecision||g.mustMove||g.moveOptional||room.trade)return false;
  return !!active(room);
}
function maybeAutoEndTurn(room){
  if(!shouldAutoEndTurn(room))return false;
  const p=active(room);
  addLog(room,`${p.name} ใช้ธูปครบ 3 ดอก → TURN END อัตโนมัติ`);
  advanceToNextAlive(room);
  return true;
}
function emitRoom(room){
  nextCurseDiscard(room);
  maybeAutoEndTurn(room);
  room.updatedAt=Date.now();
  io.to(room.code).emit("state", publicSnapshot(room));
  room.players.forEach(p=>{
    if(p.socketId) io.to(p.socketId).emit("privateState", privateSnapshot(room,p.socketId));
  });
}
function fail(socket,msg){ socket.emit("errorMessage", msg); }

function moveByGhost(room,p,{anywhere=false,reason="พลังผี"}={}){if(!room?.game||!p||p.hp<=0)return false;let choices=anywhere?room.game.rooms.map((_,i)=>i).filter(i=>i!==p.pos&&i!==room.game.bossIndex&&canEnter(room,p,i)):neighbors(p.pos).filter(i=>i!==room.game.bossIndex&&canEnter(room,p,i));if(!choices.length)return false;const dest=choices[Math.floor(Math.random()*choices.length)];p.pos=dest;bumpRoomVisit(room,dest);addLog(room,`${p.name}: ${reason} → ถูกย้ายไป ${roomAt(room,dest).name}`);return true;}
function ghostMoneyLoss(room,p,amount,reason){amount=Math.max(1,Number(amount)||1);if((p.score||0)>0){const before=p.score;p.score=Math.max(0,p.score-amount);addLog(room,`${p.name}: ${reason} → เงิน -${before-p.score}`);return true;}ghostDamage(room,p,1,`${reason} • ไม่มีเงิน`);return false;}
function ghostStealAmulet(room,p,reason){if(!p.amu?.length){ghostDamage(room,p,1,`${reason} • ไม่มี Amulet`);return false;}const idx=Math.floor(Math.random()*p.amu.length),card=p.amu.splice(idx,1)[0];returnAmuletToBottom(room,card,reason);return true;}
function curseTriggered(rule,d){if(!rule)return false;if(rule.kind==="sumGE")return d.total>=rule.value;if(rule.kind==="sumLE")return d.total<=rule.value;if(rule.kind==="totalEquals")return d.total===rule.value;if(rule.kind==="dieIncludes")return (rule.values||[]).includes(d.a)||(rule.values||[]).includes(d.b);if(rule.kind==="doubles")return d.a===d.b;return false;}
function addCurseProgress(room,amount=1,source="พลังผี"){
  const g=room?.game;if(!g||g.curseResolving)return false;
  const before=Math.max(0,Number(g.curse)||0),add=Math.max(0,Number(amount)||0);
  g.curse=Math.min(6,before+add);
  if(g.stats?.curse){
    g.stats.curse.stacks=Math.max(Number(g.stats.curse.stacks)||0,g.curse);
    g.stats.curse.maxSeen=Math.max(Number(g.stats.curse.maxSeen)||0,g.curse);
  }
  if(before<3 && g.curse>=3 && !g.curseWarned){
    g.curseWarned=true;
    io.to(room.code).emit("curseFx",{phase:"warning",curse:g.curse,max:6,ghostName:currentGhost(room).name,duration:2500});
    addLog(room,`⚠️ ${currentGhost(room).name} สะสม Curse ถึง ${g.curse}/6 — คำสาปกำลังใกล้เต็ม`);
  }
  if(g.curse>=6){
    g.curse=6;g.curseResolving=true;g.curseResolveAt=Date.now()+2700;
    io.to(room.code).emit("curseFx",{phase:"burst",curse:6,max:6,ghostName:currentGhost(room).name,duration:2700,resolveAt:g.curseResolveAt});
    addLog(room,`☠️ ${currentGhost(room).name} สะสม Curse ครบ 6/6 — กำลังปล่อยคำสาป`);
    emitRoom(room);
    const roomCode=room.code,curseGhost=currentGhost(room),targetId=active(room)?.id;
    setTimeout(()=>{
      const latest=rooms.get(roomCode);if(latest?.game!==g||!g.curseResolving)return;
      const activeId=active(latest)?.id||null;
      if(latest.game.stats?.curse)latest.game.stats.curse.bursts++;
      const target=latest.players.find(x=>x.id===targetId),oldPos=target?.pos;
      resolveGhostCurse(latest,curseGhost,target);
      if(target&&target.pos!==oldPos&&active(latest)?.id===target.id){
        g.mustMove=false;g.moveOptional=false;g.legal=[];g.moved=true;g.sanityDecision=false;
      }
      latest.game.curse=0;latest.game.curseWarned=false;latest.game.curseResolving=false;latest.game.curseResolveAt=null;
      addLog(latest,`${curseGhost.name} Curse ทำงาน → ${curseGhost.curseEffectText} • รีเซ็ต 0/6`);
      if(activeId)resolveDeathsAfterAction(latest,activeId);else markNewDeaths(latest);
      emitRoom(latest);
    },2700);
    return true;
  }
  return false;
}
function applyCurse(room,dice){
  const ghost=currentGhost(room);
  if(!active(room)||!curseTriggered(ghost.curseTrigger,dice))return;
  addCurseProgress(room,1,`${ghost.name} Curse`);
}
function queueCurseDiscard(room,p,count,reason){
  count=Math.min(p.amu.length,Math.max(0,count));if(!count)return;
  (room.game.curseDiscardQueue||=[]).push({playerId:p.id,count,reason});
}
function nextCurseDiscard(room){
  const g=room.game;if(!g||g.pendingRoomEffect||g.curseResolving)return;
  while(g.curseDiscardQueue?.length){
    const next=g.curseDiscardQueue.shift(),p=room.players.find(x=>x.id===next.playerId);
    if(!p||!p.amu.length)continue;
    g.pendingRoomEffect={...next,id:'curse-discard-'+randomUUID(),type:'discardAmuletOverflow',count:Math.min(next.count,p.amu.length),options:p.amu.map(c=>({...c}))};break;
  }
}
function resolveGhostCurse(room,ghost,p){
  const reason=ghost.name+' Curse 6/6',targets=room.players.filter(x=>x.hp>0);
  for(const x of targets){
    ghostDamage(room,x,ghost.id==='ghost-pregnant'?3:2,reason);
    if(ghost.id==='ghost-treasure-guard')ghostMoneyLoss(room,x,1,reason);
    if(ghost.id==='ghost-pob-jaothi'&&x.sac.length){const c=x.sac.splice(Math.floor(Math.random()*x.sac.length),1)[0];room.game.sacDiscard.push(c);}
    if(ghost.id==='ghost-headless'&&x.equip.length){const c=x.equip.splice(Math.floor(Math.random()*x.equip.length),1)[0];returnAmuletToBottom(room,c,reason);}
    if(['ghost-occult-master','ghost-widow'].includes(ghost.id))queueCurseDiscard(room,x,2,reason);
    if(ghost.id==='ghost-wanderer')queueCurseDiscard(room,x,Math.max(0,x.amu.length-2),reason);
    if(ghost.id==='ghost-kumarn'){queueCurseDiscard(room,x,1,reason);x.score=(x.score||0)+3;}
    if(ghost.id==='ghost-oil-pillar')moveByGhost(room,x,{reason});
  }
  if(ghost.id==='ghost-pregnant'){
    const living=targets.filter(x=>x.hp>0),chosen=living[Math.floor(Math.random()*living.length)];
    if(chosen){for(const x of living){x.pos=chosen.pos;bumpRoomVisit(room,x.pos)}addLog(room,reason+' → รวมตัวที่ '+chosen.name);}
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
function canTakeTurn(p){return !!p && (p.hp>0 || (p.hp<=0 && p.char?.skillType==="self_revive"&&!p.selfReviveUsed));}
function checkDefeat(room){
  if(room.phase!=="game") return false;
  if(room.players.length && room.players.every(p=>!canTakeTurn(p))){
    room.phase="defeat";
    finishStats(room);
    room.result={
      defeat:true,
      rows:room.players.map(p=>({
        id:p.id,name:p.name,char:p.char?.name||"",ritual:p.score||0,
        hand:(p.sac||[]).reduce((n,c)=>n+(Number(c.end)||0),0),
        support:p.supportScore||0,total:(p.supportScore||0)+(p.score||0)+(p.sac||[]).reduce((n,c)=>n+(Number(c.end)||0),0),
        winner:false
      }))
    };
    saveAccountResult(room);
    addLog(room,"ผู้เล่นทุกคนเสียชีวิต → จบเกมแบบพ่ายแพ้");
    return true;
  }
  return false;
}
function nextAliveIndex(room, fromIndex){
  const n=room.players.length;
  for(let step=1;step<=n;step++){
    const idx=(fromIndex+step)%n;
    if(canTakeTurn(room.players[idx])) return idx;
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
  if(r.effectId==="storage"){
    if(card.group==="อาหารเซ่นผี"){changeHp(room,player,1,"ห้องเก็บของ: อาหารเซ่นผี");addLog(room,`${player.name}: ห้องเก็บของ + อาหารเซ่นผี → HP +1`);}
    if(card.color==="pink") queueSacrificeDiscard(room,player,2,"จั่วสิ่งปลุกเสกในห้องเก็บของ");
  }
  if(r.effectId==="bedroom"){
    if(card.group==="ดอกไม้ธูปเทียน") drawExtraSacrifices(room,player,1,"ดอกไม้ธูปเทียนในห้องนอน");
    if(card.group==="อาหารเซ่นผี"){changeHp(room,player,-1,"ห้องนอน: อาหารเซ่นผี");addLog(room,`${player.name}: ห้องนอน + อาหารเซ่นผี → HP -1`);}
  }
}
function movementOptions(room,p){
  const g=room.game,range=Math.max(0,Math.floor(Number(g.movementRange??g.lastDice?.total)||0));
  const seen=new Set([p.pos]),queue=[{index:p.pos,distance:0}],legal=[],distances={},paths={[p.pos]:[p.pos]};
  for(let n=0;n<queue.length;n++){
    const {index,distance}=queue[n];if(distance>=range)continue;
    if(index!==p.pos&&(index===g.bossIndex||["คำสาป","กับดัก"].includes(roomAt(room,index)?.type)))continue;
    for(const next of neighbors(index)){
      if(seen.has(next)||roomAt(room,next).fear>g.sanity||!canEnter(room,p,next))continue;
      seen.add(next);legal.push(next);distances[next]=distance+1;paths[next]=[...paths[index],next];queue.push({index:next,distance:distance+1});
    }
  }
  return {legal,distances,range,paths};
}
function finalizeMovementOptions(room,p){
  const g=room.game,options=movementOptions(room,p);
  g.sanityDecision=false;g.legal=options.legal;g.moveDistances=options.distances;g.movementRange=options.range;
  g.mustMove=false;g.moveOptional=false;
  if(g.legal.length){if(room.settings.forcedMovement)g.mustMove=true;else g.moveOptional=true;}
  else g.moved=true;
}
function seatNeighbor(room,p,direction){
  const sorted=[...room.players].sort((a,b)=>(a.seat||0)-(b.seat||0));
  const idx=sorted.findIndex(x=>x.id===p.id);
  if(idx<0||sorted.length<2)return null;
  const step=direction==="left"?-1:1;
  return sorted[(idx+step+sorted.length)%sorted.length];
}
function randomRoomByType(room,type,p){
  const choices=(room.game?.rooms||[]).map((r,i)=>({r,i})).filter(x=>x.i!==room.game.bossIndex&&x.r?.type===type&&canEnter(room,p,x.i));
  return choices.length?choices[Math.floor(Math.random()*choices.length)].i:null;
}
function reactionSpellOptions(room,p,source="all"){
  if(!room?.game||!p||active(room)?.id!==p.id||room.game.actions<1)return [];
  return (p.amu||[]).filter(c=>c.type==="spell" && (c.spellEffect==="protect_all" || (source==="ghost"&&c.spellEffect==="protect_ghost")));
}
function offerNegativeReaction(room,p,{source="all",reason="ผลลบ",apply=null,supportTargets=[]}={}){
  const g=room?.game;if(!g||!p||g.pendingRoomEffect)return false;
  const options=reactionSpellOptions(room,p,source);if(!options.length)return false;
  const id=`react-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  room._negativeReaction={id,playerId:p.id,apply:typeof apply==="function"?apply:null,supportTargets};
  g.pendingRoomEffect={
    id,type:"negativeReaction",playerId:p.id,source,reason,
    options:options.map(c=>({uid:c.uid,name:c.name,condition:c.condition,effect:c.effect||c.desc||"",spellEffect:c.spellEffect,art:c.art||null}))
  };
  addLog(room,`${p.name} กำลังเจอผลลบ: ${reason} → มีคาถาป้องกันให้เลือกใช้`);
  return true;
}
function finishNegativeReaction(room,p,{blocked=false}={}){
  const pending=room.game?.pendingRoomEffect,stored=room._negativeReaction;
  if(!pending||pending.type!=="negativeReaction"||!stored||stored.id!==pending.id)return false;
  const apply=stored.apply;
  room._negativeReaction=null;
  room.game.pendingRoomEffect=null;
  if(!blocked && apply)apply();
  if(blocked)for(const item of stored.supportTargets||[]){
    const target=room.players.find(x=>x.id===item.id);
    if(target&&target.hp>0)addSupport(room,p,target,Math.min(target.hp,item.amount),'ป้องกัน '+pending.reason);
  }
  if(!blocked)resolveDeathsAfterAction(room,p.id);
  return true;
}
function applyEventCard(room,p,c,{skipProtection=false}={}){
  const g=room.game,id=c.eventId;
  const negativeIds=new Set(["to_trap","left_hp2","break_equip","skip_turn","to_curse","right_and_self_hp2"]);
  if(!skipProtection && negativeIds.has(id)){
    const friend=id==='left_hp2'?seatNeighbor(room,p,'left'):id==='right_and_self_hp2'?seatNeighbor(room,p,'right'):null;
    const supportTargets=friend&&friend.id!==p.id&&friend.hp>0&&!friend.guardAll?[{id:friend.id,amount:2}]:[];
    const queued=offerNegativeReaction(room,p,{source:"all",reason:`Event ${c.name}`,supportTargets,apply:()=>applyEventCard(room,p,c,{skipProtection:true})});
    if(queued)return true;
  }
  if(id==="to_trap"){
    const dest=randomRoomByType(room,"กับดัก",p);if(dest!==null){p.pos=dest;bumpRoomVisit(room,dest);addLog(room,`${p.name}: ${c.name} → วิ่งไป ${roomAt(room,dest).name}`);}
  }else if(id==="left_hp2"){
    changeHp(room,p,-2,`Event: ${c.name}`);const left=seatNeighbor(room,p,"left");if(left&&left.id!==p.id)changeHp(room,left,-2,`Event: ${c.name}`);
  }else if(id==="break_equip"){
    if(p.equip.length===1){const broken=p.equip.shift();returnAmuletToBottom(room,broken,`Event ${c.name}`);addLog(room,`${p.name} อุปกรณ์หลุด/แตก: ${broken.name}`);}
    else if(p.equip.length>1){g.pendingRoomEffect={id:`event-equip-${Date.now()}`,type:"chooseBrokenEquip",playerId:p.id,reason:`Event: ${c.name}`,options:p.equip.map(x=>({uid:x.uid,name:x.name,desc:x.desc,art:x.art||null}))};}
  }else if(id==="skip_turn"){
    g.actions=0;g.mustMove=false;g.moveOptional=false;g.sanityDecision=false;g.catHelp=null;addLog(room,`${p.name}: ${c.name} → จบเทิร์นปัจจุบัน`);
  }else if(id==="to_curse"){
    const dest=randomRoomByType(room,"คำสาป",p);if(dest!==null){p.pos=dest;bumpRoomVisit(room,dest);addLog(room,`${p.name}: ${c.name} → ไป ${roomAt(room,dest).name}`);}
  }else if(id==="right_and_self_hp2"){
    changeHp(room,p,-2,`Event: ${c.name}`);const right=seatNeighbor(room,p,"right");if(right&&right.id!==p.id)changeHp(room,right,-2,`Event: ${c.name}`);
  }else if(id==="next_player_roll_money"){
    const roller=seatNeighbor(room,p,"right")||p;g.pendingRoomEffect={id:`event-money-roll-${Date.now()}`,type:"eventRollMoney",playerId:roller.id,beneficiaryId:p.id,reason:`${c.name}: ${roller.name} กดทอยเต๋า แล้ว ${p.name} รับเงินเท่าผลรวม`};addLog(room,`${c.name} → รอ ${roller.name} กดทอยเพื่อให้ ${p.name} รับเงิน`);
  }else if(id==="room_money5"){
    const targets=room.players.filter(x=>x.hp>0&&x.pos===p.pos);targets.forEach(x=>x.score=(x.score||0)+5);addLog(room,`${c.name} → คนในห้อง ${targets.map(x=>x.name).join(", ")} ได้เงินคนละ 5`);
  }else if(id==="ritual_heal_all"){
    room.players.filter(x=>x.hp>0).forEach(x=>changeHp(room,x,2,c.name));addLog(room,`${c.name} → ผู้เล่นที่ยังมีชีวิตทุกคน HP +2 ทันที`);
  }else if(id==="free_curse_move"){
    const rr=roomAt(room,p.pos);
    if(rr?.type!=="คำสาป"){
      addLog(room,`${p.name}: ${c.name} → ตอนนี้ไม่ได้อยู่ห้องคำสาป จึงไม่มีผล`);
    }else{
      const options=neighbors(p.pos).filter(i=>canEnter(room,p,i)).map(i=>({index:i,name:roomAt(room,i).name,fear:roomAt(room,i).fear}));
      g.escapeRequired=false;g.escapeRule=null;p.freeSpecialExit=false;
      if(options.length){
        g.pendingRoomEffect={id:`event-curse-exit-${Date.now()}`,type:"eventFreeCurseMove",playerId:p.id,reason:`${c.name}: หลุดจากห้องคำสาปทันที • เลือกเดินออก 1 ช่อง`,options};
        addLog(room,`${p.name}: ${c.name} → หลุดจากห้องคำสาป และต้องเลือกเดินออก 1 ช่อง`);
      }else addLog(room,`${p.name}: ${c.name} → หลุดจากคำสาป แต่ไม่มีห้องข้างเคียงที่เข้าได้`);
    }
  }else if(id==="noop"){
    addLog(room,`${p.name}: ${c.name} → ไร้ประโยชน์จริง ๆ ไม่มี Effect`);
  }else if(id==="revive_any"){
    const dead=room.players.filter(x=>x.hp<=0);if(dead.length){g.pendingRoomEffect={id:`event-revive-${Date.now()}`,type:"eventReviveAny",playerId:p.id,reason:`${c.name}: เลือกชุบชีวิต 1 คนที่ HP 1`,options:dead.map(x=>({id:x.id,name:x.name,char:x.char?.name||""}))};}else addLog(room,`${c.name} → ไม่มีผู้เล่นที่เสียชีวิต`);
  }
  return false;
}
function diceConditionOk(cond,d){
  if(!cond)return true;
  if(cond.op===">=")return d.total>=cond.value;
  if(cond.op==="<=")return d.total<=cond.value;
  if(cond.op===">" )return d.total>cond.value;
  if(cond.op==="<" )return d.total<cond.value;
  return true;
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
function damagePlayersInRoom(room,pos,exceptId,amount,reason="โดนผลกระทบในห้องเดียวกัน",ghostAttack=false){
  room.players.forEach(x=>{
    if(x.id!==exceptId && x.hp>0 && x.pos===pos){
      if(ghostAttack) ghostDamage(room,x,amount,reason); else changeHp(room,x,-amount,reason);
    }
  });
}
function applyGhostCounter(room,p,color,skipProtection=false){
  const ghost=currentGhost(room);
  const splash=['ghost-pregnant','ghost-widow'].includes(ghost.id)&&color!=='green'?(color==='black'?2:1):0;
  const supportTargets=room.players.filter(x=>x.id!==p.id&&x.hp>0&&x.pos===p.pos&&!x.guardAll&&!x.guardGhost&&!x.equip.some(c=>c.wardOnce)).map(x=>({id:x.id,amount:splash}));
  if(!skipProtection&&offerNegativeReaction(room,p,{source:"ghost",reason:`${ghost.name} สวนกลับ (${color})`,supportTargets,apply:()=>applyGhostCounter(room,p,color,true)}))return true;
  const pos=p.pos,hit=(n,r)=>ghostDamage(room,p,n,r),others=(n,r)=>damagePlayersInRoom(room,pos,p.id,n,r,true);
  if(ghost.id==="ghost-occult-master"){hit(color==="green"?1:2,`${ghost.name} สวนกลับ`);if(color!=="green")addCurseProgress(room,color==="black"?2:1,`${ghost.name} สวนกลับ`);}
  else if(ghost.id==="ghost-treasure-guard"){const cost=color==="black"?3:color==="pink"?2:1;if(p.score>0)ghostMoneyLoss(room,p,cost,ghost.name+" สวนกลับ");else ghostDamage(room,p,cost,ghost.name+" ไม่มีเงิน");}
  else if(ghost.id==="ghost-pob-jaothi"){hit(color==="green"?1:color==="black"?3:2,ghost.name+" สวนกลับ");if(color==="black")queueCurseDiscard(room,p,1,ghost.name+" สวนกลับ");}
  else if(ghost.id==="ghost-pregnant"){hit(color==="green"?1:2,`${ghost.name} สวนกลับ`);if(color!=="green")others(color==="black"?2:1,`${ghost.name} สวนกลับ`);}
  else if(ghost.id==="ghost-oil-pillar"){if(color!=="green")hit(color==="blue"?1:2,`${ghost.name} สวนกลับ`);moveByGhost(room,p,{reason:`${ghost.name} ผลักออกจากพิธี`});}
  else if(ghost.id==="ghost-headless"){if(color!=="green")hit(color==="blue"?1:2,`${ghost.name} สวนกลับ`);moveByGhost(room,p,{anywhere:true,reason:`${ghost.name} ทำให้หลงทาง`});}
  else if(ghost.id==="ghost-widow"){hit(color==="green"?1:2,`${ghost.name} สวนกลับ`);if(color!=="green")others(color==="black"?2:1,`${ghost.name} ลงโทษคนที่อยู่รวมกัน`);}
  else if(ghost.id==="ghost-kumarn"){if(color==="black"){ghostMoneyLoss(room,p,2,`${ghost.name} ขโมย`);hit(1,`${ghost.name} สวนกลับ`);}else if((p.score||0)>0)ghostMoneyLoss(room,p,color==="pink"?2:1,`${ghost.name} ขโมย`);else ghostStealAmulet(room,p,`${ghost.name} ขโมย`);}
  else if(ghost.id==="ghost-wanderer"){if(color!=="green")hit(color==="black"?2:1,`${ghost.name} สวนกลับ`);moveByGhost(room,p,{anywhere:color==="pink"||color==="black",reason:`${ghost.name} พาหลงทาง`});}
}

function computeResults(room){
  finishStats(room);
  const rows=room.players.map(p=>({
    id:p.id,name:p.name,char:p.char?.name||"",ritual:p.score,
    hand:p.sac.reduce((n,c)=>n+(Number(c.end)||0),0),
    support:p.supportScore||0,total:(p.supportScore||0)+p.score+p.sac.reduce((n,c)=>n+(Number(c.end)||0),0)
  })).sort((a,b)=>b.total-a.total);
  const best=rows[0]?.total ?? 0;
  room.result={
    ghost:currentGhost(room).name,
    stats:room.game?.stats||null,
    rows:rows.map(x=>({...x,winner:x.total===best}))
  };
  saveAccountResult(room);
}

function beginTurn(room){
  if(checkDefeat(room)) return;
  const g=room.game;
  let p=active(room);

  if(p.hp<=0 && (p.char?.skillType!=="self_revive"||p.selfReviveUsed)){
    markNewDeaths(room);
    const next=nextAliveIndex(room,g.turn);
    if(next===null){ checkDefeat(room); return; }
    g.turn=next;
    p=active(room);
  }

  // Consume each eligible seat once per round, including skipped turns.
  g.roundPending=(g.roundPending||room.players.filter(canTakeTurn).map(x=>x.id)).filter(id=>room.players.some(x=>x.id===id&&canTakeTurn(x)));
  if(!g.roundPending.length){g.round=(g.round||1)+1;g.roundPending=room.players.filter(canTakeTurn).map(x=>x.id)}
  g.roundPending=g.roundPending.filter(id=>id!==p.id);g.turnStartedAt=Date.now();
  if((p.skipTurns||0)>0){
    p.skipTurns--;
    addLog(room,`${p.name} ข้ามเทิร์นจาก Event • เหลือ ${p.skipTurns} เทิร์น`);
    const next=nextAliveIndex(room,g.turn);
    if(next!==null){g.turn=next;return beginTurn(room);}
    return;
  }

  if(g.stats) g.stats.turns++;
  g.movementRange=0;g.moveDistances={};
  g.catHelp=null;g.actions=3; g.sanity=null; g.sanityBase=null; g.sanityBonus=0; g.sanityDecision=false; g.moveFear=null; g.lastDice=null; g.rolled=false; g.moved=false;
  g.mustMove=false; g.moveOptional=false; g.legal=[]; g.sacDrawn=false; g.traded=false; g.pendingRitual=null;
  g.escapeRequired=false; g.escapeRule=null; g.escapeAttempts=0;

  if(p.hp<=0 && p.char?.skillType==="self_revive"){
    g.rolled=true;g.moved=true;
    addLog(room,`${p.name} ถึงเทิร์นขณะ HP 0 → สามารถใช้สกิลฟื้น HP 2 ได้`);
    return;
  }

  const r=roomAt(room,p.pos);
  const skipSpecialStart=!!p.skipSpecialStartEffect;
  p.skipSpecialStartEffect=false;
  if(r?.effectId==="trap_hp1" && !skipSpecialStart){
    changeHp(room,p,-1,`เริ่มเทิร์นใน ${r.name}`);
    addLog(room,`${p.name} เริ่มเทิร์นใน ${r.name} → HP -1`);
  }
  if(r?.effectId==="curse_discard" && p.hp>0 && !skipSpecialStart){
    queueSacrificeDiscard(room,p,1,`ต้นเทิร์นใน ${r.name}`);
  }
  if(r?.escapeRule && p.hp>0){
    if(p.freeSpecialExit || skipSpecialStart){
      p.freeSpecialExit=false;
      addLog(room,`${p.name} ใช้สิทธิ์หลุดพ้นฟรีจาก ${r.name} → ไม่เสียผลต้นเทิร์นและไม่ต้องทอยหนี`);
    }else{
      g.escapeRequired=true;
      g.escapeRule=r.escapeRule;
      addLog(room,`${p.name} ติดอยู่ใน ${r.name} → ต้องใช้ 1 ธูปต่อครั้งเพื่อหนี (${r.escapeRule.label})`);
    }
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

function startRoom(room,chosenGhost=null){
  room.accountMatchId=randomUUID();room.accountResultQueued=false;
  const map=shuffle(ROOMS).slice(0,9);
  const ghost=chosenGhost||shuffle(GHOSTS)[0];
  const bossIndex=ghost.position;

  room.players.forEach(p=>{p.char=CHARS.find(c=>c.key===p.characterKey)||null;});

  const allAmu=AMULETS.map(uidCard);
  const amuEvents=allAmu.filter(x=>x.type==="event");
  const amuNonEvents=shuffle(allAmu.filter(x=>x.type!=="event"));
  room.players.forEach((p,i)=>{
    p.hp=p.char.hp;
    p.deadAnnounced=false;
    p.score=0;
    p.supportScore=0;p.selfReviveUsed=false;p.skipTurns=0;p.guardAll=0;p.guardGhost=0;p.freeSpecialExit=false;p.skipSpecialStartEffect=false;
    p.pos=bossIndex;
    p.equip=[];
    p.sac=[];
    p.amu=[];
    for(let n=0;n<3;n++){const c=amuNonEvents.shift();if(c)p.amu.push(c);}
  });
  const starterIndex=room.players.reduce((best,p,i,arr)=>{if(i===0)return 0;return (p.char?.hp||0)>(arr[best].char?.hp||0)?i:best;},0);

  room.game={
    startedAt:Date.now(),turnStartedAt:Date.now(),round:1,roundPending:room.players.filter(canTakeTurn).map(p=>p.id),
    turn:starterIndex, rooms:map, bossIndex, actions:3, sanity:null,sanityBase:null,sanityBonus:0,sanityDecision:false,moveFear:null,lastDice:null,
    rolled:false,moved:false,mustMove:false,moveOptional:false,legal:[],sacDrawn:false,traded:false,
    curse:0,curseWarned:false,curseResolving:false,curseResolveAt:null,bossDone:{green:0,blue:0,pink:0,black:0}, pendingRoomEffect:null,pendingRitual:null,
    ghost, escapeRequired:false, escapeRule:null, escapeAttempts:0,
    diceSeq:0,lastDiceEvent:null,cardSeq:0,stats:freshStats(room.settings),
    amuDeck:shuffle([...amuNonEvents,...amuEvents]), amuDiscard:[], officePickAfterPending:null,
    sacDeck:shuffle(SACRIFICES.map(uidCard)), sacDiscard:[]
  };
  room.phase="game";
  addLog(room,`เริ่มเกม ${room.players.length} คน`);
  addLog(room,`สุ่ม Ghost: ${ghost.name} → ใช้ตำแหน่งบนการ์ด ช่อง ${bossIndex+1}`);
  addLog(room,"ผู้เล่นทุกคนเริ่มที่ Boss Room และได้รับ Amulet คนละ 3 ใบ");
  addLog(room,`ผู้เล่น HP สูงสุดเริ่มก่อน: ${room.players[starterIndex].name} (${room.players[starterIndex].char.name} HP ${room.players[starterIndex].char.hp})`);
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
  if(room.game?.curseResolving){ fail(socket,"ผีกำลังปล่อย Curse — รอให้คำสาปทำงานเสร็จก่อน"); return null; }
  if(room.game?.pendingRoomEffect){ fail(socket,"ต้อง Resolve Effect ของห้องก่อน"); return null; }
  if(room.game?.pendingRitual){ fail(socket,"กำลัง Resolve การทำพิธี"); return null; }
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

const accounts=createAccounts({avatars:CHARS.map(c=>({key:c.key,name:c.name,art:c.art,skill:c.skill}))});
accounts.install(app,express);
accounts.installSockets(io);
if(accounts.enabled)app.get('/api/account/current-room',async(req,res)=>{res.set('Cache-Control','no-store');try{const user=await accounts.identity(req,res);if(!user)return res.status(401).json({error:'กรุณาเข้าสู่ระบบ'});const room=[...rooms.values()].find(r=>r.players.some(p=>p.accountId===user.id));res.json({code:room?.code||null})}catch{res.status(503).json({error:'เชื่อมต่อไม่ได้'})}});

function accountRoom(socket){return accounts.enabled?[...rooms.values()].find(r=>r.players.some(p=>p.accountId===socket.data.account?.id)):null}
function attachAccount(p,socket){if(accounts.enabled){p.accountId=socket.data.account.id;p.name=socket.data.account.display_name;p.token=randomUUID();}}
function saveAccountResult(room){
 if(!accounts.enabled||!room.result)return;
 room.result.rows=awards(room.result.rows,!!room.result.defeat);
 try{accounts.record(room)}catch{console.error("XP queue could not be saved; retrying while room remains available");room.accountSaveFailed=true}
}
io.on("connection", socket=>{
  socket.on("clockSync",ack=>{if(typeof ack==="function")ack({serverNow:Date.now()})});
  socket.on("createRoom", ({name,sessionToken,allowDuplicateCharacters=true})=>{
    if(accountRoom(socket))return fail(socket,"คุณมีห้องอยู่แล้ว กลับเข้าห้องเดิมหรือออกจากห้องก่อน");
    const code=makeCode();
    const token=safeToken(sessionToken);
    const p={id:randomUUID(),socketId:socket.id,token,name:safeName(name),seat:1,characterKey:null,characterPreviewKey:null,characterConfirmed:false,ready:false};
    const room={
      code,hostId:p.id,phase:"lobby",players:[],log:[],chat:[],trade:null,updatedAt:Date.now(),
      settings:{...DEFAULT_SETTINGS,allowDuplicateCharacters:normalizeSetting("allowDuplicateCharacters",allowDuplicateCharacters)??true},ghostSelection:null
    };
    attachAccount(p,socket);
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

    const occupied=accountRoom(socket);if(occupied&&occupied.code!==code)return fail(socket,"คุณมีห้องอยู่แล้ว กรุณาออกจากห้องเดิมก่อน");
    const existing=room.players.find(p=>accounts.enabled?p.accountId===socket.data.account.id:p.token===token);
    if(existing){
      existing.socketId=socket.id;
      if(accounts.enabled)existing.name=socket.data.account.display_name;else if(name) existing.name=safeName(name);
      socket.join(code);socket.data.roomCode=code;
      addLog(room,`${existing.name} กลับเข้าห้อง`);
      emitRoom(room);return;
    }

    if(room.phase!=="lobby") return fail(socket,"เกมเริ่มไปแล้ว — ใช้ Session เดิมเพื่อกลับเข้าห้อง");
    if(room.players.length>=6) return fail(socket,"V1.8 รองรับสูงสุด 6 คน");
    if(room.players.some(p=>p.socketId===socket.id)) return;
    const seat=[1,2,3,4,5,6].find(n=>!room.players.some(x=>(x.seat||0)===n)) || Math.min(6,room.players.length+1);
    const p={id:randomUUID(),socketId:socket.id,token,name:safeName(name),seat,characterKey:null,characterPreviewKey:null,characterConfirmed:false,ready:false};
    attachAccount(p,socket);
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
    const p=room.players.find(x=>accounts.enabled?x.accountId===socket.data.account.id:x.token===token);
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

  socket.on("changeSeat", ({seat})=>{
    const room=rooms.get(socket.data.roomCode);if(!room)return;
    if(room.phase!=="lobby")return fail(socket,"ย้ายที่นั่งได้เฉพาะใน Lobby");
    const p=playerBySocket(room,socket.id);if(!p)return;
    if(p.ready)return fail(socket,"กด Unready ก่อนย้ายที่นั่ง");
    seat=Math.floor(Number(seat));if(![1,2,3,4,5,6].includes(seat))return fail(socket,"ที่นั่งไม่ถูกต้อง");
    if(room.players.some(x=>x.id!==p.id&&(x.seat||0)===seat))return fail(socket,"ที่นั่งนี้มีคนแล้ว");
    const old=p.seat||1;if(old===seat)return;
    p.seat=seat;room.players.sort((a,b)=>(a.seat||99)-(b.seat||99));
    addLog(room,`${p.name} ย้ายที่นั่ง P${old} → P${seat}`);emitRoom(room);
  });

  socket.on("selectCharacter", async ({key=null})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    if(room.phase!=="lobby") return fail(socket,"เลือกตัวละครได้เฉพาะก่อนเริ่มเกม");
    const p=playerBySocket(room,socket.id); if(!p) return;
    if(p.ready) return fail(socket,"กด Unready ก่อนเปลี่ยนตัวละคร");
    if(p.characterConfirmed) return fail(socket,"ปล่อยตัวละครเดิมก่อนเลือกใหม่");
    const claimed=new Set(room.settings.allowDuplicateCharacters?[]:room.players.filter(x=>x.id!==p.id&&x.characterConfirmed&&x.characterKey).map(x=>x.characterKey));
    let owned=null;if(accounts.shopEnabled){try{owned=(await accounts.shopState(p.accountId)).owned}catch{return fail(socket,"ตรวจสิทธิ์ตัวละครไม่ได้ ลองใหม่")}}
    if(room.phase!=="lobby"||p.ready||p.characterConfirmed)return;
    const eligible=CHARS.filter(c=>!claimed.has(c.key)&&(!owned||owned.includes(c.key))); if(!eligible.length) return fail(socket,"ไม่มีตัวละครว่างแล้ว");
    let chosen=null;
    if(key===null||key==="random") chosen=eligible[Math.floor(Math.random()*eligible.length)];
    else { chosen=CHARS.find(x=>x.key===key); if(!chosen)return fail(socket,"ไม่พบตัวละครนี้"); if(claimed.has(chosen.key))return fail(socket,"ตัวละครนี้ถูกยืนยันโดยผู้เล่นอื่นแล้ว"); }
    if(owned&&!owned.includes(chosen.key))return fail(socket,"ปลดล็อกตัวละครนี้ในร้านค้าก่อน");
    p.characterPreviewKey=chosen.key;p.ready=false;addLog(room,`${p.name} กำลังดู ${chosen.name} (ยังไม่ยืนยัน)`);emitRoom(room);
  });
  socket.on("confirmCharacter", async ()=>{
    const room=rooms.get(socket.data.roomCode); if(!room)return;if(room.phase!=="lobby")return fail(socket,"ยืนยันตัวละครได้เฉพาะใน Lobby");
    const p=playerBySocket(room,socket.id);if(!p)return;if(p.ready)return fail(socket,"กด Unready ก่อนเปลี่ยนการยืนยัน");if(!p.characterPreviewKey)return fail(socket,"เลือกหรือสุ่มตัวละครก่อน");
    const chosen=CHARS.find(c=>c.key===p.characterPreviewKey);if(!chosen)return fail(socket,"ไม่พบตัวละครที่เลือก");
    if(!room.settings.allowDuplicateCharacters&&room.players.some(x=>x.id!==p.id&&x.characterConfirmed&&x.characterKey===chosen.key))return fail(socket,"ตัวละครนี้เพิ่งถูกผู้เล่นอื่นยืนยันไปแล้ว ลองเลือกใหม่");
    if(accounts.shopEnabled){try{if(!await accounts.canUse(p.accountId,chosen.key))return fail(socket,"ยังไม่ได้ปลดล็อกตัวละครนี้")}catch{return fail(socket,"ตรวจสิทธิ์ตัวละครไม่ได้")}}
    if(room.phase!=="lobby"||p.ready||p.characterConfirmed||p.characterPreviewKey!==chosen.key)return;
    if(!room.settings.allowDuplicateCharacters&&room.players.some(x=>x.id!==p.id&&x.characterConfirmed&&x.characterKey===chosen.key))return fail(socket,"ตัวละครถูกเลือกแล้ว");
    p.characterKey=chosen.key;p.characterConfirmed=true;p.ready=false;addLog(room,`${p.name} ยืนยันตัวละคร ${chosen.name}`);emitRoom(room);
  });
  socket.on("releaseCharacter", ()=>{
    const room=rooms.get(socket.data.roomCode);if(!room)return;if(room.phase!=="lobby")return fail(socket,"เปลี่ยนตัวละครได้เฉพาะใน Lobby");
    const p=playerBySocket(room,socket.id);if(!p)return;if(p.ready)return fail(socket,"กด Unready ก่อนเปลี่ยนตัวละคร");const old=CHARS.find(c=>c.key===p.characterKey);
    p.characterKey=null;p.characterPreviewKey=null;p.characterConfirmed=false;p.ready=false;if(old)addLog(room,`${p.name} ปล่อย ${old.name} กลับเข้ากอง`);emitRoom(room);
  });
  socket.on("setReady", ({ready})=>{
    const room=rooms.get(socket.data.roomCode);if(!room)return;if(room.phase!=="lobby")return fail(socket,"Ready ได้เฉพาะใน Lobby");const p=playerBySocket(room,socket.id);if(!p)return;
    const next=!!ready;if(next&&!p.characterConfirmed)return fail(socket,"ต้องยืนยันตัวละครก่อน Ready");p.ready=next;addLog(room,`${p.name} ${next?"พร้อมแล้ว":"ยกเลิก Ready"}`);emitRoom(room);
  });

  socket.on("updateSettings", ({key,value})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    if(!checkHost(socket,room)) return;
    if(room.phase!=="lobby") return fail(socket,"เปลี่ยน Playtest Settings ได้ก่อนเริ่มเกมเท่านั้น");
    const normalized=normalizeSetting(key,value);
    if(normalized===undefined) return fail(socket,"Setting ไม่ถูกต้อง");
    if(key==="allowDuplicateCharacters"&&normalized===false){
      const keys=room.players.filter(p=>p.characterConfirmed).map(p=>p.characterKey);
      if(new Set(keys).size!==keys.length)return fail(socket,"มีผู้เล่นยืนยันตัวละครซ้ำอยู่ ให้เปลี่ยนตัวละครก่อนปิดการเลือกซ้ำ");
    }
    room.settings[key]=normalized;
    addLog(room,`Host เปลี่ยน Setting: ${key} = ${String(normalized)}`);
    emitRoom(room);
  });

  socket.on("startGame", ()=>{
    const room=rooms.get(socket.data.roomCode);
    if(!room || !checkHost(socket,room)) return;
    if(room.players.length<1) return fail(socket,"ต้องมีผู้เล่นอย่างน้อย 1 คน");
    if(room.players.some(p=>!p.socketId)) return fail(socket,"มีผู้เล่น Offline อยู่ — รอให้กลับเข้าห้องก่อนเริ่ม");
    const pending=room.players.filter(p=>!p.characterConfirmed || !p.characterKey || !p.ready);
    if(pending.length) return fail(socket,`ยังเริ่มไม่ได้: ${pending.map(p=>p.name).join(", ")} ยังยืนยันตัวละคร/Ready ไม่ครบ`);
    room.phase="ghostSelect";room.ghostSelection={locked:false,selectedId:null,seq:0};addLog(room,"ทุกคนพร้อมแล้ว → เข้าสู่การสุ่มผี");emitRoom(room);
  });

  socket.on("randomGhost", ()=>{
    const room=rooms.get(socket.data.roomCode);if(!room||!checkHost(socket,room))return;
    if(room.phase!=="ghostSelect")return fail(socket,"ตอนนี้ไม่ใช่ช่วงสุ่มผี");
    if(room.ghostSelection?.locked)return fail(socket,"ผีถูกสุ่มไปแล้ว — ไม่มีการสุ่มใหม่");
    const ghost=GHOSTS[Math.floor(Math.random()*GHOSTS.length)];
    room.ghostSelection={locked:true,selectedId:ghost.id,seq:(room.ghostSelection?.seq||0)+1};
    const seq=room.ghostSelection.seq;addLog(room,"Host เริ่มสุ่มผี...");io.to(room.code).emit("ghostRandomStarted",{seq});
    setTimeout(()=>{
      const latest=rooms.get(room.code);if(!latest||latest.phase!=="ghostSelect"||latest.ghostSelection?.seq!==seq)return;
      emitRoom(latest);io.to(latest.code).emit("ghostReveal",{seq,ghost:{art:ghost.art||null,id:ghost.id,name:ghost.name,tier:ghost.tier,archetype:ghost.archetype,fear:ghost.fear,position:ghost.position,need:ghost.need,dice:ghost.dice,curseText:ghost.curseText,counterText:ghost.counterText}});
      addLog(latest,`สุ่มได้ ${ghost.name} → ล็อกผีตัวนี้ทันที`);
    },2300);
    setTimeout(()=>{
      const latest=rooms.get(room.code);if(!latest||latest.phase!=="ghostSelect"||latest.ghostSelection?.seq!==seq)return;
      const startAt=Date.now()+5000;latest.ghostSelection.startAt=startAt;
      io.to(latest.code).emit("gameStartCountdown",{seq,startAt,serverNow:Date.now(),seconds:5});
      emitRoom(latest);
      addLog(latest,"เตรียมเริ่มเกม — นับถอยหลัง 5 วินาที");
    },4800);
    setTimeout(()=>{
      const latest=rooms.get(room.code);if(!latest||latest.phase!=="ghostSelect"||latest.ghostSelection?.seq!==seq)return;
      startRoom(latest,ghost);emitRoom(latest);
    },9800);
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
    g.movementRange=d.total;
    if(g.stats) g.stats.moveRolls++;
    recordDice(room,p,d,"move");
    applyCurse(room,d);
    if(resolveDeathsAfterAction(room,p.id)){ emitRoom(room); return; }
    const currentFear=roomAt(room,p.pos).fear;
    g.moveFear=Math.max(0,currentFear+equipmentFear(p));
    g.sanityBase=Math.max(0,d.total-g.moveFear);
    g.sanityBonus=0;
    g.sanity=g.sanityBase;
    const hasSanity=(p.amu||[]).some(c=>c.type==="sanity") && g.actions>0;
    g.sanityDecision=hasSanity;
    if(!hasSanity) finalizeMovementOptions(room,p);
    addLog(room,`${p.name} ทอย ${d.a}+${d.b}=${d.total} • Fear หลังของสวมใส่ ${g.moveFear} → สติฐาน ${g.sanityBase}${hasSanity?" • รอเลือกใช้การ์ดค่าสติ":""}`);
    emitRoom(room);
  });

  socket.on("useSanity", ({uid,delta=null})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return; const g=room.game;
    if(!g.sanityDecision||!g.rolled||g.moved||g.actions<1) return fail(socket,"ตอนนี้ใช้การ์ดค่าสติไม่ได้");
    const ref=cardFromPlayer(p,uid);if(!ref||ref.zone!=="amu"||ref.card.type!=="sanity") return fail(socket,"ต้องเลือกการ์ดเรียกสติบนมือ");
    const choices=(ref.card.sanityChoices||[Number(ref.card.sanityBonus)||0]).map(Number);delta=Number(delta);
    if(!choices.includes(delta))return fail(socket,"ค่าที่เลือกไม่ตรงกับการ์ด");
    g.actions--;const card=removeCard(p,ref);g.sanityBonus=(g.sanityBonus||0)+delta;g.sanity=Math.max(0,(g.sanityBase||0)+g.sanityBonus);
    revealCard(room,p,card,"amulet","play");returnAmuletToBottom(room,card,"ใช้ปรับค่าสติ");addLog(room,`${p.name} ใช้ ${card.name} (${delta>0?"+":""}${delta}) → สติ ${g.sanity}`);
    if(g.actions<=0||!(p.amu||[]).some(c=>c.type==="sanity"))finalizeMovementOptions(room,p);emitRoom(room);
  });

  socket.on("finishSanityDecision", ()=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game;
    if(!g.sanityDecision) return fail(socket,"ไม่มีการตัดสินใจค่าสติค้างอยู่");
    finalizeMovementOptions(room,p);
    addLog(room,`${p.name} ยืนยันค่าสติ ${g.sanity} → คำนวณห้องที่เดินได้`);
    emitRoom(room);
  });

  socket.on("move", ({index})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game, i=Number(index);
    if(g.sanityDecision || !(g.mustMove||g.moveOptional) || !g.legal.includes(i)) return fail(socket,"เดินไปห้องนี้ไม่ได้");
    const route=movementOptions(room,p).paths[i];
    if(!route)return fail(socket,"เส้นทางนี้เดินไม่ได้แล้ว");
    g.lastMove={seq:(g.lastMove?.seq||0)+1,playerId:p.id,path:route};
    const distance=route.length-1;
    p.pos=i; g.mustMove=false; g.moveOptional=false; g.moved=true; g.legal=[];
    bumpRoomVisit(room,i);
    addLog(room,`${p.name} เดิน ${distance} ห้อง เข้า ${roomAt(room,i).name}`);
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
    const c=drawAmuletFromDeck(room);
    if(!c) return fail(socket,"กอง Amulet และกองทิ้งหมด");
    g.actions--;
    if(g.stats) g.stats.draws.amulet++;
    revealCard(room,p,c,"amulet","draw");
    const currentRoom=roomAt(room,p.pos);
    if(c.type==="event"){
      addLog(room,`${p.name} จั่ว Event: ${c.name} → แสดงผลทันที`);
      applyEventCard(room,p,c);
      returnAmuletToBottom(room,c,"Event จบผลทันที");
      if(resolveDeathsAfterAction(room,p.id)){ emitRoom(room); return; }
      if(currentRoom?.effectId==="event_heal"){
        changeHp(room,p,1,`${currentRoom.name}: จั่ว Event`);
        addLog(room,`${currentRoom.name}: จั่ว Event → HP +1`);
      }
      if(currentRoom?.effectId==="event_pick_discard"){
        if(g.pendingRoomEffect){g.officePickAfterPending=p.id;addLog(room,`${currentRoom.name}: รอ Resolve Event ก่อน แล้วค่อยเลือกจากกองทิ้ง`);}
        else queueOfficeDiscardPick(room,p,{force:true});
      }
    }else if(currentRoom?.effectId==="equip_free" && c.type==="equip" && p.equip.length<p.char.slots){
      p.equip.push(c);
      addLog(room,`${p.name} จั่ว ${c.name} ในห้องน้ำ → สวมใส่ทันทีฟรี`);
    }else{
      p.amu.push(c);
      addLog(room,`${p.name} จั่ว Amulet 1 ใบ (${c.category||c.type})`);
      if(p.amu.length>5){
        g.pendingRoomEffect={
          id:`amu-overflow-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
          type:"discardAmuletOverflow",
          playerId:p.id,
          reason:"Amulet Hand เต็ม — เลือกเก็บ 5 ใบ",
          count:Math.max(1,p.amu.length-5),
          newUid:c.uid,
          options:p.amu.map(x=>({uid:x.uid,name:x.name,type:x.type,category:x.category,desc:x.desc||x.effect||"",art:x.art||null}))
        };
        addLog(room,`${p.name} มี Amulet 6 ใบชั่วคราว → ต้องเลือก 1 ใบกลับใต้กอง`);
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
    if(!g.moved||g.actions<1||p.equip.length>=p.char.slots) return fail(socket,"สวมใส่ไม่ได้");
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
    if(idx<0||!g.moved||g.actions<1) return fail(socket,"ถอดอุปกรณ์ไม่ได้");
    g.actions--;const card=p.equip.splice(idx,1)[0];p.amu.push(card);
    if(p.amu.length>5)g.pendingRoomEffect={
      id:`unequip-overflow-${Date.now()}`,type:"discardAmuletOverflow",playerId:p.id,
      reason:"ถอดอุปกรณ์เข้ามือ — เลือกทิ้งให้เหลือ 5 ใบ",count:p.amu.length-5,newUid:card.uid,newLabel:"ใบที่เพิ่งถอด",
      options:p.amu.map(c=>({uid:c.uid,name:c.name,type:c.type,category:c.category,desc:c.desc||c.effect||"",art:c.art||null}))
    };
    addLog(room,`${p.name} ถอด ${card.name} กลับเข้ามือ • ใช้ธูป 1 ดอก`);
    emitRoom(room);
  });

  socket.on("useHeal", ({uid,targetId=null,freeByCat=false})=>{
    const room=rooms.get(socket.data.roomCode);if(!room)return;const p=checkTurn(socket,room);if(!p)return;const g=room.game,ref=cardFromPlayer(p,uid);
    const healTypes=["heal_self","heal_room","heal_range"];
    if(!ref||ref.zone!=="amu"||!healTypes.includes(ref.card.type)||!g.moved)return fail(socket,"ใช้การ์ดช่วยเหลือไม่ได้");
    if(!freeByCat&&g.actions<1)return fail(socket,"ธูปไม่พอ");
    if(freeByCat)return fail(socket,"ใช้การช่วยระยะไกลผ่านปุ่ม Skill เท่านั้น");
    if(!freeByCat)g.actions--;
    const card=removeCard(p,ref),amount=Number(card.heal)||1;revealCard(room,p,card,"amulet","play");
    if(freeByCat){const target=room.players.find(x=>x.id===targetId&&x.hp>0);if(!target){p.amu.push(card);return fail(socket,"เลือกเพื่อนที่ยังมีชีวิต");}changeHp(room,target,amount,`${p.name} (แมวจร) ใช้ ${card.name}`);addLog(room,`${p.name} ใช้ ${card.name} ช่วย ${target.name} ระยะไกล → HP +${amount}`);}
    else if(card.type==="heal_self"){changeHp(room,p,amount,`ใช้ ${card.name}`);addLog(room,`${p.name} ใช้ ${card.name} → HP +${amount}`);}
    else if(card.type==="heal_room"){const targets=room.players.filter(x=>x.hp>0&&x.pos===p.pos);targets.forEach(x=>healFriend(room,p,x,amount,`${p.name} ใช้ ${card.name}`));addLog(room,`${p.name} ใช้ ${card.name} → คนในห้อง HP +${amount}`);}
    else if(card.type==="heal_range"){const r1=Math.floor(p.pos/3),c1=p.pos%3,range=Number(card.range)||1;const targets=room.players.filter(x=>x.hp>0&&Math.abs(Math.floor(x.pos/3)-r1)+Math.abs((x.pos%3)-c1)<=range);targets.forEach(x=>healFriend(room,p,x,amount,`${p.name} ใช้ ${card.name}`));addLog(room,`${p.name} ใช้ ${card.name} → ระยะ ${range} ช่อง HP +${amount}`);}
    returnAmuletToBottom(room,card,"ใช้การ์ดช่วยเหลือ");emitRoom(room);
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
    reviveFriend(room,p,target,card.reviveHp||1,card.name);
    revealCard(room,p,card,"amulet","play");
    returnAmuletToBottom(room,card,"ใช้การ์ดชุบชีวิต");
    emitRoom(room);
  });

  socket.on("castSpell", ({uid})=>{
    const room=rooms.get(socket.data.roomCode);if(!room)return;const p=checkTurn(socket,room);if(!p)return;const g=room.game,ref=cardFromPlayer(p,uid);
    if(!ref||ref.zone!=="amu"||ref.card.type!=="spell")return fail(socket,"ต้องเลือกการ์ดคาถาอาคม");
    if(g.actions<1)return fail(socket,"ธูปไม่พอใช้คาถา");
    const card=ref.card;
    if(["protect_all","protect_ghost"].includes(card.spellEffect))return fail(socket,"คาถาป้องกันใบนี้ใช้ตอนระบบขึ้นแจ้งเตือนผลลบเท่านั้น");
    if(["go_anywhere","diagonal_move"].includes(card.spellEffect)&&(g.rolled||g.moved||g.escapeRequired))return fail(socket,"คาถาเคลื่อนที่ต้องใช้ก่อนทอยเดิน และต้องไม่ติดห้องพิเศษ");
    g.actions--;removeCard(p,ref);revealCard(room,p,card,"amulet","spell");
    const d=roll2();g.lastDice=d;recordDice(room,p,d,"spell");applyCurse(room,d);
    const ok=diceConditionOk(card.condition,d);
    if(ok){
      if(card.spellEffect==="protect_all"){p.guardAll=(p.guardAll||0)+1;addLog(room,`${p.name} ใช้ ${card.name} สำเร็จ → ป้องกันผลลบ 1 ครั้ง`);}
      else if(card.spellEffect==="protect_ghost"){p.guardGhost=(p.guardGhost||0)+1;addLog(room,`${p.name} ใช้ ${card.name} สำเร็จ → ป้องกันการโจมตีผี 1 ครั้ง`);}
      else if(card.spellEffect==="escape_special"){g.escapeRequired=false;g.escapeRule=null;addLog(room,`${p.name} ใช้ ${card.name} สำเร็จ → หลุดจากคำสาป/กับดักทันที`);}
      else if(card.spellEffect==="go_anywhere"){
        const options=[];for(let i=0;i<9;i++)if(i!==p.pos&&canEnter(room,p,i))options.push({index:i,name:roomAt(room,i).name,fear:roomAt(room,i).fear});
        g.rolled=true;g.pendingRoomEffect={id:`spell-any-${Date.now()}`,type:"spellMoveAny",playerId:p.id,reason:`${card.name}: เลือกห้องปลายทาง`,options};
      }else if(card.spellEffect==="diagonal_move"){
        const r=Math.floor(p.pos/3),c=p.pos%3,options=[];for(const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]){const rr=r+dr,cc=c+dc;if(rr>=0&&rr<3&&cc>=0&&cc<3){const i=rr*3+cc;if(canEnter(room,p,i))options.push({index:i,name:roomAt(room,i).name,fear:roomAt(room,i).fear});}}
        if(options.length){g.rolled=true;g.pendingRoomEffect={id:`spell-diag-${Date.now()}`,type:"spellMoveDiagonal",playerId:p.id,reason:`${card.name}: เลือกเดินทะแยง`,options};}else addLog(room,`${card.name} สำเร็จ แต่ไม่มีห้องทะแยงที่เข้าได้`);
      }
    }else addLog(room,`${p.name} ใช้ ${card.name} • ทอย ${d.total} ไม่ผ่าน ${card.condition?.label||"เงื่อนไข"}`);
    returnAmuletToBottom(room,card,`ใช้คาถา ${ok?"สำเร็จ":"ไม่สำเร็จ"}`);
    io.to(room.code).emit("spellFx",{playerName:p.name,name:card.name,dice:d,condition:card.condition?.label||"",success:ok,effect:card.effect||""});
    if(resolveDeathsAfterAction(room,p.id)){emitRoom(room);return;}emitRoom(room);
  });

  socket.on("skill", ({targetId=null,index=null,uid=null,side=null}={})=>{
    const room=rooms.get(socket.data.roomCode);if(!room)return;const p=checkTurn(socket,room);if(!p)return;const g=room.game,type=p.char?.skillType;
    if(!type)return fail(socket,"ตัวละครนี้ไม่มีสกิล");
    if(g.actions<3&&!(type==="remote_help"&&g.catHelp?.playerId===p.id))return fail(socket,"ต้องมีธูป 3 ดอกเพื่อใช้ Skill");
    if(g.stats)g.stats.skillsUsed++;

    if(type==="self_revive"){
      if(p.hp>0||p.selfReviveUsed)return fail(socket,"พ่อไกรคืนชีพได้ครั้งเดียวต่อเกมเมื่อ HP 0");p.selfReviveUsed=true;g.actions=0;revivePlayer(room,p,2,"สกิลพ่อไกร");g.rolled=true;g.moved=true;addLog(room,`${p.name} ใช้สกิลพ่อไกร → ฟื้น HP 2`);emitRoom(room);return;
    }
    if(p.hp<=0)return fail(socket,"ผู้เล่นที่เสียชีวิตใช้สกิลนี้ไม่ได้");

    if(type==="draw_five_stop_event"){
      if(!g.moved)return fail(socket,"ต้อง Resolve การเดินก่อนใช้สกิลแม่มะลิ");g.actions=0;let got=0;
      for(let i=0;i<5;i++){const card=drawAmuletFromDeck(room);if(!card)break;revealCard(room,p,card,"amulet","skill");got++;if(card.type==="event"){addLog(room,`${p.name} สกิลแม่มะลิ เจอ Event ใบที่ ${got} → หยุดจั่วทันที`);applyEventCard(room,p,card);returnAmuletToBottom(room,card,"สกิลแม่มะลิเปิด Event");break;}p.amu.push(card);}
      if(p.amu.length>5&&!g.pendingRoomEffect)g.pendingRoomEffect={id:`mali-overflow-${Date.now()}`,type:"discardAmuletOverflow",playerId:p.id,reason:"สกิลแม่มะลิ: เลือกเก็บ Amulet ให้เหลือ 5 ใบ",count:p.amu.length-5,options:p.amu.map(c=>({uid:c.uid,name:c.name,type:c.type,category:c.category,desc:c.desc||c.effect||"",art:c.art||null}))};
      addLog(room,`${p.name} ใช้สกิลแม่มะลิ → จั่ว ${got} ใบ`);emitRoom(room);return;
    }

    if(type==="heal_all_living"){
      if(!g.moved)return fail(socket,"ต้อง Resolve การเดินก่อนใช้สกิลหมอสาว");g.actions=0;room.players.filter(x=>x.id!==p.id&&x.hp>0).forEach(x=>healFriend(room,p,x,1,`${p.name} ใช้สกิลหมอสาว`));changeHp(room,p,-2,"ค่าพลังสกิลหมอสาว");addLog(room,`${p.name} ใช้สกิลหมอสาว → เพื่อนที่ยังมีชีวิต HP +1 • ตัวเอง HP -2`);if(resolveDeathsAfterAction(room,p.id)){emitRoom(room);return;}emitRoom(room);return;
    }

    if(type==="move_to_friend_hp2"){
      if(g.escapeRequired)return fail(socket,"ต้องหลุดจากคำสาป/กับดักก่อน");const target=room.players.find(x=>x.id===targetId&&x.id!==p.id&&x.hp>0);if(!target)return fail(socket,"เลือกเพื่อนที่ยังมีชีวิต");g.actions=0;p.pos=target.pos;g.rolled=true;g.moved=true;g.mustMove=false;g.moveOptional=false;g.legal=[];healFriend(room,p,target,1,"สกิลเด็กเนิร์ด");changeHp(room,p,-2,"ค่าพลังสกิลเด็กเนิร์ด");bumpRoomVisit(room,p.pos);addLog(room,`${p.name} ใช้สกิลเด็กเนิร์ด → ไปหา ${target.name} • HP -2`);if(resolveDeathsAfterAction(room,p.id)){emitRoom(room);return;}emitRoom(room);return;
    }

    if(type==="remote_ritual_hp3"){
      const ref=cardFromPlayer(p,uid);if(!ref||ref.zone!=="sac")return fail(socket,"เลือกเครื่องเซ่นสำหรับท้าดวลผี");const c=ref.card,ghost=currentGhost(room);if(!ghost.need[c.color]||(g.bossDone[c.color]||0)>=ghost.need[c.color])return fail(socket,"ผีไม่ต้องการเครื่องเซ่นสีนี้แล้ว");
      g.actions=0;if(g.stats){g.stats.rituals.attempts++;if(g.stats.rituals.byColor[c.color])g.stats.rituals.byColor[c.color].attempts++;}if((g.ritualHealAllCharges||0)>0){g.ritualHealAllCharges--;room.players.filter(x=>x.hp>0).forEach(x=>changeHp(room,x,2,"Event ยันต์ปลิวติดหน้า: มีคนทำพิธี"));addLog(room,"ยันต์ปลิวติดหน้า → มีคนทำพิธี: ผู้เล่นที่ยังมีชีวิตทุกคน HP +2");}const d=roll2();g.lastDice=d;recordDice(room,p,d,"ritual");applyCurse(room,d);const rule=ghost.dice[c.color],attackMax=equipmentAttack(p);g.pendingRitual={id:`rit-skill-${Date.now()}`,playerId:p.id,playerName:p.name,cardUid:c.uid,cardName:c.name,color:c.color,dice:d,rule:{op:rule.op,value:rule.value,label:rule.label},attackMax,modifierOptions:equipmentAttackOptions(p),equipment:equipmentSummary(p),score:c.boss,counterText:ghost.counterText?.[c.color]||"",remoteSkill:true,skillHpCost:3};addLog(room,`${p.name} ใช้สกิลหมอผีดำ → ท้าดวล ${ghost.name} จากระยะไกล • หลัง Resolve จะเสีย HP 3`);emitRoom(room);return;
    }

    if(type==="free_any_trap_curse"){
      const target=room.players.find(x=>x.id===(targetId||p.id)&&x.hp>0);if(!target)return fail(socket,"เลือกผู้เล่นที่ยังมีชีวิต");const rr=roomAt(room,target.pos);if(!rr||!["คำสาป","กับดัก"].includes(rr.type))return fail(socket,"เป้าหมายต้องอยู่ในห้องคำสาปหรือกับดัก");if(target.freeSpecialExit||target.skipSpecialStartEffect)return fail(socket,"เป้าหมายถูกปลดแล้ว");g.actions=0;addSupport(room,p,target,2,"ปลดคำสาป/กับดัก");target.freeSpecialExit=true;if(target.id===p.id){g.escapeRequired=false;g.escapeRule=null;}else target.skipSpecialStartEffect=true;addLog(room,`${p.name} ใช้สกิลหมอธรรม → ปลด ${target.name} จาก ${rr.name} ทั่วกระดาน`);emitRoom(room);return;
    }

    if(type==="peek_four_choose_two"){
      if(!g.moved)return fail(socket,"ต้องเดินก่อนใช้สกิลหมาวัด");
      if(!g.amuDeck.length)return fail(socket,"กอง Amulet หมด");
      g.actions=0;const block=g.amuDeck.slice(0,4),count=Math.min(2,block.filter(c=>c.type!=="event").length);
      g.pendingRoomEffect={id:'dog-'+randomUUID(),type:'skillPeekChoose',playerId:p.id,side:'top',count,reason:'หมาวัด: เลือกได้ '+count+' ใบ',options:block.map(c=>c.type==='event'?{uid:c.uid,type:'event',name:'เหตุการณ์ — เลือกไม่ได้',disabled:true}:{...c})};
      emitRoom(room);return;
    }

    if(type==="remote_help"){
      if(!g.moved)return fail(socket,"ต้องเดินก่อนใช้สกิลแมวจร");
      const ref=cardFromPlayer(p,uid),target=room.players.find(x=>x.id===targetId&&x.id!==p.id);
      if(!ref||ref.zone!=='amu'||ref.card.category!=='ช่วยเหลือ'||!target)return fail(socket,"เลือกการ์ดช่วยเหลือและเพื่อน");
      const card=ref.card,session=g.catHelp;
      if((card.type==='revive')!==(target.hp<=0))return fail(socket,"เลือกการ์ดให้ตรงกับสถานะเพื่อน");
      if(session?.targets.includes(target.id))return fail(socket,"เพื่อนคนนี้ได้รับการ์ดจากสกิลแล้วในเทิร์นนี้");
      if(!session){g.actions=0;g.catHelp={playerId:p.id,targets:[]};}
      g.catHelp.targets.push(target.id);removeCard(p,ref);revealCard(room,p,card,"amulet","skill");
      if(card.type==='revive')reviveFriend(room,p,target,card.reviveHp||1,card.name);
      else {
        let targets=[target];
        if(card.type==='heal_room')targets=room.players.filter(x=>x.hp>0&&x.pos===target.pos);
        if(card.type==='heal_range')targets=room.players.filter(x=>x.hp>0&&Math.abs(Math.floor(x.pos/3)-Math.floor(target.pos/3))+Math.abs(x.pos%3-target.pos%3)<=(Number(card.range)||1));
        for(const x of targets){if(x.id===p.id||x.id!==target.id&&g.catHelp.targets.includes(x.id))continue;healFriend(room,p,x,card.heal||1,card.name);if(!g.catHelp.targets.includes(x.id))g.catHelp.targets.push(x.id);}
      }
      returnAmuletToBottom(room,card,"สกิลแมวจร");
      if(!p.amu.some(c=>c.category==='ช่วยเหลือ')||room.players.every(x=>x.id===p.id||g.catHelp.targets.includes(x.id)))g.catHelp=null;
      emitRoom(room);return;
    }

    return fail(socket,"สกิลนี้ยังไม่มี Logic");
  });

  socket.on("ritual", ({uid})=>{
    const room=rooms.get(socket.data.roomCode); if(!room) return;
    const p=checkTurn(socket,room); if(!p) return;
    const g=room.game, r=roomAt(room,p.pos);
    if(!g.moved||g.actions<2||!r.boss) return fail(socket,"ทำพิธีไม่ได้");
    const ref=cardFromPlayer(p,uid);
    if(!ref||ref.zone!=="sac") return fail(socket,"ต้องเลือกเครื่องเซ่น");
    const c=ref.card,ghost=currentGhost(room);
    if(!ghost.need[c.color]) return fail(socket,"ผีตัวนี้ไม่ต้องการเครื่องเซ่นสีนี้");
    if((g.bossDone[c.color]||0)>=ghost.need[c.color]) return fail(socket,"สีนี้ครบแล้ว");
    g.actions-=2;
    if(g.stats){g.stats.rituals.attempts++;if(g.stats.rituals.byColor[c.color])g.stats.rituals.byColor[c.color].attempts++;}
    if((g.ritualHealAllCharges||0)>0){
      g.ritualHealAllCharges--;
      room.players.filter(x=>x.hp>0).forEach(x=>changeHp(room,x,2,"Event ยันต์ปลิวติดหน้า: มีคนทำพิธี"));
      addLog(room,"ยันต์ปลิวติดหน้า → มีคนทำพิธี: ผู้เล่นที่ยังมีชีวิตทุกคน HP +2");
    }
    const d=roll2();g.lastDice=d;recordDice(room,p,d,"ritual");applyCurse(room,d);
    if(resolveDeathsAfterAction(room,p.id)){emitRoom(room);return;}
    const rule=ghost.dice[c.color],attackMax=equipmentAttack(p);
    g.pendingRitual={
      id:`rit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      playerId:p.id,playerName:p.name,cardUid:c.uid,cardName:c.name,color:c.color,
      dice:d,rule:{op:rule.op,value:rule.value,label:rule.label},attackMax,modifierOptions:equipmentAttackOptions(p),
      equipment:equipmentSummary(p),score:c.boss,counterText:ghost.counterText?.[c.color]||""
    };
    addLog(room,`${p.name} เริ่มพิธีด้วย ${c.name} • ทอยดิบ ${d.total} • อุปกรณ์ปรับได้ ±${attackMax} • รอเลือก Modifier`);
    emitRoom(room);
  });

  socket.on("resolveRitual", ({modifier=0})=>{
    const room=rooms.get(socket.data.roomCode);if(!room||!room.game?.pendingRitual)return;
    if(room.game.curseResolving)return fail(socket,"รอ Curse ทำงานเสร็จก่อน");
    const p=playerBySocket(room,socket.id),g=room.game,pending=g.pendingRitual;
    if(!p||pending.playerId!==p.id)return fail(socket,"พิธีนี้ไม่ใช่ของคุณ");
    modifier=Math.trunc(Number(modifier)||0);
    const attackMax=equipmentAttack(p),modifierOptions=equipmentAttackOptions(p);
    if(!modifierOptions.includes(modifier))return fail(socket,`Modifier นี้ใช้ไม่ได้กับอุปกรณ์ที่สวมอยู่`);
    const ref=cardFromPlayer(p,pending.cardUid);
    if(!ref||ref.zone!=="sac")return fail(socket,"ไม่พบเครื่องเซ่นที่ใช้ทำพิธี");
    const c=ref.card,ghost=currentGhost(room),rule=pending.rule,d=pending.dice;
    const finalTotal=d.total+modifier;
    const ok=rule.op===">="?finalTotal>=rule.value:finalTotal<=rule.value;
    removeCard(p,ref);
    g.pendingRitual=null;
    if(ok){
      if(g.stats){g.stats.rituals.success++;if(g.stats.rituals.byColor[c.color])g.stats.rituals.byColor[c.color].success++;}
      g.bossDone[c.color]++;p.score+=c.boss;
      const life=equipmentLifeSteal(p);if(life>0)changeHp(room,p,life,`อุปกรณ์ดูดเลือดหลังทำพิธีสำเร็จ`);
      addLog(room,`${p.name} พิธีสำเร็จ • ${d.total}${modifier?`${modifier>0?"+":""}${modifier}`:""} = ${finalTotal} เทียบ ${rule.label} • เงิน +${c.boss}${life?` • HP +${life}`:""}`);
    }else{
      if(g.stats){g.stats.rituals.fail++;if(g.stats.rituals.byColor[c.color])g.stats.rituals.byColor[c.color].fail++;}
      if(room.settings.failedSacrifice==="remove"){g.sacDiscard.push(c);addLog(room,`${p.name} ทำพิธีพลาด • ${c.name} ออกจากเกมสำหรับ Session นี้`);}
      else{g.sacDeck.push(c);addLog(room,`${p.name} ทำพิธีพลาด • ${c.name} กลับใต้กอง`);}
      applyGhostCounter(room,p,c.color);
      const weaponIdx=p.equip.map((x,i)=>x.breakOnAttackFail?i:-1).filter(i=>i>=0);
      if(weaponIdx.length){
        const indices=room.settings.equipmentBreak==="all"?weaponIdx:[weaponIdx[0]];
        const broken=[];[...indices].sort((a,b)=>b-a).forEach(i=>broken.push(p.equip.splice(i,1)[0]));broken.forEach(x=>returnAmuletToBottom(room,x,"โจมตีผีไม่สำเร็จ"));
        if(g.stats)g.stats.equipmentBreaks+=broken.length;addLog(room,`อาวุธของ ${p.name} แตก: ${broken.map(x=>x.name).join(", ")}`);
      }
    }
    if(pending.remoteSkill&&pending.skillHpCost)changeHp(room,p,-Math.abs(Number(pending.skillHpCost)||3),"ค่าพลังสกิลหมอผีดำ");
    io.to(room.code).emit("ritualFx",{playerName:p.name,ghostName:ghost.name,cardName:c.name,color:c.color,dice:d,modifier,finalTotal,ruleLabel:rule.label,ruleValue:rule.value,success:ok,score:ok?c.boss:0,attackMax,counterText:pending.counterText});
    if(resolveDeathsAfterAction(room,p.id)){emitRoom(room);return;}
    if(ghostComplete(room)){room.phase="result";computeResults(room);addLog(room,`ปราบ ${ghost.name} สำเร็จ → จบเกม`);}
    emitRoom(room);
  });

  socket.on("resolveRoomEffect", ({uids=[],uid=null})=>{
    const room=rooms.get(socket.data.roomCode); if(!room||!room.game?.pendingRoomEffect) return;
    if(room.game.curseResolving)return fail(socket,"รอ Curse ทำงานเสร็จก่อน");
    const p=playerBySocket(room,socket.id), pending=room.game.pendingRoomEffect;
    if(!p||pending.playerId!==p.id) return fail(socket,"Effect นี้ไม่ใช่ของคุณ");
    if(pending.type==="negativeReaction"){
      if(uid==="pass"||uid==null){
        addLog(room,`${p.name} ไม่ใช้คาถาป้องกัน → รับผลลบ: ${pending.reason}`);
        finishNegativeReaction(room,p,{blocked:false});
      }else{
        const ref=cardFromPlayer(p,uid);
        if(!ref||ref.zone!=="amu"||ref.card.type!=="spell"||!pending.options?.some(o=>o.uid===uid))return fail(socket,"คาถาป้องกันใบนี้ใช้ไม่ได้ตอนนี้");
        if(room.game.actions<1)return fail(socket,"ธูปไม่พอใช้คาถาป้องกัน");
        room.game.actions--;
        const card=removeCard(p,ref),d=roll2(),ok=diceConditionOk(card.condition,d);
        room.game.lastDice=d;recordDice(room,p,d,"spell");revealCard(room,p,card,"amulet","reaction-spell");returnAmuletToBottom(room,card,`คาถาป้องกัน ${ok?"สำเร็จ":"ไม่สำเร็จ"}`);
        addLog(room,`${p.name} ใช้ ${card.name} ตอบโต้ ${pending.reason} • ทอย ${d.total} ${ok?"ผ่าน":"ไม่ผ่าน"} ${card.condition?.label||"เงื่อนไข"}`);
        io.to(room.code).emit("spellFx",{playerName:p.name,name:card.name,dice:d,condition:card.condition?.label||"",success:ok,effect:card.effect||""});
        finishNegativeReaction(room,p,{blocked:ok});
      }
    }else if(pending.type==="discardSacrifice"){
      const chosen=[...new Set(Array.isArray(uids)?uids:[])];
      if(chosen.length!==pending.count) return fail(socket,`ต้องเลือกเครื่องเซ่น ${pending.count} ชิ้น`);
      const refs=chosen.map(x=>cardFromPlayer(p,x));
      if(refs.some(r=>!r||r.zone!=="sac")) return fail(socket,"เลือกเครื่องเซ่นไม่ถูกต้อง");
      [...refs].sort((a,b)=>b.index-a.index).forEach(ref=>{
        const c=removeCard(p,ref); room.game.sacDeck.push(c);
      });
      addLog(room,`${p.name} Resolve ${pending.reason} → เครื่องเซ่น ${pending.count} ชิ้นกลับใต้กอง`);
      room.game.pendingRoomEffect=null;
    }else if(pending.type==="discardAmuletOverflow"){
      const chosen=[...new Set((Array.isArray(uids)&&uids.length?uids:[uid]).filter(Boolean))];
      const need=Math.max(1,Number(pending.count)||1);
      if(chosen.length!==need)return fail(socket,`ต้องเลือกทิ้ง ${need} ใบ`);
      const refs=chosen.map(x=>cardFromPlayer(p,x));if(refs.some(r=>!r||r.zone!=="amu"))return fail(socket,"ไม่พบ Amulet ที่เลือก");
      [...refs].sort((a,b)=>b.index-a.index).forEach(ref=>{const c=removeCard(p,ref);returnAmuletToBottom(room,c,"มือเกิน 5 ใบ")});
      addLog(room,`${p.name} ทิ้ง Amulet ${need} ใบ → เหลือ ${p.amu.length}/5`);
      room.game.pendingRoomEffect=null;
    }else if(pending.type==="officePickDiscard"){
      const pile=room.game.amuDiscard||[],idx=pile.findIndex(c=>c.uid===uid);
      if(idx<0||!pending.options?.some(c=>c.uid===uid)||!canRecoverToHand(pile[idx]))return fail(socket,"เลือกได้เฉพาะ Amulet ที่ไม่ใช่ Event ในตัวเลือก");
      const [card]=pile.splice(idx,1);room.game.pendingRoomEffect=null;p.amu.push(card);
      addLog(room,`${p.name} หยิบ ${card.name} จากกองทิ้งเข้ามือ`);
      if(p.amu.length>5)room.game.pendingRoomEffect={
        id:`recover-overflow-${Date.now()}`,type:"discardAmuletOverflow",playerId:p.id,count:p.amu.length-5,
        reason:"หยิบจากกองทิ้ง — เลือกทิ้งให้เหลือ 5 ใบ",newUid:card.uid,newLabel:"ใบที่เพิ่งหยิบ",
        options:p.amu.map(c=>({uid:c.uid,name:c.name,type:c.type,category:c.category,desc:c.desc||c.effect||"",art:c.art||null}))
      };
    }else if(pending.type==="eventRollMoney"){
      const beneficiary=room.players.find(x=>x.id===pending.beneficiaryId);const d=roll2();recordDice(room,p,d,"event");if(beneficiary){beneficiary.score=(beneficiary.score||0)+d.total;addLog(room,`${p.name} ทอย Event ${d.a}+${d.b}=${d.total} → ${beneficiary.name} ได้เงิน ${d.total}`);}room.game.pendingRoomEffect=null;
    }else if(pending.type==="eventReviveAny"){
      const target=room.players.find(x=>x.id===uid&&x.hp<=0);if(!target)return fail(socket,"เลือกผู้เล่นที่เสียชีวิต");revivePlayer(room,target,1,"เครื่องปั๊มหัวใจ");room.game.pendingRoomEffect=null;
    }else if(pending.type==="eventFreeCurseMove"){
      const index=Number(uid);if(!pending.options?.some(x=>x.index===index))return fail(socket,"เลือกห้องข้างเคียงไม่ถูกต้อง");p.pos=index;bumpRoomVisit(room,index);room.game.rolled=true;room.game.moved=true;room.game.mustMove=false;room.game.moveOptional=false;room.game.legal=[];room.game.escapeRequired=false;room.game.escapeRule=null;addLog(room,`${p.name} หลุดจากคำสาปทันที → เดินไป ${roomAt(room,index).name}`);room.game.pendingRoomEffect=null;
    }else if(pending.type==="spellMoveAny" || pending.type==="spellMoveDiagonal"){
      const index=Number(uid);if(!pending.options?.some(x=>x.index===index))return fail(socket,"เลือกห้องปลายทางไม่ถูกต้อง");p.pos=index;room.game.rolled=true;room.game.moved=true;room.game.mustMove=false;room.game.moveOptional=false;room.game.legal=[];bumpRoomVisit(room,index);addLog(room,`${p.name} ใช้คาถาเคลื่อนที่ → ${roomAt(room,index).name}`);room.game.pendingRoomEffect=null;
    }else if(pending.type==="skillPeekChoose"){
      const chosen=[...new Set(Array.isArray(uids)?uids:[])];if(chosen.length!==pending.count)return fail(socket,"เลือกให้ครบ "+pending.count+" ใบ");const opt=pending.options||[];if(chosen.some(id=>!opt.some(o=>o.uid===id&&!o.disabled)))return fail(socket,"เลือกการ์ดไม่ถูกต้อง");
      const set=new Set(opt.map(o=>o.uid));const block=room.game.amuDeck.filter(c=>set.has(c.uid));room.game.amuDeck=room.game.amuDeck.filter(c=>!set.has(c.uid));const picked=block.filter(c=>chosen.includes(c.uid)),rest=block.filter(c=>!chosen.includes(c.uid));picked.forEach(c=>p.amu.push(c));if(pending.side==="top")room.game.amuDeck.unshift(...rest);else room.game.amuDeck.push(...rest);addLog(room,`${p.name} เลือกเก็บ ${picked.map(c=>c.name).join(", ")} จาก ${pending.side==="top"?"บนสุด":"ล่างสุด"} 4 ใบ`);room.game.pendingRoomEffect=null;if(p.amu.length>5){room.game.pendingRoomEffect={id:`peek-overflow-${Date.now()}`,type:"discardAmuletOverflow",playerId:p.id,reason:"สกิลหมาวัด: มือเกิน 5 ใบ",count:p.amu.length-5,options:p.amu.map(c=>({uid:c.uid,name:c.name,type:c.type,category:c.category,desc:c.desc||c.effect||"",art:c.art||null}))};}
    }else if(pending.type==="chooseBrokenEquip"){
      const idx=p.equip.findIndex(c=>c.uid===uid);
      if(idx<0)return fail(socket,"เลือกอุปกรณ์ไม่ถูกต้อง");
      const [broken]=p.equip.splice(idx,1);returnAmuletToBottom(room,broken,"Event ทำให้อุปกรณ์แตก");
      addLog(room,`${p.name} เลือกอุปกรณ์ที่แตก: ${broken.name}`);room.game.pendingRoomEffect=null;
    }else if(pending.type==="eventMoveTwo"){
      const index=Number(uid);
      if(!pending.options.some(x=>x.index===index))return fail(socket,"เลือกห้องปลายทางไม่ถูกต้อง");
      p.pos=index;bumpRoomVisit(room,index);addLog(room,`${p.name} วิ่งจาก Event ไป ${roomAt(room,index).name}`);room.game.pendingRoomEffect=null;
    }
    maybeQueueDeferredOfficePick(room);
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
    if(room.game.pendingRitual) return fail(socket,"ต้อง Resolve การทำพิธีก่อน");
    if(room.game.sanityDecision) return fail(socket,"ยืนยันการใช้/ไม่ใช้การ์ดค่าสติก่อน");
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
    if(!g.moved||g.traded||room.trade||g.actions<1) return fail(socket,"แลกเปลี่ยนต้องมี 1 ธูป และใช้ได้ 1 ครั้ง/เทิร์น");
    const target=room.players.find(x=>x.id===toId);
    if(!target||target.id===p.id||target.pos!==p.pos||target.hp<=0) return fail(socket,"Trade ได้เฉพาะคนที่อยู่ห้องเดียวกัน");
    giveScore=Math.max(0,Math.floor(Number(giveScore)||0));
    askScore=Math.max(0,Math.floor(Number(askScore)||0));
    askCardCount=Math.max(0,Math.min(2,Math.floor(Number(askCardCount)||0)));
    if(giveScore>p.score) return fail(socket,"เงินที่เสนอมากกว่าเงินที่มี");
    const refs=[];
    for(const uid of [...new Set(giveUids)].slice(0,3)){
      const ref=cardFromPlayer(p,uid);
      if(!ref) return fail(socket,"มีการ์ดในข้อเสนอที่ไม่ถูกต้อง");
      refs.push(ref);
    }
    if(!refs.length&&!giveScore&&!askScore&&!askCardCount)return fail(socket,"เลือกสิ่งที่ต้องการแลกก่อน");
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
    if(room.phase!=="game"||active(room)?.id!==from.id||from.hp<=0||target.hp<=0||from.pos!==target.pos||room.game.actions<1)return fail(socket,"ไม่สามารถแลกเปลี่ยนได้ในตอนนี้");
    if(!Array.isArray(returnUids)||new Set(returnUids).size!==returnUids.length)return fail(socket,"ต้องเลือกการ์ดตอบกลับไม่ซ้ำกัน");
    if(target.score<t.askScore||from.score<t.giveScore) return fail(socket,"เงินไม่พอสำหรับ Trade");
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
    room.game.actions--;
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
  for(const room of rooms.values())if(room.accountSaveFailed&&!room.accountResultQueued)saveAccountResult(room);
},60000).unref();

server.listen(PORT, "0.0.0.0", ()=>console.log(`บ้านผีสิง V1.12.0 listening on :${PORT}`));
