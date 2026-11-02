# CPU Race: Single-cycle vs Multicycle MIPS บน Nexys A7-100T

**เว็บ CPU Race Lab:** ดับเบิลคลิก [`web/index.html`](web/index.html) (ไม่ต้องต่อเน็ต) ดู single vs multi แข่งกัน, บทเรียน, เขียนโปรแกรม, เลขฐาน, แบบฝึก และวิธีตั้งสวิตช์บนบอร์ด

| อ่านอะไร | เมื่อไร |
|---|---|
| [`docs/tutorial.md`](docs/tutorial.md) | เพิ่งเริ่ม อยากเข้าใจว่า CPU, single-cycle, multicycle คืออะไร |
| [`docs/manual.md`](docs/manual.md) | อยากรันเทสต์ เขียนโปรแกรมเอง ดู waveform หรือโหลดลงบอร์ด |
| [`docs/demo_script.md`](docs/demo_script.md) | วันนำเสนอ: ลำดับการเล่น demo, ตำแหน่งสวิตช์, ตัวเลขที่ต้องได้, คำถามที่น่าจะโดน |
| [`docs/spec.md`](docs/spec.md) | สเปคทั้งหมด (source of truth) และการตัดสินใจของโปรเจค |
| [`docs/wire_map.md`](docs/wire_map.md) | บิตไหนของ `active` คือเส้นไหนในภาพ datapath |

## เริ่มเร็ว (ในคอม ไม่ต้องมีบอร์ด)

```
python sim/run_all.py                       ต้องได้ ALL PASS
python sim/vga_frame.py --prog B --ov 4     ดูภาพจอที่วงจรสร้าง (build/frames/)
```

ต้องมี Python 3 + Pillow และ Icarus Verilog 12 (ดู `docs/manual.md`)

## สำหรับเพื่อนที่มี Vivado 2025.2

1. แตก zip แล้วเปิด cmd ที่โฟลเดอร์ `cpu-race`
2. ถ้า `vivado` ยังไม่อยู่ใน PATH: `call <ที่ติดตั้ง Vivado>\settings64.bat`
3. **ทดสอบบอร์ดก่อน:** `fpga\run.bat smoke program`
   - ควรเห็น: LED ตามสวิตช์, กด BTNC แล้ว LED ติดหมด, 7-seg ขวาสุดนับ 0–F ทีละวินาที, 7-seg ซ้ายสุดแสดงค่า SW[3:0]
4. **ตัวเต็ม:** `fpga\run.bat top program` (ใช้เวลานานกว่า) แล้วต่อจอ VGA
   - ควรเห็น: ภาพ datapath สองฝั่งบนจอ, `PROG A  OV 0  TIME 00000000` ที่แถวบน
   - SW15 ลง แล้วกด BTNC: เวลาเดินทีละจังหวะ เส้นบนจอเปลี่ยน
   - SW15 ขึ้น, SW14–12 = 011 แล้วกด BTNR: วิ่งเองประมาณ 15 วินาที จบแล้วขึ้น WINNER
5. ส่งโฟลเดอร์ `build\smoke\` และ `build\top\` กลับมา (**ไม่ต้องส่ง `.bit`**) ถ้า build ไม่ผ่านให้ส่ง `vivado.log` มาด้วย
