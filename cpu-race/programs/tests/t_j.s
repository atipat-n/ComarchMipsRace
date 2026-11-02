# j: กระโดดไปข้างหน้าและย้อนหลัง
        addi $t0, $zero, 1
        j    skip
        addi $t0, $t0, 100          # ต้องถูกข้าม
skip:   addi $t0, $t0, 2            # 3
        j    fwd
back:   addi $t0, $t0, 20           # 33
        j    end
fwd:    addi $t0, $t0, 10           # 13
        j    back
end:
halt:   j    halt

#! expect $t0 = 33
#! expect retired = 8
#! expect steps = 28
