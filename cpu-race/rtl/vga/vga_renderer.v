// วาดหน้าจอ 640x480 (สเปคหัวข้อ 10.2-10.4)
//
//   ชั้นที่ 1 ภาพพื้นหลัง wire-ID (bg.mem, 640x320 ที่ y = 32..351): สีของแต่ละเส้นมาจาก active_s / active_m
//   ชั้นที่ 2 แถบแข่ง (แถว 24-25)
//   ชั้นที่ 3 ตัวหนังสือ 80x30 ช่อง ช่องละ 8x16 (text.mem = template, font.mem = ฟอนต์)
//
// template 12 bit ต่อช่อง (สร้างด้วย tools/gen_screen.py):
//   bit 11 = 0          -> ตัวอักษร ASCII = bit 7:0
//   bit 11 = 1, type = bit 10:8, arg = bit 7:0
//     type 0: เลข hex ของ field arg[7:3] หลักที่ arg[2:0] (0 = หลักซ้ายสุดของ 8 หลัก)
//     type 1/2: ชื่อคำสั่งของ single / multi ตัวที่ arg
//     type 3: ชื่อ state ของ multi ตัวที่ arg
//     type 4/5: สถานะการแข่งของ single / multi (WINNER, TIE, FINISH) ตัวที่ arg
//
// pipeline 3 clock: hsync/vsync/สี ออกช้ากว่า hc/vc 3 clock เท่ากันหมด
module vga_renderer (
    input             clk,
    input      [9:0]  hc,
    input      [9:0]  vc,
    input             visible,
    input             hsync,
    input             vsync,

    input      [31:0] active_s,
    input      [31:0] active_m,
    input             done_s,
    input             done_m,
    input      [31:0] f_time,
    input      [3:0]  f_ov,
    input             f_prog,
    input      [31:0] s_pc,
    input      [31:0] s_instr,
    input      [31:0] s_ret,
    input      [31:0] s_time,
    input      [31:0] m_pc,
    input      [31:0] m_ir,
    input      [31:0] m_ret,
    input      [31:0] m_time,
    input      [3:0]  m_state,
    input      [255:0] s_regs,      // $t0..$t7 ของ single (reg i อยู่ที่ [32*i +: 32])
    input      [255:0] m_regs,

    output reg [3:0]  vga_r,
    output reg [3:0]  vga_g,
    output reg [3:0]  vga_b,
    output reg        vga_hs,
    output reg        vga_vs,
    // สำหรับ testbench (ตำแหน่งของ pixel ที่ออกไปพร้อมสี)
    output reg        vis_o,
    output reg [9:0]  x_o,
    output reg [9:0]  y_o
);
    // ---------------- ROM ----------------
    reg [5:0]  bg_rom   [0:204799];
    reg [11:0] tmpl_rom [0:2399];
    reg [7:0]  font_rom [0:2047];

    initial begin
        $readmemh("bg.mem",   bg_rom);
        $readmemh("text.mem", tmpl_rom);
        $readmemh("font.mem", font_rom);
    end

    // ---------------- stage A: คำนวณ address ----------------
    wire        in_region = (vc >= 10'd32) && (vc < 10'd352) && (hc < 10'd640);
    wire [9:0]  ry        = vc - 10'd32;
    wire [17:0] bg_addr   = in_region ? (({8'd0, ry} << 9) + ({8'd0, ry} << 7) + {8'd0, hc}) : 18'd0;
    wire [4:0]  row       = vc[8:4];
    wire [6:0]  col       = hc[9:3];
    wire [11:0] tmpl_addr = (vc < 10'd480 && hc < 10'd640) ? (({7'd0, row} << 6) + ({7'd0, row} << 4) + {5'd0, col}) : 12'd0;

    reg  [5:0]  bg_q;
    reg  [11:0] tmpl_q;
    reg  [9:0]  hc1, vc1;
    reg         vis1, hs1, vs1;

    always @(posedge clk) begin
        bg_q   <= bg_rom[bg_addr];
        tmpl_q <= tmpl_rom[tmpl_addr];
        hc1    <= hc;
        vc1    <= vc;
        vis1   <= visible;
        hs1    <= hsync;
        vs1    <= vsync;
    end

    // ---------------- stage B: แปลง template เป็นตัวอักษร ----------------
    function [31:0] field_val;
        input [4:0] f;
        begin
            case (f)
                5'd0:  field_val = f_time;
                5'd1:  field_val = {28'd0, f_ov};
                5'd2:  field_val = f_prog ? 32'hB : 32'hA;
                5'd3:  field_val = s_pc;
                5'd4:  field_val = s_instr;
                5'd5:  field_val = s_ret;
                5'd6:  field_val = s_time;
                5'd7:  field_val = m_pc;
                5'd8:  field_val = m_ir;
                5'd9:  field_val = m_ret;
                5'd10: field_val = m_time;
                5'd11: field_val = {28'd0, m_state};
                default: begin
                    if (f >= 5'd12 && f < 5'd20) field_val = s_regs[(f - 5'd12) * 32 +: 32];
                    else if (f >= 5'd20 && f < 5'd28) field_val = m_regs[(f - 5'd20) * 32 +: 32];
                    else field_val = 32'd0;
                end
            endcase
        end
    endfunction

    function [7:0] hex_char;
        input [3:0] n;
        hex_char = (n < 4'd10) ? (8'd48 + n) : (8'd55 + n);   // '0'.. / 'A'..
    endfunction

    function [31:0] mnem;            // 4 ตัวอักษร
        input [31:0] w;
        input        d;
        begin
            if (d) mnem = "DONE";
            else case (w[31:26])
                6'h00: case (w[5:0])
                           6'h20: mnem = "add ";
                           6'h22: mnem = "sub ";
                           6'h24: mnem = "and ";
                           6'h25: mnem = "or  ";
                           6'h2A: mnem = "slt ";
                           default: mnem = "??? ";
                       endcase
                6'h02: mnem = "j   ";
                6'h04: mnem = "beq ";
                6'h08: mnem = "addi";
                6'h23: mnem = "lw  ";
                6'h2B: mnem = "sw  ";
                default: mnem = "??? ";
            endcase
        end
    endfunction

    function [71:0] state_name;      // 9 ตัวอักษร
        input [3:0] s;
        input       d;
        begin
            if (d) state_name = "DONE     ";
            else case (s)
                4'd0:  state_name = "FETCH    ";
                4'd1:  state_name = "DECODE   ";
                4'd2:  state_name = "MEM_ADDR ";
                4'd3:  state_name = "MEM_READ ";
                4'd4:  state_name = "MEM_WB   ";
                4'd5:  state_name = "MEM_WRITE";
                4'd6:  state_name = "EXECUTE  ";
                4'd7:  state_name = "ALU_WB   ";
                4'd8:  state_name = "BRANCH   ";
                4'd9:  state_name = "JUMP     ";
                4'd10: state_name = "ADDI_EXEC";
                4'd11: state_name = "ADDI_WB  ";
                default: state_name = "?????????";
            endcase
        end
    endfunction

    // สถานะการแข่ง: ชนะ / เสมอ / จบแต่แพ้ / ยังวิ่ง
    function [47:0] status;          // 6 ตัวอักษร
        input        me_done, other_done;
        input [31:0] me_t, other_t;
        begin
            if (!me_done)                         status = "      ";
            else if (!other_done || me_t < other_t) status = "WINNER";
            else if (me_t == other_t)             status = "TIE   ";
            else                                  status = "FINISH";
        end
    endfunction

    wire [31:0] ms_s = mnem(s_instr, done_s);
    wire [31:0] ms_m = mnem(m_ir, done_m);
    wire [71:0] sn   = state_name(m_state, done_m);
    wire [47:0] st_s = status(done_s, done_m, s_time, m_time);
    wire [47:0] st_m = status(done_m, done_s, m_time, s_time);

    reg  [7:0]  ch;
    always @(*) begin
        if (!tmpl_q[11]) begin
            ch = tmpl_q[7:0];
        end else begin
            case (tmpl_q[10:8])
                3'd0: ch = hex_char(field_val(tmpl_q[7:3]) >> (5'd28 - {tmpl_q[2:0], 2'b00}));
                3'd1: ch = ms_s[31 - tmpl_q[1:0] * 8 -: 8];
                3'd2: ch = ms_m[31 - tmpl_q[1:0] * 8 -: 8];
                3'd3: ch = sn[71 - tmpl_q[3:0] * 8 -: 8];
                3'd4: ch = st_s[47 - tmpl_q[2:0] * 8 -: 8];
                3'd5: ch = st_m[47 - tmpl_q[2:0] * 8 -: 8];
                default: ch = 8'd32;
            endcase
        end
    end

    // สีตัวหนังสือตามแถว (S = ส้ม, M = ฟ้า)
    reg [11:0] txt_col;
    always @(*) begin
        case (vc1[8:4])
            5'd2:           txt_col = (hc1 < 10'd320) ? 12'hFA5 : 12'h6DF;
            5'd22, 5'd27:   txt_col = 12'hFA5;
            5'd23, 5'd28:   txt_col = 12'h6DF;
            5'd24:          txt_col = 12'hFA5;
            5'd25:          txt_col = 12'h6DF;
            5'd29:          txt_col = 12'h999;
            default:        txt_col = 12'hFFF;
        endcase
    end

    reg  [7:0]  font_q;
    reg  [5:0]  bg2;
    reg  [11:0] txt_col2;
    reg  [9:0]  hc2, vc2;
    reg         vis2, hs2, vs2;

    always @(posedge clk) begin
        font_q   <= font_rom[{ch[6:0], vc1[3:0]}];
        bg2      <= (vc1 >= 10'd32 && vc1 < 10'd352) ? bg_q : 6'd0;
        txt_col2 <= txt_col;
        hc2      <= hc1;
        vc2      <= vc1;
        vis2     <= vis1;
        hs2      <= hs1;
        vs2      <= vs1;
    end

    // ---------------- stage C: รวมสี ----------------
    // แถบแข่ง: ยาว = เวลา x 43 / 512 (~1/12) จำกัด 480 px เริ่มที่ x = 72
    function [9:0] bar_len;
        input [31:0] t;
        reg   [37:0] p;
        begin
            p = t * 38'd43;
            bar_len = (p[37:9] > 38'd480) ? 10'd480 : p[18:9];
        end
    endfunction

    reg [9:0] len_s, len_m;
    always @(posedge clk) begin
        len_s <= bar_len(s_time);
        len_m <= bar_len(m_time);
    end

    wire in_track  = (hc2 >= 10'd72) && (hc2 < 10'd552);
    wire bar_s_row = (vc2 >= 10'd387) && (vc2 < 10'd397);
    wire bar_m_row = (vc2 >= 10'd403) && (vc2 < 10'd413);
    wire on_bar_s  = bar_s_row && (hc2 >= 10'd72) && (hc2 < 10'd72 + len_s);
    wire on_bar_m  = bar_m_row && (hc2 >= 10'd72) && (hc2 < 10'd72 + len_m);
    wire on_track  = (bar_s_row || bar_m_row) && in_track;

    wire text_px   = font_q[3'd7 - hc2[2:0]];

    function [11:0] palette;
        input [5:0] idx;
        begin
            if (idx == 6'd0)       palette = 12'h112;
            else if (idx == 6'd1)  palette = 12'h89A;
            else if (idx < 6'd32)  palette = active_s[idx - 6'd2]  ? 12'hF80 : 12'h445;
            else                   palette = active_m[idx - 6'd32] ? 12'h2CF : 12'h445;
        end
    endfunction

    reg [11:0] color;
    always @(*) begin
        if (text_px)       color = txt_col2;
        else if (on_bar_s) color = 12'hF80;
        else if (on_bar_m) color = 12'h2CF;
        else if (on_track) color = 12'h223;
        else               color = palette(bg2);
    end

    always @(posedge clk) begin
        {vga_r, vga_g, vga_b} <= vis2 ? color : 12'h000;
        vga_hs <= hs2;
        vga_vs <= vs2;
        vis_o  <= vis2;
        x_o    <= hc2;
        y_o    <= vc2;
    end
endmodule
