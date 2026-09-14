# บ้านผีสิง V1.8 — Playtest Candidate

Online multiplayer playtest build สำหรับบอร์ดเกม “บ้านผีสิง” โดยใช้การ์ดจาก Figma/PDF ชุดล่าสุดเป็น source of truth สำหรับ V1.8

## V1.8 highlights

- Lobby เลือกตัวละคร 8 ตัว: Manual / Random / Confirm / Ready และห้ามตัวละครซ้ำหลังยืนยัน
- Host สุ่ม Ghost 1 จาก 9 ตัวแบบ one-shot reveal ไม่มี reroll
- ผู้เล่นสูงสุด 6 คน และผู้เล่น HP สูงสุดเริ่มก่อน
- Card migration ครบ 147 ใบ: Room 13, Character 8, Ghost 9, Amulet 63, Sacrifice 54
- Amulet มี Draw pile + Discard pile; กองหมดจึงสับกองทิ้งกลับมา
- Spell ใช้ 1 ธูปและทอยตามเงื่อนไข, Help 18, Sanity + / - / ±, Event 12
- Character Skill ทั้ง 8 ตัวตามกติกา V1.8
- เงินใช้เป็น resource กลางสำหรับ Trade และนับคะแนนท้ายเกม
- Deck counter แสดงจำนวน Amulet จั่ว/ทิ้ง และ Sacrifice ที่เหลือ
- Ghost ทั้ง 9 มี playtest balance คนละ archetype และ ritual requirement รวม 6 ช่อง
- Artwork จาก PDF ถูกครอปและผูกเข้าการ์ดผ่าน `public/assets/cards/manifest.json`

## Run locally

```bash
npm install
npm start
```

เปิด `http://localhost:3000`

## Validation

```bash
npm test
```

`npm test` รัน V1.8 extended regression ซึ่งรวม static inventory/card checks และ core multiplayer rule flows.

ดูรายละเอียดใน `V1.8-CHANGELOG.md`
