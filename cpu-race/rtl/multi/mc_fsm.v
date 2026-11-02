// FSM ของ multicycle (สเปคหัวข้อ 8.2 = ตาราง 5 step ในสไลด์ w04c หน้า 4 + addi)
// state เปลี่ยนเมื่อ step = 1 เท่านั้น (step = en & ~done จาก core)
module mc_fsm (
    input            clk,
    input            rst,
    input            step,
    input      [5:0] opcode,      // จาก IR
    input      [5:0] funct,       // จาก IR
    output reg [3:0] state,
    output reg [3:0] next_state,
    output reg       pc_write,
    output reg       pc_write_cond,
    output reg       i_or_d,
    output reg       mem_read,
    output reg       mem_write,
    output reg       ir_write,
    output reg       mem_to_reg,
    output reg [1:0] pc_source,
    output reg [1:0] alu_op,
    output reg       alu_src_a,
    output reg [1:0] alu_src_b,
    output reg       reg_write,
    output reg       reg_dst,
    output           illegal      // ใช้ได้ตั้งแต่ DECODE (IR มีค่าแล้ว)
);
    localparam S_FETCH     = 4'd0,
               S_DECODE    = 4'd1,
               S_MEM_ADDR  = 4'd2,
               S_MEM_READ  = 4'd3,
               S_MEM_WB    = 4'd4,
               S_MEM_WRITE = 4'd5,
               S_EXECUTE   = 4'd6,
               S_ALU_WB    = 4'd7,
               S_BRANCH    = 4'd8,
               S_JUMP      = 4'd9,
               S_ADDI_EXEC = 4'd10,
               S_ADDI_WB   = 4'd11;

    localparam OP_R    = 6'h00,
               OP_J    = 6'h02,
               OP_BEQ  = 6'h04,
               OP_ADDI = 6'h08,
               OP_LW   = 6'h23,
               OP_SW   = 6'h2B;

    wire r_funct_ok = (funct == 6'h20) || (funct == 6'h22) || (funct == 6'h24) ||
                      (funct == 6'h25) || (funct == 6'h2A);

    assign illegal = !((opcode == OP_R && r_funct_ok) || opcode == OP_J || opcode == OP_BEQ ||
                       opcode == OP_ADDI || opcode == OP_LW || opcode == OP_SW);

    always @(posedge clk) begin
        if (rst)       state <= S_FETCH;
        else if (step) state <= next_state;
    end

    // next state
    always @(*) begin
        case (state)
            S_FETCH:  next_state = S_DECODE;
            S_DECODE: begin
                if (illegal)                                 next_state = S_FETCH;
                else if (opcode == OP_LW || opcode == OP_SW) next_state = S_MEM_ADDR;
                else if (opcode == OP_R)                     next_state = S_EXECUTE;
                else if (opcode == OP_BEQ)                   next_state = S_BRANCH;
                else if (opcode == OP_J)                     next_state = S_JUMP;
                else                                         next_state = S_ADDI_EXEC;
            end
            S_MEM_ADDR:  next_state = (opcode == OP_LW) ? S_MEM_READ : S_MEM_WRITE;
            S_MEM_READ:  next_state = S_MEM_WB;
            S_EXECUTE:   next_state = S_ALU_WB;
            S_ADDI_EXEC: next_state = S_ADDI_WB;
            default:     next_state = S_FETCH;   // MEM_WB, MEM_WRITE, ALU_WB, BRANCH, JUMP, ADDI_WB
        endcase
    end

    // สัญญาณ control ของแต่ละ state (ค่าที่ไม่ได้เขียน = 0)
    always @(*) begin
        pc_write      = 1'b0;
        pc_write_cond = 1'b0;
        i_or_d        = 1'b0;
        mem_read      = 1'b0;
        mem_write     = 1'b0;
        ir_write      = 1'b0;
        mem_to_reg    = 1'b0;
        pc_source     = 2'b00;
        alu_op        = 2'b00;
        alu_src_a     = 1'b0;
        alu_src_b     = 2'b00;
        reg_write     = 1'b0;
        reg_dst       = 1'b0;
        case (state)
            S_FETCH: begin      // IR <= Mem[PC]; PC <= PC + 4
                mem_read  = 1'b1;
                ir_write  = 1'b1;
                alu_src_b = 2'b01;
                pc_write  = 1'b1;
            end
            S_DECODE: begin     // A,B <= Reg; ALUOut <= PC + (sext << 2)
                alu_src_b = 2'b11;
            end
            S_MEM_ADDR, S_ADDI_EXEC: begin  // ALUOut <= A + sext
                alu_src_a = 1'b1;
                alu_src_b = 2'b10;
            end
            S_MEM_READ: begin   // MDR <= Mem[ALUOut]
                mem_read = 1'b1;
                i_or_d   = 1'b1;
            end
            S_MEM_WB: begin     // Reg[rt] <= MDR
                mem_to_reg = 1'b1;
                reg_write  = 1'b1;
            end
            S_MEM_WRITE: begin  // Mem[ALUOut] <= B
                mem_write = 1'b1;
                i_or_d    = 1'b1;
            end
            S_EXECUTE: begin    // ALUOut <= A op B
                alu_src_a = 1'b1;
                alu_op    = 2'b10;
            end
            S_ALU_WB: begin     // Reg[rd] <= ALUOut
                reg_dst   = 1'b1;
                reg_write = 1'b1;
            end
            S_BRANCH: begin     // if (A == B) PC <= ALUOut
                alu_src_a     = 1'b1;
                alu_op        = 2'b01;
                pc_write_cond = 1'b1;
                pc_source     = 2'b01;
            end
            S_JUMP: begin       // PC <= {PC[31:28], IR[25:0], 00}
                pc_write  = 1'b1;
                pc_source = 2'b10;
            end
            S_ADDI_WB: begin    // Reg[rt] <= ALUOut
                reg_write = 1'b1;
            end
            default: ;
        endcase
    end
endmodule
