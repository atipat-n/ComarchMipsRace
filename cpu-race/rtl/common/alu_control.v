// ALU control ตามสไลด์ w04a หน้า 28 (สเปคหัวข้อ 7.3)
//   ALUOp 00 -> add, 01 -> sub, 10 -> ตาม funct
//   bad_funct = 1 เมื่อ ALUOp=10 แต่ funct ไม่อยู่ใน ISA (ให้ control ตัดสินว่าเป็น illegal)
module alu_control (
    input      [1:0] alu_op,
    input      [5:0] funct,
    output reg [3:0] ctrl,
    output reg       bad_funct
);
    always @(*) begin
        bad_funct = 1'b0;
        case (alu_op)
            2'b00: ctrl = 4'b0010;
            2'b01: ctrl = 4'b0110;
            default: begin
                case (funct)
                    6'h20: ctrl = 4'b0010; // add
                    6'h22: ctrl = 4'b0110; // sub
                    6'h24: ctrl = 4'b0000; // and
                    6'h25: ctrl = 4'b0001; // or
                    6'h2A: ctrl = 4'b0111; // slt
                    default: begin
                        ctrl      = 4'b0010;
                        bad_funct = 1'b1;
                    end
                endcase
            end
        endcase
    end
endmodule
