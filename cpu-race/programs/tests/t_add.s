# add: บวกปกติ, ล้น 32 bit, เขียน $0 ไม่ติด
        addi $t0, $zero, 7
        addi $t1, $zero, 8
        add  $t2, $t0, $t1          # 15
        addi $t3, $zero, -1         # 0xffffffff
        add  $t4, $t3, $t3          # 0xfffffffe (ล้นทิ้ง ไม่มี exception)
        add  $zero, $t0, $t1        # ไม่มีผล
        add  $t5, $t2, $zero        # copy
halt:   j    halt

#! expect $t2 = 15
#! expect $t4 = 0xfffffffe
#! expect $t5 = 15
#! expect $zero = 0
#! expect retired = 7
#! expect steps = 28
