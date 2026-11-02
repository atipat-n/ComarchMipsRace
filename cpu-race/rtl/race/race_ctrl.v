// นาฬิการ่วมของการแข่ง (สเปคหัวข้อ 9)
//   single เดินหนึ่งคำสั่งทุก T_s = 50+ov หน่วยเวลา, multi เดินหนึ่ง step ทุก T_m = 10+ov
//   run mode: เวลาเดินทีละ 1 หน่วยตามความเร็วจาก speed (กด run_toggle เพื่อเริ่ม/หยุด)
//   step mode: กด step_pulse = กระโดดเวลาไปเหตุการณ์ถัดไป (ทุกครั้งมีอย่างน้อยหนึ่ง core เดิน)
//   last_s / last_m = เวลาที่ core นั้นเดินครั้งล่าสุด (เมื่อ done แล้ว = เวลาจบ)
module race_ctrl #(
    parameter integer CLK_HZ = 25_000_000
) (
    input             clk,
    input             rst,
    input      [3:0]  ov,
    input             run_mode,
    input      [2:0]  speed,
    input             step_pulse,
    input             run_toggle,
    input             run_set,      // จาก UART: เริ่มวิ่ง (ไม่สลับ)
    input             run_clr,      // จาก UART: หยุด
    input             done_s,
    input             done_m,
    output reg        en_s,
    output reg        en_m,
    output reg [31:0] time_now,
    output reg [31:0] last_s,
    output reg [31:0] last_m,
    output reg        running
);
    // จำนวน clock ต่อ 1 หน่วยเวลา: ความเร็ว 20, 50, 100, 200, 400, 1000, 4000 หน่วย/วินาที และเร็วสุด
    function [31:0] presc_of;
        input [2:0] sp;
        reg [31:0] v;
        begin
            case (sp)
                3'd0: v = CLK_HZ / 20;
                3'd1: v = CLK_HZ / 50;
                3'd2: v = CLK_HZ / 100;
                3'd3: v = CLK_HZ / 200;
                3'd4: v = CLK_HZ / 400;
                3'd5: v = CLK_HZ / 1000;
                3'd6: v = CLK_HZ / 4000;
                default: v = 1;
            endcase
            presc_of = (v < 2) ? 32'd1 : v;
        end
    endfunction

    wire [31:0] t_s = 32'd50 + ov;
    wire [31:0] t_m = 32'd10 + ov;

    reg  [31:0] next_s, next_m;
    reg  [31:0] presc;

    wire        all_done = done_s & done_m;
    wire [31:0] next_evt = done_s ? next_m :
                           done_m ? next_s :
                           (next_s < next_m ? next_s : next_m);

    // เวลาใหม่ของ clock นี้ (ถ้ามีการเดิน)
    reg         adv;
    reg  [31:0] new_t;
    always @(*) begin
        adv   = 1'b0;
        new_t = time_now;
        if (!all_done) begin
            if (step_pulse && !(run_mode && running)) begin
                adv   = 1'b1;
                new_t = next_evt;
            end else if (run_mode && running && presc + 32'd1 >= presc_of(speed)) begin
                adv   = 1'b1;
                new_t = time_now + 32'd1;
            end
        end
    end

    always @(posedge clk) begin
        en_s <= 1'b0;
        en_m <= 1'b0;
        if (rst) begin
            time_now <= 32'd0;
            next_s   <= t_s;
            next_m   <= t_m;
            last_s   <= 32'd0;
            last_m   <= 32'd0;
            presc    <= 32'd0;
            running  <= 1'b0;
        end else begin
            if (run_toggle && run_mode) running <= ~running;
            if (run_set && run_mode)    running <= 1'b1;
            if (run_clr)                running <= 1'b0;
            if (all_done || !run_mode) running <= 1'b0;

            if (run_mode && running) presc <= (presc + 32'd1 >= presc_of(speed)) ? 32'd0 : presc + 32'd1;
            else                     presc <= 32'd0;

            if (adv) begin
                time_now <= new_t;
                if (!done_s && new_t >= next_s) begin
                    en_s   <= 1'b1;
                    next_s <= next_s + t_s;
                    last_s <= new_t;
                end
                if (!done_m && new_t >= next_m) begin
                    en_m   <= 1'b1;
                    next_m <= next_m + t_m;
                    last_m <= new_t;
                end
            end
        end
    end
endmodule
