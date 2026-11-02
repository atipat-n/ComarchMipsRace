// sync 2 FF + debounce (ค่าต้องนิ่ง N clock) + pulse 1 clock ตอนกด
module debounce #(
    parameter integer N = 250_000      // 10 ms ที่ 25 MHz
) (
    input      clk,
    input      in,
    output reg level,
    output     pulse
);
    reg        s0 = 1'b0, s1 = 1'b0, level_d = 1'b0;
    reg [19:0] cnt = 20'd0;

    initial level = 1'b0;

    always @(posedge clk) begin
        s0      <= in;
        s1      <= s0;
        level_d <= level;
        if (s1 == level) begin
            cnt <= 20'd0;
        end else if (cnt >= N - 1) begin
            level <= s1;
            cnt   <= 20'd0;
        end else begin
            cnt <= cnt + 20'd1;
        end
    end

    assign pulse = level & ~level_d;
endmodule
