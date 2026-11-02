# Wire map (ร่างแรก)

ตารางนี้บอกว่าบิตไหนของ `active` คือเส้นไหนในภาพ datapath และติดไฟเมื่อไร (สเปคหัวข้อ 10.2–10.3)
ตอนวาดภาพจริงให้ใช้สีของ wire ID ตามตารางนี้ ถ้าจะแก้ ให้แก้ทั้งตารางนี้และ RTL พร้อมกัน

- ในภาพพื้นหลัง: index `2 + bit` = เส้นของ single-cycle, index `32 + bit` = เส้นของ multicycle
- ตอน `done = 1` ทุกบิตเป็น 0

## Single-cycle: `active_s` (`rtl/single/single_cycle_cpu.v`)

คำนวณจากสัญญาณ control ของคำสั่งที่ PC ชี้อยู่ คำสั่งที่ไม่รู้จักจะติดแค่บิต 0–1

| bit | เส้น / กล่อง | ติดเมื่อ |
|---|---|---|
| 0 | PC → IMEM | ทุกคำสั่ง |
| 1 | PC → adder +4 → mux PCSrc | ทุกคำสั่ง |
| 2 | IMEM → rs/rt → RegFile | ทุกคำสั่งยกเว้น j |
| 3 | IMEM[15:11] → mux RegDst | R-type |
| 4 | IMEM[20:16] → mux RegDst | lw, addi |
| 5 | ReadData1 → ALU A | ทุกคำสั่งยกเว้น j |
| 6 | ReadData2 → mux ALUSrc | R-type, beq |
| 7 | sign-extend → mux ALUSrc | lw, sw, addi |
| 8 | ALU result → DMEM address | lw, sw |
| 9 | ReadData2 → DMEM write data | sw |
| 10 | DMEM read data → mux MemtoReg | lw |
| 11 | ALU result → mux MemtoReg | R-type, addi |
| 12 | mux MemtoReg → RegFile write data | R-type, lw, addi |
| 13 | sign-extend → shift-2 → branch adder | beq |
| 14 | branch adder → mux PCSrc | beq ที่กระโดดจริง |
| 15 | ALU Zero → AND gate | beq |
| 16 | IMEM[25:0] → shift-2 → jump address | j |
| 17 | jump mux → PC | j |
| 18 | กล่อง DMEM | lw, sw |
| 19 | กล่อง ALU | ทุกคำสั่งยกเว้น j |

## Multicycle: `active_m` (`rtl/multi/multi_cycle_cpu.v`)

คำนวณจาก state ปัจจุบัน

| bit | เส้น / กล่อง | ติดใน state |
|---|---|---|
| 0 | PC → mux IorD | S0 |
| 1 | mux IorD → Memory address | S0, S3, S5 |
| 2 | Memory → IR | S0 |
| 3 | PC → mux ALUSrcA | S0, S1 |
| 4 | ค่าคงที่ 4 → mux ALUSrcB | S0 |
| 5 | ALU → PC (PCSource=00) | S0 |
| 6 | IR rs/rt → RegFile | S1 |
| 7 | RegFile → A, B | S1 |
| 8 | sign-extend → shift-2 → mux ALUSrcB | S1 |
| 9 | ALU → ALUOut | S1, S2, S6, S10 |
| 10 | A → mux ALUSrcA | S2, S6, S8, S10 |
| 11 | B → mux ALUSrcB | S6, S8 |
| 12 | sign-extend → mux ALUSrcB | S2, S10 |
| 13 | ALUOut → mux IorD | S3, S5 |
| 14 | Memory → MDR | S3 |
| 15 | MDR → mux MemtoReg → RegFile | S4 |
| 16 | IR[20:16] → mux RegDst | S4, S11 |
| 17 | B → Memory write data | S5 |
| 18 | ALUOut → mux MemtoReg → RegFile | S7, S11 |
| 19 | IR[15:11] → mux RegDst | S7 |
| 20 | ALUOut → PC (PCSource=01) | S8 ที่กระโดดจริง |
| 21 | Zero → PCWriteCond | S8 |
| 22 | IR[25:0] → shift-2 → PC (PCSource=10) | S9 |
| 23 | กล่อง Memory | S0, S3, S5 |
| 24 | กล่อง ALU | S0, S1, S2, S6, S8, S10 |
| 25 | กล่อง RegFile | S1, S4, S7, S11 |

## ค่าจริงจาก simulation (โปรแกรม `programs/examples/ex_lw_add.s`)

| core | จังหวะ | active (hex) |
|---|---|---|
| single | `lw` | `000c15b7` |
| single | `add` | `0008186f` |
| single | `sw` | `000c03a7` |
| single | `beq` (ไม่กระโดด) | `0008a067` |
| multi | S0 FETCH | `0180003f` |
| multi | S1 DECODE | `030003c8` |
| multi | S2 MEM_ADDR | `01001600` |
| multi | S3 MEM_READ | `00806002` |
| multi | S4 MEM_WB | `02018000` |
| multi | S5 MEM_WRITE | `00822002` |
| multi | S6 EXECUTE | `01000e00` |
| multi | S7 ALU_WB | `020c0000` |
| multi | S8 BRANCH (ไม่กระโดด) | `01200c00` |
