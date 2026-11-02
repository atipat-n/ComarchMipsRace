// VGA 640x480 @ 60 Hz ที่ pixel clock 25 MHz (สเปคหัวข้อ 10.1)
//   แนวนอน 640 + 16 + 96 + 48 = 800, แนวตั้ง 480 + 10 + 2 + 33 = 525, sync active-low
module vga_timing (
    input            clk,
    output reg [9:0] hc,
    output reg [9:0] vc,
    output           visible,
    output           hsync,
    output           vsync,
    output           frame_start    // 1 clock ตอน hc=0, vc=0
);
    initial begin
        hc = 10'd0;
        vc = 10'd0;
    end

    always @(posedge clk) begin
        if (hc == 10'd799) begin
            hc <= 10'd0;
            vc <= (vc == 10'd524) ? 10'd0 : vc + 10'd1;
        end else begin
            hc <= hc + 10'd1;
        end
    end

    assign visible     = (hc < 10'd640) && (vc < 10'd480);
    assign hsync       = ~((hc >= 10'd656) && (hc < 10'd752));
    assign vsync       = ~((vc >= 10'd490) && (vc < 10'd492));
    assign frame_start = (hc == 10'd0) && (vc == 10'd0);
endmodule
