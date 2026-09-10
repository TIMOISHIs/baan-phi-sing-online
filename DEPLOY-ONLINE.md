# บ้านผีสิง V1.2 — Online Deploy

V1.2 เป็น Online Test Candidate สำหรับเล่นคนละเครื่อง/คนละสถานที่

## ก่อน Deploy
รัน:
```bash
npm install
npm run smoke
```

ถ้าผ่าน จะเห็น `"ok": true` พร้อม checks:
- sameMap
- privateHandsProtected
- turnSync
- reconnectPreservedSeat

## Deploy บน Render
โปรเจกต์มี `render.yaml` แล้ว

- Runtime: Node
- Build: `npm install`
- Start: `npm start`
- Health check: `/health`

หลัง Deploy สำเร็จ:
1. Host เปิด URL
2. Create Room
3. Copy Room Code
4. ส่ง URL + Room Code ให้เพื่อน
5. เพื่อน Join Room จากคนละเครื่องได้

## Deploy บน Railway
มี `railway.json` แล้ว

- Build: `npm install`
- Start: `npm start`
- Health check: `/health`

## หมายเหตุสำคัญ
Game State V1.2 ยังเก็บใน memory ของ server:
- Refresh/เน็ตหลุด → Reconnect กลับที่นั่งเดิมได้
- แต่ถ้า hosting restart/redeploy → ห้องที่กำลังเล่นจะหาย
เหมาะกับ Friends Test ก่อน Production

Production รอบหลังควรย้าย Room State ไป Redis/Database
