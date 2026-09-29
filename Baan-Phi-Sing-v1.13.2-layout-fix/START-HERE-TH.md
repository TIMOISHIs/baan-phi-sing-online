# แก้เลย์เอาต์ v1.13.2 ต่อจาก v1.13.1

- แก้ปุ่มย่อกระเป๋าแย่งคอลัมน์: เครื่องเซ่น / Amulet / สวมใส่ / สถานะ กลับมาเรียงแถวเดียวบนคอม
- แถบปุ่มย่อ–ขยายอยู่ด้านล่างของทั้งแผง และคงความสูงแผงเดิม
- กองจั่วสองกองและกองทิ้งอยู่ชิดขอบขวากระดาน โดยคงขนาดกองเด็ค

## ติดตั้ง

1. แตก ZIP และวางโฟลเดอร์ Baan-Phi-Sing-v1.13.2-layout-fix ในโฟลเดอร์หลักเกมที่มี server.js และ package.json
2. เปิด Terminal ในโฟลเดอร์หลักเกม แล้วรัน:

```bash
node Baan-Phi-Sing-v1.13.2-layout-fix/install-v1.13.2.cjs --check
```

3. เมื่อ CHECK PASSED ให้รัน:

```bash
node Baan-Phi-Sing-v1.13.2-layout-fix/install-v1.13.2.cjs
```

4. ส่ง 3 ไฟล์ขึ้น GitHub:

```bash
git add public/index.html public/dashboard.js public/dashboard.css
git commit -m "Fix v1.13.2 inventory columns and adjacent decks"
git push origin v1.8-playtest
```

5. รอ Railway Deploy คอมมิตใหม่นี้สำเร็จ แล้วรีเฟรชเว็บด้วย Ctrl + Shift + R

ตัวติดตั้งตรวจไฟล์ v1.13.1 ก่อนเขียนและสำรองไฟล์เดิม ไม่ต้องรัน SQL หรือลง dependencies เพิ่ม
