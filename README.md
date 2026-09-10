# บ้านผีสิง — V1.2 Online Test Candidate

เป้าหมายของ Build นี้คือพิสูจน์ Multiplayer ก่อนเอาขึ้น URL จริง

## Multiplayer
- Create Room / Join Room
- 1–4 คน
- Server-authoritative state
- Private hands
- Turn sync
- Room/HP/Score/Curse sync
- Trade
- Reconnect กลับที่นั่งเดิม
- Host Playtest Settings
- Playtest Stats + JSON export

## Automated smoke test
เพิ่ม `smoke-test.js`

ทดสอบ:
1. Server health
2. Host สร้าง Room
3. Client คนที่ 2 Join
4. ทั้งสองเครื่องเห็น Map/Boss ตรงกัน
5. Public state ไม่เผยมือการ์ด
6. Private state ได้ Amulet เริ่มต้นเฉพาะของตัวเอง
7. Host ทอยและ State sync
8. ส่ง Turn ไป Client คนที่ 2
9. Client คนที่ 2 Disconnect + Resume
10. Reconnect แล้วยังเป็นผู้เล่นคนเดิม

รัน:
```bash
npm install
npm run smoke
```

ดู `DEPLOY-ONLINE.md` สำหรับขั้นเอาขึ้นเว็บ

## GitHub Actions
มี `.github/workflows/smoke.yml` สำหรับรัน Multiplayer 2-client smoke test อัตโนมัติทุกครั้งที่ push ขึ้น `main` หรือเปิด Pull Request
