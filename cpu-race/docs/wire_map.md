# 🎨 Wire Map: ตารางจับคู่สัญญาณ Active กับเส้นในภาพ Datapath

> [!NOTE]
> เอกสารฉบับนี้ระบุการจับคู่ระหว่างบิตของสัญญาณ `active_s` / `active_m` จากวงจร CPU กับรหัสประจำเส้น (**Wire-ID**) ในภาพพื้นหลัง `mem/bg.mem` สำหรับแสดงผลบนจอ VGA 640×480 (อ้างอิง [`spec.md`](spec.md) หัวข้อ 10.2–10.3)

---

## ⚙️ หลักการทำงานของ Wire-ID

1. สคริปต์ [`tools/gen_screen.py`](../tools/gen_screen.py) วาดภาพ Datapath ขนาด 640×480 โดยใส่ค่า **Index 6-bit (`0–63`)** ลงในแต่ละพิกเซลของไฟล์ `mem/bg.mem` แทนการเก็บค่าสีโดยตรง:
   - **`Index 0`:** พื้นหลังสีมืด
   - **`Index 1`:** เส้นกรอบหรือข้อความคงที่ (สีเทาสว่าง)
   - **`Index 2 + bit` (`2–21`):** เส้นและกล่องของ 🟠 **Single-cycle CPU** (ระบาย **สีส้ม** เมื่อ `active_s[bit] == 1`, มิฉะนั้นระบายสีเทาเข้ม)
   - **`Index 32 + bit` (`32–57`):** เส้นและกล่องของ 🔵 **Multicycle CPU** (ระบาย **สีฟ้า** เมื่อ `active_m[bit] == 1`, มิฉะนั้นระบายสีเทาเข้ม)
2. เมื่อ CPU ตัวใดทำงานจบโปรแกรมแล้ว (`done == 1`) บิต `active` ทั้งหมดของตัวนั้นจะกลายเป็น `0`

---

## 🟠 1. Single-cycle CPU: `active_s[19:0]` ([`rtl/single/single_cycle_cpu.v`](../rtl/single/single_cycle_cpu.v))

คำนวณแบบ Combinational จากสัญญาณ Control ของคำสั่งที่ `PC` ชี้อยู่ในปัจจุบัน (หากเป็นคำสั่งที่ไม่รู้จัก จะติดเฉพาะบิต `0–1`):

| บิต (`bit`) | Wire-ID (`2 + bit`) | เส้นทางข้อมูล / กล่องใน Datapath | เงื่อนไขที่ติดสีส้ม (`active_s[bit] = 1`) |
|:---:|:---:|---|---|
| `0` | `2` | `PC → IMEM` | ทุกคำสั่ง |
| `1` | `3` | `PC → Adder (+4) → Mux PCSrc` | ทุกคำสั่ง |
| `2` | `4` | `IMEM → rs / rt → RegFile (Read)` | ทุกคำสั่ง ยกเว้น `j` |
| `3` | `5` | `IMEM[15:11] (rd) → Mux RegDst` | คำสั่งกลุ่ม `R-type` |
| `4` | `6` | `IMEM[20:16] (rt) → Mux RegDst` | `lw`, `addi` |
| `5` | `7` | `RegFile ReadData1 → ALU Input A` | ทุกคำสั่ง ยกเว้น `j` |
| `6` | `8` | `RegFile ReadData2 → Mux ALUSrc` | `R-type`, `beq` |
| `7` | `9` | `Sign-Extend → Mux ALUSrc` | `lw`, `sw`, `addi` |
| `8` | `10` | `ALU Result → DMEM Address` | `lw`, `sw` |
| `9` | `11` | `RegFile ReadData2 → DMEM WriteData` | `sw` |
| `10` | `12` | `DMEM ReadData → Mux MemtoReg` | `lw` |
| `11` | `13` | `ALU Result → Mux MemtoReg` | `R-type`, `addi` |
| `12` | `14` | `Mux MemtoReg → RegFile WriteData` | `R-type`, `lw`, `addi` (`RegWrite = 1`) |
| `13` | `15` | `Sign-Extend → Shift-Left-2 → Branch Adder` | `beq` |
| `14` | `16` | `Branch Adder → Mux PCSrc` | `beq` ที่เงื่อนไขเป็นจริง (กระโดดจริง) |
| `15` | `17` | `ALU Zero → Branch AND Gate` | `beq` |
| `16` | `18` | `IMEM[25:0] → Shift-Left-2 → Jump Address` | `j` |
| `17` | `19` | `Jump Mux → PC` | `j` |
| `18` | `20` | **กรอบกล่อง `DMEM`** | `lw`, `sw` |
| `19` | `21` | **กรอบกล่อง `ALU`** | ทุกคำสั่ง ยกเว้น `j` |

