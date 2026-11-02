// M0 smoke test: เช็กว่า build + โหลดบอร์ดได้ และ part/ขาถูก
//   LED[15:0]  = SW[15:0]   (กด BTNC ค้าง = LED ติดหมด)
//   7-seg หลัก 0 นับ 0..F ทุก 1 วินาที (เช็ก clock 100 MHz)  หลัก 7 แสดงค่า SW[3:0]
//   CPU_RESETN กด = ตัวนับกลับเป็น 0
module top_smoke (
    input             CLK100MHZ,
    input             CPU_RESETN,
    input      [15:0] SW,
    input             BTNC,
    output     [15:0] LED,
    output            CA, CB, CC, CD, CE, CF, CG, DP,
    output     [7:0]  AN
);
    assign LED = BTNC ? 16'hFFFF : SW;

    // ตัวนับ 1 วินาที
    reg [26:0] tick;
    reg [3:0]  sec;
    always @(posedge CLK100MHZ) begin
        if (!CPU_RESETN) begin
            tick <= 27'd0;
            sec  <= 4'd0;
        end else if (tick == 27'd99_999_999) begin
            tick <= 27'd0;
            sec  <= sec + 4'd1;
        end else begin
            tick <= tick + 27'd1;
        end
    end

    // สแกน 2 หลัก (หลัก 0 กับหลัก 7) สลับทุก ~1.3 ms
    reg [16:0] scan = 17'd0;
    always @(posedge CLK100MHZ) scan <= scan + 17'd1;
    wire       sel   = scan[16];
    wire [3:0] digit = sel ? SW[3:0] : sec;

    reg [6:0] seg; // {g,f,e,d,c,b,a} active-low
    always @(*) begin
        case (digit)
            4'h0: seg = 7'b1000000;
            4'h1: seg = 7'b1111001;
            4'h2: seg = 7'b0100100;
            4'h3: seg = 7'b0110000;
            4'h4: seg = 7'b0011001;
            4'h5: seg = 7'b0010010;
            4'h6: seg = 7'b0000010;
            4'h7: seg = 7'b1111000;
            4'h8: seg = 7'b0000000;
            4'h9: seg = 7'b0010000;
            4'hA: seg = 7'b0001000;
            4'hB: seg = 7'b0000011;
            4'hC: seg = 7'b1000110;
            4'hD: seg = 7'b0100001;
            4'hE: seg = 7'b0000110;
            default: seg = 7'b0001110; // F
        endcase
    end

    assign {CG, CF, CE, CD, CC, CB, CA} = seg;
    assign DP = 1'b1;
    assign AN = sel ? 8'b0111_1111 : 8'b1111_1110;
endmodule
