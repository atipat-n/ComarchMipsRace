// UART รับ 8N1 (LSB ก่อน) DIV = จำนวน clock ต่อ 1 bit (25 MHz / 115200 = 217)
module uart_rx #(
    parameter integer DIV = 217
) (
    input            clk,
    input            rx,          // ขาจาก FTDI (idle = 1)
    output reg [7:0] data,
    output reg       valid        // 1 clock เมื่อได้ byte ครบ
);
    reg        s0 = 1'b1, s1 = 1'b1;
    reg [1:0]  st = 2'd0;          // 0 idle, 1 start, 2 data, 3 stop
    reg [15:0] cnt = 16'd0;
    reg [2:0]  bitn = 3'd0;
    reg [7:0]  sh = 8'd0;

    initial begin
        data  = 8'd0;
        valid = 1'b0;
    end

    always @(posedge clk) begin
        s0    <= rx;
        s1    <= s0;
        valid <= 1'b0;
        case (st)
            2'd0: if (!s1) begin st <= 2'd1; cnt <= 16'd0; end
            2'd1: begin                                   // รอถึงกลาง start bit
                if (cnt == DIV / 2) begin
                    cnt <= 16'd0;
                    if (!s1) begin st <= 2'd2; bitn <= 3'd0; end
                    else st <= 2'd0;                      // สัญญาณรบกวน
                end else cnt <= cnt + 16'd1;
            end
            2'd2: begin
                if (cnt == DIV - 1) begin
                    cnt  <= 16'd0;
                    sh   <= {s1, sh[7:1]};
                    bitn <= bitn + 3'd1;
                    if (bitn == 3'd7) st <= 2'd3;
                end else cnt <= cnt + 16'd1;
            end
            default: begin                                // stop bit
                if (cnt == DIV - 1) begin
                    st <= 2'd0;
                    cnt <= 16'd0;
                    if (s1) begin data <= sh; valid <= 1'b1; end
                end else cnt <= cnt + 16'd1;
            end
        endcase
    end
endmodule
