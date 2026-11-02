// โปรแกรม demo A และ B ฝังตอน synthesize (สเปคหัวข้อ 10.6) อ่านแบบ synchronous (BRAM)
// ไฟล์ progA.mem / progB.mem สร้างด้วย tools/build_mems.py (512 word ตาม memory map)
module boot_rom (
    input             clk,
    input             sel,       // 0 = A, 1 = B
    input      [8:0]  addr,
    output reg [31:0] data
);
    reg [31:0] rom_a [0:511];
    reg [31:0] rom_b [0:511];

    initial begin
        $readmemh("progA.mem", rom_a);
        $readmemh("progB.mem", rom_b);
    end

    reg [31:0] qa, qb;
    reg        sel_d;
    always @(posedge clk) begin
        qa    <= rom_a[addr];
        qb    <= rom_b[addr];
        sel_d <= sel;
    end

    always @(*) data = sel_d ? qb : qa;
endmodule
