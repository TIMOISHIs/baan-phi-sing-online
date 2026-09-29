# บ้านผีสิง v1.14.1 — หน้า Lobby

แพตช์นี้ใช้กับเกม **v1.14.0** ที่ติดตั้งระบบเพื่อนแล้ว ไม่ต้องรัน SQL เพิ่มใน Supabase และไม่ต้องย้ายไฟล์ใน `public` เอง

สิ่งที่เปลี่ยน: หน้า Lobby เต็มจอแนวนอน 1920×1080 ไม่มีการเลื่อนหน้าในขนาดนี้; โปรไฟล์ซ้ายบน; เงินบาทที่ใช้ได้จริงและทอง 0 กรัมที่ยังเป็นตัวเลขแสดงผลอยู่ขวาบน; ปุ่มสร้างห้อง/เข้าห้องเพื่อนและเมนูล่างตามภาพตัวอย่าง; แสงควันกับเงาผีผ่านช้า ๆ; ปุ่มร้านค้าที่อ่านข้อความได้; รายชื่อเพลงเหลือ Lo-Fi เที่ยงคืน โคมผี และฝนหลอน ค่าเพลงเก่าที่เคยเลือกจะเปลี่ยนเป็นเที่ยงคืนเอง

## วางโฟลเดอร์แพตช์

1. ดาวน์โหลด ZIP และแตกไฟล์ในคอม จะได้โฟลเดอร์ `Baan-Phi-Sing-v1.14.1-lobby`
2. เปิด Codespaces ของเกม ลาก **ทั้งโฟลเดอร์** นี้ไปวางที่โฟลเดอร์หลัก **ระดับเดียวกับ `server.js` และ `package.json`** โฟลเดอร์ `Baan-Phi-Sing-v1.14.0-friends` เก็บไว้ได้ ไม่ต้องลบ
3. ใน Terminal ของ Codespaces ซึ่งขึ้นว่า `/workspaces/baan-phi-sing-online` ให้ตรวจ:

```bash
node Baan-Phi-Sing-v1.14.1-lobby/install-v1.14.1.cjs --check
```

เมื่อขึ้น `CHECK PASSED` ให้ติดตั้ง:

```bash
node Baan-Phi-Sing-v1.14.1-lobby/install-v1.14.1.cjs
```

ตัวติดตั้งสำรองไฟล์เดิมก่อนแก้ และหยุดทันทีหากไฟล์เกมไม่ตรงกับ v1.14.0 หากขึ้น `หยุดก่อน` ให้ส่งภาพผล Terminal ให้มีนาดู **อย่าคัดลอกไฟล์ใน `files` ทับเอง**

## ทดสอบและส่งขึ้น Railway

```bash
npm test
```

เมื่อทดสอบผ่าน ให้เพิ่มเฉพาะแปดไฟล์ของแพตช์นี้:

```bash
git add public/index.html public/app.js public/shop.js public/shop.css public/styles.css shop-dom-test.cjs package.json package-lock.json
git diff --cached --name-only
git commit -m "Update lobby layout and music v1.14.1"
```

หลังเกมที่กำลังเล่นจบแล้ว ค่อยส่งขึ้น branch ของเกม เพราะ Railway อาจเริ่มเซิร์ฟเวอร์ใหม่:

```bash
git push origin v1.8-playtest
```

ใน Railway เปิด service ของเกม → Deployments → ตรวจรายการ commit ล่าสุดว่าขึ้น Success/Active ก่อนเปิดเว็บทดสอบ หาก Deploy อัตโนมัติแล้ว ไม่ต้องกดซ้ำ
