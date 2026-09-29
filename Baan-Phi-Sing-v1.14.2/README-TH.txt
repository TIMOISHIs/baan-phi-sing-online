บ้านผีสิง v1.14.2 — Login + Room

1. แตก ZIP จะได้โฟลเดอร์ Baan-Phi-Sing-v1.14.2
2. ใน Codespaces ลากโฟลเดอร์นี้ทั้งโฟลเดอร์ไปไว้ในโฟลเดอร์หลักเกม
   ให้อยู่ระดับเดียวกับ server.js, package.json และ public
   ไม่ต้องลากไฟล์ใน files ไปวางเอง
3. เปิดเมนู Terminal > New Terminal แล้วรัน:
   node Baan-Phi-Sing-v1.14.2/install-v1.14.2.cjs
4. ต้องเห็นข้อความ ติดตั้ง v1.14.2 สำเร็จ พร้อม Commit และ Push
   ถ้าแจ้งว่าไฟล์ต่างจากฐาน ให้หยุดและส่งข้อความให้มีนา ไม่ต้องลบไฟล์
5. รันทีละบรรทัด:
   git add public/index.html public/app.js public/room.css server.js package.json package-lock.json
   git commit -m "Update Login and Room UI to v1.14.2"
   git push
6. Railway เปิด service เกมที่ผูกกับ repository นี้ ตรวจ Deployments ว่ามี commit ใหม่
   ถ้าไม่ได้ deploy อัตโนมัติ ใช้ Deploy Latest Commit ของ service เกม
   รอสำเร็จ แล้วเปิดเว็บใหม่ (Windows: Ctrl+Shift+R / Mac: Cmd+Shift+R)

แพตช์นี้ไม่เพิ่ม dependency และไม่ต้องเปลี่ยน Supabase หรือ Railway Variables
การติดตั้งสำรองไฟล์ก่อนเปลี่ยน และหยุดทันทีถ้าฐานไฟล์ไม่ตรงกับ v1.14.1
ขณะอัปเดตเซิร์ฟเวอร์ ห้องที่กำลังเล่นอาจสะดุด ควรติดตั้งตอนจบเกมแล้ว

สิ่งที่เปลี่ยน
- Login ชื่อเกมและปุ่ม Google อยู่กลางจอ
- Room แบบเต็มหน้าจอแนวนอน 6 ช่องตัวละครตามภาพ
- เลือกตัวละครและ Playtest Settings เปิดกลางจอ
- ยืนยันแล้วปิดหน้าต่างและโชว์ตัวละครในช่องตัวเอง
- ผู้เล่นกดเตรียมพร้อม โฮสต์กดเริ่มเกมเมื่อยืนยันตัวละครและเพื่อนพร้อมครบ
- ออกจากห้องขวาบน กลับ Lobby
- Layout หน้า Lobby และหน้าเกมหลักคงเดิม

ผลทดสอบ: เบราว์เซอร์สองผู้เล่นในโหมดทดสอบ, 1920x1080 และ 1366x768,
Ready/ยกเลิก Ready/เปลี่ยนตัวละคร/สิทธิ์ตั้งค่าห้อง/เริ่มเข้าสู่สุ่มผี
ไม่ได้ทดสอบล็อกอิน Google จริงในเซิร์ฟเวอร์ production และยังไม่ได้ Deploy
