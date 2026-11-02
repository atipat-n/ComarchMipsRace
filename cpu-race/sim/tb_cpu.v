`timescale 1ns/1ps
// รัน CPU หนึ่งตัวกับโปรแกรมหนึ่งไฟล์จนถึง done แล้ว dump state ออกเป็นไฟล์
// compile: iverilog -g2001            sim/tb_cpu.v ...   -> single-cycle
//          iverilog -g2001 -DMULTI    sim/tb_cpu.v ...   -> multicycle
// run:     vvp tb.vvp +MEM=t_add.mem +OUT=t_add.state [+MAX=100000] [+VCD=t_add.vcd] [+TRACE [+REG=8]]
// รูปแบบไฟล์ output ตรงกับ ref_model.format_state()
// stdout: "tb_cpu: core=... done=1 retired=N cycles=M"  (cycles = จำนวน en ที่ใช้จริง)
module tb_cpu;
    reg         clk = 1'b0;
    reg         rst = 1'b1;
    reg         en  = 1'b0;
    reg         ld_we = 1'b0;
    reg  [8:0]  ld_addr = 9'd0;
    reg  [31:0] ld_data = 32'd0;
    reg  [4:0]  dbg_addr = 5'd0;
    wire [31:0] dbg_data, pc, instr, retired, active;
    wire [3:0]  state;
    wire        done;

`ifdef MULTI
    multi_cycle_cpu dut (
`else
    single_cycle_cpu dut (
`endif
        .clk(clk), .rst(rst), .en(en),
        .ld_we(ld_we), .ld_addr(ld_addr), .ld_data(ld_data),
        .dbg_reg_addr(dbg_addr), .dbg_reg_data(dbg_data),
        .pc(pc), .instr(instr), .retired(retired), .done(done),
        .active(active), .state(state)
    );

    always #5 clk = ~clk;

    reg [31:0]    image [0:511];
    reg [8*256:1] memfile, outfile, vcdfile;
    reg [15:0]    maddr;
    reg [31:0]    mword;
    integer       i, fd, cycles, max_cycles, trace, trace_reg;

    initial begin
        if (!$value$plusargs("REG=%d", trace_reg)) trace_reg = 8;   // register ที่จะโชว์ใน trace
        if (!$value$plusargs("MEM=%s", memfile)) begin
            $display("ERROR: ต้องใส่ +MEM=<file.mem>");
            $finish;
        end
        if (!$value$plusargs("OUT=%s", outfile)) outfile = "cpu.state";
        if (!$value$plusargs("MAX=%d", max_cycles)) max_cycles = 500000;
        if ($value$plusargs("VCD=%s", vcdfile)) begin
            $dumpfile(vcdfile);
            $dumpvars(0, tb_cpu);
        end

        for (i = 0; i < 512; i = i + 1) image[i] = 32'd0;
        $readmemh(memfile, image);

        // โหลดโปรแกรมผ่าน loader port ระหว่าง reset
        @(negedge clk);
        for (i = 0; i < 512; i = i + 1) begin
            ld_we   = 1'b1;
            ld_addr = i;
            ld_data = image[i];
            @(negedge clk);
        end
        ld_we = 1'b0;
        rst   = 1'b0;
        @(negedge clk);

        // ให้ en ทุก clock จนกว่าจะ done (+TRACE = พิมพ์สถานะก่อนเดินแต่ละ step)
        trace  = $test$plusargs("TRACE");
        cycles = 0;
        while (!done && cycles < max_cycles) begin
            if (trace) begin
                dbg_addr = trace_reg;
                #1;
                $display("cycle %4d  state=S%-2d  pc=%h  instr=%h  retired=%0d  active=%h  $%0d=%h",
                         cycles, state, pc, instr, retired, active, trace_reg, dbg_data);
            end
            en = 1'b1;
            @(negedge clk);
            cycles = cycles + 1;
        end
        en = 1'b0;
        if (!done) $display("TIMEOUT after %0d cycles (PC=%h state=%0d)", cycles, pc, state);

        fd = $fopen(outfile, "w");
        $fdisplay(fd, "retired %0d", retired);
        for (i = 0; i < 32; i = i + 1) begin
            dbg_addr = i;
            #1;
            if (i < 10) $fdisplay(fd, "r0%0d %h", i, dbg_data);
            else        $fdisplay(fd, "r%0d %h", i, dbg_data);
        end
        for (i = 0; i < 256; i = i + 1) begin
            maddr = 16'h0400 + 4 * i;
`ifdef MULTI
            mword = dut.mem.mem[256 + i];
`else
            mword = dut.dmem.mem[i];
`endif
            $fdisplay(fd, "m%h %h", maddr, mword);
        end
        $fclose(fd);

`ifdef MULTI
        $display("tb_cpu: core=multi done=%0d retired=%0d cycles=%0d", done, retired, cycles);
`else
        $display("tb_cpu: core=single done=%0d retired=%0d cycles=%0d", done, retired, cycles);
`endif
        $finish;
    end
endmodule
