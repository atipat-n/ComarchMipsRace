`timescale 1ns/1ps
// ทดสอบ top ผ่าน UART เหมือนเว็บ web-live/ คุยกับบอร์ด (compile ด้วย -DSIM)
//   +SCRIPT=file  แต่ละบรรทัด "op val":
//                 1 b = ส่ง byte b, 2 n = รอรับ n byte, 3 n = รอ n clock, 4 0 = รอจน single และ multi จบ
//   +RX=file      byte ที่ได้รับทั้งหมด บรรทัดละ 1 byte (hex)
// UART_DIV = 8 clock ต่อ bit (เร็วกว่าบอร์ดจริง แต่ logic เดียวกัน)
module tb_uart;
    localparam integer DIV = 8;

    reg         clk = 1'b0;
    reg         resetn = 1'b0;
    reg         line = 1'b1;           // คอม -> บอร์ด
    wire        uart_out;              // บอร์ด -> คอม
    wire [15:0] led;
    wire        ca, cb, cc, cd, ce, cf, cg, dp;
    wire [7:0]  an;
    wire [3:0]  vr, vg, vb;
    wire        hs, vs;

    top #(.CLK_HZ(1000), .DEBOUNCE_N(4), .UART_DIV(DIV), .UART_TIMEOUT(5000)) dut (
        .CLK100MHZ(clk), .CPU_RESETN(resetn), .SW(16'd0),
        .BTNC(1'b0), .BTNU(1'b0), .BTNL(1'b0), .BTNR(1'b0),
        .UART_TXD_IN(line), .UART_RXD_OUT(uart_out),
        .LED(led), .CA(ca), .CB(cb), .CC(cc), .CD(cd), .CE(ce), .CF(cf), .CG(cg), .DP(dp), .AN(an),
        .VGA_R(vr), .VGA_G(vg), .VGA_B(vb), .VGA_HS(hs), .VGA_VS(vs)
    );

    always #20 clk = ~clk;

    // ---------------- ตัวรับ (เหมือน FTDI) ----------------
    integer rx_count = 0;
    integer rxfd;
    reg [7:0] rb;
    integer k;
    initial begin
        @(posedge resetn);
        forever begin
            @(negedge uart_out);
            repeat (DIV / 2) @(posedge clk);
            for (k = 0; k < 8; k = k + 1) begin
                repeat (DIV) @(posedge clk);
                rb[k] = uart_out;
            end
            repeat (DIV) @(posedge clk);
            $fdisplay(rxfd, "%h", rb);
            rx_count = rx_count + 1;
        end
    end

    task send_byte;
        input [7:0] b;
        integer i;
        begin
            line = 1'b0;
            repeat (DIV) @(posedge clk);
            for (i = 0; i < 8; i = i + 1) begin
                line = b[i];
                repeat (DIV) @(posedge clk);
            end
            line = 1'b1;
            repeat (DIV) @(posedge clk);
        end
    endtask

    reg [8*256:1] script_file, rx_file;
    integer sfd, op, val, r, want, timeout;

    initial begin
        if (!$value$plusargs("SCRIPT=%s", script_file)) begin $display("ERROR: +SCRIPT"); $finish; end
        if (!$value$plusargs("RX=%s", rx_file)) rx_file = "rx.hex";
        rxfd = $fopen(rx_file, "w");
        sfd  = $fopen(script_file, "r");

        repeat (10) @(posedge clk);
        resetn = 1'b1;
        repeat (800) @(posedge clk);        // boot ROM โหลดโปรแกรม A ตอนเปิดเครื่อง

        while (!$feof(sfd)) begin
            r = $fscanf(sfd, "%d %d\n", op, val);
            if (r == 2) begin
                case (op)
                    1: send_byte(val);
                    2: begin
                        want = rx_count + val;
                        timeout = 0;
                        while (rx_count < want && timeout < 200000) begin @(posedge clk); timeout = timeout + 1; end
                        if (rx_count < want) $display("TIMEOUT waiting for %0d bytes (got %0d)", val, rx_count - want + val);
                    end
                    3: repeat (val) @(posedge clk);
                    default: begin
                        timeout = 0;
                        while (!(led[15] && led[14]) && timeout < 2000000) begin @(posedge clk); timeout = timeout + 1; end
                    end
                endcase
            end
        end
        repeat (50) @(posedge clk);
        $fclose(rxfd);
        $display("tb_uart: received %0d bytes", rx_count);
        $finish;
    end
endmodule
