# บ้านผีสิง V1.6 — Full Amulet + Combat Presentation

- รอ animation เต๋าหยุดก่อนจึงอัปเดต state/โชว์ห้องที่เดินได้
- HP ลด/เพิ่ม: server ส่ง HP event ตรงไปยังผู้เล่นคนนั้น พร้อมสาเหตุ + notification กลางจอ + SFX
- เดินย้ายห้อง: destination pulse + banner + footstep SFX
- เปลี่ยนเทิร์น: handoff notification + chime
- Amulet Hand ย้ายเป็น floating hand ติดหน้าจอ แยกจาก “พื้นที่ของฉัน”
- พื้นที่ของฉันเหลือ Character / สีตัวเดิน / สวมใส่ / เครื่องเซ่น
- P1–P4 มีสีประจำที่ต่างกันและ seat ไม่สลับเมื่อคนอื่นออกจากห้อง
- Chat Box realtime ด้านขวาเหนือเพลง เปิด/ย่อได้ มี unread badge และเก็บข้อความล่าสุดใน room memory

หมายเหตุ: Chat และ Room state ยังเป็น in-memory เหมือนระบบเดิม จึงหายเมื่อ Railway restart/redeploy.

## Run
`npm start`

## Test
`npm run smoke`


## V1.6
ดูรายละเอียดใน `V1.6-CHANGELOG.md` — รอบนี้ล็อก Amulet Deck 54 ใบ, sanity decision, equipment stats, combat modifier presentation, card inspection และ fan hand UI.
