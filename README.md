# บ้านผีสิง V1.7 — Turn Presentation & Pace

Online multiplayer playtest build สำหรับบอร์ดเกม “บ้านผีสิง”

## V1.7 highlights
- Cinematic Dice Focus: ปุ่มทอยกลางจอ + dim ฉากหลัง + full-screen dice animation
- Turn transition แบบสไลด์ขวา → กลาง → ซ้าย พร้อม SFX
- Action buttons แบบ tactile bubble และ TURN END แยกด้านขวา
- ธูปหมด 3 ดอก → Auto End Turn หลัง resolve effect ที่ค้างอยู่
- Turn Pace Ring 60 วินาที ไม่มีตัวเลข และเตือนเสียงเฉพาะเจ้าของเทิร์นโดยไม่ Skip
- Ritual flow: เลือกเครื่องเซ่น → ทอย → เลือก equipment modifier → เทียบเงื่อนไข → แสดงผล

## ระบบเดิมที่ยังอยู่
- Multiplayer room / reconnect / host transfer / chat
- 3×3 random rooms + Ghost/Boss position
- Amulet Deck 54 ใบตามข้อมูล playtest ปัจจุบัน
- Floating Amulet Hand, อ่าน Amulet/Character ได้ตลอด
- Equipment stats, Sanity cards, HP feedback, movement effect
- Playtest settings + export stats

ดูรายละเอียดรอบนี้ใน `V1.7-CHANGELOG.md`

## Run locally
```bash
npm install
npm start
```
จากนั้นเปิด `http://localhost:3000`

## Smoke test
```bash
npm run smoke
```
