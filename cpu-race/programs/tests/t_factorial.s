# n! ด้วยการบวกซ้ำ (ไม่มีคำสั่งคูณ) ใช้ทดสอบความถูกต้อง ไม่ใช่ demo หลัก
        .data
n:      .word 5
result: .space 4

        .text
        lw   $s0, n($zero)          # n
        addi $s1, $zero, 1          # acc = 1
        addi $s2, $zero, 2          # i = 2
outer:  slt  $t0, $s0, $s2          # n < i ?
        beq  $t0, $zero, mul
        j    done
mul:    add  $t1, $zero, $zero      # sum = 0
        add  $t2, $zero, $s2        # k = i
inner:  beq  $t2, $zero, next
        add  $t1, $t1, $s1          # sum += acc
        addi $t2, $t2, -1
        j    inner
next:   add  $s1, $zero, $t1        # acc = acc * i
        addi $s2, $s2, 1
        j    outer
done:   sw   $s1, result($zero)
halt:   j    halt

#! expect $s1 = 120
#! expect mem[0x404] = 120
