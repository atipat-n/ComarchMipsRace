# CPU Race: Single-cycle vs Multicycle MIPS บน Nexys A7-100T

| อ่านอะไร | เมื่อไร |
|---|---|
| [`docs/tutorial.md`](docs/tutorial.md) | เพิ่งเริ่ม อยากเข้าใจว่า CPU, single-cycle, multicycle คืออะไร |
| [`docs/manual.md`](docs/manual.md) | อยากรันเทสต์ เขียนโปรแกรมเอง ดู waveform หรือโหลดลงบอร์ด |
| [`docs/spec.md`](docs/spec.md) | สเปคทั้งหมด (source of truth) และการตัดสินใจของโปรเจค |
| [`docs/wire_map.md`](docs/wire_map.md) | บิตไหนของ `active` คือเส้นไหนในภาพ datapath |

## เริ่มเร็ว

```
python sim/run_all.py
```

ต้องได้บรรทัดสุดท้ายเป็น `ALL PASS` (ต้องมี Python 3 และ Icarus Verilog 12, ดู `docs/manual.md`)

## สำหรับเพื่อนที่มี Vivado 2025.2

1. แตก zip แล้วเปิด cmd ที่โฟลเดอร์ `cpu-race`
2. ถ้า `vivado` ยังไม่อยู่ใน PATH: `call <ที่ติดตั้ง Vivado>\settings64.bat`
3. `fpga\run.bat smoke program` (build แล้วโหลดลงบอร์ดที่ต่อ USB อยู่)
4. เช็กบนบอร์ด: LED ตามสวิตช์, กด BTNC แล้ว LED ติดหมด, 7-seg ขวาสุดนับ 0–F ทีละวินาที, 7-seg ซ้ายสุดแสดงค่า SW[3:0]
5. ส่งโฟลเดอร์ `build\smoke\` กลับมา (ไม่ต้องส่ง `.bit`)
