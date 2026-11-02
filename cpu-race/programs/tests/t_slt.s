# slt แบบ signed รวมกรณีที่ a-b ล้น (0x80000000 < 3)
        addi $t0, $zero, -5
        addi $t1, $zero, 3
        slt  $t2, $t0, $t1          # -5 < 3  -> 1
        slt  $t3, $t1, $t0          # 3 < -5  -> 0
        slt  $t4, $t1, $t1          # 3 < 3   -> 0
        addi $t5, $zero, -32768
        addi $t6, $zero, 32767
        slt  $t7, $t5, $t6          # 1
        slt  $s0, $t6, $t5          # 0

        # สร้าง 0x80000000 ด้วยการบวกตัวเองซ้ำ 31 ครั้ง
        addi $s1, $zero, 1
        addi $s2, $zero, 31
dbl:    beq  $s2, $zero, cmp
        add  $s1, $s1, $s1
        addi $s2, $s2, -1
        j    dbl
cmp:    slt  $s3, $s1, $t1          # 0x80000000 < 3 -> 1 (ถ้าไม่จัดการ overflow จะได้ 0)
        slt  $s4, $t1, $s1          # 0
        addi $s5, $s1, -1           # 0x7fffffff
        slt  $s6, $s5, $s1          # 0x7fffffff < 0x80000000 (signed) -> 0
        slt  $s7, $s1, $s5          # 1
halt:   j    halt

#! expect $t2 = 1
#! expect $t3 = 0
#! expect $t4 = 0
#! expect $t7 = 1
#! expect $s0 = 0
#! expect $s1 = 0x80000000
#! expect $s3 = 1
#! expect $s4 = 0
#! expect $s5 = 0x7fffffff
#! expect $s6 = 0
#! expect $s7 = 1
