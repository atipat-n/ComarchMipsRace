// Main control ของ single-cycle (สเปคหัวข้อ 7.2 = สไลด์ w04a + addi)
// คำสั่งที่ไม่รู้จัก -> illegal = 1 และสัญญาณเขียนทุกตัวเป็น 0 (ทำตัวเป็น NOP)
module sc_control (
    input      [5:0] opcode,
    input      [5:0] funct,
    output reg       reg_dst,
    output reg       alu_src,
    output reg       mem_to_reg,
    output reg       reg_write,
    output reg       mem_read,
    output reg       mem_write,
    output reg       branch,
    output reg       jump,
    output reg [1:0] alu_op,
    output reg       illegal
);
    localparam OP_R    = 6'h00,
               OP_J    = 6'h02,
               OP_BEQ  = 6'h04,
               OP_ADDI = 6'h08,
               OP_LW   = 6'h23,
               OP_SW   = 6'h2B;

    wire r_funct_ok = (funct == 6'h20) || (funct == 6'h22) || (funct == 6'h24) ||
                      (funct == 6'h25) || (funct == 6'h2A);

    always @(*) begin
        reg_dst    = 1'b0;
        alu_src    = 1'b0;
        mem_to_reg = 1'b0;
        reg_write  = 1'b0;
        mem_read   = 1'b0;
        mem_write  = 1'b0;
        branch     = 1'b0;
        jump       = 1'b0;
        alu_op     = 2'b00;
        illegal    = 1'b0;
        case (opcode)
            OP_R: begin
                if (r_funct_ok) begin
                    reg_dst   = 1'b1;
                    reg_write = 1'b1;
                    alu_op    = 2'b10;
                end else begin
                    illegal = 1'b1;
                end
            end
            OP_LW: begin
                alu_src    = 1'b1;
                mem_to_reg = 1'b1;
                reg_write  = 1'b1;
                mem_read   = 1'b1;
            end
            OP_SW: begin
                alu_src   = 1'b1;
                mem_write = 1'b1;
            end
            OP_BEQ: begin
                branch = 1'b1;
                alu_op = 2'b01;
            end
            OP_J: begin
                jump = 1'b1;
            end
            OP_ADDI: begin
                alu_src   = 1'b1;
                reg_write = 1'b1;
            end
            default: illegal = 1'b1;
        endcase
    end
endmodule
