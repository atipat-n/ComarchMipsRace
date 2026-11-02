`timescale 1ns/1ps
// Unit test ของ rtl/common: alu, alu_control, regfile, sign_ext
// จบด้วยบรรทัด "tb_common: ALL PASS" หรือ "tb_common: N FAIL"
module tb_common;
    integer fails = 0;

    // ---------------- ALU ----------------
    reg  [31:0] a, b;
    reg  [3:0]  ctrl;
    wire [31:0] y;
    wire        zero;
    alu u_alu (.a(a), .b(b), .ctrl(ctrl), .y(y), .zero(zero));

    task check_alu;
        input [3:0]  c;
        input [31:0] ia, ib, exp_y;
        begin
            a = ia; b = ib; ctrl = c;
            #1;
            if (y !== exp_y || zero !== (exp_y == 32'd0)) begin
                $display("FAIL alu ctrl=%b a=%h b=%h -> y=%h zero=%b (expect %h)", c, ia, ib, y, zero, exp_y);
                fails = fails + 1;
            end
        end
    endtask

    // ---------------- ALU control ----------------
    reg  [1:0] alu_op;
    reg  [5:0] funct;
    wire [3:0] actl;
    wire       bad;
    alu_control u_ac (.alu_op(alu_op), .funct(funct), .ctrl(actl), .bad_funct(bad));

    task check_ac;
        input [1:0] op;
        input [5:0] f;
        input [3:0] exp_c;
        input       exp_bad;
        begin
            alu_op = op; funct = f;
            #1;
            if (actl !== exp_c || bad !== exp_bad) begin
                $display("FAIL alu_control op=%b funct=%h -> %b bad=%b (expect %b bad=%b)", op, f, actl, bad, exp_c, exp_bad);
                fails = fails + 1;
            end
        end
    endtask

    // ---------------- regfile ----------------
    reg         clk = 1'b0, rst = 1'b1, we = 1'b0;
    reg  [4:0]  wa = 5'd0, ra1 = 5'd0, ra2 = 5'd0, dra = 5'd0;
    reg  [31:0] wd = 32'd0;
    wire [31:0] rd1, rd2, drd;
    regfile u_rf (.clk(clk), .rst(rst), .we(we), .wa(wa), .wd(wd),
                  .ra1(ra1), .ra2(ra2), .rd1(rd1), .rd2(rd2), .dbg_ra(dra), .dbg_rd(drd));
    always #5 clk = ~clk;

    task rf_write;
        input [4:0]  addr;
        input [31:0] data;
        begin
            @(negedge clk);
            we = 1'b1; wa = addr; wd = data;
            @(negedge clk);
            we = 1'b0;
        end
    endtask

    task check_rf;
        input [4:0]  addr;
        input [31:0] exp_v;
        begin
            ra1 = addr; ra2 = addr; dra = addr;
            #1;
            if (rd1 !== exp_v || rd2 !== exp_v || drd !== exp_v) begin
                $display("FAIL regfile r%0d -> %h/%h/%h (expect %h)", addr, rd1, rd2, drd, exp_v);
                fails = fails + 1;
            end
        end
    endtask

    // ---------------- sign_ext ----------------
    reg  [15:0] se_in;
    wire [31:0] se_out;
    sign_ext u_se (.in(se_in), .out(se_out));

    initial begin
        // ALU
        check_alu(4'b0000, 32'hF0F0_F0F0, 32'hFF00_FF00, 32'hF000_F000);
        check_alu(4'b0001, 32'hF0F0_F0F0, 32'h0F00_0000, 32'hFFF0_F0F0);
        check_alu(4'b0010, 32'd7,         32'd8,         32'd15);
        check_alu(4'b0010, 32'hFFFF_FFFF, 32'd1,         32'd0);        // ล้น -> 0, zero=1
        check_alu(4'b0110, 32'd5,         32'd7,         32'hFFFF_FFFE);
        check_alu(4'b0110, 32'd9,         32'd9,         32'd0);        // zero ของ beq
        check_alu(4'b0111, 32'hFFFF_FFFB, 32'd3,         32'd1);        // -5 < 3
        check_alu(4'b0111, 32'd3,         32'hFFFF_FFFB, 32'd0);
        check_alu(4'b0111, 32'h8000_0000, 32'd1,         32'd1);        // a-b ล้น
        check_alu(4'b0111, 32'h7FFF_FFFF, 32'h8000_0000, 32'd0);        // a-b ล้น
        check_alu(4'b0111, 32'd4,         32'd4,         32'd0);
        check_alu(4'b1100, 32'h0000_00FF, 32'h0000_FF00, 32'hFFFF_0000);

        // ALU control (สเปคหัวข้อ 7.3)
        check_ac(2'b00, 6'h3F, 4'b0010, 1'b0);
        check_ac(2'b01, 6'h00, 4'b0110, 1'b0);
        check_ac(2'b10, 6'h20, 4'b0010, 1'b0);
        check_ac(2'b10, 6'h22, 4'b0110, 1'b0);
        check_ac(2'b10, 6'h24, 4'b0000, 1'b0);
        check_ac(2'b10, 6'h25, 4'b0001, 1'b0);
        check_ac(2'b10, 6'h2A, 4'b0111, 1'b0);
        check_ac(2'b10, 6'h0A, 4'b0010, 1'b1);   // funct ตามสไลด์ w04c ที่พิมพ์ผิด ต้องไม่รับ

        // sign_ext
        se_in = 16'h7FFF; #1;
        if (se_out !== 32'h0000_7FFF) begin $display("FAIL sign_ext 7fff -> %h", se_out); fails = fails + 1; end
        se_in = 16'h8000; #1;
        if (se_out !== 32'hFFFF_8000) begin $display("FAIL sign_ext 8000 -> %h", se_out); fails = fails + 1; end

        // regfile
        @(negedge clk); @(negedge clk);
        rst = 1'b0;
        check_rf(5'd5, 32'd0);
        rf_write(5'd5, 32'hDEAD_BEEF);
        check_rf(5'd5, 32'hDEAD_BEEF);
        rf_write(5'd0, 32'h1234_5678);           // $0 เขียนไม่ติด
        check_rf(5'd0, 32'd0);
        rf_write(5'd31, 32'hCAFE_0001);
        check_rf(5'd31, 32'hCAFE_0001);
        check_rf(5'd5, 32'hDEAD_BEEF);
        @(negedge clk); rst = 1'b1; @(negedge clk); rst = 1'b0;
        check_rf(5'd5, 32'd0);                   // reset ล้างค่า
        check_rf(5'd31, 32'd0);

        if (fails == 0) $display("tb_common: ALL PASS");
        else            $display("tb_common: %0d FAIL", fails);
        $finish;
    end
endmodule
