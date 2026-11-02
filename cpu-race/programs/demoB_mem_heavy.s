# Demo B (memory heavy): รวม array 8 ตัวด้วย lw แล้ว sw ผลลัพธ์
# ร่างแรก: ขนาด array ต้องเลือกด้วย race_calc.py (สเปคหัวข้อ 14)
        .data
arr:    .word 3, 1, 4, 1, 5, 9, 2, 6
sum:    .word 0

        .text
        addi $t0, $zero, arr        # ptr
        addi $t1, $zero, 8          # count
        add  $t2, $zero, $zero      # sum
loop:   beq  $t1, $zero, done
        lw   $t3, 0($t0)
        add  $t2, $t2, $t3
        addi $t0, $t0, 4
        addi $t1, $t1, -1
        j    loop
done:   sw   $t2, sum($zero)
halt:   j    halt

#! expect $t2 = 31
#! expect mem[0x420] = 31
