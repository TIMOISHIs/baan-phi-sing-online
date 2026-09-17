'use strict';
const data=require('./balance-data.json');
module.exports=function applyBalance(CHARS,GHOSTS,AMULETS){
 for(const [kind,items] of [['characters',CHARS],['ghosts',GHOSTS],['amulets',AMULETS]])for(const change of data[kind]){
  const item=items.find(x=>(x.key||x.id)===change.id);if(!item)throw Error('Unknown balance item '+change.id);
  const parts=change.field.split('.');let target=item;for(const key of parts.slice(0,-1)){if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid field');target=target[key]}
  target[parts.at(-1)]=change.value;
 }
 CHARS.find(x=>x.key==='por-krai').skill='ใช้ธูป 3 ดอก: เมื่อ HP 0 ตอนถึงเทิร์น คืนชีพที่ HP 2 • ครั้งเดียวต่อเกม';
 CHARS.find(x=>x.key==='doctor').skill='ใช้ธูป 3 ดอก: เพื่อนที่ยังมีชีวิตทุกคน HP +1 • ตัวเอง HP -2';
 CHARS.find(x=>x.key==='temple-dog').skill='ใช้ธูป 3 ดอก: ดูบนสุด 4 ใบ เก็บได้สูงสุด 2 ใบที่ไม่ใช่เหตุการณ์ • คืนที่เหลือตามลำดับ';
 CHARS.find(x=>x.key==='stray-cat').skill='ใช้ธูป 3 ดอก: ใช้การ์ดช่วยเหลือระยะไกลหลายใบ • เพื่อนแต่ละคนรับผลได้ 1 ใบในเทิร์นนี้';
 GHOSTS.find(x=>x.id==='ghost-occult-master').curseTrigger={kind:'sumGE',value:8,label:'ผลรวมเต๋า 8+'};
 GHOSTS.find(x=>x.id==='ghost-pob-jaothi').curseTrigger={kind:'sumLE',value:4,label:'ผลรวมเต๋า 4-'};
 GHOSTS.find(x=>x.id==='ghost-wanderer').curseTrigger={kind:'totalEquals',value:7,label:'ผลรวมเต๋า = 7'};
 for(const g of GHOSTS)g.curseText=`${g.curseTrigger.label} → Curse +1 • 3/6 เตือน • 6/6: ${g.curseEffectText}`;
};
