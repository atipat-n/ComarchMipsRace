# Demo A (ALU heavy): sum = 1 + 2 + ... + 10
# ลูปมี slt(4) beq(3) add(4) addi(4) j(3) = 18 step ต่อ 5 คำสั่ง (CPI multi = 3.6)
# ร่างแรก: จุดพลิกจริงต้องเช็กด้วย race_calc.py (สเปคหัวข้อ 14)
        .data
result: .word 0

        .text
        addi $t0, $zero, 0          # sum
        addi $t1, $zero, 1          # i
        addi $t2, $zero, 11         # limit
loop:   slt  $t3, $t1, $t2          # i < 11 ?
        beq  $t3, $zero, done
        add  $t0, $t0, $t1
        addi $t1, $t1, 1
        j    loop
done:   sw   $t0, result($zero)
halt:   j    halt

#! expect $t0 = 55
#! expect mem[0x400] = 55
