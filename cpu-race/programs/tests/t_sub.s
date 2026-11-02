# sub: ผลบวก ผลลบ และศูนย์
        addi $t0, $zero, 20
        addi $t1, $zero, 5
        sub  $t2, $t0, $t1          # 15
        sub  $t3, $t1, $t0          # -15
        sub  $t4, $t0, $t0          # 0
        sub  $t5, $zero, $t1        # -5
halt:   j    halt

#! expect $t2 = 15
#! expect $t3 = 0xfffffff1
#! expect $t4 = 0
#! expect $t5 = 0xfffffffb
#! expect retired = 6
