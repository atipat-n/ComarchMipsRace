// copy boot ROM 512 word ลง memory ของทั้งสอง core ผ่าน loader port (ใช้ ~514 clock)
// ระหว่าง busy ให้ top จับ core ไว้ใน reset
module mem_loader (
    input             clk,
    input             start,
    output            busy,
    output     [8:0]  rom_addr,
    input      [31:0] rom_data,     // ค่าของ rom_addr เมื่อ clock ก่อนหน้า (synchronous ROM)
    output reg        ld_we,
    output reg [8:0]  ld_addr,
    output     [31:0] ld_data
);
    reg [9:0] cnt  = 10'd0;
    reg       active = 1'b0;

    initial begin
        ld_we   = 1'b0;
        ld_addr = 9'd0;
    end

    assign rom_addr = cnt[8:0];
    assign ld_data  = rom_data;
    assign busy     = active | ld_we;

    always @(posedge clk) begin
        if (start) begin
            active <= 1'b1;
            cnt    <= 10'd0;
            ld_we  <= 1'b0;
        end else if (active) begin
            // ROM ได้รับ addr = cnt ตอนนี้ ข้อมูลออกมา clock หน้า พร้อมกับ ld_we/ld_addr นี้
            ld_we   <= 1'b1;
            ld_addr <= cnt[8:0];
            cnt     <= cnt + 10'd1;
            if (cnt == 10'd511) active <= 1'b0;
        end else begin
            ld_we <= 1'b0;
        end
    end
endmodule
