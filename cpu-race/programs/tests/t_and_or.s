# and / or
        addi $t0, $zero, 0x0f0f
        addi $t1, $zero, 0x00ff
        and  $t2, $t0, $t1          # 0x000f
        or   $t3, $t0, $t1          # 0x0fff
        addi $t4, $zero, -1         # 0xffffffff
        and  $t5, $t4, $t0          # 0x0f0f
        or   $t6, $t4, $zero        # 0xffffffff
        and  $t7, $t4, $zero        # 0
halt:   j    halt

#! expect $t2 = 0x0000000f
#! expect $t3 = 0x00000fff
#! expect $t5 = 0x00000f0f
#! expect $t6 = 0xffffffff
#! expect $t7 = 0
