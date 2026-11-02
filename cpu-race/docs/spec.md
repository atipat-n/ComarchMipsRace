# CPU Race: Single-cycle vs Multicycle MIPS บน Nexys A7-100T

> สเปคโปรเจคสำหรับวิชา Computer Architecture (CoE KKU) ใช้เป็นบรีฟให้ทีมและ AI ที่มาช่วยทำ
> สถานะ (2 พ.ย. 2569): เลือกหัวข้อและตัดสินใจแนวทางหลักแล้ว (ดูหัวข้อ 0.2) ยังไม่เริ่มเขียนโค้ด

---

## 0. วิธีใช้ไฟล์นี้ (อ่านก่อน)

- ไฟล์นี้คือ **source of truth** ของโปรเจค ถ้าตัดสินใจอะไรใหม่ให้แก้ที่นี่ก่อน แล้วค่อยแก้โค้ด
- สำหรับ AI ที่ช่วยทำ:
  - ทำตามลำดับ Milestone ในหัวข้อ 15 อย่าข้ามไปทำ VGA หรือเว็บก่อนที่ core จะผ่าน simulation
  - ทุกโมดูล RTL ต้องมี testbench ที่รันด้วย Icarus Verilog ได้ ไม่ใช่รันได้แค่ใน Vivado
  - ห้ามใช้ MicroBlaze หรือ soft-CPU สำเร็จรูป เพราะโจทย์คือเราสร้าง CPU เอง IP ที่ใช้ได้มีแค่ Clocking Wizard (หรือจะหาร clock เองก็ได้)
  - เรื่องที่ยังไม่รู้อยู่ในหัวข้อ 18 ถ้าต้องใช้ข้อมูลพวกนั้น **ให้ถามผู้ใช้ อย่าเดา**
- ภาษา HDL: **Verilog-2001** เพื่อให้ใช้ได้ทั้ง Vivado และ Icarus Verilog

---

## 0.1 สถานะตอนนี้ และวิธีทำงาน (อัปเดต 2 พ.ย. 2569)

