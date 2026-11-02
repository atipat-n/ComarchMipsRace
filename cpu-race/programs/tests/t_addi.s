# addi: sign-extend immediate ขอบบน/ขอบล่าง และเขียน $0 ไม่ติด
        addi $t0, $zero, 32767      # 0x00007fff
        addi $t1, $zero, -32768     # 0xffff8000
        addi $t2, $t0, 1            # 0x00008000
        addi $t3, $t1, -1           # 0xffff7fff
        addi $t4, $t4, 5
        addi $t4, $t4, 5            # 10
        addi $zero, $zero, 9        # ไม่มีผล
        addi $t5, $zero, 0xffff     # 0xffff = -1 หลัง sign-extend
halt:   j    halt

#! expect $t0 = 0x00007fff
#! expect $t1 = 0xffff8000
#! expect $t2 = 0x00008000
#! expect $t3 = 0xffff7fff
#! expect $t4 = 10
#! expect $zero = 0
#! expect $t5 = 0xffffffff
