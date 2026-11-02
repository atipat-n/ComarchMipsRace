# ตัวอย่างประกอบคู่มือ (docs/tutorial.md): โหลดเลขสองตัวจาก memory มาบวกกันแล้วเก็บกลับ
        .data
x:      .word 30
y:      .word 12
z:      .word 0

        .text
        lw   $t0, x($zero)          # $t0 = 30
        lw   $t1, y($zero)          # $t1 = 12
        add  $t2, $t0, $t1          # $t2 = 42
        sw   $t2, z($zero)          # z = 42
        beq  $t2, $zero, halt       # ไม่กระโดด (42 != 0)
halt:   j    halt

#! expect $t2 = 42
#! expect mem[z] = 42
#! expect retired = 5
#! expect steps = 21
