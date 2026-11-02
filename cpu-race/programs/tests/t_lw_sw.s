# lw / sw: offset บวก ลบ, ใช้ label เป็น offset, เขียนทับข้อมูลเดิม
        .data
arr:    .word 11, 22, 0x12345678
out:    .space 8

        .text
        addi $t0, $zero, arr        # 0x400
        lw   $t1, 0($t0)            # 11
        lw   $t2, 4($t0)            # 22
        lw   $t3, 8($t0)            # 0x12345678
        add  $t4, $t1, $t2          # 33
        sw   $t4, out($zero)        # mem[0x40c] = 33
        sw   $t3, 4($t0)            # mem[0x404] = 0x12345678
        addi $t5, $zero, out
        sw   $t1, 4($t5)            # mem[0x410] = 11
        lw   $t6, out($zero)        # 33
        addi $t7, $zero, 0x408
        lw   $s0, -8($t7)           # mem[0x400] = 11
halt:   j    halt

#! expect $t3 = 0x12345678
#! expect $t6 = 33
#! expect $s0 = 11
#! expect mem[0x400] = 11
#! expect mem[0x404] = 0x12345678
#! expect mem[0x40c] = 33
#! expect mem[0x410] = 11
#! expect steps = 53
