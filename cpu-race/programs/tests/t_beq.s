# beq: กระโดดไปข้างหน้า, ไม่กระโดด, กระโดดย้อนหลัง (ลูป)
        addi $t0, $zero, 3
        addi $t1, $zero, 3
        addi $t2, $zero, 0
        beq  $t0, $t1, taken        # กระโดด
        addi $t2, $t2, 100          # ต้องถูกข้าม
taken:  addi $t2, $t2, 1
        beq  $t0, $zero, skip       # ไม่กระโดด
        addi $t2, $t2, 10
skip:   addi $t2, $t2, 1000         # 1011

        addi $t3, $zero, 5
        addi $t4, $zero, 0
loop:   addi $t4, $t4, 2
        addi $t3, $t3, -1
        beq  $t3, $zero, out
        beq  $zero, $zero, loop     # กระโดดย้อนหลังเสมอ
out:
halt:   j    halt

#! expect $t2 = 1011
#! expect $t4 = 10
#! expect $t3 = 0