---

## 🔵 2. Multicycle CPU: `active_m[25:0]` ([`rtl/multi/multi_cycle_cpu.v`](../rtl/multi/multi_cycle_cpu.v))

คำนวณแบบ Combinational จากสถานะปัจจุบัน (`state`) ของ FSM 12 States:

| บิต (`bit`) | Wire-ID (`32 + bit`) | เส้นทางข้อมูล / กล่องใน Datapath | สถานะ FSM ที่ติดสีฟ้า (`active_m[bit] = 1`) |
|:---:|:---:|---|---|
| `0` | `32` | `PC → Mux IorD` | `S0` (`FETCH`) |
| `1` | `33` | `Mux IorD → Memory Address` | `S0`, `S3`, `S5` |
| `2` | `34` | `Memory → IR` | `S0` |
| `3` | `35` | `PC → Mux ALUSrcA` | `S0`, `S1` |
| `4` | `36` | `Constant 4 → Mux ALUSrcB` | `S0` |
| `5` | `37` | `ALU → PC` (`PCSource = 00`) | `S0` |
| `6` | `38` | `IR (rs / rt) → RegFile` | `S1` (`DECODE`) |
| `7` | `39` | `RegFile → A, B` | `S1` |
| `8` | `40` | `Sign-Extend → Shift-Left-2 → Mux ALUSrcB` | `S1` |
| `9` | `41` | `ALU → ALUOut` | `S1`, `S2`, `S6`, `S10` |
| `10` | `42` | `A → Mux ALUSrcA` | `S2`, `S6`, `S8`, `S10` |
| `11` | `43` | `B → Mux ALUSrcB` | `S6`, `S8` |
| `12` | `44` | `Sign-Extend → Mux ALUSrcB` | `S2`, `S10` |
| `13` | `45` | `ALUOut → Mux IorD` | `S3` (`MEM_READ`), `S5` (`MEM_WRITE`) |
| `14` | `46` | `Memory → MDR` | `S3` |
| `15` | `47` | `MDR → Mux MemtoReg → RegFile` | `S4` (`MEM_WB`) |
| `16` | `48` | `IR[20:16] (rt) → Mux RegDst` | `S4`, `S11` (`ADDI_WB`) |
| `17` | `49` | `B → Memory WriteData` | `S5` |
| `18` | `50` | `ALUOut → Mux MemtoReg → RegFile` | `S7` (`ALU_WB`), `S11` (`ADDI_WB`) |
| `19` | `51` | `IR[15:11] (rd) → Mux RegDst` | `S7` |
| `20` | `52` | `ALUOut → PC` (`PCSource = 01`) | `S8` (`BRANCH`) เมื่อเงื่อนไขเท่ากันจริง |
| `21` | `53` | `ALU Zero → PCWriteCond` | `S8` |
| `22` | `54` | `IR[25:0] → Shift-Left-2 → PC` (`PCSource = 10`) | `S9` (`JUMP`) |
| `23` | `55` | **กรอบกล่อง `Memory`** | `S0`, `S3`, `S5` |
| `24` | `56` | **กรอบกล่อง `ALU`** | `S0`, `S1`, `S2`, `S6`, `S8`, `S10` |
| `25` | `57` | **กรอบกล่อง `RegFile`** | `S1`, `S4`, `S7`, `S11` |

---

## 🧪 3. ตัวอย่างค่า `active` จริงจากการจำลอง (`programs/examples/ex_lw_add.s`)

| CPU Core | คำสั่ง / สถานะปัจจุบัน | ค่า `active` (Hex 32-bit) |
|---|---|---|
| 🟠 **Single-cycle** | `lw` | `0x000c15b7` |
| 🟠 **Single-cycle** | `add` | `0x0008186f` |
| 🟠 **Single-cycle** | `sw` | `0x000c03a7` |
| 🟠 **Single-cycle** | `beq` (ไม่กระโดด) | `0x0008a067` |
| 🔵 **Multicycle** | `S0 FETCH` | `0x0180003f` |
| 🔵 **Multicycle** | `S1 DECODE` | `0x030003c8` |
| 🔵 **Multicycle** | `S2 MEM_ADDR` | `0x01001600` |
| 🔵 **Multicycle** | `S3 MEM_READ` | `0x00806002` |
| 🔵 **Multicycle** | `S4 MEM_WB` | `0x02018000` |
| 🔵 **Multicycle** | `S5 MEM_WRITE` | `0x00822002` |
| 🔵 **Multicycle** | `S6 EXECUTE` | `0x01000e00` |
| 🔵 **Multicycle** | `S7 ALU_WB` | `0x020c0000` |
| 🔵 **Multicycle** | `S8 BRANCH` (ไม่กระโดด) | `0x01200c00` |
