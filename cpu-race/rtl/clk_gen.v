// 100 MHz -> 25 MHz (สเปคหัวข้อ 5.1) ใช้ MMCM primitive ตรงๆ (ไม่ต้องสร้าง IP)
// ตอน simulation (iverilog -DSIM) ให้ testbench ป้อน clock 25 MHz เข้ามาตรงๆ
module clk_gen (
    input  clk100,
    output clk25,
    output locked
);
`ifdef SIM
    assign clk25  = clk100;
    assign locked = 1'b1;
`else
    wire clkfb, clk25_unbuf;

    // VCO = 100 MHz x 10 = 1000 MHz (ช่วงที่ Artix-7 -1 รับได้ 600-1200), CLKOUT0 = 1000 / 40 = 25 MHz
    MMCME2_BASE #(
        .CLKIN1_PERIOD    (10.0),
        .DIVCLK_DIVIDE    (1),
        .CLKFBOUT_MULT_F  (10.0),
        .CLKOUT0_DIVIDE_F (40.0)
    ) mmcm (
        .CLKIN1   (clk100),
        .CLKFBIN  (clkfb),
        .CLKFBOUT (clkfb),
        .CLKOUT0  (clk25_unbuf),
        .LOCKED   (locked),
        .PWRDWN   (1'b0),
        .RST      (1'b0)
    );

    BUFG bufg25 (.I(clk25_unbuf), .O(clk25));
`endif
endmodule
