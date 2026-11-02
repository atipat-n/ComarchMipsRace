// Single-cycle MIPS (สเปคหัวข้อ 7) port ตามหัวข้อ 16
//
// - เดินหนึ่งคำสั่งต่อ en pulse (ไม่ได้เดินทุก clock)
// - IMEM = word 0..255 (byte 0x000-0x3FF), DMEM = word 256..511 (byte 0x400-0x7FF)
// - loader: ld_addr[8]=0 เขียน IMEM, =1 เขียน DMEM
// - done = คำสั่งที่ PC ชี้อยู่คือ `j` กระโดดหาตัวเอง (halt) -> ไม่รันคำสั่งนั้นและไม่นับ retired
module single_cycle_cpu (
    input         clk,
    input         rst,
    input         en,
    input         ld_we,
    input  [8:0]  ld_addr,
    input  [31:0] ld_data,
    input  [4:0]  dbg_reg_addr,
    output [31:0] dbg_reg_data,
    output [31:0] pc,
    output [31:0] instr,
    output [31:0] retired,
    output        done,
    output [31:0] active,
    output [3:0]  state
);
    reg [31:0] pc_r;
    reg [31:0] retired_r;

    // ---------------- fetch ----------------
    wire [31:0] pc_plus4 = pc_r + 32'd4;

    lutram #(.AW(8)) imem (
        .clk   (clk),
        .we    (ld_we & ~ld_addr[8]),
        .waddr (ld_addr[7:0]),
        .wdata (ld_data),
        .raddr (pc_r[9:2]),
        .rdata (instr)
    );

    wire [5:0]  opcode = instr[31:26];
    wire [4:0]  rs     = instr[25:21];
    wire [4:0]  rt     = instr[20:16];
    wire [4:0]  rd     = instr[15:11];
    wire [5:0]  funct  = instr[5:0];

    // ---------------- control ----------------
    wire       reg_dst, alu_src, mem_to_reg, reg_write, mem_read, mem_write, branch, jump, illegal;
    wire [1:0] alu_op;

    sc_control ctl (
        .opcode     (opcode),
        .funct      (funct),
        .reg_dst    (reg_dst),
        .alu_src    (alu_src),
        .mem_to_reg (mem_to_reg),
        .reg_write  (reg_write),
        .mem_read   (mem_read),
        .mem_write  (mem_write),
        .branch     (branch),
        .jump       (jump),
        .alu_op     (alu_op),
        .illegal    (illegal)
    );

    wire [31:0] jump_target = {pc_plus4[31:28], instr[25:0], 2'b00};
    assign done = jump & (jump_target == pc_r);

    // เดินจริงเมื่อได้ en และยังไม่จบ
    wire step = en & ~done;

    // ---------------- register file ----------------
    wire [31:0] rd1, rd2, wb_data;
    wire [4:0]  wa = reg_dst ? rd : rt;

    regfile rf (
        .clk    (clk),
        .rst    (rst),
        .we     (step & reg_write),
        .wa     (wa),
        .wd     (wb_data),
        .ra1    (rs),
        .ra2    (rt),
        .rd1    (rd1),
        .rd2    (rd2),
        .dbg_ra (dbg_reg_addr),
        .dbg_rd (dbg_reg_data)
    );

    // ---------------- execute ----------------
    wire [31:0] imm_ext;
    sign_ext se (.in(instr[15:0]), .out(imm_ext));

    wire [3:0] alu_ctrl;
    wire       bad_funct; // ตรวจไปแล้วใน sc_control
    alu_control ac (.alu_op(alu_op), .funct(funct), .ctrl(alu_ctrl), .bad_funct(bad_funct));

    wire [31:0] alu_b = alu_src ? imm_ext : rd2;
    wire [31:0] alu_y;
    wire        zero;
    alu alu0 (.a(rd1), .b(alu_b), .ctrl(alu_ctrl), .y(alu_y), .zero(zero));

    // ---------------- data memory ----------------
    // address ของข้อมูลอยู่ในช่วง 0x400-0x7FF จึงใช้ alu_y[9:2] ตรงๆ (สเปคหัวข้อ 6.1)
    wire [31:0] dmem_rdata;
    lutram #(.AW(8)) dmem (
        .clk   (clk),
        .we    (ld_we ? ld_addr[8] : (step & mem_write)),
        .waddr (ld_we ? ld_addr[7:0] : alu_y[9:2]),
        .wdata (ld_we ? ld_data : rd2),
        .raddr (alu_y[9:2]),
        .rdata (dmem_rdata)
    );

    assign wb_data = mem_to_reg ? dmem_rdata : alu_y;

    // ---------------- next PC ----------------
    wire [31:0] branch_target = pc_plus4 + {imm_ext[29:0], 2'b00};
    wire        pc_src        = branch & zero;
    wire [31:0] pc_next       = jump   ? jump_target   :
                                pc_src ? branch_target : pc_plus4;

    always @(posedge clk) begin
        if (rst) begin
            pc_r      <= 32'd0;
            retired_r <= 32'd0;
        end else if (step) begin
            pc_r      <= pc_next;
            retired_r <= retired_r + 32'd1;
        end
    end

    assign pc      = pc_r;
    assign retired = retired_r;
    assign state   = 4'd0;

    // ---------------- active wires (สเปคหัวข้อ 10.3) ----------------
    wire legal  = ~illegal & ~done;
    wire uses_alu = legal & ~jump;

    assign active[0]  = ~done;                              // PC -> IMEM
    assign active[1]  = ~done;                              // PC -> +4 -> mux PCSrc
    assign active[2]  = uses_alu;                           // IMEM -> rs/rt -> RegFile
    assign active[3]  = legal & reg_dst & reg_write;        // IMEM[15:11] -> mux RegDst
    assign active[4]  = legal & ~reg_dst & reg_write;       // IMEM[20:16] -> mux RegDst
    assign active[5]  = uses_alu;                           // ReadData1 -> ALU A
    assign active[6]  = uses_alu & ~alu_src;                // ReadData2 -> mux ALUSrc
    assign active[7]  = uses_alu & alu_src;                 // sign-ext -> mux ALUSrc
    assign active[8]  = legal & (mem_read | mem_write);     // ALU -> DMEM addr
    assign active[9]  = legal & mem_write;                  // ReadData2 -> DMEM wdata
    assign active[10] = legal & mem_read;                   // DMEM rdata -> mux MemtoReg
    assign active[11] = legal & reg_write & ~mem_to_reg;    // ALU -> mux MemtoReg
    assign active[12] = legal & reg_write;                  // mux MemtoReg -> RegFile wd
    assign active[13] = legal & branch;                     // sign-ext -> <<2 -> branch adder
    assign active[14] = legal & branch & zero;              // branch adder -> mux PCSrc
    assign active[15] = legal & branch;                     // Zero -> AND gate
    assign active[16] = legal & jump;                       // IMEM[25:0] -> <<2 -> jump addr
    assign active[17] = legal & jump;                       // jump mux -> PC
    assign active[18] = legal & (mem_read | mem_write);     // กล่อง DMEM
    assign active[19] = uses_alu;                           // กล่อง ALU
    assign active[31:20] = 12'd0;
endmodule
