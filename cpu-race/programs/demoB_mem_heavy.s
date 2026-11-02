# Demo B (memory heavy): รวม array 8 ตัวด้วย lw แล้ว sw ผลลัพธ์
# ลูปคลี่ออกทีละ 2 ตัว: lw lw add add addi addi beq j = 32 step ต่อ 8 คำสั่ง (CPI multi = 4.0)
# ผล (race_calc.py): multi ชนะถึง ov=3, single ชนะตั้งแต่ ov=4  (โปรแกรม A ที่ ov=4 multi ยังชนะ)
        .data
arr:    .word 3, 1, 4, 1, 5, 9, 2, 6
sum:    .word 0

        .text
        addi $t0, $zero, arr        # ptr
        addi $t1, $zero, 8          # count
        add  $t2, $zero, $zero      # sum
loop:   beq  $t1, $zero, done
        lw   $t3, 0($t0)
        lw   $t4, 4($t0)
        add  $t2, $t2, $t3
        add  $t2, $t2, $t4
        addi $t0, $t0, 8
        addi $t1, $t1, -2
        j    loop
done:   sw   $t2, sum($zero)
halt:   j    halt

#! expect $t2 = 31
#! expect mem[0x420] = 31