| เรื่อง | สถานะ |
|---|---|
| หัวข้อ | เลือกแล้ว: CPU Race (หัวข้อ 1) |
| บอร์ด | มี Nexys A7-100T ให้ใช้ |
| Vivado | **เครื่องของผู้ใช้ไม่มี** เครื่องเพื่อน 1 คนมี **Vivado 2025.2** และเคยโหลดลงบอร์ดจริงได้ตอนเรียนวิชาดิจิตอล ⇒ ไดรเวอร์และสายโหลดใช้ได้แล้ว **เพื่อนคนนี้กับบอร์ดอยู่ด้วยกัน (ตอบแล้ว 2 พ.ย.)** แต่ตั้งใจ **ไปต่อบอร์ดทีหลังสุด** |
| ห้องนำเสนอ | **มีช่อง VGA** (ผู้ใช้ยืนยันแล้ว) ยังควรพกตัวแปลงสำรอง |
| เครื่องของผู้ใช้ | Python 3.14 + **Icarus Verilog 12 (ติดตั้ง 2 พ.ย. ผ่าน winget `Icarus.Verilog` อยู่ที่ `C:\iverilog`, มี GTKWave ใน `C:\iverilog\gtkwave\bin`)** ทำ M1–M4 และ software ทั้งหมดได้โดยไม่ต้องมีบอร์ด |
| ที่เก็บไฟล์ | **เก็บทุกไฟล์ในโฟลเดอร์เดียวผ่าน VS Code บนเครื่องผู้ใช้ก่อน** ยังไม่ขึ้น Git/GitHub ไว้ค่อยตัดสินใจทีหลัง |
| cpuSim | **ได้ไฟล์แล้ว** อยู่ใน `Slide/ExampleFromProf/` (รุ่น `main32V7`) ตัดสินใจวิธีใช้แล้วในหัวข้อ 2.3 |
| ที่อยู่โปรเจค | **`D:\Comarch2\Project\cpu-race\`** (ย้ายเข้า `Project/` ตามที่ผู้ใช้ขอ 2 พ.ย.) สไลด์และไฟล์ของอาจารย์ยังอยู่ที่ `D:\Comarch2\Slide\` |
| ทำแล้ว (2 พ.ย.) | **ทั้งระบบเสร็จใน simulation:** single + multi + race_ctrl + boot ROM/loader + ปุ่ม/7-seg/LED + VGA (ภาพ datapath สร้างด้วยโค้ด, ตัวหนังสือ, แถบแข่ง) รวมใน `rtl/top.v` · `python sim/run_all.py` = ALL PASS: เทียบ 4 ทาง (ref_model, cpuSim ของอาจารย์, single, multi) + จำลองทั้งบอร์ดแข่ง demo A/B 6 กรณี เวลาจบตรงสูตร · ภาพจอจริงจาก simulation อยู่ใน `build/frames/` · เอกสาร: `manual.md`, `tutorial.md`, `wire_map.md`, `demo_script.md` |
| **ยังไม่ได้ทดสอบ** | **ยังไม่เคย build บน Vivado** (เครื่องผู้ใช้ไม่มี): MMCM ใน `clk_gen.v`, timing ที่ 25 MHz, การ infer BRAM/LUTRAM, ขา VGA จะรู้ผลตอนเพื่อนรัน `fpga\run.bat top` |
| ขั้นต่อไป | เพื่อนรัน `fpga\run.bat smoke program` แล้ว `fpga\run.bat top program` → ส่ง `build/<target>/` กลับมาอ่าน → แก้ตาม log → ซ้อมตาม `docs/demo_script.md` → อัดคลิปสำรอง · (stretch) UART + เว็บ |

**กติกาการทำงานช่วงนี้ (สำหรับ AI และทีม):**
- ทำงานในโฟลเดอร์ `Project/cpu-race/` ตามโครงในหัวข้อ 13 **ไม่ต้อง `git init` ไม่ต้อง commit หรือ push** จนกว่าผู้ใช้จะสั่ง
- เขียนให้ย้ายขึ้น Git ทีหลังได้ง่าย: ใช้ path แบบ relative เท่านั้น ห้ามฝัง path ของเครื่องใครไว้ในสคริปต์ ไฟล์ที่เครื่องมือสร้างออกมา (project ของ Vivado, ผล simulation, `.ppm`, `.vcd`) ให้ไปอยู่ใน `build/` และเตรียม `.gitignore` ที่กัน `build/` ไว้ตั้งแต่แรก
- **Vivado 2025.2 ไม่เก็บไฟล์ `.xpr`** `fpga/build.tcl` ใช้ **non-project mode** สร้างทุกอย่างใหม่ใน `build/<target>/` ทุกครั้งจากโค้ดใน `rtl/` `constr/` `mem/` บน Windows รัน `fpga\run.bat smoke` (หรือ `fpga\run.bat smoke program` เพื่อโหลดลงบอร์ดด้วย) จากที่ไหนก็ได้ เพราะ path อ้างจากตำแหน่งสคริปต์
- **ไฟล์ขา:** อย่าแก้ `constr/*.xdc` ด้วยมือ ให้รัน `python tools/make_xdc.py` ซึ่ง uncomment จาก `constr/Nexys-A7-100T-Master.xdc` (ดาวน์โหลดจาก `Digilent/digilent-xdc` 2 พ.ย.) ตามรายชื่อ port ในสคริปต์
- **ส่งไฟล์ให้เพื่อนที่มี Vivado (ตอนที่ยังไม่มี Git):** zip โฟลเดอร์ `rtl/` `constr/` `mem/` `fpga/` ตั้งชื่อมีวันที่ เช่น `cpu-race_2026-11-05.zip` เพื่อนแตกแล้วรัน `fpga\run.bat` ผลที่ต้องส่งกลับคือโฟลเดอร์ `build/<target>/` ยกเว้น `.bit` (มี `vivado.log`, `timing_summary.rpt`, `utilization.rpt`, `drc.rpt`, `messages_summary.txt`) เพื่อให้ฝั่งผู้ใช้อ่านปัญหาได้โดยไม่ต้องมี Vivado
- ถ้าจะย้ายขึ้น Git ทีหลัง: `git init` ในโฟลเดอร์เดิมแล้ว push ได้เลย ไม่ต้องจัดโครงใหม่

---

## 0.2 การตัดสินใจที่ล็อกแล้ว (2 พ.ย. 2569)

| # | เรื่อง | ตัดสินใจ | เหตุผล |
|---|---|---|---|
| D1 | ลำดับการทำงาน | ทำ **simulation ที่บ้านก่อน** (M1 → M4 + งานวาดภาพ + tools) แล้วค่อยไปลงบอร์ดที่เครื่องเพื่อนเป็นรอบๆ ท้ายงาน | บอร์ดกับ Vivado อยู่กับเพื่อน เข้าถึงยาก ส่วน sim ทำได้ทุกที่ |
| D2 | ความเสี่ยงของ D1 | ไฟล์ M0 (`top_smoke.v`, `build.tcl`, xdc) เขียนเตรียมไว้ก่อนเลย และ **แนะนำให้นัดเพื่อนรัน M0 สั้นๆ 15 นาทีหนึ่งครั้งตั้งแต่เนิ่นๆ** เพื่อให้รู้ปัญหา part/ขา/ไดรเวอร์ก่อนที่งานใหญ่เสร็จ (ไม่บังคับ แต่ถ้าข้ามต้องรับความเสี่ยงตามหัวข้อ 19) | ถ้าเจอปัญหา build ครั้งแรกตอนท้ายโปรเจคจะแก้ไม่ทัน |
| D3 | cpuSim | ใช้ `main32V7` ที่มีในมือ **ไม่แก้ไฟล์ต้นฉบับของอาจารย์** copy ไว้ใน `tools/third_party/cpusim_v7/` แล้วให้ `cpusim_adapter.py` ครอบ: แปลงชื่อ register และ `j halt`→`HALT`, เติม SUB/AND/OR/SLT ที่ cpuSim ไม่มี, แก้บั๊ก ADD (ใช้ `ops[3]`) โดย monkeypatch ใน adapter | เลือกรุ่นเองได้ ไม่ต้องรอ V7.1 และไม่ต้องไปขอไฟล์ใหม่ |
| D4 | เว็บ | ทำเป็น **เว็บ local บนคอมผู้ใช้** (ดูหัวข้อ 11) ต่อบอร์ดผ่าน USB-UART ด้วย Web Serial ที่ `localhost` และมี **โหมด Mock** ไว้พัฒนาโดยไม่มีบอร์ด | ตอบโจทย์ "ต่อเข้าคอมขึ้นเว็บ" โดยไม่ต้องมี server ภายนอก |
| D5 | Demo หลัก | ยังคงเป็น **บอร์ด → VGA → จอ** แบบ standalone ไม่พึ่งคอม เว็บเป็นส่วนเสริม (M6) | กันความเสี่ยงห้องนำเสนอไม่มีเน็ตหรือคอมมีปัญหา |
| D6 | ภาพ datapath บนจอ | **วาดด้วยโค้ด** (`tools/gen_screen.py`) แทนการวาดใน PowerPoint ทุกเส้นมี wire-ID ตาม `docs/wire_map.md` ไม่มี anti-aliasing ฟอนต์ 8×16 render จาก Consolas (`tools/gen_font.py`) | ต้องเสร็จภายในวันเดียว (ผู้ใช้ขอ 2 พ.ย.), แก้ตำแหน่งเส้นได้ง่ายและไม่มีปัญหาสีเพี้ยน |
| D7 | Clock | ใช้ primitive `MMCME2_BASE` + `BUFG` ใน `rtl/clk_gen.v` (100→25 MHz) แทน Clocking Wizard; simulation ใช้ `-DSIM` ข้าม MMCM | ไม่ต้องสร้าง IP, build ด้วยสคริปต์ล้วนได้ |
| D8 | โปรแกรม demo | A = บวก 1..10 (พลิกที่ ov=6), B = รวม array คลี่ลูปทีละ 2 (พลิกที่ ov=4) ⇒ ที่ ov=4 ผู้ชนะต่างกันตามโปรแกรม (หัวข้อ 14) | ได้เรื่องเล่าที่ชัดกว่า "พลิกที่ ov=4" อย่างเดียว |
| D9 | ทดสอบทั้งบอร์ด | `sim/tb_top.v` จำลอง `top.v` ทั้งตัว (ปุ่ม, loader, race, VGA) และจับภาพจอเป็น PNG ได้ (`sim/vga_frame.py`) | ตรวจหน้าจอได้โดยไม่ต้องมีบอร์ด |

---

## 1. ภาพรวมในประโยคเดียว

สร้าง CPU MIPS สองแบบ (single-cycle กับ multicycle) ลงบอร์ด FPGA ตัวเดียวกัน รันโปรแกรมเดียวกันพร้อมกัน แล้วให้จอ VGA วาด datapath ของทั้งสองตัวแบบสด เส้นที่กำลังทำงานติดไฟ พร้อมแถบแข่งว่าใครจบก่อน **ตามเวลาจริง ไม่ใช่ตามจำนวน clock**

**แก่นที่อยากสอน:** "เร็วกว่า ดูจากจำนวน clock หรือดูจากเวลา?" CPU ที่ใช้ clock มากกว่า (multicycle) อาจจบเร็วกว่า เพราะ clock แต่ละอันสั้นกว่า แต่ถ้า overhead ของ register สูง ผลจะพลิกกลับ

**ข้อความที่ลงในตารางนำเสนอ (กลุ่ม 19, 15:20):**
- ประเภท: `ซอฟต์แวร์/ฮาร์ดแวร์`
- ทำอะไร: `CPU MIPS บน FPGA เทียบ single-cycle กับ multicycle แสดง datapath ผ่านจอ VGA`

---

## 2. บริบทของวิชา

### 2.1 เงื่อนไขการนำเสนอ (จากตารางของวิชา)
- นำเสนอ 10–15 นาที ถาม-ตอบ 5–10 นาที รวมกลุ่มละ 20 นาที
- **ต้องมี demo** ถ้าไม่ทำงานตามที่หวังไว้ จะโดนย้ายไปนำเสนอท้ายสุดเป็นรอบซ่อม
- อาจารย์ (ธัชพงศ์ กตัญญูกุล) เคยแนะนำว่า "ทำ CPU เล็กๆ ใน FPGA" และแบ่งกันทำแล้วมาประกอบได้

### 2.2 สไลด์ที่ใช้อ้างอิง (มีในมือ)
| ไฟล์ | เรื่อง | ใช้ตรงไหน |
|---|---|---|
| `w01b.pdf` | Introduction, Performance | สมการเวลา = IC × CPI × T, ใช้ตอนอธิบายการแข่ง |
| `w02a.pdf`, `w02b3.pdf` | Instructions (ISA) | รูปแบบคำสั่ง R/I/J และ encoding |
| `w04a.pdf` | The Processor (single-cycle) | datapath, control, ALU control, ตาราง ALUOp |
| `w04c.pdf` | Multicycle Machine | ตาราง 5 step และสัญญาณ control ของแต่ละ step (หน้า 4) |
| `w04c_pipeline.pdf` | Pipelining | ไม่อยู่ใน scope (เป็นงานต่อยอดได้) |

**ข้อควรระวังจากสไลด์:** ใน `w04c.pdf` หน้า 2 เขียน funct ของ `slt` เป็น `0xA` แต่ MIPS จริงคือ `0x2A` ในโปรเจคนี้ใช้ `0x2A` **ยืนยันแล้ว** จาก `w04a.pdf` หน้า 25 และ `isa.py` ของ cpuSim (`101010`)

### 2.3 cpuSim ของอาจารย์ (golden model)
- อาจารย์และพี่ TA ทำ Python simulator (เริ่มจาก `cpu_simulator_python-main` แล้วต่อยอดเป็น `main32V1`–`V7`) ตั้งใจเอาไว้ตรวจงานใน autolab
- ไฟล์อยู่ที่ `Slide/ExampleFromProf/` (`drive-download-...zip` ข้างในมี V1–V7, `Readme.txt` และ `Readme3-7.txt` อธิบายแต่ละรุ่น) **รุ่นที่ใช้: `main32V7`** (ดูการตัดสินใจ D3)
- พี่ TA บอกว่ายังไม่รองรับชื่อ register (เช่น `$t0`) และยังไม่มีคำสั่ง JAL
- **โปรเจคนี้ใช้ cpuSim เป็นตัวตรวจคำตอบ:** โปรแกรมเดียวกันรันบน cpuSim, บน single-cycle และบน multicycle แล้วค่า register ทั้งสามต้องตรงกัน

**ข้อจำกัดของ V7 ที่อ่านจากโค้ดแล้ว (ต้องจัดการใน `cpusim_adapter.py`):**
| เรื่อง | รายละเอียด | วิธีจัดการ |
|---|---|---|
| คำสั่งที่ `execute()` ไม่มี | SUB, AND, OR, SLT (มีแค่ ADD, ADDI, ADDIU, LW, SW, LUI, ORI, SLTI, SLTIU, BEQ, BNE, J, HALT) | adapter เติมการทำงานของ 4 คำสั่งนี้เอง ผลเทียบถือว่า "cpuSim+patch" ไม่ใช่ของอาจารย์ล้วน |
| บั๊ก ADD | ใช้ `ops[3]` ทั้งที่มี operand แค่ index 0–2 | patch ใน adapter |
| `decode3` ของ R-type | ได้แค่ opcode + ศูนย์ ไม่ใส่ rs/rt/rd/funct | **ห้ามใช้ hex ของ cpuSim เป็นตัวเทียบ machine code ของ R-type** ใช้ `asm.py` ของเราเป็นหลัก |
| รูปแบบ input | `ADD $1 $2 $3` คั่นด้วยช่องว่าง ไม่มีลูกน้ำ ใช้ `$N` เท่านั้น มี `.ORG` และ `HALT` | adapter แปลงจากชื่อ register / ลูกน้ำ / `j halt` |
| Memory | dict แบบ byte address แต่ `SW` เก็บทั้ง word ไว้ key เดียว | เทียบเฉพาะค่า **register** และค่าที่ `lw` อ่านกลับ ไม่เทียบ byte ใน memory |
| ตัวแปร `textpos` | ไม่ถูกกำหนดถ้าบรรทัดแรกไม่ใช่ `.ORG` | adapter ใส่ `.ORG 0x0` ให้เสมอ |

### 2.4 กลุ่มอื่นทำอะไรไปแล้ว (เลี่ยงอย่าให้ชน)
- กลุ่ม 2: เว็บไซต์เพื่อการเรียนรู้ + Simulation
- กลุ่ม 5: เครื่องคิดเลข (ซอฟต์แวร์/ฮาร์ดแวร์)
- กลุ่ม 6: IDE for FPGA
- กลุ่ม 7: Hardware Cache Controller
- กลุ่ม 12: เว็บสอนแปลง C เป็น MIPS opcode มีโจทย์ ระบบคะแนน และ leaderboard
- กลุ่มอื่นๆ ที่ได้ยินมา: คูณ/หาร 8/16 bit บนบอร์ด, บวกลบ floating point บนบอร์ด, ระบบแนว ATM
- **สรุป:** อย่าเน้นวงจรคำนวณ อย่าเน้น cache และอย่าทำเว็บ leaderboard จุดขายของเราคือ **ตัว CPU ทั้งตัวที่มองเห็นข้างใน + การแข่งกันตามเวลา**

---

## 3. เป้าหมายและเกณฑ์ความสำเร็จ

### 3.1 MVP: ต้องได้ ถ้าได้แค่นี้ก็นำเสนอได้
- [ ] Single-cycle MIPS บนบอร์ด รันโปรแกรม demo ที่ฝังไว้ใน ROM ได้ถูกต้อง
- [ ] 7-seg แสดง PC และจำนวนคำสั่งที่รันไปแล้ว กดปุ่ม step ได้ทีละคำสั่ง
- [ ] จอ VGA แสดงภาพ datapath ของ single-cycle และไฮไลต์เส้นที่ทำงานตามคำสั่งปัจจุบัน
- [ ] ผล register ตรงกับ cpuSim ในทุก test program

### 3.2 Target: เป้าหลัก
- [ ] Multicycle MIPS (FSM) บนบอร์ดเดียวกัน ภาพ datapath อยู่อีกครึ่งจอ ไฮไลต์ตาม state
- [ ] **Race mode:** นาฬิกาเวลาร่วม (หัวข้อ 9) ทั้งสองตัวเดินตามเวลาจริงของตัวเอง แถบแข่งและตัวนับเวลาบนจอ
- [ ] สวิตช์ปรับ register overhead (0–15) แล้วเห็นผลแข่งพลิก
- [ ] โปรแกรม demo 2 ตัวฝังใน ROM เลือกด้วยสวิตช์ (demo ได้โดยไม่ต้องต่อคอม)

### 3.3 Stretch: ถ้ามีเวลาเหลือ
- [ ] UART + เว็บ local: เขียน assembly บนเว็บ → assemble → ส่งลงบอร์ด → ดึงค่า register กลับมาเทียบกับ cpuSim อัตโนมัติ และดูสถานะสดของทั้งสอง core (หัวข้อ 11)
- [ ] เสียง: ช่อง audio PWM บนบอร์ดเล่นโน้ตตามประเภทคำสั่ง (R = โน้ตหนึ่ง, lw/sw = อีกโน้ต, beq/j = กลอง)
- [ ] Exception/interrupt แบบในสไลด์ w04c หน้า 10–12 (handler อยู่ที่ 0x80001000 / 0x80002000)

---

## 4. ฮาร์ดแวร์และเครื่องมือ

### 4.1 บอร์ด Digilent Nexys A7-100T
- FPGA: Xilinx Artix-7 XC7A100T (ประมาณ 63k LUT, BRAM ประมาณ 4.8 Mbit)
- Clock: 100 MHz
- I/O ที่ใช้: สวิตช์ 16, ปุ่ม 5 (BTNC/U/D/L/R) + ปุ่ม CPU_RESETN, LED 16, 7-seg 8 หลัก (common anode, active-low, ต้องสแกนเอง), VGA 12 bit (4:4:4), USB-UART (FTDI), mono audio PWM
- **ไฟล์ขา:** ใช้ `Nexys-A7-100T-Master.xdc` จาก repo `Digilent/digilent-xdc` บน GitHub แล้ว uncomment เฉพาะขาที่ใช้ **อย่าพิมพ์ขาเอง**

### 4.2 ซอฟต์แวร์
- Vivado **2025.2** (รุ่น ML Standard ฟรี รองรับ Artix-7) **มีเฉพาะที่เครื่องเพื่อน** เครื่องผู้ใช้ไม่มี: ใช้ synthesize, implement, โหลดลงบอร์ด
- VS Code: editor หลักของผู้ใช้ เก็บโปรเจคทั้งหมดไว้ในโฟลเดอร์เดียว
- Icarus Verilog + GTKWave: simulation หลัก ทุกคนรันที่บ้านได้โดยไม่ต้องมีบอร์ด
- Python 3: assembler, reference model, สคริปต์แปลงรูป, สคริปต์เทียบผล
- Chrome หรือ Edge: เว็บใช้ Web Serial API คุยกับบอร์ดตรงๆ โดยไม่ต้องมี backend

### 4.3 อุปกรณ์วัน demo
- จอหรือโปรเจคเตอร์ที่มีช่อง **VGA** หรือตัวแปลง VGA→HDMI แบบ active (⚠️ เช็กห้องนำเสนอล่วงหน้า)
- สาย micro-USB (ทั้งจ่ายไฟ โหลด bitstream และเป็น UART)
- คลิปวิดีโอ demo สำรองไว้เผื่อบอร์ดมีปัญหา

---

## 5. สถาปัตยกรรมระบบ

```
             ┌──────────────────────── Nexys A7-100T ───────────────────────────┐
             │                                                                  │
 [Web/PC] ◄──┼─► uart_rx/tx ─► uart_cmd ──┬─► load memory (both cores)         │
  (stretch)  │                            ├─► step / run / reset / dump        │
             │                            │                                    │
 [Buttons] ──┼─► debounce ─► race_ctrl ◄──┘                                    │
 [Switches]──┼─►              │  (เวลาร่วม, enable ให้แต่ละ core)              │
             │          ┌─────┴──────┐                                         │
             │          ▼            ▼                                         │
             │   single_cycle    multi_cycle      boot_rom (โปรแกรม demo A/B)  │
             │      _cpu            _cpu    ◄──── copy ลง RAM ตอน reset        │
             │          │ active_s   │ active_m, state, regs, pc ...           │
             │          ▼            ▼                                         │
             │        vga_renderer (ภาพพื้นหลัง wire-ID + text overlay) ───────┼─► VGA จอ
             │        sevenseg_driver ─────────────────────────────────────────┼─► 7-seg
             │        leds ────────────────────────────────────────────────────┼─► LED
             │        (stretch) audio_pwm ─────────────────────────────────────┼─► audio
             └──────────────────────────────────────────────────────────────────┘
```

### 5.1 Clock: ใช้ clock domain เดียว
- สร้าง **25 MHz** จาก 100 MHz (Clocking Wizard หรือ MMCM) แล้วใช้ clock นี้ทั้งระบบ: VGA, core, UART, 7-seg
- core ไม่ได้เดินทุก clock แต่เดินเมื่อได้ `enable` pulse จาก `race_ctrl` วิธีนี้ไม่มีปัญหาข้าม clock domain (CDC)
- 25 MHz กับวงจร single-cycle ที่เป็น combinational ยาวๆ ผ่าน timing สบาย

### 5.2 เรื่องสำคัญ: หน่วยความจำของ core ต้องอ่านแบบ asynchronous
- Single-cycle ต้องอ่าน instruction memory กับ data memory **ภายใน cycle เดียว** แต่ BRAM อ่านแบบ synchronous (ได้ข้อมูล clock ถัดไป)
- **วิธีแก้:** ให้หน่วยความจำของ core เป็น **distributed RAM (LUTRAM)** คือ `reg [31:0] mem [0:255]` ที่อ่านด้วย `assign` (async read) และเขียนตอน posedge ซึ่ง Vivado จะ infer เป็น LUTRAM ให้เอง
- ขนาดเล็กพอ: 256 word = 1 KB ต่อหน่วย
- ใช้ BRAM เฉพาะกับภาพพื้นหลัง VGA และ font ROM

---

## 6. ISA (ชุดคำสั่ง)

ใช้ subset ตามสไลด์ w04c หน้า 2 บวก `addi` (ต้องมีไว้เขียนลูปกับตั้งค่าคงที่)

| คำสั่ง | Format | opcode | funct | ความหมาย |
|---|---|---|---|---|
| `add rd, rs, rt` | R | 0x00 | 0x20 | rd = rs + rt |
| `sub rd, rs, rt` | R | 0x00 | 0x22 | rd = rs − rt |
| `and rd, rs, rt` | R | 0x00 | 0x24 | rd = rs & rt |
| `or rd, rs, rt` | R | 0x00 | 0x25 | rd = rs \| rt |
| `slt rd, rs, rt` | R | 0x00 | 0x2A | rd = (rs < rt) ? 1 : 0 (signed) |
| `addi rt, rs, imm` | I | 0x08 | – | rt = rs + signext(imm) |
| `lw rt, off(rs)` | I | 0x23 | – | rt = Mem[rs + signext(off)] |
| `sw rt, off(rs)` | I | 0x2B | – | Mem[rs + signext(off)] = rt |
| `beq rs, rt, off` | I | 0x04 | – | if (rs == rt) PC = PC+4 + (signext(off) << 2) |
| `j target` | J | 0x02 | – | PC = {PC+4[31:28], target, 00} |

- `$0` เป็น 0 เสมอ (เขียนไม่ติด)
- ไม่มี overflow exception (add/sub/addi ทำเหมือน addu)
- **HALT:** ถือว่าโปรแกรมจบเมื่อเจอ `j` ที่กระโดดไปหาตัวเอง (`halt: j halt`, assembler มี pseudo `halt` ให้)
  - **นิยามที่ล็อกแล้ว (ทำใน M1):** `done` เป็น combinational = "คำสั่งที่ PC ชี้อยู่คือ halt" core จึง **ไม่รันคำสั่ง halt และไม่นับใน retired/step** ใช้ได้เพราะหน่วยความจำอ่านแบบ async
  - multicycle: ให้ `done = (state == S0) && (mem[PC] เป็น halt)` แบบเดียวกัน จะได้ไม่ต้องเก็บ `pc_instr` และจำนวน step ตรงกับหัวข้อ 8.3 พอดี
- คำสั่งที่ไม่รู้จัก: ให้ถือเป็น NOP (นับ retired) และตั้ง flag `illegal` ไว้ debug; multicycle ใช้ 2 step (FETCH + DECODE แล้วกลับ S0)
- **lw/sw ต้องอ้าง address ในช่วง 0x400–0x7FF และลงตัว word เท่านั้น** ถ้าออกนอกช่วง single กับ multi จะให้ผลต่างกัน (multi จะไปโดนโปรแกรม) `ref_model.py` จึงถือว่าเป็นโปรแกรมผิดและหยุดพร้อม error

### 6.1 Memory map (ทั้งสอง core ใช้ address เดียวกัน)
| ช่วง address (byte) | ใช้ทำอะไร | Single-cycle | Multicycle |
|---|---|---|---|
| `0x0000–0x03FF` | โปรแกรม (256 word) | IMEM | unified mem ครึ่งล่าง |
| `0x0400–0x07FF` | ข้อมูล (256 word) | DMEM | unified mem ครึ่งบน |

- single-cycle: IMEM ใช้ addr[9:2], DMEM ใช้ addr[9:2] ของ address ที่ลบ 0x400 แล้ว
- multicycle: memory เดียวขนาด 512 word ใช้ addr[10:2]
- ⇒ โปรแกรมเดียวกันให้ผลเหมือนกันทั้งสอง core
- **ไฟล์ `.mem`** (ผลจาก `tools/asm.py`): 512 บรรทัด hex 8 หลัก บรรทัด 0–255 = text, 256–511 = data ตรงกับ word address ของ loader port (`ld_addr[8]=1` = data) และ unified memory ของ multicycle

---

## 7. Single-cycle core

### 7.1 ส่วนประกอบ
PC, IMEM, RegFile (2 read port + 1 write port + **1 debug read port** สำหรับจอ), sign-extend, ALU, ALU control, DMEM, mux RegDst/ALUSrc/MemtoReg/PCSrc/Jump, adder PC+4, adder branch, shift-left-2 สองตัว (branch และ jump)

### 7.2 Main control (ตามสไลด์ w04a + addi)
| คำสั่ง | RegDst | ALUSrc | MemtoReg | RegWrite | MemRead | MemWrite | Branch | Jump | ALUOp |
|---|---|---|---|---|---|---|---|---|---|
| R-type | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 10 |
| lw | 0 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 00 |
| sw | x | 1 | x | 0 | 0 | 1 | 0 | 0 | 00 |
| beq | x | 0 | x | 0 | 0 | 0 | 1 | 0 | 01 |
| j | x | x | x | 0 | 0 | 0 | 0 | 1 | xx |
| addi | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 00 |

### 7.3 ALU control
| ALUOp | funct | ALU op | รหัส ALU (4 bit) |
|---|---|---|---|
| 00 | x | add | 0010 |
| 01 | x | subtract | 0110 |
| 10 | 0x20 | add | 0010 |
| 10 | 0x22 | subtract | 0110 |
| 10 | 0x24 | AND | 0000 |
| 10 | 0x25 | OR | 0001 |
| 10 | 0x2A | slt | 0111 |

ใช้โมดูล `alu.v` และ `alu_control.v` ตัวเดียวกันกับ multicycle

### 7.4 Output สำหรับแสดงผล
- `active_s[31:0]`: บอกว่าเส้นไหนใน datapath กำลังมีข้อมูลที่มีความหมาย คำนวณแบบ combinational จาก control signal ของคำสั่งปัจจุบัน (ดูรายการเส้นในหัวข้อ 10.3)
- `pc`, `instr`, `retired_count`, `done`, `dbg_reg_data` (อ่านจาก `dbg_reg_addr`)

---

## 8. Multicycle core

### 8.1 ส่วนประกอบ
PC, unified Memory, IR, MDR, RegFile (+ debug port), A, B, ALUOut, sign-extend, shift-left-2, ALU, ALU control, mux IorD/RegDst/MemtoReg/ALUSrcA/ALUSrcB(4 ทาง)/PCSource(3 ทาง), FSM control
(datapath ตามรูป "Multicycle Machine's Full Datapath" ในสไลด์ w04c หน้า 3)

### 8.2 FSM: ขยายจากตาราง 5 step ในสไลด์ w04c หน้า 4 โดยเพิ่ม addi
| State | ชื่อ | สัญญาณที่ assert | ไป state ถัดไป |
|---|---|---|---|
| S0 | FETCH | MemRead, IorD=0, IRWrite, ALUSrcA=0, ALUSrcB=01, ALUOp=00, PCSource=00, PCWrite | S1 |
| S1 | DECODE | ALUSrcA=0, ALUSrcB=11, ALUOp=00 | lw/sw→S2, R→S6, beq→S8, j→S9, addi→S10 |
| S2 | MEM_ADDR | ALUSrcA=1, ALUSrcB=10, ALUOp=00 | lw→S3, sw→S5 |
| S3 | MEM_READ | MemRead, IorD=1 | S4 |
| S4 | MEM_WB | RegDst=0, MemtoReg=1, RegWrite | S0 |
| S5 | MEM_WRITE | MemWrite, IorD=1 | S0 |
| S6 | EXECUTE | ALUSrcA=1, ALUSrcB=00, ALUOp=10 | S7 |
| S7 | ALU_WB | RegDst=1, MemtoReg=0, RegWrite | S0 |
| S8 | BRANCH | ALUSrcA=1, ALUSrcB=00, ALUOp=01, PCWriteCond, PCSource=01 | S0 |
| S9 | JUMP | PCWrite, PCSource=10 | S0 |
| S10 | ADDI_EXEC | ALUSrcA=1, ALUSrcB=10, ALUOp=00 | S11 |
| S11 | ADDI_WB | RegDst=0, MemtoReg=0, RegWrite | S0 |

- state register 4 bit (สไลด์ใช้ 3 bit เพราะมีแค่ 5 step แต่ของเรามี 12 state)
- **รายละเอียดที่ทำจริงใน M4:** A, B, ALUOut, MDR รับค่าใหม่ทุก step แบบในสไลด์ (IR รับเฉพาะ IRWrite), `retired` นับตอนที่ state กำลังกลับไป S0, คำสั่งที่ไม่รู้จักออกจาก S1 กลับ S0 เลย (2 step), state เปลี่ยนเฉพาะเมื่อได้ `en` และยังไม่ `done`
- PC เขียนเมื่อ `PCWrite | (PCWriteCond & Zero)`

### 8.3 จำนวน step ต่อคำสั่ง (ใช้คำนวณการแข่ง)
| คำสั่ง | step |
|---|---|
| lw | 5 |
| sw, R-type, addi | 4 |
| beq, j | 3 |

### 8.4 Output สำหรับแสดงผล
- `state[3:0]`, `active_m[31:0]` (คำนวณจาก state ปัจจุบัน), `pc`, `ir`, `retired_count` (นับตอนกลับมา S0), `done`, `dbg_reg_data`

---

## 9. Race mode: โมเดลเวลา (หัวใจของงาน)

### 9.1 ปัญหา
บนบอร์ดจริงทั้งสอง core ใช้ clock เดียวกัน ถ้าปล่อยให้เดินทุก clock เหมือนกัน จะไม่เห็นว่า single-cycle มี clock ที่ยาวกว่า เลยต้องจำลอง "เวลา" แยกจาก clock จริง

### 9.2 โมเดล
- หน่วยเวลาเล็กสุด: **1 unit** (สมมติว่า 1 step ของงานใช้เวลา 10 unit)
- `ov` = register overhead (0–15 unit) ตั้งจากสวิตช์ SW[3:0]
- **Single-cycle:** 1 คำสั่งใช้เวลา `T_s = 50 + ov` unit ทุกคำสั่ง (clock ต้องยาวพอสำหรับ lw = 5 step + overhead หนึ่งครั้ง)
- **Multicycle:** 1 step ใช้เวลา `T_m = 10 + ov` unit (ทุก step มี overhead ของ register คั่น)

### 9.3 วงจร `race_ctrl`
```
time       : ตัวนับเวลาร่วม (32 bit)
next_s     : เวลาที่ single จะเดินครั้งถัดไป  (เริ่มที่ T_s)
next_m     : เวลาที่ multi จะเดินครั้งถัดไป   (เริ่มที่ T_m)

ทุกครั้งที่ time เพิ่ม:
  if (!done_s && time >= next_s) { en_s = 1; next_s += T_s; }
  if (!done_m && time >= next_m) { en_m = 1; next_m += T_m; }
```
- **Step mode (SW[15]=0):** กด BTNC หนึ่งครั้ง = กระโดด `time` ไปที่ `min(next_s, next_m)` ทุกครั้งที่กดจะมีอย่างน้อยหนึ่ง core เดิน (ถ้าเวลาตรงกันก็เดินพร้อมกัน)
- **Run mode (SW[15]=1):** `time` เพิ่ม 1 unit ทุก N ms (ปรับความเร็วด้วย SW[14:12]) ให้ animation ดูทัน
- ทั้งสอง core ใช้ `time` ตัวเดียวกัน ⇒ ใครถึง `done` ก่อนคือผู้ชนะตามเวลาจริง

### 9.4 ตัวอย่างที่ใช้เล่าตอนนำเสนอ
| คำสั่ง | Single (ov=0) | Multi (ov=0) | Single (ov=4) | Multi (ov=4) |
|---|---|---|---|---|
| R-type | 50 | 40 ✅ | 54 ✅ | 56 |
| lw | 50 | 50 (เสมอ) | 54 ✅ | 70 |
| beq | 50 | 30 ✅ | 54 | 42 ✅ |

- multicycle ชนะ R-type เมื่อ `4(10+ov) < 50+ov` ⇒ `ov ≤ 3`
- ⇒ **demo:** รันโปรแกรม A ที่ ov=0 แล้ว multi ชนะ จากนั้นโยกสวิตช์ไป ov=4 แล้วรันใหม่ จะเห็นผลพลิก

---

## 10. การแสดงผล

### 10.1 VGA 640×480 @ 60 Hz
- pixel clock 25 MHz (มาตรฐานคือ 25.175 แต่ 25 ใช้ได้กับจอเกือบทุกตัว)
- แนวนอน: 640 visible + 16 front porch + 96 sync + 48 back porch = 800
- แนวตั้ง: 480 visible + 10 front porch + 2 sync + 33 back porch = 525
- hsync/vsync เป็น active-low
- สี 12 bit (R4 G4 B4)

### 10.2 เทคนิคภาพพื้นหลังแบบ wire-ID (ไม่ต้องวาดเส้นด้วยวงจร)
1. วาดภาพทั้งจอ 640×480 ในโปรแกรมวาดรูป (Inkscape, PowerPoint หรือ Figma แล้ว export เป็น PNG ขนาดพอดี **ปิด anti-aliasing**)
2. ให้แต่ละเส้นหรือแต่ละกล่องใน datapath ใช้ **สีเฉพาะของตัวเอง** ตาม palette ใน `tools/palette.json`
3. `tools/img2mem.py` แปลงสีเป็น index ขนาด 6 bit แล้ว export เป็น `mem/bg.mem` สำหรับ `$readmemh`
   - index 0 = พื้นหลัง, 1 = เส้นหรือตัวหนังสือคงที่ (label, กรอบ), 2–31 = เส้นของ single-cycle, 32–63 = เส้นของ multicycle
4. ตอนแสดงผล วงจรอ่าน index ของ pixel แล้วเลือกสี:
   - index 2–31: `active_s[index-2]` ? ส้ม : เทาเข้ม
   - index 32–63: `active_m[index-32]` ? ฟ้า : เทาเข้ม
5. ขนาดภาพ: 640×480×6 bit ≈ 1.84 Mbit ซึ่งพอใน BRAM ของ 100T (ประมาณ 4.8 Mbit)
   - ถ้าอยากประหยัด ใช้ 320×240 แล้วขยาย ×2 ได้ แต่ label จะแตก

### 10.3 รายการเส้น (wire ID) เริ่มต้น ปรับได้ตอนวาดรูป

**Single-cycle (`active_s`):**
| bit | เส้น | active เมื่อ |
|---|---|---|
| 0 | PC → IMEM | เสมอ |
| 1 | PC → adder +4 → mux PCSrc | เสมอ |
| 2 | IMEM → rs/rt → RegFile read | ทุกคำสั่งยกเว้น j |
| 3 | IMEM[15:11] → mux RegDst | RegDst=1 & RegWrite |
| 4 | IMEM[20:16] → mux RegDst | RegDst=0 & RegWrite |
| 5 | RegFile ReadData1 → ALU A | R, lw, sw, beq, addi |
| 6 | RegFile ReadData2 → mux ALUSrc | R, beq |
| 7 | sign-extend → mux ALUSrc | lw, sw, addi |
| 8 | ALU result → DMEM address | lw, sw |
| 9 | ReadData2 → DMEM write data | sw |
| 10 | DMEM read data → mux MemtoReg | lw |
| 11 | ALU result → mux MemtoReg | R, addi |
| 12 | mux MemtoReg → RegFile write data | RegWrite=1 |
| 13 | sign-extend → shift-2 → branch adder | beq |
| 14 | branch adder → mux PCSrc | beq & Zero |
| 15 | ALU Zero → AND gate | beq |
| 16 | IMEM[25:0] → shift-2 → jump address | j |
| 17 | jump mux → PC | j |
| 18 | กล่อง DMEM (ไฮไลต์กรอบ) | lw, sw |
| 19 | กล่อง ALU | ทุกคำสั่งยกเว้น j |

**Multicycle (`active_m`):** ทำแบบเดียวกันแต่ตัดสินจาก **state** เช่น S0 ไฮไลต์ PC→mux IorD→Memory→IR และ PC→ALU (+4)→PC, S3 ไฮไลต์ ALUOut→mux IorD→Memory→MDR ฯลฯ ตาราง state × wire **ร่างแรกอยู่ใน `docs/wire_map.md` แล้ว (26 บิต ทำใน RTL แล้ว)** ปรับได้ตอนวาดรูป

### 10.4 Layout ของจอ

**ที่ทำจริง (2 พ.ย.):** ภาพจริงจาก simulation ดูได้ด้วย `python sim/vga_frame.py` (ผลใน `build/frames/`)
- แถว 0: ชื่อ, PROG A/B, OV, TIME · แถว 2: หัวข้อสองฝั่ง + ชื่อ state ของ multi
- y 32–351: ภาพ datapath ที่ **สร้างด้วยโค้ด** (`tools/gen_screen.py`, การตัดสินใจ D6) ซ้าย single ขวา multi
- แถว 22–23: PC, IR + ชื่อคำสั่ง, RETIRED, TIME, สถานะ WINNER / TIE / FINISH · แถว 24–25: แถบแข่ง (ยาว ≈ เวลา/12 px)
- แถว 26–28: `$t0..$t7` ของทั้งสอง core · แถว 29: วิธีใช้สวิตช์/ปุ่ม
- ตัวหนังสือมาจาก template (`mem/text.mem`) ที่บอกว่าช่องไหนเป็นตัวอักษรคงที่ ช่องไหนเป็นเลข hex ของค่าไหน (รูปแบบอยู่ต้นไฟล์ `rtl/vga/vga_renderer.v`)

ร่างเดิม:
```
y=0   ┌────────────────────────────────────────────────────────────┐
      │ SINGLE-CYCLE  vs  MULTICYCLE      Program: A   ov=0        │ (32 px)
y=32  ├─────────────────────────────┬──────────────────────────────┤
      │ datapath single-cycle       │ datapath multicycle          │
      │ (ไฮไลต์ส้ม)                 │ (ไฮไลต์ฟ้า)  State: S3 MEM_RD │ (320 px)
y=352 ├─────────────────────────────┴──────────────────────────────┤
      │ S: PC=0x0010 instr=8C080400 lw   retired=12 time=600       │
      │ M: PC=0x000C state=S3        retired=10 time=590           │
      │ S ████████████████░░░░░░  M ██████████████████░░░░  WINNER │
      │ $t0..$t7 ของทั้งสอง core (hex)                             │ (128 px)
y=480 └────────────────────────────────────────────────────────────┘
```
- ตัวหนังสือที่เปลี่ยนตามเวลาใช้ font ROM 8×16 (ASCII) วาดทับลงในกรอบที่กำหนดตำแหน่งไว้ (text grid 80×30 ตัว)
- ตัวเลขแสดงเป็น hex เพื่อไม่ต้องมีวงจรแปลงเป็นเลขฐานสิบ (ถ้ามีเวลาค่อยเพิ่ม double-dabble)
- แถบแข่งยาวตามสัดส่วน `time_done_or_now / scale` และขึ้นคำว่า `WINNER` ข้างตัวที่จบก่อน (ไม่ใช้สีอย่างเดียว)

### 10.5 7-seg, LED, สวิตช์, ปุ่ม
| อุปกรณ์ | หน้าที่ |
|---|---|
| 7-seg หลัก 7–4 | single: retired count (hex) / time (สลับด้วย BTNU) มีจุดคั่นระหว่างหลัก 4 กับ 3 |
| 7-seg หลัก 3–0 | multi: retired count (hex) / time |
| LED[15] / LED[14] | single done / multi done |
| LED[13] / LED[12] | กำลังวิ่ง (run mode) / โปรแกรมที่โหลดอยู่คือ B |
| LED[11:0] | state ของ multicycle แบบ one-hot (S0–S11) |
| SW[3:0] | overhead `ov` 0–15 (เปลี่ยนกลางทางได้ มีผลกับ step ถัดไป) |
| SW[4] | เลือกโปรแกรม demo A / B (มีผลตอนกด BTNL หรือ CPU_RESETN) |
| SW[14:12] | ความเร็วใน run mode: 0=20, 1=50, 2=100, 3=200, 4=400, 5=1000, 6=4000 หน่วยเวลา/วินาที, 7=เร็วสุด (แนะนำ 3: demo A ใช้ ~15 วินาที) |
| SW[15] | 0 = step, 1 = run |
| BTNC | step (กระโดดไปเหตุการณ์ถัดไป) |
| BTNR | run / pause |
| BTNL | reset core: copy โปรแกรมจาก ROM ลง RAM, PC=0, reg=0, time=0 |
| BTNU | สลับสิ่งที่ 7-seg แสดง |
| CPU_RESETN | reset ทั้งระบบ แล้วโหลดโปรแกรมให้อัตโนมัติ (เปิดเครื่องมาก็พร้อมเล่น) |

- ปุ่มทุกปุ่มต้องผ่าน debounce (ประมาณ 10–20 ms) และ edge detect
- 7-seg ต้องสแกนทีละหลักที่ประมาณ 1 kHz ต่อหลัก

### 10.6 Boot ROM: demo ได้โดยไม่ต้องต่อคอม
- ฝังโปรแกรม A และ B ลง ROM ตอน synthesize (`$readmemh("progA.mem")`)
- ตอนกด BTNL วงจร copy จะลอก ROM ที่เลือกลงหน่วยความจำของทั้งสอง core (ใช้ประมาณ 512 clock ซึ่งเร็วมาก)
- เหตุผล: โปรแกรมเขียนทับ data memory ได้ ถ้าไม่ copy ใหม่ รอบที่สองจะได้ผลไม่เหมือนรอบแรก

---

## 11. UART + เว็บ (Stretch)

### 11.1 Protocol: 115200 baud, 8N1, ข้อมูลแบบ binary big-endian
**คอม → บอร์ด**
| คำสั่ง | รูปแบบ | ผล |
|---|---|---|
| `L` | `'L' addr_hi addr_lo n_hi n_lo` + n×4 byte | เขียน n word ลง memory ของทั้งสอง core ตั้งแต่ word address `addr` แล้วตอบ `'K'` |
| `R` | `'R'` | reset core (ไม่ copy จาก ROM) |
| `S` | `'S'` | step หนึ่งเหตุการณ์ |
| `G` / `P` | `'G'` / `'P'` | run / pause |
| `O` | `'O' ov` | ตั้ง overhead แทนค่าจากสวิตช์ |
| `D` | `'D'` | ขอ dump สถานะ |

**บอร์ด → คอม (ตอบคำสั่ง `D`)**
`0xA5` + [single: PC(4) retired(4) time_done(4) done(1) pad(1) regs 32×4] + [multi: เหมือนกันแต่ pad เป็น state] + checksum (ผลรวม mod 256 ของทุก byte หลัง 0xA5)

### 11.2 เว็บ local (`web/`)
- **ต่อบอร์ดเข้าคอมผู้ใช้ด้วยสาย micro-USB เส้นเดียวกับที่ใช้โหลด bitstream** คอมจะเห็นเป็น COM port (ไดรเวอร์ FTDI ของ Windows ลงเองได้ ถ้าไม่ขึ้นให้ติดตั้งไดรเวอร์ของ Digilent)
- HTML + JS ธรรมดา ใช้ **Web Serial API** (Chrome/Edge) ไม่มี backend
- **เปิดเว็บผ่าน localhost:** รัน `python -m http.server 8000 --directory web` แล้วเข้า `http://localhost:8000` (Web Serial ต้องการ secure context ซึ่ง `localhost` ผ่าน ส่วนการเปิดไฟล์ตรงๆ แบบ `file://` ให้ถือว่าไม่รับประกัน) ไม่ต้องต่อเน็ตและไม่ต้องมี server ภายนอก
- **ดูสถานะสด:** เว็บส่ง `D` ทุก ~200 ms (ใน run mode) แล้ววาด register 32 ตัว, PC, state, retired, time ของทั้งสอง core พร้อมแถบแข่ง และอาจวาด datapath แบบ SVG ที่ไฮไลต์ตามค่า `active` (ต้องเพิ่ม `active` เข้าไปในแพ็กเก็ต dump ตอนทำ M6)
- **โหมด Mock (ไม่ต้องมีบอร์ด):** ปุ่มสลับให้เว็บเรียก `ref_model.py` ผ่าน Pyodide แทน serial ใช้พัฒนาและทดสอบหน้าเว็บที่บ้านได้ก่อนที่บอร์ดจะอยู่ในมือ
- ช่องเขียน assembly → ปุ่ม Assemble → ปุ่ม Load to board → Run → ปุ่ม Compare
- assembler เขียนเป็น Python ไฟล์เดียว (`tools/asm.py`) แล้วเว็บรันผ่าน **Pyodide** ได้ จะได้มี source เดียวใช้ทั้ง test และเว็บ
  - เก็บไฟล์ Pyodide ไว้ในเครื่อง เผื่อห้องนำเสนอไม่มีเน็ต
- Compare: รันโปรแกรมเดียวกันใน cpuSim (ผ่าน Pyodide หรือรันล่วงหน้า) แล้วเทียบ register 32 ตัวกับค่าที่ dump จากบอร์ดทั้งสอง core แสดงเป็นตาราง ✓ หรือ ✗ พร้อมข้อความ
- **แผนสำรอง:** ถ้าเว็บไม่ทัน ใช้ `tools/send.py` (pyserial) เป็น CLI แทน

---

## 12. Software tools (`tools/`)

| ไฟล์ | หน้าที่ |
|---|---|
| `asm.py` | assembler: รองรับ label, ชื่อ register (`$t0`, `$s1`, `$zero` ฯลฯ) และเลข `$8`, directive `.text` / `.data` / `.word` → output เป็น `.mem` (hex ต่อบรรทัด) แยก text กับ data ตาม memory map |
| `ref_model.py` | simulator ของเราเองที่ทำตามสเปคหัวข้อ 6 (ใช้เทียบเผื่อ cpuSim ใช้กับ ISA ของเราไม่ได้ทั้งหมด) |
| `cpusim_adapter.py` | แปลงโปรแกรมให้อยู่ในรูปที่ cpuSimV7.1 รับได้ แล้วดึงผล register ออกมา (เขียนหลังอ่าน Readme ของ cpuSim) |
| `compare.py` | รัน testbench ของทั้งสอง core + ref_model + cpuSim แล้วรายงานว่า register ตรงกันไหม |
| `img2mem.py` | PNG → `bg.mem` ตาม palette |
| `race_calc.py` | คำนวณเวลาแข่งที่คาดไว้ของโปรแกรมใดๆ ที่ ov ต่างๆ ใช้เช็กกับบอร์ดและทำกราฟลงสไลด์ |
| `send.py` | ส่งคำสั่ง UART ผ่าน CLI |

---

## 13. โครงสร้างโฟลเดอร์

```
Project/cpu-race/          ← (D:\Comarch2\Project\cpu-race)
├── README.md
├── .gitignore             ← กัน build/ ไว้ตั้งแต่แรก (เผื่อขึ้น Git ทีหลัง)
├── build/                 ← ไฟล์ที่เครื่องมือสร้าง (Vivado project, .vcd, .ppm) ไม่เก็บเข้า Git
├── docs/
│   ├── spec.md            ← ไฟล์นี้
│   ├── manual.md          ← คู่มือการใช้งาน (ติดตั้ง, รันเทสต์, เขียนโปรแกรม, แก้ปัญหา)
│   ├── tutorial.md        ← บทเรียน single-cycle / multicycle สำหรับคนเริ่มจากศูนย์
│   ├── wire_map.md        ← ตาราง state/instr × wire ID
│   └── demo_script.md
├── rtl/
│   ├── common/   alu.v  alu_control.v  regfile.v  sign_ext.v
│   ├── single/   single_cycle_cpu.v  sc_control.v
│   ├── multi/    multi_cycle_cpu.v  mc_fsm.v
│   ├── mem/      lutram.v  boot_rom.v  mem_loader.v
│   ├── race/     race_ctrl.v
│   ├── io/       debounce.v  sevenseg.v  uart_rx.v  uart_tx.v  uart_cmd.v  (audio_pwm.v)
│   ├── vga/      vga_timing.v  vga_renderer.v (รวม ROM ภาพ/template/ฟอนต์ และ text overlay)
│   ├── clk_gen.v          ← MMCM 100→25 MHz (D7)
│   ├── top.v
│   └── top_smoke.v        ← M0: สวิตช์ → LED ไว้เช็กว่า build + โหลดบอร์ดได้
├── fpga/    build.tcl  program.tcl  run.bat   ← Vivado batch non-project mode (ผลอยู่ใน build/<target>/)
├── constr/  Nexys-A7-100T-Master.xdc (ต้นฉบับ Digilent)  smoke.xdc  nexys_a7_100t.xdc  ← สองไฟล์หลังสร้างด้วย tools/make_xdc.py
├── mem/     bg.mem  font.mem  progA.mem  progB.mem
├── programs/
│   ├── demoA_alu_heavy.s
│   ├── demoB_mem_heavy.s
│   ├── examples/  ex_lw_add.s   ← ตัวอย่างประกอบบทเรียน
│   └── tests/  t_add.s  t_sub.s  t_and_or.s  t_slt.s  t_addi.s  t_lw_sw.s  t_beq.s  t_j.s  t_factorial.s  t_illegal.s
├── sim/     tb_common.v  tb_cpu.v (single/multi)  tb_top.v (ทั้งบอร์ด: แข่ง + จับภาพจอ)  run_all.py  trace.py  vga_frame.py
├── tools/   asm.py  ref_model.py  race_calc.py  cpusim_adapter.py  make_xdc.py  gen_font.py  gen_screen.py  build_mems.py
│            third_party/cpusim_v7/  (cpuSim ของอาจารย์ ไม่แก้ไข)
└── web/     index.html  app.js  style.css  pyodide/
```

---

## 14. แผนการทดสอบ

1. **Unit test:** testbench ของ ALU (ทุก op), regfile ($0 เขียนไม่ติด), alu_control
2. **Instruction test:** โปรแกรมสั้นทีละคำสั่งใน `programs/tests/` ตัวละไม่กี่บรรทัด จบด้วย `halt: j halt`
3. **Golden compare:** `python sim/run_all.py` (เขียนเป็น Python แทน `.sh` เพื่อให้รันบน Windows ได้ตรงๆ และรวมงานของ `compare.py` ไว้ในตัว) จะ
   - assemble ทุกโปรแกรมใน `programs/` และ `programs/tests/`
   - รัน ref_model แล้วเช็กกับบรรทัด `#! expect $t0 = 15` / `#! expect mem[0x404] = 120` / `#! expect retired|steps|illegal = N` ในไฟล์ `.s` (ค่าที่คนคิดเอง เป็นตัวตรวจอิสระจาก ref_model)
   - รัน `tb_cpu` ของทั้ง single และ multi (`-DMULTI`) ด้วย iverilog: testbench โหลด `.mem` ผ่าน loader port, รันจนถึง `done` แล้ว dump `retired` + register 32 ตัว + data memory 256 word และเช็กจำนวน cycle (single = จำนวนคำสั่ง, multi = จำนวน step ของ ref_model)
   - เทียบ dump ของ RTL กับ ref_model ทั้งไฟล์ (cpuSim จะเพิ่มเป็นทางที่ 4 เมื่อมี `cpusim_adapter.py`)
   - ยืนยันแล้วว่าจับบั๊กได้จริง: ลองทำ slt ไม่จัดการ overflow แล้ว tb_common กับ t_slt ฟ้องทั้งคู่
4. **Cycle count test:** multicycle ต้องใช้จำนวน step ตรงกับหัวข้อ 8.3 และ `tb_race` ต้องได้เวลาจบตรงกับ `race_calc.py`
5. **VGA test ใน simulation:** `tb_vga_frame` เขียน pixel 1 เฟรมออกเป็นไฟล์ `.ppm` แล้วเปิดดูเป็นรูปได้เลย ไม่ต้องรอลงบอร์ด
6. **ลงบอร์ด (ทำตามลำดับ):** smoke test สวิตช์→LED (M0) → 7-seg + ปุ่ม → single-cycle + 7-seg → VGA ภาพนิ่ง → VGA + ไฮไลต์ → multicycle → race → UART

**โปรแกรม demo**
- **A (ALU heavy):** บวก 1..10 ด้วย `addi`, `add`, `slt` หรือ `beq` และ `j` วนลูป ⇒ multi ชนะตอน ov=0 แต่แพ้ตอน ov สูง **จุดพลิกจริงขึ้นกับ CPI เฉลี่ยของลูป** (multi ชนะเมื่อ `CPI_เฉลี่ย × (10+ov) < 50+ov`; ถ้าเฉลี่ย 3.7 step จุดพลิกอยู่ที่ ov≈4.8 ไม่ใช่ 4) ให้ใช้ `race_calc.py` ปรับลูปให้พลิกตรงค่า ov ที่อยากโชว์ก่อนจะระบุตัวเลขในสไลด์
- **B (memory heavy):** เอา array 8 ตัวใน `.data` มารวมกันด้วย `lw` แล้ว `sw` ผลลัพธ์ ⇒ ช่องว่างแคบกว่าโปรแกรม A มาก เพราะ lw เสมอกันตั้งแต่ ov=0 (ผลจริงขึ้นกับสัดส่วน lw:addi:beq ในลูป ใช้ `race_calc.py` เลือกขนาด array ให้ผลพลิกตรงจุดที่อยากโชว์)
- **ผลจริงที่ล็อกแล้ว (D8, `python tools/race_calc.py`, ยืนยันด้วยการจำลองทั้งบอร์ดใน `run_all.py`):**
  | โปรแกรม | คำสั่ง | step multi | CPI multi | ov=0 single / multi | ov=4 single / multi | single เริ่มชนะที่ |
  |---|---|---|---|---|---|---|
  | A (ALU heavy) | 56 | 203 | 3.63 | 2800 / **2030** | 3024 / **2842** | ov = 6 |
  | B (memory heavy, คลี่ลูปทีละ 2) | 37 | 147 | 3.97 | 1850 / **1470** | **1998** / 2058 | ov = 4 |
  - **เรื่องที่ใช้เล่า:** ที่ ov=4 เดียวกัน โปรแกรม A ให้ multi ชนะ แต่โปรแกรม B ให้ single ชนะ ⇒ ผลแข่งขึ้นกับสัดส่วนคำสั่ง (CPI) ไม่ใช่แค่ตัว CPU
  - A มี `beq`/`j` (3 step) เยอะ CPI ต่ำ multi จึงทน ov ได้ถึง 5; B มี `lw` (5 step) CPI เกือบ 4 จึงพลิกเร็วกว่า
- **factorial:** ไม่มีคำสั่งคูณ ใช้บวกซ้ำแทน (ใช้ทดสอบความถูกต้องเท่านั้น ไม่ใช้ demo หลัก)

---

## 15. Milestones (ยังไม่รู้วันนำเสนอจริง ให้ใส่วันที่เมื่อรู้)

**ลำดับลงมือจริง (ตามการตัดสินใจ D1–D2):** ช่วงแรกทำใน simulation ที่บ้านทั้งหมด = M1 + M4 + งานวาดภาพ datapath + tools (`asm.py`, `ref_model.py`, `compare.py`, `race_calc.py`) + `vga_timing`/`tb_vga_frame` + เว็บโหมด Mock จากนั้นนัดเพื่อนรอบแรก (M0 สั้นๆ) แล้วค่อยลงบอร์ด M2 → M3 → M5 → M6 ตามลำดับ

| # | Milestone | ผลที่ต้องได้ | ใช้ได้ทันทีถ้าเวลาหมด |
|---|---|---|---|
| M0 | Smoke test บนเครื่องเพื่อน | `top_smoke.v` + `build.tcl` รันได้ใน Vivado 2025.2 บอร์ดไฟ LED ติดตามสวิตช์ ยืนยัน part `xc7a100tcsg324-1` | – |
| M1 | Common + single-cycle ใน sim | ผ่าน instruction test ทุกตัว ผลตรง ref_model | – |
| M2 | Single-cycle ลงบอร์ด + 7-seg + ปุ่ม step | รันโปรแกรม A บนบอร์ด เห็น PC และ count บน 7-seg | ✅ ขั้นต่ำสุด |
| M3 | VGA ภาพ datapath single + ไฮไลต์ | จอวาด datapath และเส้นติดไฟตามคำสั่ง | ✅ **MVP** |
| M4 | Multicycle ใน sim | ผ่าน test ทุกตัว จำนวน step ถูก | – |
| M5 | Multicycle บนบอร์ด + จอครึ่งขวา + race_ctrl | แข่งกันได้ เห็นผลพลิกเมื่อปรับ ov | ✅ **Target** |
| M6 | UART + เว็บ + compare กับ cpuSim | โหลดโปรแกรมจากเว็บแล้วเทียบผลได้ | Stretch |
| M7 | เสียง + ตกแต่ง + ซ้อม + อัดคลิปสำรอง | พร้อมนำเสนอ | – |

**ความคืบหน้า (2 พ.ย. 2569):** M1, M3, M4, M5 = ✅ ครบใน simulation (ทั้งบอร์ดจำลองได้ รวม VGA) · M0, M2, M3, M5 บนบอร์ดจริง = รอเพื่อนรัน Vivado · M6 (UART/เว็บ) = ยังไม่ทำ · M7 = มีสคริปต์นำเสนอ `docs/demo_script.md` แล้ว

**ทำขนานกันได้:** M1 กับ M4 เริ่มพร้อมกันได้เลย เพราะใช้ `rtl/common/` ชุดเดียวกัน และงานวาดภาพ datapath กับ `vga_timing.v` เริ่มได้ตั้งแต่วันแรก

---

## 16. แบ่งงาน 4 คน (ใส่ชื่อเอง)

| บทบาท | ชื่อ | งาน |
|---|---|---|
| Single-cycle + common | [ ] | alu, regfile, alu_control, single_cycle_cpu, testbench, active_s |
| Multicycle + race | [ ] | mc_fsm, multi_cycle_cpu, race_ctrl, active_m, cycle count test |
| Display | [ ] | วาดภาพ datapath ทั้งสองแบบ, img2mem, vga_timing, renderer, font/text overlay, 7-seg, debounce |
| Tools + web + เนื้อหา | [ ] | asm.py, ref_model, cpuSim adapter, compare, UART, เว็บ, สไลด์, สคริปต์ demo, อัดคลิปสำรอง |

**จุดต่อระหว่างคน (interface):** ตกลง port ของ `single_cycle_cpu` และ `multi_cycle_cpu` ให้เหมือนกันตั้งแต่วันแรก:
```verilog
module xxx_cpu (
  input         clk, rst, en,          // en = เดินหนึ่งคำสั่ง (single) / หนึ่ง step (multi)
  // loader port (เขียน memory จาก boot ROM หรือ UART)
  input         ld_we, input [8:0] ld_addr, input [31:0] ld_data,
  // debug / display
  input  [4:0]  dbg_reg_addr, output [31:0] dbg_reg_data,
  output [31:0] pc, output [31:0] instr,
  output [31:0] retired, output done,
  output [31:0] active,                // wire-ID bitmask
  output [3:0]  state                  // single = 0 เสมอ
);
```

---

## 17. สคริปต์นำเสนอ (10–15 นาที + ถาม-ตอบ 5–10)

| เวลา | หัวข้อ | สิ่งที่ทำ |
|---|---|---|
| 0:00–1:30 | คำถามเปิด | "CPU สองตัว ตัวหนึ่งใช้ 1 clock ต่อคำสั่ง อีกตัวใช้ 3–5 clock ตัวไหนเร็วกว่า?" ให้ห้องโหวต |
| 1:30–4:00 | ระบบของเรา | รูป block diagram บอร์ด + จอ ชี้ให้เห็นว่าภาพบนจอตรงกับรูปในสไลด์ w04a/w04c |
| 4:00–6:00 | Demo 1: step | กด step ทีละครั้ง โปรแกรม A ชี้เส้นที่ติดไฟตอน `lw` เทียบสองฝั่ง |
| 6:00–9:00 | Demo 2: แข่ง | โปรแกรม A, ov=0 → multi ชนะ / ให้ห้องทาย / โยก ov=4 → ผลพลิก |
| 9:00–10:30 | Demo 3: B | โปรแกรม memory heavy ⇒ สูสี อธิบายด้วยสมการ IC × CPI × T |
| 10:30–13:00 | เบื้องหลัง | FSM, เทคนิค wire-ID, การตรวจกับ cpuSim, ปัญหาที่เจอ |
| 13:00–15:00 | สรุป | ได้เรียนอะไร, ต่อยอดเป็น pipeline ได้ |

**กันพัง:** มีคลิป demo สำรอง, เตรียมโหลด bitstream ไว้ในบอร์ดก่อนขึ้นเวที (ถ้าเปิดใช้ flash ไว้ บอร์ดจะ boot เองได้), พกตัวแปลง VGA ไปด้วย

---

## 18. สิ่งที่ยังไม่รู้ (ต้องถามผู้ใช้หรือทีม)

- [ ] วันนำเสนอจริง และมีกี่สัปดาห์
- [x] ไฟล์ cpuSim + Readme: ได้แล้ว ใช้ `main32V7` ข้อจำกัดและวิธีจัดการอยู่ในหัวข้อ 2.3; funct ของ slt = `0x2A` ยืนยันแล้ว
- [ ] ยืมบอร์ดกลับบ้านได้ไหม หรือใช้ได้เฉพาะในแล็บ (มีผลกับการทดสอบเว็บ/UART กับบอร์ดจริงที่คอมผู้ใช้; ตอนนี้บอร์ดอยู่กับเพื่อนที่มี Vivado)
- [x] ห้องนำเสนอมีช่อง VGA: มี (ผู้ใช้ยืนยัน 2 พ.ย.)
- [ ] อาจารย์อยากให้ใช้ชุดคำสั่งตามสไลด์เป๊ะ หรือเพิ่ม `addi` ได้ (หมายเหตุ: cpuSim ของอาจารย์มี ADDI อยู่แล้ว จึงน่าจะไม่มีปัญหา)
- [x] เพื่อนที่มี Vivado 2025.2 กับบอร์ดอยู่ด้วยกัน (ผู้ใช้ยืนยัน 2 พ.ย.) ยังไม่ได้ระบุชื่อและนัดเวลา
- [ ] ยืนยัน part number `xc7a100tcsg324-1` จาก project ดิจิตอลเก่าของเพื่อน
- [ ] จะใช้ Git/GitHub หรือไม่ และเมื่อไหร่ (ตอนนี้: ยังไม่ใช้ เก็บในโฟลเดอร์ผ่าน VS Code)

---

## 19. ความเสี่ยงและทางแก้

| ความเสี่ยง | ทางแก้ |
|---|---|
| Single-cycle อ่าน BRAM ไม่ทันภายใน cycle | ใช้ LUTRAM (async read) ตามหัวข้อ 5.2 |
| VGA ไม่ขึ้นภาพ | ทดสอบ `vga_timing` ด้วยแถบสีก่อน แล้วค่อยใส่ภาพ ใช้ `tb_vga_frame` ดู `.ppm` |
| ภาพ datapath มี anti-aliasing ทำให้สีเพี้ยน | export โดยปิด anti-alias, `img2mem.py` ต้องเตือนถ้าเจอสีที่ไม่อยู่ใน palette |
| Multicycle ไม่ทัน | M3 (single + จอ) คือ MVP ที่นำเสนอได้แล้ว |
| เว็บหรือ UART ไม่ทัน | boot ROM ทำให้ demo ได้โดยไม่ต้องต่อคอม และมี `send.py` เป็นแผนสำรอง |
| Build บน Vivado ครั้งแรกเจอ error (ยังไม่เคย build ตัวเต็ม) | ส่ง `build/top/` (log + รายงาน) กลับมาอ่าน, จุดที่น่าจะเจอ: MMCM, timing ของ single-cycle, BRAM ของภาพพื้นหลัง (~50 BRAM36 จาก 135) |
| ผลไม่ตรงกับ cpuSim | เทียบกับ `ref_model.py` ก่อน ดูว่าต่างที่ ISA (เช่น funct ของ slt) หรือเป็น bug |
| ทีมรวมงานแล้วพัง | ล็อก interface ในหัวข้อ 16 ตั้งแต่วันแรก ทุกคนส่ง testbench มาพร้อมโค้ด (ตอนนี้ยังไม่ใช้ Git: ส่งเป็น zip ที่มีวันที่ในชื่อ และบอกกันก่อนแก้ไฟล์ของคนอื่น) |
| ปัญหา build/ขา/ไดรเวอร์ถูกค้นพบครั้งแรกตอนท้ายโปรเจค (เพราะตั้งใจต่อบอร์ดทีหลังสุด, D1) | รัน M0 สั้นๆ ตั้งแต่เนิ่นๆ (D2) และเขียน RTL ให้ synthesizable ตั้งแต่ต้น (ไม่ใช้ `initial` แปลกๆ, ไม่ใช้ `#delay` นอก testbench) |
| cpuSim ไม่มี SUB/AND/OR/SLT และมีบั๊ก ADD | ใช้ adapter ที่ patch (D3) และถือว่า `ref_model.py` เป็นตัวเทียบหลักของคำสั่งเหล่านี้ |
| Vivado มีที่เครื่องเพื่อนคนเดียว (คอขวด) | รัน synthesize รอบแรกให้เร็วที่สุดตั้งแต่ single-cycle ผ่าน simulation, เพื่อนรัน `build.tcl` แล้วส่ง log + รายงาน timing กลับมาให้ฝั่งผู้ใช้อ่าน, นัดลงบอร์ดเป็นรอบล่วงหน้า |

---

## 20. คำศัพท์ย่อ

- **retired:** คำสั่งที่รันจบแล้ว
- **ov:** register overhead ในโมเดลเวลา
- **wire-ID:** index ของเส้นในภาพพื้นหลังที่ใช้ตัดสินว่าเส้นไหนติดไฟ
- **active_s / active_m:** bitmask ของเส้นที่ทำงานอยู่ใน single / multi
- **LUTRAM:** distributed RAM ใน LUT ของ FPGA อ่านแบบ async ได้
