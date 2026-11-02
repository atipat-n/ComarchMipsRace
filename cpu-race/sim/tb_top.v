`timescale 1ns/1ps
// ทดสอบ top ทั้งบอร์ด (compile ด้วย -DSIM: ใช้ clock 25 MHz ตรงๆ ไม่ผ่าน MMCM)
//
//   +PROG=0|1   เลือกโปรแกรม A/B (SW4)       +OV=n   ค่า ov (SW3-0)
//   +UNITS=n    วิ่งแบบ run mode จนเวลาถึง n หน่วยแล้วกด pause (ไม่ใส่ = วิ่งจนจบทั้งคู่)
//   +STEPS=n    ใช้ step mode กด BTNC n ครั้งแทน run mode
//   +FRAME=f    จับภาพหน้าจอ 1 เฟรมหลังจากนั้นเขียนเป็น .ppm
//
// stdout: "race: prog=.. ov=.. done_s=.. done_m=.. t_s=.. t_m=.. ret_s=.. ret_m=.. time=.."
module tb_top;
    reg         clk = 1'b0;
    reg         resetn = 1'b0;
    reg  [15:0] sw = 16'd0;
    reg         btnc = 1'b0, btnu = 1'b0, btnl = 1'b0, btnr = 1'b0;
    wire [15:0] led;
    wire        ca, cb, cc, cd, ce, cf, cg, dp;
    wire [7:0]  an;
    wire [3:0]  vr, vg, vb;
    wire        hs, vs;

    top #(.CLK_HZ(1000), .DEBOUNCE_N(4)) dut (
        .CLK100MHZ(clk), .CPU_RESETN(resetn), .SW(sw),
        .BTNC(btnc), .BTNU(btnu), .BTNL(btnl), .BTNR(btnr),
        .LED(led), .CA(ca), .CB(cb), .CC(cc), .CD(cd), .CE(ce), .CF(cf), .CG(cg), .DP(dp), .AN(an),
        .VGA_R(vr), .VGA_G(vg), .VGA_B(vb), .VGA_HS(hs), .VGA_VS(vs)
    );

    always #20 clk = ~clk;   // 25 MHz

    task press;
        input integer which;   // 0 = C, 1 = R, 2 = L, 3 = U
        begin
            case (which)
                0: btnc = 1'b1;
                1: btnr = 1'b1;
                2: btnl = 1'b1;
                default: btnu = 1'b1;
            endcase
            repeat (12) @(posedge clk);
            btnc = 1'b0; btnr = 1'b0; btnl = 1'b0; btnu = 1'b0;
            repeat (12) @(posedge clk);
        end
    endtask

    integer prog, ov, units, steps, i, fd, n, timeout;
    reg [8*256:1] frame_file;
    reg do_frame;

    initial begin
        if (!$value$plusargs("PROG=%d", prog)) prog = 0;
        if (!$value$plusargs("OV=%d", ov)) ov = 0;
        if (!$value$plusargs("UNITS=%d", units)) units = -1;
        if (!$value$plusargs("STEPS=%d", steps)) steps = -1;
        do_frame = $value$plusargs("FRAME=%s", frame_file);

        // SW15 = run mode (ถ้าไม่ได้สั่ง STEPS), SW14-12 = เร็วสุด
        sw = {(steps < 0) ? 1'b1 : 1'b0, 3'd7, 7'd0, prog[0], ov[3:0]};

        repeat (10) @(posedge clk);
        resetn = 1'b1;
        repeat (700) @(posedge clk);          // รอโหลดโปรแกรมจาก boot ROM

        if (steps >= 0) begin
            for (i = 0; i < steps; i = i + 1) press(0);
        end else begin
            press(1);                          // run
            timeout = 0;
            while (!(led[15] && led[14]) && (units < 0 || dut.time_now < units) && timeout < 2000000) begin
                @(posedge clk);
                timeout = timeout + 1;
            end
            if (units >= 0 && !(led[15] && led[14])) press(1);   // pause
        end
        repeat (5) @(posedge clk);

        $display("race: prog=%0d ov=%0d done_s=%0d done_m=%0d t_s=%0d t_m=%0d ret_s=%0d ret_m=%0d time=%0d",
                 prog, ov, led[15], led[14], dut.rc.last_s, dut.rc.last_m,
                 dut.cpu_s.retired, dut.cpu_m.retired, dut.time_now);

        if (do_frame) begin
            // รอจุดเริ่มเฟรม แล้วเก็บ 640x480 pixel
            @(posedge clk);
            while (!(dut.vr.vis_o && dut.vr.x_o == 0 && dut.vr.y_o == 0)) @(posedge clk);
            fd = $fopen(frame_file, "w");
            $fwrite(fd, "P3\n640 480\n15\n");
            n = 0;
            while (n < 640 * 480) begin
                if (dut.vr.vis_o) begin
                    $fwrite(fd, "%0d %0d %0d\n", vr, vg, vb);
                    n = n + 1;
                end
                @(posedge clk);
            end
            $fclose(fd);
            $display("frame: %0s", frame_file);
        end
        $finish;
    end
endmodule
