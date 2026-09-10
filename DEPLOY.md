# เอา V1.0 ขึ้นเว็บเพื่อส่งให้เพื่อน

โปรเจกต์นี้ต้องใช้ Hosting ที่รัน Node.js และ WebSocket ได้ เพราะ Multiplayer ใช้ Socket.IO

## ทางที่ง่าย
1. สร้าง Git repository แล้วใส่ไฟล์ทั้งหมดในโฟลเดอร์นี้
2. เชื่อม repository กับบริการ Node hosting
3. Build command: `npm install`
4. Start command: `npm start`
5. Port ไม่ต้องล็อกเอง — server อ่าน `process.env.PORT`
6. Health check ใช้ `/health`

มี `render.yaml`, `Dockerfile` และ `Procfile` เตรียมไว้ให้แล้ว

เมื่อ Deploy สำเร็จ:
- Host เปิด URL → Create Room
- ส่ง URL เดียว + Room Code ให้เพื่อน
- เพื่อนเปิด URL → Join Room
- ถ้า Refresh/เน็ตหลุด ระบบพยายาม Reconnect ที่นั่งเดิมอัตโนมัติ

## ข้อจำกัดของ V1.0
- Game State ยังอยู่ใน memory ของ server: ถ้า hosting restart ห้องที่กำลังเล่นจะหาย
- เหมาะกับ Playtest 1 ห้อง/กลุ่มเล็กก่อน
- Production จริงควรย้าย Room State ไป Redis/Database
