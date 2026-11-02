// Register file 32 x 32 bit: อ่าน 2 port + debug 1 port (async), เขียน 1 port (posedge)
// $0 เป็น 0 เสมอ เขียนไม่ติด, rst ล้างทุกตัวเป็น 0
module regfile (
    input         clk,
    input         rst,
    input         we,
    input  [4:0]  wa,
    input  [31:0] wd,
    input  [4:0]  ra1,
    input  [4:0]  ra2,
    output [31:0] rd1,
    output [31:0] rd2,
    input  [4:0]  dbg_ra,
    output [31:0] dbg_rd
);
    reg [31:0] r [1:31];
    integer i;

    always @(posedge clk) begin
        if (rst) begin
            for (i = 1; i < 32; i = i + 1) r[i] <= 32'd0;
        end else if (we && wa != 5'd0) begin
            r[wa] <= wd;
        end
    end

    assign rd1    = (ra1    == 5'd0) ? 32'd0 : r[ra1];
    assign rd2    = (ra2    == 5'd0) ? 32'd0 : r[ra2];
    assign dbg_rd = (dbg_ra == 5'd0) ? 32'd0 : r[dbg_ra];
endmodule
