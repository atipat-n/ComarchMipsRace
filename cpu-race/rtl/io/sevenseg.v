// 7-seg 8 หลัก (common anode, active-low) แสดงค่า 32 bit เป็น hex
// สแกนทีละหลัก ~650 µs ต่อหลักที่ 25 MHz
module sevenseg (
    input             clk,
    input      [31:0] value,
    output reg [6:0]  seg,    // {g,f,e,d,c,b,a} active-low
    output            dp,
    output reg [7:0]  an
);
    reg [16:0] scan = 17'd0;
    always @(posedge clk) scan <= scan + 17'd1;

    wire [2:0] idx   = scan[16:14];
    wire [3:0] digit = value[idx*4 +: 4];

    always @(*) begin
        an = ~(8'd1 << idx);
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
            default: seg = 7'b0001110;
        endcase
    end

    // จุดคั่นระหว่างหลัก 4 กับ 3 (แบ่ง single | multi)
    assign dp = ~(idx == 3'd4);
endmodule
