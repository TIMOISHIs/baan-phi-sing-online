บ้านผีสิง v1.14.3 — แผงเพื่อนใน Lobby และห้องเตรียมพร้อม

ติดตั้งบนโปรเจกต์ v1.14.2 ที่ติมใช้อยู่

1) แตก ZIP จะได้โฟลเดอร์ Baan-Phi-Sing-v1.14.3
2) ใน Codespaces ลาก “โฟลเดอร์ Baan-Phi-Sing-v1.14.3 ทั้งโฟลเดอร์” ไปไว้ในโฟลเดอร์หลักเกม ระดับเดียวกับ server.js, package.json และ public
   ห้ามลากไฟล์จาก files ไปทับเอง
3) เปิด Terminal ที่โฟลเดอร์หลักเกม (ตำแหน่งที่พิมพ์ ls แล้วเห็น server.js) แล้วรัน:
   node Baan-Phi-Sing-v1.14.3/install-v1.14.3.cjs
4) ถ้าขึ้น “ติดตั้ง v1.14.3 สำเร็จ” ให้รันทีละบรรทัด:
   git add public/index.html public/accounts.js public/styles.css public/room.css package.json package-lock.json
   git commit -m "Add friends drawer to lobby and room"
   git push
5) เปิด Railway > service เกม > Deployments ตรวจว่ามี commit ล่าสุดและสถานะ Deploy สำเร็จ
   ถ้า deploy อัตโนมัติไม่เริ่ม ให้เลือก Deploy Latest Commit
6) เปิดเว็บเกมใหม่แบบ Hard Refresh (Mac: Cmd+Shift+R / Windows: Ctrl+Shift+R)

ถ้าติดตั้งแจ้งว่าไฟล์ไม่ตรงกับ v1.14.2 ให้หยุดก่อน อย่าลบหรือวางทับไฟล์ ส่งข้อความแจ้งเตือนนั้นให้มีนาตรวจ
ตัวติดตั้งสำรองไฟล์ที่เปลี่ยนไว้ใน .patch-backups ก่อนติดตั้ง

สิ่งที่เปลี่ยน
- แผงเพื่อนเปิดจากด้านขวาได้ทั้ง Lobby และห้องเตรียมพร้อม ปิดได้จากปุ่ม ×
- แยกเพื่อนออนไลน์/ออฟไลน์และคำขอเป็นหมวดที่ย่อ/ขยายได้
- หน้าจอ Lobby/Room ขยับพื้นที่ให้แผงโดยไม่ทับเนื้อหาและช่องผู้เล่น
- ปุ่มเพื่อนมีป้ายจำนวนคำขอที่รออยู่
- ค้นหาเพื่อน ส่ง/ตอบรับ/ปฏิเสธคำขอ และสถานะออนไลน์ยังใช้ระบบเดิม
- ไม่มีการเปลี่ยน schema, Supabase migration, server API หรือระบบเชิญเพื่อนเข้าห้อง
- Login และหน้าจอเกมไม่เปลี่ยน

ผลตรวจ
- ผ่าน: friend API, friend database/RLS, friend UI; บททดสอบรุ่นก่อนหน้าส่วนใหญ่ผ่าน
- ชุด npm test ทั้งชุดสะดุดที่ duplicate-characters-test.cjs ซึ่งตรวจลำดับ HTML ของ startBtn เทียบ lobbyPlayers; ทดสอบเดียวกันสะดุดบน v1.14.2 ก่อนแพตช์นี้ด้วย
- พรีวิวใน ZIP ใช้ข้อมูลตัวอย่างสำหรับภาพเท่านั้น
- ยังไม่ได้ Commit, Push หรือ Deploy ไป Railway
