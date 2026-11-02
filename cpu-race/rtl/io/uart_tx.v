// UART ส่ง 8N1 (LSB ก่อน)
module uart_tx #(
    parameter integer DIV = 217
) (
    input       clk,
    input       start,        // 1 clock: เริ่มส่ง data (ใช้ได้เมื่อ busy = 0)
    input [7:0] data,
    output      tx,
    output      busy
);
    reg [9:0]  sh = 10'h3FF;   // {stop, data, start} ส่ง bit 0 ก่อน
    reg [3:0]  left = 4'd0;
    reg [15:0] cnt = 16'd0;

    assign tx   = sh[0];
    assign busy = (left != 4'd0);

    always @(posedge clk) begin
        if (!busy) begin
            if (start) begin
                sh   <= {1'b1, data, 1'b0};
                left <= 4'd10;
                cnt  <= 16'd0;
            end
        end else if (cnt == DIV - 1) begin
            cnt  <= 16'd0;
            sh   <= {1'b1, sh[9:1]};
            left <= left - 4'd1;
        end else begin
            cnt <= cnt + 16'd1;
        end
    end
endmodule
