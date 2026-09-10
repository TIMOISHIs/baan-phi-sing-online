# บ้านผีสิง — V1.3 Leave Room + Ambient

## ของใหม่
- ออกจากห้องได้จาก Lobby / ระหว่างเกม / หลังจบเกม
- สร้างห้องใหม่ทันทีหลังจบเกม
- ผู้เล่นที่ออกจริงถูกเอาออกจาก Server room
- Host ออก → โอน Host ให้คนที่เหลือ
- Active player ออก → ส่งเทิร์นต่ออย่างปลอดภัย
- Trade ที่เกี่ยวข้องถูกยกเลิก

## เพลง/เสียงบรรยากาศ
ใช้ Web Audio API สร้างเสียง Original แบบ procedural โดยไม่ใช้เพลงลิขสิทธิ์: low drone + wind/room tone + haunting tones เป็นช่วง ๆ มี Toggle และ Volume

Browser ต้องได้รับการคลิกจากผู้เล่นก่อนเริ่มเสียงตาม autoplay policy

## Online
Push ไฟล์ V1.3 เข้า GitHub repo เดิม แล้ว Railway จะ redeploy อัตโนมัติ
