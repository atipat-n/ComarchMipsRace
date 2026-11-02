# คำสั่งที่ไม่รู้จักต้องทำตัวเป็น NOP (สเปคหัวข้อ 6) และยังนับ retired
        addi $t0, $zero, 1
        .word 0xfc000000            # opcode 0x3f ไม่อยู่ใน ISA
        .word 0x01095006            # R-type funct 0x06 ไม่อยู่ใน ISA (ถ้าทำงานจะเขียน $t2)
        addi $t0, $t0, 1
halt:   j    halt

#! expect $t0 = 2
#! expect $t2 = 0
#! expect retired = 4
#! expect illegal = 2
#! expect steps = 12
