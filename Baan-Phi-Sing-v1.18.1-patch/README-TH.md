# ติดตั้งแพตช์ v1.18.1

ใช้กับโปรเจกต์ v1.18.0 บน branch `v1.8-playtest`

1. แตก ZIP แล้วอัปโหลดโฟลเดอร์ `Baan-Phi-Sing-v1.18.1-patch` ทั้งโฟลเดอร์ไปไว้ระดับเดียวกับ `server.js` และ `package.json` ใน Codespaces
2. เปิด Terminal ที่โฟลเดอร์โปรเจกต์ แล้วรัน:

```bash
node Baan-Phi-Sing-v1.18.1-patch/install.cjs && node Baan-Phi-Sing-v1.18.1-patch/stage.cjs
```

คำสั่งนี้ตรวจเวอร์ชันและไฟล์ก่อนเขียน สำรองไฟล์เดิม ติดตั้ง รันทดสอบทั้งหมด แล้ว stage เฉพาะไฟล์ของแพตช์ ถ้าไฟล์เดิมต่างจากที่ตรวจไว้จะหยุดก่อนเขียน ถ้าทดสอบไม่ผ่านจะคืนไฟล์เดิมและไม่ stage

3. เมื่อขึ้น `PATCH v1.18.1 PASS` และ `STAGE PASS` ตรวจรายการ staged ใน Source Control แล้ว commit/push:

```bash
git commit -m "v1.18.1 board card movement and reveal timing" && git push origin v1.8-playtest
```

ไม่ต้อง `git add .` และไม่ต้อง commit โฟลเดอร์แพตช์หรือ `.patch-backups`

4. รอ Railway deploy จาก branch นี้ แล้วรีเฟรชเกมเพื่อรับไฟล์ใหม่ แนะนำเริ่มห้องทดสอบใหม่

กติกาและข้อจำกัดการตรวจสอบรอบนี้อยู่ที่ `files/RELEASE-v1.18.1.md`
