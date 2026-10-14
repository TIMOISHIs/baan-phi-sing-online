# บ้านผีสิง v1.17.0 — Movement and special-room escape

Prepared from the v1.16.9 playtest code on 2026-10-14. Not yet deployed: the connected GitHub integration rejected branch/tree writes with HTTP 403 (Resource not accessible by integration).

## กติกาตามบรีฟ

- การทอยเดินหักเฉพาะ Fear ของสวมใส่ ไม่นับ Fear ของห้องที่ผู้เล่นยืนอยู่ ห้องที่จะเดินผ่าน/เข้าแต่ละห้องยังต้องมี Fear ไม่เกินสติที่เหลือ และยังตรวจความจุห้อง ระยะเดินสูงสุดเท่าผลรวมเต๋าตามเดิม
- กระดานสุ่มจากห้องทั่วไป 12 แบบ: ห้องปกติสีเขียว 3 ห้อง ห้องฟาร์มเครื่องเซ่นสีม่วง 3 ห้อง ห้องกับดัก 1 ห้อง ห้องคำสาป 1 ห้อง และห้องบอส 1 ห้อง รวม 9 ช่อง สุ่มชนิดย่อยและตำแหน่งห้อง แต่คงตำแหน่งบอสตามการ์ดผี ไม่มีห้องซ้ำ
- หนีห้องคำสาปเลขคู่/คี่ครั้งละ 1 ธูป เต๋าแต่ละลูกที่ตรงเงื่อนไขได้ 1 สแต็ก ครบ 2 สแต็กผ่านทันที เช่น 2/3 เก็บ 1 สแต็ก แล้ว 6/1 ครบ 2 หรือ 2/4 ผ่านในครั้งเดียว ค่าหน้าเต๋าไม่ใช่จำนวนสแต็ก
- สแต็กแยกตามผู้เล่นและห้อง คงข้ามเทิร์น/การ reconnect จนผู้เล่นออกจากห้อง การเดิน วาร์ป ย้ายโดย Event/พลังผี และการหนีสำเร็จจะล้างสแต็กเมื่อออกจากห้อง เข้าห้องคำสาปใหม่เริ่มที่ 0 แสดงจำนวนและหน้าที่เก็บใน HUD และ Game Log
- เมื่อหนีคำสาป/กับดักสำเร็จ เลือกออก 1 ห้องติดกัน (ขึ้น/ลง/ซ้าย/ขวา) ทันที ไม่ทอยเดินซ้ำ ไม่คิด Fear และไม่เสียธูปเพิ่ม ยังคงห้ามเข้าห้องเต็ม ผลของห้องปลายทางทำงานตามจังหวะเดิม รวมทางออกจาก Event, คาถาปลดห้อง และสกิลหมอธรรมที่ช่วยตัวเอง/เพื่อน
- เมื่อใช้ธูปดอกสุดท้ายแล้วหนีผ่าน ต้องเลือกทางออกให้เสร็จก่อนจบเทิร์นอัตโนมัติ ระบบหมดเวลาเลือกทางออกที่ยังเข้าได้ให้ และป้องกันการเลือกโดยผู้เล่นอื่น/คลิกซ้ำ
- ปุ่มอยู่ห้องเดิมมีแสงกระพริบเมื่อแสดงและกดได้ หยุดเมื่อระบบล็อกการตัดสินใจ และใช้กรอบคงที่สำหรับ prefers-reduced-motion

## ขอบเขต

คงค่าเงื่อนไขทอยของห้องกับดัก ผลเสียต้นเทิร์นของห้อง และระบบแรงอาฆาตของผีตามเดิม คาถาอาคมยังรอบรีฟรีเมค เปลี่ยนเฉพาะผลออกจากห้องให้ใช้กติกาทางออกใหม่ ไม่ปรับชื่อ/ค่าเงื่อนไข/เอฟเฟกต์อื่นของคาถา

## Validation

- Node syntax checks for server/client and new tests.
- New server regression: 1,800 seeded maps covering all boss positions and room variants; all 72 odd/even dice pairs; movement Fear and capacity; stack ownership/persistence/reset; trap thresholds; final-incense, timeout, curse locks; card exits and remote rescue.
- New client regression: stack text, stay-button visibility/pulse and interaction locks, reduced-motion fallback, no additional rescue roll.
- Existing movement/event/rescue tests updated for the requested rules; remaining regression tests retained.
