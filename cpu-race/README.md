# 🏎️ CPU Race — Quick Start & Workspace Guide

> Single-cycle vs Multicycle MIPS บนบอร์ด **Digilent Nexys A7-100T** แข่งกันตามเวลาจริงและแสดงผล Datapath แบบสดผ่านจอ VGA 640×480
> 📌 **สำหรับภาพรวมสถาปัตยกรรมและรายละเอียดทั้งหมด โปรดดูที่ [หน้าหลักของโปรเจค (`../README.md`)](../README.md)**

---

## 🌐 เปิดเว็บใช้งานทันที

| แอปพลิเคชัน | วิธีเปิดใช้งาน | รายละเอียด |
|---|---|---|
| 🖥️ **[CPU Race Lab](web/index.html)** | ดับเบิลคลิก [`web/index.html`](web/index.html) | **ใช้งานแบบ Offline ไม่ต้องต่อเน็ต ไม่ต้องมีบอร์ด** — ดู Single-cycle vs Multicycle แข่งกันทีละ step, บทเรียน 3 ระดับ, เขียนโค้ด Assembly, แปลงเลขฐาน, ทำแบบฝึกหัด และดูวิธีตั้งสวิตช์บนบอร์ด |
| 🔌 **[CPU Race Live](web-live/index.html)** | ดับเบิลคลิก [`web-live/index.html`](web-live/index.html) หรือรัน [`live.bat`](live.bat) | **เชื่อมต่อบอร์ดจริงผ่านสาย USB (Web Serial API บน Chrome/Edge)** — สั่งงานและดูสถานะบอร์ดจริงสดๆ บนหน้าเว็บ หากยังไม่ได้เชื่อมต่อจะแสดงสถานะ `DISCONNECTED` (ดูคู่มือใน [`docs/manual.md`](docs/manual.md) หัวข้อ 6.10) |

---

## 📚 สารบัญเอกสารใน [`docs/`](docs/)

| เอกสาร | อ่านเมื่อไหร่ |
|---|---|
| 📖 [`docs/tutorial.md`](docs/tutorial.md) | เพิ่งเริ่มต้น อยากเข้าใจพื้นฐานว่า CPU, Single-cycle และ Multicycle ทำงานและต่างกันอย่างไร |
| 🛠️ [`docs/manual.md`](docs/manual.md) | อยากรันชุดทดสอบ เขียนโปรแกรม Assembly เอง เปิดดู Waveform ใน GTKWave หรือสร้าง Bitstream ลงบอร์ด |
| 🎤 [`docs/demo_script.md`](docs/demo_script.md) | วันนำเสนอ: ลำดับการเล่น Demo, ตำแหน่งสวิตช์/ปุ่มกด, ตารางตัวเลขที่ต้องได้ และแนวคำถาม-คำตอบ |
| 📐 [`docs/spec.md`](docs/spec.md) | สเปคทั้งหมดของระบบ (Source of Truth) และการตัดสินใจทางวิศวกรรมของโปรเจค |
| 🎨 [`docs/wire_map.md`](docs/wire_map.md) | ตารางจับคู่ว่าบิตไหนของสัญญาณ `active` แทนเส้นหรือกล่องไหนในภาพ Datapath บนจอ VGA |
| 🔌 [`docs/protocol.md`](docs/protocol.md) | รายละเอียดโปรโตคอล UART (115200 bps) ระหว่างเว็บ `CPU Race Live` กับบอร์ด FPGA |

---

## ⚡ เริ่มต้นอย่างรวดเร็วในคอมพิวเตอร์ (ไม่ต้องมีบอร์ด)

ต้องมี **Python 3** (พร้อมไลบรารี `Pillow`) และ **Icarus Verilog 12** (ดูวิธีติดตั้งใน [`docs/manual.md`](docs/manual.md)):

```bash
# 1. รันชุดทดสอบทั้งหมด (ต้องขึ้น ALL PASS)
python sim/run_all.py

# 2. จำลองวงจรทั้งบอร์ดแล้วสร้างภาพหน้าจอ VGA ออกมาเป็น PNG ใน build/frames/
python sim/vga_frame.py --prog B --ov 4

# 3. ดูการทำงานของโปรแกรมทีละ step พร้อมค่า Register
python sim/trace.py programs/examples/ex_lw_add.s --reg t2
```

---

## 🔌 การสังเคราะห์วงจรและโหลดลงบอร์ด (Vivado 2025.2)

1. เปิด Command Prompt (`cmd`) ที่โฟลเดอร์ `cpu-race`
2. หากคำสั่ง `vivado` ยังไม่อยู่ใน `PATH` ให้รันสคริปต์ตั้งค่าสภาพแวดล้อมก่อน:
   ```bat
   call <โฟลเดอร์ที่ติดตั้ง Vivado>\2025.2\Vivado\settings64.bat
   ```
3. **ขั้นที่ 1 — ทดสอบบอร์ดเบื้องต้น (Smoke Test):**
   ```bat
   fpga\run.bat smoke program
   ```
   - **ผลที่ควรเห็นบนบอร์ด:** ไฟ LED ติดตามสวิตช์, กด `BTNC` ค้างแล้ว LED ติดครบ 16 ดวง, 7-Segment หลักขวาสุดนับ `0–F` ทีละวินาที, 7-Segment หลักซ้ายสุดแสดงค่า `SW[3:0]`
4. **ขั้นที่ 2 — สังเคราะห์และโหลดวงจรตัวเต็ม (CPU Race):**
   ```bat
   fpga\run.bat top program
   ```
   - **ผลที่ควรเห็นเมื่อต่อจอ VGA:**
     - ภาพ Datapath สองฝั่งขึ้นบนจอ พร้อมข้อความแถวบน `PROG A  OV 0  TIME 00000000`
     - โยก `SW15` ลง (`0` = Step Mode) แล้วกดปุ่มกลาง `BTNC`: เวลาจะเดินทีละจังหวะและเส้นสีส้ม/ฟ้าบนจอจะเปลี่ยนตามการทำงานจริง
     - โยก `SW15` ขึ้น (`1` = Run Mode), ตั้งความเร็ว `SW14–12 = 011` แล้วกดปุ่มขวา `BTNR`: ทั้งสอง CPU จะวิ่งแข่งกันประมาณ 15 วินาที และแสดงคำว่า **`WINNER`** เมื่อจบการทำงาน
5. ไฟล์รายงานผลลัพธ์ทั้งหมด (`vivado.log`, `timing_summary.rpt`, `utilization.rpt`, `drc.rpt`, `messages_summary.txt`) จะถูกเก็บไว้ใน `build\smoke\` และ `build\top\`
