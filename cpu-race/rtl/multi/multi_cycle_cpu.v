// Multicycle MIPS (สเปคหัวข้อ 8) datapath ตามรูป "Multicycle Machine's Full Datapath" สไลด์ w04c หน้า 3
// port เหมือน single_cycle_cpu (หัวข้อ 16)
//
// - เดินหนึ่ง step (หนึ่ง state) ต่อ en pulse
// - memory เดียว 512 word: word 0..255 = โปรแกรม, 256..511 = ข้อมูล (ld_addr ใช้ตรงๆ)
// - A, B, ALUOut, MDR รับค่าใหม่ทุก step แบบในสไลด์ ส่วน IR รับเฉพาะตอน IRWrite
// - done = อยู่ที่ FETCH และคำสั่งที่ PC ชี้คือ halt (`j` หาตัวเอง) -> ไม่รันและไม่นับ
module multi_cycle_cpu (
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
    reg [31:0] pc_r, ir, mdr, a_r, b_r, alu_out, retired_r;

    // ---------------- control ----------------
    wire       pc_write, pc_write_cond, i_or_d, mem_read, mem_write, ir_write, mem_to_reg;
    wire       alu_src_a, reg_write, reg_dst, illegal;
    wire [1:0] pc_source, alu_op, alu_src_b;
    wire [3:0] next_state;
    wire       step;

    mc_fsm fsm (
        .clk(clk), .rst(rst), .step(step),
        .opcode(ir[31:26]), .funct(ir[5:0]),
        .state(state), .next_state(next_state),
        .pc_write(pc_write), .pc_write_cond(pc_write_cond), .i_or_d(i_or_d),
        .mem_read(mem_read), .mem_write(mem_write), .ir_write(ir_write),
        .mem_to_reg(mem_to_reg), .pc_source(pc_source), .alu_op(alu_op),
        .alu_src_a(alu_src_a), .alu_src_b(alu_src_b),
        .reg_write(reg_write), .reg_dst(reg_dst), .illegal(illegal)
    );

    // ---------------- memory ----------------
    wire [31:0] mem_addr = i_or_d ? alu_out : pc_r;
    wire [31:0] mem_rdata;

    lutram #(.AW(9)) mem (
        .clk   (clk),
        .we    (ld_we | (step & mem_write)),
        .waddr (ld_we ? ld_addr : mem_addr[10:2]),
        .wdata (ld_we ? ld_data : b_r),
        .raddr (mem_addr[10:2]),
        .rdata (mem_rdata)
    );

    // halt: ตอน FETCH ค่าที่อ่านได้คือคำสั่งที่ PC ชี้ (IorD = 0)
    wire [31:0] pc_plus4  = pc_r + 32'd4;
    wire        is_halt   = (mem_rdata[31:26] == 6'h02) &&
                            ({pc_plus4[31:28], mem_rdata[25:0], 2'b00} == pc_r);
    assign done = (state == 4'd0) && is_halt;
    assign step = en & ~done;

    // ---------------- register file ----------------
    wire [31:0] rd1, rd2;
    wire [4:0]  wa = reg_dst ? ir[15:11] : ir[20:16];
    wire [31:0] wd = mem_to_reg ? mdr : alu_out;

    regfile rf (
        .clk(clk), .rst(rst),
        .we(step & reg_write), .wa(wa), .wd(wd),
        .ra1(ir[25:21]), .ra2(ir[20:16]), .rd1(rd1), .rd2(rd2),
        .dbg_ra(dbg_reg_addr), .dbg_rd(dbg_reg_data)
    );

    // ---------------- ALU ----------------
    wire [31:0] imm_ext;
    sign_ext se (.in(ir[15:0]), .out(imm_ext));

    wire [31:0] alu_a = alu_src_a ? a_r : pc_r;
    reg  [31:0] alu_b;
    always @(*) begin
        case (alu_src_b)
            2'b00:   alu_b = b_r;
            2'b01:   alu_b = 32'd4;
            2'b10:   alu_b = imm_ext;
            default: alu_b = {imm_ext[29:0], 2'b00};
        endcase
    end

    wire [3:0]  alu_ctrl;
    wire        bad_funct; // ตรวจไปแล้วใน mc_fsm
    alu_control ac (.alu_op(alu_op), .funct(ir[5:0]), .ctrl(alu_ctrl), .bad_funct(bad_funct));

    wire [31:0] alu_y;
    wire        zero;
    alu alu0 (.a(alu_a), .b(alu_b), .ctrl(alu_ctrl), .y(alu_y), .zero(zero));

    // ---------------- PC ----------------
    reg [31:0] pc_next;
    always @(*) begin
        case (pc_source)
            2'b00:   pc_next = alu_y;                                  // PC + 4
            2'b01:   pc_next = alu_out;                                // branch target จาก DECODE
            default: pc_next = {pc_r[31:28], ir[25:0], 2'b00};         // jump (PC ถูก +4 ไปแล้ว)
        endcase
    end
    wire pc_en = pc_write | (pc_write_cond & zero);

    // ---------------- registers ----------------
    always @(posedge clk) begin
        if (rst) begin
            pc_r      <= 32'd0;
            ir        <= 32'd0;
            mdr       <= 32'd0;
            a_r       <= 32'd0;
            b_r       <= 32'd0;
            alu_out   <= 32'd0;
            retired_r <= 32'd0;
        end else if (step) begin
            if (pc_en)    pc_r <= pc_next;
            if (ir_write) ir   <= mem_rdata;
            mdr     <= mem_rdata;
            a_r     <= rd1;
            b_r     <= rd2;
            alu_out <= alu_y;
            // คำสั่งจบเมื่อกำลังจะกลับไป FETCH
            if (state != 4'd0 && next_state == 4'd0) retired_r <= retired_r + 32'd1;
        end
    end

    assign pc      = pc_r;
    assign instr   = ir;
    assign retired = retired_r;

    // ---------------- active wires (ร่าง: docs/wire_map.md) ----------------
    wire s0  = ~done & (state == 4'd0);
    wire s1  = state == 4'd1;
    wire s2  = state == 4'd2;
    wire s3  = state == 4'd3;
    wire s4  = state == 4'd4;
    wire s5  = state == 4'd5;
    wire s6  = state == 4'd6;
    wire s7  = state == 4'd7;
    wire s8  = state == 4'd8;
    wire s9  = state == 4'd9;
    wire s10 = state == 4'd10;
    wire s11 = state == 4'd11;

    assign active[0]  = s0;                         // PC -> mux IorD
    assign active[1]  = s0 | s3 | s5;               // mux IorD -> Memory address
    assign active[2]  = s0;                         // Memory -> IR
    assign active[3]  = s0 | s1;                    // PC -> mux ALUSrcA
    assign active[4]  = s0;                         // 4 -> mux ALUSrcB
    assign active[5]  = s0;                         // ALU -> PC (PCSource=00)
    assign active[6]  = s1;                         // IR rs/rt -> RegFile read
    assign active[7]  = s1;                         // RegFile -> A, B
    assign active[8]  = s1;                         // sign-ext -> <<2 -> mux ALUSrcB
    assign active[9]  = s1 | s2 | s6 | s10;         // ALU -> ALUOut
    assign active[10] = s2 | s6 | s8 | s10;         // A -> mux ALUSrcA
    assign active[11] = s6 | s8;                    // B -> mux ALUSrcB
    assign active[12] = s2 | s10;                   // sign-ext -> mux ALUSrcB
    assign active[13] = s3 | s5;                    // ALUOut -> mux IorD
    assign active[14] = s3;                         // Memory -> MDR
    assign active[15] = s4;                         // MDR -> mux MemtoReg -> RegFile
    assign active[16] = s4 | s11;                   // IR[20:16] -> mux RegDst
    assign active[17] = s5;                         // B -> Memory write data
    assign active[18] = s7 | s11;                   // ALUOut -> mux MemtoReg -> RegFile
    assign active[19] = s7;                         // IR[15:11] -> mux RegDst
    assign active[20] = s8 & zero;                  // ALUOut -> PC (PCSource=01)
    assign active[21] = s8;                         // Zero -> PCWriteCond
    assign active[22] = s9;                         // IR[25:0] -> <<2 -> PC (PCSource=10)
    assign active[23] = s0 | s3 | s5;               // กล่อง Memory
    assign active[24] = s0 | s1 | s2 | s6 | s8 | s10; // กล่อง ALU
    assign active[25] = s1 | s4 | s7 | s11;         // กล่อง RegFile
    assign active[31:26] = 6'd0;
endmodule
