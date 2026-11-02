// ALU 32 bit ตามสไลด์ w04a หน้า 26
//   0000 AND, 0001 OR, 0010 add, 0110 sub, 0111 slt (signed), 1100 NOR
module alu (
    input      [31:0] a,
    input      [31:0] b,
    input      [3:0]  ctrl,
    output reg [31:0] y,
    output            zero
);
    wire [31:0] diff = a - b;
    // slt แบบ signed: ดูเครื่องหมายของผลลบ แก้ด้วย overflow
    wire        lt   = (a[31] ^ b[31]) ? a[31] : diff[31];

    always @(*) begin
        case (ctrl)
            4'b0000: y = a & b;
            4'b0001: y = a | b;
            4'b0010: y = a + b;
            4'b0110: y = diff;
            4'b0111: y = {31'd0, lt};
            4'b1100: y = ~(a | b);
            default: y = 32'd0;
        endcase
    end

    assign zero = (y == 32'd0);
endmodule
