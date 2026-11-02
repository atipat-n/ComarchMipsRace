/* สร้างโดย tools/build_web.py จาก programs/*.s ห้ามแก้มือ */
(function (root) {
  const PROGRAMS = [
 {
  "id": "demoA_alu_heavy",
  "group": "demo",
  "groupLabel": "โปรแกรม demo (มีบนบอร์ด)",
  "title": "A: บวก 1..10 (ALU เยอะ)",
  "desc": "Demo A (ALU heavy): sum = 1 + 2 + ... + 10",
  "file": "programs/demoA_alu_heavy.s",
  "src": "# Demo A (ALU heavy): sum = 1 + 2 + ... + 10\n# ลูปมี slt(4) beq(3) add(4) addi(4) j(3) = 18 step ต่อ 5 คำสั่ง (CPI multi = 3.6)\n# ร่างแรก: จุดพลิกจริงต้องเช็กด้วย race_calc.py (สเปคหัวข้อ 14)\n        .data\nresult: .word 0\n\n        .text\n        addi $t0, $zero, 0          # sum\n        addi $t1, $zero, 1          # i\n        addi $t2, $zero, 11         # limit\nloop:   slt  $t3, $t1, $t2          # i < 11 ?\n        beq  $t3, $zero, done\n        add  $t0, $t0, $t1\n        addi $t1, $t1, 1\n        j    loop\ndone:   sw   $t0, result($zero)\nhalt:   j    halt\n\n#! expect $t0 = 55\n#! expect mem[0x400] = 55\n"
 },
 {
  "id": "demoB_mem_heavy",
  "group": "demo",
  "groupLabel": "โปรแกรม demo (มีบนบอร์ด)",
  "title": "B: รวม array (lw เยอะ)",
  "desc": "Demo B (memory heavy): รวม array 8 ตัวด้วย lw แล้ว sw ผลลัพธ์",
  "file": "programs/demoB_mem_heavy.s",
  "src": "# Demo B (memory heavy): รวม array 8 ตัวด้วย lw แล้ว sw ผลลัพธ์\n# ลูปคลี่ออกทีละ 2 ตัว: lw lw add add addi addi beq j = 32 step ต่อ 8 คำสั่ง (CPI multi = 4.0)\n# ผล (race_calc.py): multi ชนะถึง ov=3, single ชนะตั้งแต่ ov=4  (โปรแกรม A ที่ ov=4 multi ยังชนะ)\n        .data\narr:    .word 3, 1, 4, 1, 5, 9, 2, 6\nsum:    .word 0\n\n        .text\n        addi $t0, $zero, arr        # ptr\n        addi $t1, $zero, 8          # count\n        add  $t2, $zero, $zero      # sum\nloop:   beq  $t1, $zero, done\n        lw   $t3, 0($t0)\n        lw   $t4, 4($t0)\n        add  $t2, $t2, $t3\n        add  $t2, $t2, $t4\n        addi $t0, $t0, 8\n        addi $t1, $t1, -2\n        j    loop\ndone:   sw   $t2, sum($zero)\nhalt:   j    halt\n\n#! expect $t2 = 31\n#! expect mem[0x420] = 31\n"
 },
 {
  "id": "ex_lw_add",
  "group": "example",
  "groupLabel": "ตัวอย่าง",
  "title": "โหลด 2 ค่ามาบวกแล้วเก็บ",
  "desc": "ตัวอย่างประกอบคู่มือ (docs/tutorial.md): โหลดเลขสองตัวจาก memory มาบวกกันแล้วเก็บกลับ",
  "file": "programs/examples/ex_lw_add.s",
  "src": "# ตัวอย่างประกอบคู่มือ (docs/tutorial.md): โหลดเลขสองตัวจาก memory มาบวกกันแล้วเก็บกลับ\n        .data\nx:      .word 30\ny:      .word 12\nz:      .word 0\n\n        .text\n        lw   $t0, x($zero)          # $t0 = 30\n        lw   $t1, y($zero)          # $t1 = 12\n        add  $t2, $t0, $t1          # $t2 = 42\n        sw   $t2, z($zero)          # z = 42\n        beq  $t2, $zero, halt       # ไม่กระโดด (42 != 0)\nhalt:   j    halt\n\n#! expect $t2 = 42\n#! expect mem[z] = 42\n#! expect retired = 5\n#! expect steps = 21\n"
 },
 {
  "id": "t_add",
  "group": "test",
  "groupLabel": "เทสต์ทีละคำสั่ง",
  "title": "add",
  "desc": "add: บวกปกติ, ล้น 32 bit, เขียน $0 ไม่ติด",
  "file": "programs/tests/t_add.s",
  "src": "# add: บวกปกติ, ล้น 32 bit, เขียน $0 ไม่ติด\n        addi $t0, $zero, 7\n        addi $t1, $zero, 8\n        add  $t2, $t0, $t1          # 15\n        addi $t3, $zero, -1         # 0xffffffff\n        add  $t4, $t3, $t3          # 0xfffffffe (ล้นทิ้ง ไม่มี exception)\n        add  $zero, $t0, $t1        # ไม่มีผล\n        add  $t5, $t2, $zero        # copy\nhalt:   j    halt\n\n#! expect $t2 = 15\n#! expect $t4 = 0xfffffffe\n#! expect $t5 = 15\n#! expect $zero = 0\n#! expect retired = 7\n#! expect steps = 28\n"
 },
 {
  "id": "t_addi",
  "group": "test",
  "groupLabel": "เทสต์ทีละคำสั่ง",
  "title": "addi",
  "desc": "addi: sign-extend immediate ขอบบน/ขอบล่าง และเขียน $0 ไม่ติด",
  "file": "programs/tests/t_addi.s",
  "src": "# addi: sign-extend immediate ขอบบน/ขอบล่าง และเขียน $0 ไม่ติด\n        addi $t0, $zero, 32767      # 0x00007fff\n        addi $t1, $zero, -32768     # 0xffff8000\n        addi $t2, $t0, 1            # 0x00008000\n        addi $t3, $t1, -1           # 0xffff7fff\n        addi $t4, $t4, 5\n        addi $t4, $t4, 5            # 10\n        addi $zero, $zero, 9        # ไม่มีผล\n        addi $t5, $zero, 0xffff     # 0xffff = -1 หลัง sign-extend\nhalt:   j    halt\n\n#! expect $t0 = 0x00007fff\n#! expect $t1 = 0xffff8000\n#! expect $t2 = 0x00008000\n#! expect $t3 = 0xffff7fff\n#! expect $t4 = 10\n#! expect $zero = 0\n#! expect $t5 = 0xffffffff\n"
 },
 {
  "id": "t_and_or",
  "group": "test",
  "groupLabel": "เทสต์ทีละคำสั่ง",
  "title": "and / or",
  "desc": "and / or",
  "file": "programs/tests/t_and_or.s",
  "src": "# and / or\n        addi $t0, $zero, 0x0f0f\n        addi $t1, $zero, 0x00ff\n        and  $t2, $t0, $t1          # 0x000f\n        or   $t3, $t0, $t1          # 0x0fff\n        addi $t4, $zero, -1         # 0xffffffff\n        and  $t5, $t4, $t0          # 0x0f0f\n        or   $t6, $t4, $zero        # 0xffffffff\n        and  $t7, $t4, $zero        # 0\nhalt:   j    halt\n\n#! expect $t2 = 0x0000000f\n#! expect $t3 = 0x00000fff\n#! expect $t5 = 0x00000f0f\n#! expect $t6 = 0xffffffff\n#! expect $t7 = 0\n"
 },
 {
  "id": "t_beq",
  "group": "test",
  "groupLabel": "เทสต์ทีละคำสั่ง",
  "title": "beq",
  "desc": "beq: กระโดดไปข้างหน้า, ไม่กระโดด, กระโดดย้อนหลัง (ลูป)",
  "file": "programs/tests/t_beq.s",
  "src": "# beq: กระโดดไปข้างหน้า, ไม่กระโดด, กระโดดย้อนหลัง (ลูป)\n        addi $t0, $zero, 3\n        addi $t1, $zero, 3\n        addi $t2, $zero, 0\n        beq  $t0, $t1, taken        # กระโดด\n        addi $t2, $t2, 100          # ต้องถูกข้าม\ntaken:  addi $t2, $t2, 1\n        beq  $t0, $zero, skip       # ไม่กระโดด\n        addi $t2, $t2, 10\nskip:   addi $t2, $t2, 1000         # 1011\n\n        addi $t3, $zero, 5\n        addi $t4, $zero, 0\nloop:   addi $t4, $t4, 2\n        addi $t3, $t3, -1\n        beq  $t3, $zero, out\n        beq  $zero, $zero, loop     # กระโดดย้อนหลังเสมอ\nout:\nhalt:   j    halt\n\n#! expect $t2 = 1011\n#! expect $t4 = 10\n#! expect $t3 = 0\n"
 },
 {
  "id": "t_factorial",
  "group": "test",
  "groupLabel": "เทสต์ทีละคำสั่ง",
  "title": "5! ด้วยการบวกซ้ำ",
  "desc": "n! ด้วยการบวกซ้ำ (ไม่มีคำสั่งคูณ) ใช้ทดสอบความถูกต้อง ไม่ใช่ demo หลัก",
  "file": "programs/tests/t_factorial.s",
  "src": "# n! ด้วยการบวกซ้ำ (ไม่มีคำสั่งคูณ) ใช้ทดสอบความถูกต้อง ไม่ใช่ demo หลัก\n        .data\nn:      .word 5\nresult: .space 4\n\n        .text\n        lw   $s0, n($zero)          # n\n        addi $s1, $zero, 1          # acc = 1\n        addi $s2, $zero, 2          # i = 2\nouter:  slt  $t0, $s0, $s2          # n < i ?\n        beq  $t0, $zero, mul\n        j    done\nmul:    add  $t1, $zero, $zero      # sum = 0\n        add  $t2, $zero, $s2        # k = i\ninner:  beq  $t2, $zero, next\n        add  $t1, $t1, $s1          # sum += acc\n        addi $t2, $t2, -1\n        j    inner\nnext:   add  $s1, $zero, $t1        # acc = acc * i\n        addi $s2, $s2, 1\n        j    outer\ndone:   sw   $s1, result($zero)\nhalt:   j    halt\n\n#! expect $s1 = 120\n#! expect mem[0x404] = 120\n"
 },
 {
  "id": "t_illegal",
  "group": "test",
  "groupLabel": "เทสต์ทีละคำสั่ง",
  "title": "คำสั่งที่ไม่รู้จัก",
  "desc": "คำสั่งที่ไม่รู้จักต้องทำตัวเป็น NOP (สเปคหัวข้อ 6) และยังนับ retired",
  "file": "programs/tests/t_illegal.s",
  "src": "# คำสั่งที่ไม่รู้จักต้องทำตัวเป็น NOP (สเปคหัวข้อ 6) และยังนับ retired\n        addi $t0, $zero, 1\n        .word 0xfc000000            # opcode 0x3f ไม่อยู่ใน ISA\n        .word 0x01095006            # R-type funct 0x06 ไม่อยู่ใน ISA (ถ้าทำงานจะเขียน $t2)\n        addi $t0, $t0, 1\nhalt:   j    halt\n\n#! expect $t0 = 2\n#! expect $t2 = 0\n#! expect retired = 4\n#! expect illegal = 2\n#! expect steps = 12\n"
 },
 {
  "id": "t_j",
  "group": "test",
  "groupLabel": "เทสต์ทีละคำสั่ง",
  "title": "j",
  "desc": "j: กระโดดไปข้างหน้าและย้อนหลัง",
  "file": "programs/tests/t_j.s",
  "src": "# j: กระโดดไปข้างหน้าและย้อนหลัง\n        addi $t0, $zero, 1\n        j    skip\n        addi $t0, $t0, 100          # ต้องถูกข้าม\nskip:   addi $t0, $t0, 2            # 3\n        j    fwd\nback:   addi $t0, $t0, 20           # 33\n        j    end\nfwd:    addi $t0, $t0, 10           # 13\n        j    back\nend:\nhalt:   j    halt\n\n#! expect $t0 = 33\n#! expect retired = 8\n#! expect steps = 28\n"
 },
 {
  "id": "t_lw_sw",
  "group": "test",
  "groupLabel": "เทสต์ทีละคำสั่ง",
  "title": "lw / sw",
  "desc": "lw / sw: offset บวก ลบ, ใช้ label เป็น offset, เขียนทับข้อมูลเดิม",
  "file": "programs/tests/t_lw_sw.s",
  "src": "# lw / sw: offset บวก ลบ, ใช้ label เป็น offset, เขียนทับข้อมูลเดิม\n        .data\narr:    .word 11, 22, 0x12345678\nout:    .space 8\n\n        .text\n        addi $t0, $zero, arr        # 0x400\n        lw   $t1, 0($t0)            # 11\n        lw   $t2, 4($t0)            # 22\n        lw   $t3, 8($t0)            # 0x12345678\n        add  $t4, $t1, $t2          # 33\n        sw   $t4, out($zero)        # mem[0x40c] = 33\n        sw   $t3, 4($t0)            # mem[0x404] = 0x12345678\n        addi $t5, $zero, out\n        sw   $t1, 4($t5)            # mem[0x410] = 11\n        lw   $t6, out($zero)        # 33\n        addi $t7, $zero, 0x408\n        lw   $s0, -8($t7)           # mem[0x400] = 11\nhalt:   j    halt\n\n#! expect $t3 = 0x12345678\n#! expect $t6 = 33\n#! expect $s0 = 11\n#! expect mem[0x400] = 11\n#! expect mem[0x404] = 0x12345678\n#! expect mem[0x40c] = 33\n#! expect mem[0x410] = 11\n#! expect steps = 53\n"
 },
 {
  "id": "t_slt",
  "group": "test",
  "groupLabel": "เทสต์ทีละคำสั่ง",
  "title": "slt (มีเครื่องหมาย)",
  "desc": "slt แบบ signed รวมกรณีที่ a-b ล้น (0x80000000 < 3)",
  "file": "programs/tests/t_slt.s",
  "src": "# slt แบบ signed รวมกรณีที่ a-b ล้น (0x80000000 < 3)\n        addi $t0, $zero, -5\n        addi $t1, $zero, 3\n        slt  $t2, $t0, $t1          # -5 < 3  -> 1\n        slt  $t3, $t1, $t0          # 3 < -5  -> 0\n        slt  $t4, $t1, $t1          # 3 < 3   -> 0\n        addi $t5, $zero, -32768\n        addi $t6, $zero, 32767\n        slt  $t7, $t5, $t6          # 1\n        slt  $s0, $t6, $t5          # 0\n\n        # สร้าง 0x80000000 ด้วยการบวกตัวเองซ้ำ 31 ครั้ง\n        addi $s1, $zero, 1\n        addi $s2, $zero, 31\ndbl:    beq  $s2, $zero, cmp\n        add  $s1, $s1, $s1\n        addi $s2, $s2, -1\n        j    dbl\ncmp:    slt  $s3, $s1, $t1          # 0x80000000 < 3 -> 1 (ถ้าไม่จัดการ overflow จะได้ 0)\n        slt  $s4, $t1, $s1          # 0\n        addi $s5, $s1, -1           # 0x7fffffff\n        slt  $s6, $s5, $s1          # 0x7fffffff < 0x80000000 (signed) -> 0\n        slt  $s7, $s1, $s5          # 1\nhalt:   j    halt\n\n#! expect $t2 = 1\n#! expect $t3 = 0\n#! expect $t4 = 0\n#! expect $t7 = 1\n#! expect $s0 = 0\n#! expect $s1 = 0x80000000\n#! expect $s3 = 1\n#! expect $s4 = 0\n#! expect $s5 = 0x7fffffff\n#! expect $s6 = 0\n#! expect $s7 = 1\n"
 },
 {
  "id": "t_sub",
  "group": "test",
  "groupLabel": "เทสต์ทีละคำสั่ง",
  "title": "sub",
  "desc": "sub: ผลบวก ผลลบ และศูนย์",
  "file": "programs/tests/t_sub.s",
  "src": "# sub: ผลบวก ผลลบ และศูนย์\n        addi $t0, $zero, 20\n        addi $t1, $zero, 5\n        sub  $t2, $t0, $t1          # 15\n        sub  $t3, $t1, $t0          # -15\n        sub  $t4, $t0, $t0          # 0\n        sub  $t5, $zero, $t1        # -5\nhalt:   j    halt\n\n#! expect $t2 = 15\n#! expect $t3 = 0xfffffff1\n#! expect $t4 = 0\n#! expect $t5 = 0xfffffffb\n#! expect retired = 6\n"
 }
];
  if (typeof module === 'object' && module.exports) module.exports = PROGRAMS;
  else root.PROGRAMS = PROGRAMS;
})(typeof self !== 'undefined' ? self : this);
