// หน่วยความจำ 32 bit อ่านแบบ async เขียนตอน posedge (สเปคหัวข้อ 5.2)
// Vivado จะ infer เป็น distributed RAM (LUTRAM) ให้ ใช้กับ core เท่านั้น
module lutram #(
    parameter AW = 8
) (
    input           clk,
    input           we,
    input  [AW-1:0] waddr,
    input  [31:0]   wdata,
    input  [AW-1:0] raddr,
    output [31:0]   rdata
);
    reg [31:0] mem [0:(1<<AW)-1];

    integer i;
    initial begin
        for (i = 0; i < (1<<AW); i = i + 1) mem[i] = 32'd0;
    end

    always @(posedge clk) begin
        if (we) mem[waddr] <= wdata;
    end

    assign rdata = mem[raddr];
endmodule
