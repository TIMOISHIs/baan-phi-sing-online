# Baan Phi Sing Friends Update v1.14.0

เพิ่มเมนูเพื่อนหลัง ร้านค้า · กระเป๋า · ตัวละคร พร้อมค้นหาผู้เล่นจากชื่อในเกมหรือ Player ID, ส่ง/รับ/ปฏิเสธคำขอ, ดูรายชื่อเพื่อน และสถานะออนไลน์ สถานะอัปเดตทุก 20 วินาทีในขณะที่เปิดหน้าต่างเพื่อน; ผู้เล่นที่ไม่มี heartbeat เกิน 90 วินาทีจะแสดงออฟไลน์ ระบบชวนเข้าห้องยังไม่ได้เพิ่ม

## ติดตั้งไฟล์

1. แตก ZIP แล้ววางโฟลเดอร์ `Baan-Phi-Sing-v1.14.0-friends` **ไว้ในโฟลเดอร์หลักของเกมเดียวกับ `server.js`, `package.json`, `public` และ `lib`** อย่าเอาไฟล์แพตช์ไปวางทับโฟลเดอร์ `lib` เอง
2. เปิด Terminal ในโฟลเดอร์หลักของเกม แล้วรันคำสั่งตรวจ:

```bash
node Baan-Phi-Sing-v1.14.0-friends/install-v1.14.0.cjs --check
```

3. เมื่อเห็น `CHECK PASSED` ให้ติดตั้ง:

```bash
node Baan-Phi-Sing-v1.14.0-friends/install-v1.14.0.cjs
```

ตัวติดตั้งสำรองไฟล์เก่าก่อนเขียน และหยุดหากพบไฟล์ที่ไม่ตรงกับฐาน v1.13.2

## เปิดตารางเพื่อนใน Supabase

4. ใน Explorer ของโฟลเดอร์เกม เปิด `supabase/v1.14.0-friends.sql` ที่ตัวติดตั้งคัดลอกไว้ แล้วคัดลอก SQL ทั้งหมด
5. เปิด Supabase Dashboard ของโปรเจกต์เกม → **SQL Editor** → **New query** → วาง SQL → กด **Run** รอให้ขึ้น Success
6. กลับ Terminal ในโฟลเดอร์เกม แล้วรันทดสอบ:

```bash
npm test
```

ควรเห็น `PASS` รวมถึง `friends-test`, `friends-sql-test`, `friends-ui-test`.

## Deploy

7. ตรวจรายการเปลี่ยนแปลงด้วย `git status`, แล้ว commit และ push ตาม branch ที่ใช้อยู่ (เช่น `v1.8-playtest`) ให้ Railway deploy สำเร็จ
8. เปิดเกมด้วยบัญชี Google ทั้งสองบัญชี → กด **เพื่อน** → ค้นหาชื่อในเกม/วาง Player ID → ส่งคำขอ อีกบัญชีเปิด **คำขอที่ได้รับ** แล้วกดยอมรับ

การเพิ่มนี้ใช้ Supabase tables ผ่าน backend ของเกม ไม่ใส่ service key ใน browser และไม่ต้องเพิ่ม dependency หรือเปลี่ยนค่า Railway เพิ่มเติม ตารางจะเก็บคำขอ/รายชื่อเพื่อนและ heartbeat ล่าสุดหนึ่งแถวต่อผู้เล่น
