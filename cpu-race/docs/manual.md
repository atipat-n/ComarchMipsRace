# คู่มือการใช้งาน CPU Race

> คู่มือนี้บอก **วิธีใช้** เครื่องมือในโปรเจค ถ้ายังไม่รู้ว่า single-cycle / multicycle คืออะไร ให้อ่าน [`tutorial.md`](tutorial.md) ก่อน
> ทุกคำสั่งในคู่มือนี้ให้รันจากโฟลเดอร์ `D:\Comarch2\Project\cpu-race` (ใน VS Code: เปิดโฟลเดอร์นี้แล้วกด `` Ctrl+` `` เพื่อเปิด terminal)

---

## 1. ภาพรวม: ในโปรเจคมีอะไรบ้าง

```
cpu-race/
├── docs/        เอกสาร (สเปค, คู่มือ, บทเรียน, wire map)
├── rtl/         วงจร CPU ที่เขียนด้วย Verilog  ← ของจริงที่จะลงบอร์ด
│   ├── common/    ชิ้นส่วนที่ใช้ร่วมกัน: ALU, register file, sign-extend
│   ├── single/    single-cycle CPU
│   ├── multi/     multicycle CPU + FSM
│   ├── mem/       หน่วยความจำ (LUTRAM), boot ROM, ตัวโหลดโปรแกรม
│   ├── race/      ตัวคุมการแข่ง (นาฬิการ่วม)
│   ├── io/        ปุ่ม (debounce), 7-seg
│   ├── vga/       จอ VGA (timing + วาดภาพ)
│   ├── top.v        รวมทุกอย่างลงบอร์ด
│   └── top_smoke.v  วงจรทดสอบบอร์ด (สวิตช์ → LED)
├── programs/    โปรแกรม assembly ที่จะให้ CPU รัน
│   ├── tests/     เทสต์ทีละคำสั่ง
│   ├── examples/  ตัวอย่างประกอบบทเรียน
│   └── demo*.s    โปรแกรมที่จะใช้ตอนนำเสนอ
├── sim/         ตัวทดสอบ (testbench) และสคริปต์รันเทสต์
├── tools/       เครื่องมือ Python: assembler, reference model, สร้างไฟล์ขา
├── fpga/        สคริปต์ Vivado (ใช้ที่เครื่องเพื่อน)
├── constr/      ไฟล์ขา (.xdc) ของบอร์ด
├── mem/         ไฟล์ที่ฝังลงชิป: โปรแกรม demo, ฟอนต์, ภาพพื้นหลัง, template ตัวหนังสือ
└── build/       ไฟล์ที่เครื่องมือสร้างขึ้น ลบทิ้งได้ทุกเมื่อ
```

**ลำดับการไหลของงาน:**

```
 เขียน .s ──► asm.py ──► .mem (ตัวเลข 512 บรรทัด) ──┬──► ref_model.py   (Python จำลอง: "เฉลย")
                                                    ├──► single-cycle  (Verilog ใน Icarus)
                                                    └──► multicycle    (Verilog ใน Icarus)
                                                              │
                                     run_all.py เทียบผลทั้งสามทาง ──► PASS / FAIL
```

---

## 2. ติดตั้ง (ทำครั้งเดียว)

| โปรแกรม | ใช้ทำอะไร | วิธีติดตั้งบน Windows | เช็กว่าลงแล้ว |
|---|---|---|---|
| Python 3 | รัน assembler, reference model, สคริปต์เทสต์ | python.org หรือ `winget install Python.Python.3.13` | `python --version` |
| Icarus Verilog 12 | จำลองวงจร Verilog (simulation) | `winget install Icarus.Verilog` | มีไฟล์ `C:\iverilog\bin\iverilog.exe` |
| GTKWave | ดู waveform (มากับ Icarus) | มากับข้างบน | `C:\iverilog\gtkwave\bin\gtkwave.exe` |
| VS Code | แก้ไฟล์ | code.visualstudio.com | – |
| Vivado 2025.2 | สร้าง bitstream ลงบอร์ด | **ไม่ต้องลง** ใช้เครื่องเพื่อน | – |

> 💡 เครื่องของผู้ใช้หลักลง Icarus แล้ว (2 พ.ย. 2569) ที่ `C:\iverilog`
> สคริปต์ของเราหา `C:\iverilog\bin` เองได้ แม้ยังไม่ได้เพิ่มเข้า PATH

**ส่วนเสริม VS Code ที่แนะนำ:** "Verilog-HDL/SystemVerilog" (สีโค้ด Verilog), "Python"

---

## 3. รันเทสต์ทั้งหมด

```
python sim/run_all.py
```

ตัวอย่างผล:

```
[PASS] tb_common (alu, alu_control, regfile, sign_ext)
[PASS] t_add              retired=7     mc_steps=28    expects=6   single=ref multi=ref
[PASS] t_lw_sw            retired=12    mc_steps=53    expects=8   single=ref multi=ref
...
------------------------------------------------------------
ALL PASS
```

**อ่านผลยังไง:**

| ส่วน | ความหมาย |
|---|---|
| `tb_common` | ทดสอบชิ้นส่วนย่อย (ALU ทุก op, register file, ALU control, sign-extend) |
| `retired=7` | โปรแกรมนี้รันไป 7 คำสั่ง (ไม่นับคำสั่ง halt) |
| `mc_steps=28` | multicycle ใช้ 28 step (clock) สำหรับโปรแกรมนี้ |
| `expects=6` | เช็กค่าที่เขียนไว้ในไฟล์ `.s` ผ่าน 6 ข้อ |
| `single=ref` | single-cycle ให้ผล **ตรงกับเฉลย** ทุก register, ทุก word ใน data memory และใช้ cycle ถูก |
| `multi=ref` | multicycle ให้ผลตรงกับเฉลย และใช้จำนวน step ตรง |
| `single!=ref` | **ไม่ตรง** จะมีบรรทัดบอกว่า register ไหนต่าง เช่น `ref: r19 00000001  rtl: r19 00000000` (= `$19` ควรเป็น 1 แต่ได้ 0) |

**รันเฉพาะบางโปรแกรม:** `python sim/run_all.py t_slt t_beq`

---

## 4. ดูโปรแกรมวิ่งทีละ step (trace)

นี่คือเครื่องมือที่ดีที่สุดสำหรับเรียนรู้และหาบั๊ก

```
python sim/trace.py programs/examples/ex_lw_add.s --reg t2
```

| ตัวเลือก | ทำอะไร |
|---|---|
| `--core single` / `--core multi` | ดูเฉพาะตัวเดียว (ค่าเริ่มต้นดูทั้งสอง) |
| `--reg t2` หรือ `--reg 10` | โชว์ค่า register นี้ทุกบรรทัด (ใน PowerShell อย่าพิมพ์ `$t2` ตรงๆ เพราะ `$` คือตัวแปร) |
| `--vcd` | เขียน waveform ไว้เปิดด้วย GTKWave |

ตัวอย่างผลของ multicycle (ผลจริงจากเครื่อง):

```
cycle    0  S0  FETCH      pc=00000000  instr=00000000  retired=0  active=0180003f  $10=00000000
cycle    1  S1  DECODE     pc=00000004  instr=8c080400  retired=0  active=030003c8  $10=00000000
cycle    2  S2  MEM_ADDR   pc=00000004  instr=8c080400  retired=0  active=01001600  $10=00000000
cycle    3  S3  MEM_READ   pc=00000004  instr=8c080400  retired=0  active=00806002  $10=00000000
cycle    4  S4  MEM_WB     pc=00000004  instr=8c080400  retired=0  active=02018000  $10=00000000
cycle    5  S0  FETCH      pc=00000004  instr=8c080400  retired=1  ...
```

- แต่ละบรรทัดคือสถานะ **ก่อน** เดิน step นั้น
- `instr` ของ multicycle คือค่าใน IR (กล่องเก็บคำสั่ง) ตอน S0 จึงยังเป็นคำสั่งเก่าอยู่ เพราะ S0 คือจังหวะที่กำลังไปหยิบคำสั่งใหม่
- `active` คือบิตบอกว่าเส้นไหนในภาพ datapath ติดไฟ (ดู [`wire_map.md`](wire_map.md))

### เปิด waveform ด้วย GTKWave

1. `python sim/trace.py programs/examples/ex_lw_add.s --core multi --vcd`
2. `C:\iverilog\gtkwave\bin\gtkwave.exe build\trace\ex_lw_add.multi.vcd`
3. ด้านซ้ายกดขยาย `tb_cpu` → `dut` แล้วลากสัญญาณเหล่านี้มาที่หน้าต่าง Signals:
   - ทั้งสองแบบ: `clk`, `en`, `pc_r`, `retired_r`, `done`
   - multicycle: `state`, `ir`, `a_r`, `b_r`, `alu_out`, `mdr`, `mem_addr`
   - single-cycle: `instr`, `alu_y`, `wb_data`, `pc_next`
4. คลิกขวาที่สัญญาณ → Data Format → Hex ให้อ่านง่าย

---

## 5. เขียนโปรแกรม assembly เอง

### 5.1 ไฟล์ตัวอย่าง

สร้างไฟล์ `programs/examples/my_first.s`:

```asm
# บวก 5 + 7 แล้วเก็บลง memory
        .data
answer: .word 0                 # จองที่ไว้ 1 word ที่ 0x400

        .text
        addi $t0, $zero, 5      # $t0 = 5
        addi $t1, $zero, 7      # $t1 = 7
        add  $t2, $t0, $t1      # $t2 = 12
        sw   $t2, answer($zero) # เก็บ 12 ลงที่ answer
        halt                    # จบโปรแกรม

#! expect $t2 = 12
#! expect mem[answer] = 12
```

แล้วรัน:

```
python sim/trace.py programs/examples/my_first.s --reg t2
python sim/run_all.py my_first
```

### 5.2 กฎการเขียน

| เรื่อง | กฎ |
|---|---|
| คำสั่งที่ใช้ได้ | `add sub and or slt` (R-type), `addi lw sw beq` (I-type), `j` (J-type) |
| คำสั่งช่วย (pseudo) | `nop` = ไม่ทำอะไร, `halt` = จบโปรแกรม (จริงๆ คือ `j` ที่กระโดดหาตัวเอง) |
| register | ใช้ชื่อ (`$t0`, `$s1`, `$zero`) หรือเลข (`$8`) ก็ได้ |
| ลูกน้ำ | ใส่หรือไม่ใส่ก็ได้: `add $t0, $t1, $t2` = `add $t0 $t1 $t2` |
| comment | ขึ้นต้นด้วย `#` หรือ `;` |
| label | `ชื่อ:` ใช้เป็นเป้าหมายของ `beq`/`j` หรือเป็น address ของข้อมูล |
| ตัวเลข | ฐานสิบ `42`, ฐานสิบหก `0x2a`, ฐานสอง `0b101010`, ติดลบ `-5` |
| immediate ของ `addi` | 16 bit: -32768 ถึง 32767 (ใส่ 0x8000–0xFFFF ได้ แต่จะกลายเป็นเลขลบ) |
| `.text` | ส่วนโปรแกรม เริ่มที่ address 0x000 (สูงสุด 256 คำสั่ง) |
| `.data` | ส่วนข้อมูล เริ่มที่ address 0x400 (สูงสุด 256 word) |
| `.word 1, 2, 3` | ใส่ข้อมูลทีละ word |
| `.space 16` | จองที่ 16 byte (= 4 word) ค่าเป็น 0 |
| **lw/sw** | **ต้องอ้าง address ในช่วง 0x400–0x7FF และหาร 4 ลงตัว** ไม่อย่างนั้น ref_model จะฟ้อง error |
| จบโปรแกรม | ต้องจบด้วย `halt` ไม่อย่างนั้น CPU จะวิ่งต่อไปเรื่อยๆ |

**ชื่อ register:**

| ชื่อ | เลข | ใช้ทำอะไร (ตามธรรมเนียม MIPS) |
|---|---|---|
| `$zero` | 0 | ค่า 0 เสมอ เขียนไม่ติด |
| `$at` | 1 | สำรองให้ assembler |
| `$v0–$v1` | 2–3 | ค่าที่ฟังก์ชันส่งกลับ |
| `$a0–$a3` | 4–7 | argument ของฟังก์ชัน |
| `$t0–$t7` | 8–15 | ตัวแปรชั่วคราว ← **ใช้ตัวนี้บ่อยสุด** |
| `$s0–$s7` | 16–23 | ตัวแปรที่ต้องเก็บไว้นาน |
| `$t8–$t9` | 24–25 | ชั่วคราวเพิ่ม |
| `$k0–$k1` | 26–27 | สำรองให้ OS |
| `$gp $sp $fp $ra` | 28–31 | pointer ต่างๆ และ return address |

> ในโปรเจคนี้ทุก register ใช้ได้เหมือนกันหมด (ยกเว้น `$zero`) ชื่อเป็นแค่ธรรมเนียมให้อ่านง่าย

### 5.3 ใส่ "ค่าที่คาดไว้" ให้เช็กอัตโนมัติ

เขียนบรรทัดพวกนี้ที่ไหนก็ได้ในไฟล์ `.s` (assembler จะข้ามเพราะขึ้นต้นด้วย `#`)

| รูปแบบ | ตัวอย่าง |
|---|---|
| ค่า register | `#! expect $t2 = 12` หรือ `#! expect $10 = 0xc` |
| ค่าใน memory | `#! expect mem[0x400] = 12` หรือ `#! expect mem[answer] = 12` |
| จำนวนคำสั่งที่รัน | `#! expect retired = 5` |
| จำนวน step ของ multicycle | `#! expect steps = 16` |
| จำนวนคำสั่งที่ไม่รู้จัก | `#! expect illegal = 0` |

> 💡 **ทำไมต้องเขียน expect เอง?** ref_model กับ CPU เขียนโดยคนกลุ่มเดียวกัน ถ้าเข้าใจผิดเหมือนกันทั้งคู่ ผลจะ "ตรงกัน" แต่ผิดทั้งคู่ ค่าที่คิดด้วยมือเป็นตัวตรวจทางที่สามที่ไม่ขึ้นกับโค้ด

### 5.4 ใช้เครื่องมือทีละตัว (ถ้าอยากรู้ว่าข้างในทำอะไร)

```
python tools/asm.py programs/examples/my_first.s -o build/my_first.mem --listing
python tools/ref_model.py build/my_first.mem --trace
```

- `asm.py --listing` โชว์ address, machine code (hex) และบรรทัดต้นฉบับ
- `ref_model.py --trace` โชว์ทุกคำสั่งที่รัน และค่า register ทั้ง 32 ตัวตอนจบ

### 5.5 รูปแบบลูปที่ใช้บ่อย

ISA ของเราไม่มี `bne`, `blt`, `mul` ต้องประกอบเอง:

```asm
# for (i = 0; i < 10; i++) { ... }
        addi $t0, $zero, 0          # i = 0
        addi $t1, $zero, 10         # limit
loop:   slt  $t2, $t0, $t1          # t2 = (i < 10)
        beq  $t2, $zero, done       # ถ้าไม่จริง ออกจากลูป
        # ... งานในลูป ...
        addi $t0, $t0, 1            # i++
        j    loop
done:

# if (a != b) goto L   (ไม่มี bne)
        beq  $a0, $a1, skip
        j    L
skip:

# a = b * c (ไม่มีคูณ: บวกซ้ำ c ครั้ง)  ดู programs/tests/t_factorial.s
```

---

## 6. ลงบอร์ด (ทำที่เครื่องเพื่อนที่มี Vivado)

### 6.1 ส่งไฟล์ให้เพื่อน

zip โฟลเดอร์ `rtl` `constr` `mem` `fpga` (และ `README.md`) ตั้งชื่อมีวันที่ เช่น `cpu-race_2026-11-05.zip`

### 6.2 สิ่งที่เพื่อนทำ

```
fpga\run.bat smoke            ← build อย่างเดียว
fpga\run.bat smoke program    ← build แล้วโหลดลงบอร์ด
```

ถ้าขึ้นว่าหา `vivado` ไม่เจอ ให้รัน `settings64.bat` ของ Vivado ก่อน (อยู่ในโฟลเดอร์ที่ติดตั้ง Vivado)

### 6.3 ผลที่ควรเห็นบนบอร์ด (smoke test)

| ทำอะไร | ควรเห็น |
|---|---|
| โยกสวิตช์ | LED ดวงเดียวกันติด/ดับตาม |
| กด BTNC (ปุ่มกลาง) ค้าง | LED ติดหมด 16 ดวง |
| รอเฉยๆ | 7-seg หลักขวาสุดนับ 0, 1, ..., F ทีละวินาที |
| โยก SW0–SW3 | 7-seg หลักซ้ายสุดแสดงเลขฐานสิบหกของสวิตช์ 4 ตัวนั้น |
| กด CPU_RESETN (ปุ่มแดง) | ตัวนับกลับเป็น 0 |

### 6.4 ตัวเต็ม (CPU Race)

```
fpga\run.bat top program
```

ใช้เวลานานกว่า smoke (ประมาณ 5–15 นาที เพราะมีภาพพื้นหลังใน BRAM) ผลอยู่ใน `build\top\`

**ผลที่ควรเห็นบนบอร์ด:**

| ทำอะไร | ควรเห็น |
|---|---|
| หลังโหลด bitstream | จอ VGA ขึ้นภาพ datapath สองฝั่ง + `PROG A  OV 0  TIME 00000000`, LED[14:0] มีดวงเดียวติดที่ตำแหน่ง S0 (LED0) |
| SW15 = 0 แล้วกด BTNC | TIME เพิ่มทีละเหตุการณ์ (0A, 14, 1E, ...) เส้นบนจอเปลี่ยน, LED state ของ multi เลื่อน |
| SW15 = 1, SW14–12 = 011 แล้วกด BTNR | วิ่งเองประมาณ 15 วินาที จบแล้วขึ้น WINNER, LED15 / LED14 ติด |
| โยก SW3–0, SW4 แล้วกด BTNL | เริ่มใหม่ด้วย ov / โปรแกรมใหม่ |
| กด BTNU | 7-seg สลับระหว่างจำนวนคำสั่ง กับเวลา (ซ้าย 4 หลัก = single, ขวา 4 หลัก = multi) |

ตัวเลขที่ควรได้ของแต่ละกรณีอยู่ใน [`demo_script.md`](demo_script.md)

### 6.5 สิ่งที่ต้องส่งกลับมา

โฟลเดอร์ `build\smoke\` หรือ `build\top\` ทั้งหมด **ยกเว้น** `.bit`:

| ไฟล์ | ดูอะไร |
|---|---|
| `messages_summary.txt` | จำนวน ERROR / CRITICAL WARNING / WARNING และ WNS |
| `timing_summary.rpt` | timing ผ่านไหม (WNS ต้อง ≥ 0) |
| `utilization.rpt` | ใช้ LUT, FF, BRAM ไปเท่าไร |
| `vivado.log` | log เต็ม ไว้หาสาเหตุเวลามีปัญหา |

### 6.6 ไฟล์ขา (.xdc)

**ห้ามแก้ `constr/*.xdc` ด้วยมือ** ถ้าต้องเพิ่มขา ให้แก้รายชื่อ port ใน `tools/make_xdc.py` แล้วรัน

```
python tools/make_xdc.py smoke    # หรือ full
```

สคริปต์จะ uncomment บรรทัดจากไฟล์ต้นฉบับของ Digilent ให้ ซึ่งกันพิมพ์ขาผิด (เช่น SW8, SW9 ใช้ไฟ 1.8 V ต่างจากขาอื่นที่เป็น 3.3 V)

---

### 6.7 แก้โปรแกรม demo หรือหน้าจอ

ไฟล์ใน `mem/` ถูกฝังลง bitstream ตอน build ถ้าแก้ `programs/demo*.s` หรือ `tools/gen_screen.py` ต้องสร้างใหม่ก่อนส่งให้เพื่อน:

```
python tools/build_mems.py       # สร้าง mem/progA.mem, progB.mem, font.mem, bg.mem, text.mem
python tools/race_calc.py programs/demoA_alu_heavy.s   # ดูว่าผลพลิกที่ ov เท่าไร
python sim/run_all.py            # ต้อง ALL PASS ก่อนส่ง
python sim/vga_frame.py --prog A --ov 0                # ดูภาพจอจริงจาก simulation
```

### 6.8 เครื่องมือจำลองทั้งบอร์ด (ไม่ต้องมีบอร์ด)

| คำสั่ง | ทำอะไร |
|---|---|
| `python sim/vga_frame.py` | จำลองทั้งบอร์ด (`rtl/top.v`) แข่งโปรแกรม A ที่ ov=0 จนจบ แล้วถ่ายภาพจอเป็น PNG ใน `build/frames/` |
| `python sim/vga_frame.py --prog B --ov 4` | เปลี่ยนโปรแกรม / ov |
| `python sim/vga_frame.py --units 900` | หยุดกลางทางที่เวลา 900 แล้วถ่าย |
| `python sim/vga_frame.py --steps 5` | ใช้ step mode กด BTNC 5 ครั้งแล้วถ่าย |
| `python tools/race_calc.py <ไฟล์.s>` | ตารางเวลา single / multi ทุกค่า ov และจุดพลิก |
| `python tools/cpusim_adapter.py <ไฟล์.s>` | รันบน cpuSim ของอาจารย์ (โชว์บรรทัดที่ส่งให้ cpuSim และค่า register) |

---

## 7. แก้ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `[skip] ไม่พบ iverilog/vvp` | ยังไม่ได้ติดตั้ง Icarus หรือติดตั้งไว้ที่อื่น ให้ `winget install Icarus.Verilog` |
| ภาษาไทยเป็นตัวประหลาด | terminal ไม่ใช่ UTF-8: ใน PowerShell รัน `chcp 65001` ก่อน |
| `line 7: ไม่รู้จัก register '$t10'` | มีแค่ `$t0–$t9` |
| `line 5: immediate 40000 เกิน 16 bit` | `addi` ใส่ได้แค่ -32768..32767 ถ้าต้องการเลขใหญ่ให้บวกหลายรอบ |
| `ref_model: เข้าถึงข้อมูลที่ 0x00000010 นอกช่วง` | lw/sw ไปอ้าง address ของโปรแกรม ต้องใช้ 0x400 ขึ้นไป (ใช้ label ใน `.data` จะไม่พลาด) |
| `รันเกิน 100000 คำสั่งแล้วยังไม่เจอ halt` | ลืมใส่ `halt` หรือลูปไม่มีทางออก ใช้ `ref_model.py --trace` ดูว่าวนอยู่ตรงไหน |
| `TIMEOUT after ... cycles` | CPU (Verilog) ไม่ถึง done ทั้งที่ ref_model จบได้ แปลว่ามีบั๊กใน RTL ให้ใช้ `trace.py --vcd` ดู |
| `single!=ref` หรือ `multi!=ref` | ดูบรรทัดที่ต่าง `r19` = register $19, `m040c` = memory ที่ 0x40C แล้ว trace ดูว่าค่าเพี้ยนตอนคำสั่งไหน |
| `multi: ใช้ 48 cycle แต่ ref_model คาด 53` | FSM เดินผิดเส้นทาง (ข้ามหรือเกิน state) ให้ trace ดู state ทีละ cycle |
| `Move-Item ... being used by another process` | มีโปรแกรม (VS Code / terminal) เปิดโฟลเดอร์ค้างอยู่ ปิดแล้วลองใหม่ |

---

## 8. สถานะของแต่ละส่วน (2 พ.ย. 2569)

| ส่วน | สถานะ |
|---|---|
| Assembler, reference model, ชุดเทสต์ | ✅ ใช้ได้ |
| Single-cycle CPU (M1) | ✅ ผ่าน simulation |
| Multicycle CPU (M4) | ✅ ผ่าน simulation จำนวน step ถูก |
| cpuSim adapter (ตัวตรวจทางที่ 4) | ✅ ทุกโปรแกรมตรงกัน (ยกเว้น t_illegal ที่ cpuSim รับไม่ได้) |
| race_ctrl, boot ROM, ปุ่ม, 7-seg, LED, VGA, top.v | ✅ ผ่าน simulation ทั้งบอร์ด (แข่ง 6 กรณีเวลาตรงสูตร, ภาพจอถูกต้อง) |
| Smoke test (M0) และตัวเต็มบนบอร์ดจริง | ⏳ **ยังไม่เคยรันบน Vivado** รอเพื่อน |
| UART + เว็บ (stretch) | ยังไม่ทำ |

ลำดับงานต่อจากนี้อยู่ใน [`spec.md`](spec.md) หัวข้อ 0.1 และ 15
