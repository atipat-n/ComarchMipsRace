// Top ของบอร์ด Nexys A7-100T: CPU Race (สเปคหัวข้อ 5)
//
// สวิตช์/ปุ่ม (สเปคหัวข้อ 10.5):
//   SW[3:0]  ov 0-15          SW[4]  โปรแกรม A/B (มีผลตอนกด BTNL)
//   SW[14:12] ความเร็ว run     SW[15] 0 = step, 1 = run
//   BTNC step   BTNR run/pause   BTNL reset core + โหลดโปรแกรมใหม่   BTNU สลับสิ่งที่ 7-seg แสดง
//   CPU_RESETN reset ทั้งระบบ (แล้วโหลดโปรแกรมให้อัตโนมัติ)
// LED: [15] single done, [14] multi done, [13] running, [12] โปรแกรม B, [11:0] state ของ multi (one-hot)
// 7-seg: หลัก 7-4 = single, 3-0 = multi (retired หรือเวลา, สลับด้วย BTNU)
// USB-UART 115200 8N1: เว็บ web-live/ สั่งงานและอ่านสถานะได้ (rtl/io/uart_cmd.v, docs/protocol.md)
//   เมื่อเว็บสั่งแทนค่า ov หรือโหมด สวิตช์ตัวนั้นจะไม่มีผลจนกว่าเว็บจะยกเลิก
module top #(
    parameter integer CLK_HZ       = 25_000_000,
    parameter integer DEBOUNCE_N   = 250_000,
    parameter integer UART_DIV     = 217,          // 25 MHz / 115200
    parameter integer UART_TIMEOUT = 8_000_000
) (
    input         CLK100MHZ,
    input         CPU_RESETN,
    input  [15:0] SW,
    input         BTNC,
    input         BTNU,
    input         BTNL,
    input         BTNR,
    input         UART_TXD_IN,     // จากคอม (ชื่อตามมุมมองของ FTDI)
    output        UART_RXD_OUT,    // ไปคอม
    output [15:0] LED,
    output        CA, CB, CC, CD, CE, CF, CG, DP,
    output [7:0]  AN,
    output [3:0]  VGA_R,
    output [3:0]  VGA_G,
    output [3:0]  VGA_B,
    output        VGA_HS,
    output        VGA_VS
);
    // ---------------- clock / reset ----------------
    wire clk, locked;
    clk_gen cg (.clk100(CLK100MHZ), .clk25(clk), .locked(locked));

    reg [2:0] rst_sync = 3'b111;
    always @(posedge clk) rst_sync <= {rst_sync[1:0], ~CPU_RESETN | ~locked};
    wire sys_rst = rst_sync[2];

    reg sys_rst_d = 1'b1;
    always @(posedge clk) sys_rst_d <= sys_rst;

    // ---------------- ปุ่ม ----------------
    wire btnc_p, btnu_p, btnl_p, btnr_p;
    wire btnc_l, btnu_l, btnl_l, btnr_l;
    debounce #(.N(DEBOUNCE_N)) db_c (.clk(clk), .in(BTNC), .level(btnc_l), .pulse(btnc_p));
    debounce #(.N(DEBOUNCE_N)) db_u (.clk(clk), .in(BTNU), .level(btnu_l), .pulse(btnu_p));
    debounce #(.N(DEBOUNCE_N)) db_l (.clk(clk), .in(BTNL), .level(btnl_l), .pulse(btnl_p));
    debounce #(.N(DEBOUNCE_N)) db_r (.clk(clk), .in(BTNR), .level(btnr_l), .pulse(btnr_p));

    // สวิตช์ผ่าน sync 2 FF
    reg [15:0] sw_s0 = 16'd0, sw = 16'd0;
    always @(posedge clk) begin
        sw_s0 <= SW;
        sw    <= sw_s0;
    end

    // ---------------- UART ----------------
    wire [7:0]  rx_data, tx_data;
    wire        rx_valid, tx_start, tx_busy;
    uart_rx #(.DIV(UART_DIV)) urx (.clk(clk), .rx(UART_TXD_IN), .data(rx_data), .valid(rx_valid));
    uart_tx #(.DIV(UART_DIV)) utx (.clk(clk), .start(tx_start), .data(tx_data), .tx(UART_RXD_OUT), .busy(tx_busy));

    wire        u_step, u_run_set, u_run_clr, u_reset, u_boot, u_boot_sel;
    wire        u_ov_en, u_mode_en, u_run;
    wire [3:0]  u_ov;
    wire [2:0]  u_speed;
    wire        u_ld_we, u_loading;
    wire [8:0]  u_ld_addr;
    wire [31:0] u_ld_data;
    wire [4:0]  u_dbg_addr;
    wire        u_dbg_own;

    // ค่าที่ใช้จริง (เว็บแทนค่าสวิตช์ได้)
    wire [3:0]  ov_eff    = u_ov_en   ? u_ov    : sw[3:0];
    wire        run_eff   = u_mode_en ? u_run   : sw[15];
    wire [2:0]  speed_eff = u_mode_en ? u_speed : sw[14:12];

    // ---------------- boot ROM -> memory ของทั้งสอง core ----------------
    reg         prog_sel = 1'b0;
    wire        btn_load   = (sys_rst_d & ~sys_rst) | (btnl_p & ~sys_rst);
    wire        load_start = btn_load | (u_boot & ~sys_rst);
    wire        load_sel   = u_boot ? u_boot_sel : sw[4];
    always @(posedge clk) if (load_start) prog_sel <= load_sel;

    wire [8:0]  rom_addr;
    wire [31:0] rom_data;
    wire        ld_busy, b_ld_we;
    wire [8:0]  b_ld_addr;
    wire [31:0] b_ld_data;

    boot_rom brom (.clk(clk), .sel(load_start ? load_sel : prog_sel), .addr(rom_addr), .data(rom_data));
    mem_loader loader (
        .clk(clk), .start(load_start), .busy(ld_busy),
        .rom_addr(rom_addr), .rom_data(rom_data),
        .ld_we(b_ld_we), .ld_addr(b_ld_addr), .ld_data(b_ld_data)
    );

    // loader port ของ core: boot ROM หรือ UART
    wire        ld_we   = b_ld_we | u_ld_we;
    wire [8:0]  ld_addr = b_ld_we ? b_ld_addr : u_ld_addr;
    wire [31:0] ld_data = b_ld_we ? b_ld_data : u_ld_data;

    wire core_rst = sys_rst | ld_busy | load_start | u_loading | u_ld_we | u_reset;

    // ---------------- race control ----------------
    wire        en_s, en_m, running;
    wire [31:0] time_now, last_s, last_m;
    wire        done_s, done_m;

    race_ctrl #(.CLK_HZ(CLK_HZ)) rc (
        .clk(clk), .rst(core_rst),
        .ov(ov_eff), .run_mode(run_eff), .speed(speed_eff),
        .step_pulse(btnc_p | u_step), .run_toggle(btnr_p), .run_set(u_run_set), .run_clr(u_run_clr),
        .done_s(done_s), .done_m(done_m),
        .en_s(en_s), .en_m(en_m),
        .time_now(time_now), .last_s(last_s), .last_m(last_m),
        .running(running)
    );

    // ---------------- CPU ทั้งสองตัว ----------------
    reg  [2:0]  dbg_i = 3'd0;
    wire [4:0]  dbg_addr = u_dbg_own ? u_dbg_addr : {2'b01, dbg_i};   // จอใช้ $8..$15, UART ใช้ทั้ง 32 ตัว
    wire [31:0] dbg_s, dbg_m;
    wire [31:0] s_pc, s_instr, s_ret, s_active;
    wire [31:0] m_pc, m_ir, m_ret, m_active;
    wire [3:0]  s_state, m_state;

    single_cycle_cpu cpu_s (
        .clk(clk), .rst(core_rst), .en(en_s),
        .ld_we(ld_we), .ld_addr(ld_addr), .ld_data(ld_data),
        .dbg_reg_addr(dbg_addr), .dbg_reg_data(dbg_s),
        .pc(s_pc), .instr(s_instr), .retired(s_ret), .done(done_s),
        .active(s_active), .state(s_state)
    );

    multi_cycle_cpu cpu_m (
        .clk(clk), .rst(core_rst), .en(en_m),
        .ld_we(ld_we), .ld_addr(ld_addr), .ld_data(ld_data),
        .dbg_reg_addr(dbg_addr), .dbg_reg_data(dbg_m),
        .pc(m_pc), .instr(m_ir), .retired(m_ret), .done(done_m),
        .active(m_active), .state(m_state)
    );

    // อ่าน $t0..$t7 ของทั้งสอง core วนไปเรื่อยๆ ผ่าน debug port เก็บไว้ให้จอ (หยุดชั่วคราวเมื่อ UART ใช้ port)
    reg [255:0] s_regs = 256'd0, m_regs = 256'd0;
    always @(posedge clk) begin
        if (!u_dbg_own) begin
            dbg_i <= dbg_i + 3'd1;
            s_regs[dbg_i * 32 +: 32] <= dbg_s;
            m_regs[dbg_i * 32 +: 32] <= dbg_m;
        end
    end

    wire [31:0] s_time = done_s ? last_s : time_now;
    wire [31:0] m_time = done_m ? last_m : time_now;

    uart_cmd #(.TIMEOUT(UART_TIMEOUT)) ucmd (
        .clk(clk), .rst(sys_rst),
        .rx_data(rx_data), .rx_valid(rx_valid), .tx_data(tx_data), .tx_start(tx_start), .tx_busy(tx_busy),
        .st_time(time_now), .st_ov(ov_eff),
        .st_flags({ld_busy | u_loading, u_mode_en, u_ov_en, run_eff, prog_sel, running, done_m, done_s}),
        .st_speed(speed_eff), .st_mstate(m_state),
        .st_s_pc(s_pc), .st_s_instr(s_instr), .st_s_ret(s_ret), .st_s_last(last_s), .st_s_active(s_active),
        .st_m_pc(m_pc), .st_m_ir(m_ir), .st_m_ret(m_ret), .st_m_last(last_m), .st_m_active(m_active),
        .dbg_addr(u_dbg_addr), .dbg_own(u_dbg_own), .dbg_s(dbg_s), .dbg_m(dbg_m),
        .step_pulse(u_step), .run_set(u_run_set), .run_clr(u_run_clr), .reset_pulse(u_reset),
        .boot_pulse(u_boot), .boot_sel(u_boot_sel),
        .ov_ovr_en(u_ov_en), .ov_ovr(u_ov), .mode_ovr_en(u_mode_en), .run_ovr(u_run), .speed_ovr(u_speed),
        .ld_we(u_ld_we), .ld_addr(u_ld_addr), .ld_data(u_ld_data), .loading(u_loading)
    );

    // ---------------- 7-seg + LED ----------------
    reg seg_mode = 1'b0;
    always @(posedge clk) if (btnu_p) seg_mode <= ~seg_mode;

    wire [31:0] seg_val = seg_mode ? {s_time[15:0], m_time[15:0]} : {s_ret[15:0], m_ret[15:0]};
    wire [6:0]  seg;
    sevenseg ss (.clk(clk), .value(seg_val), .seg(seg), .dp(DP), .an(AN));
    assign {CG, CF, CE, CD, CC, CB, CA} = seg;

    wire [11:0] state_onehot = done_m ? 12'd0 : (12'd1 << m_state);
    assign LED = {done_s, done_m, running, prog_sel, state_onehot};

    // ---------------- VGA ----------------
    wire [9:0] hc, vc;
    wire       visible, hsync, vsync, frame_start;
    vga_timing vt (.clk(clk), .hc(hc), .vc(vc), .visible(visible), .hsync(hsync), .vsync(vsync),
                   .frame_start(frame_start));

    wire       vis_o;
    wire [9:0] x_o, y_o;
    vga_renderer vr (
        .clk(clk), .hc(hc), .vc(vc), .visible(visible), .hsync(hsync), .vsync(vsync),
        .active_s(s_active), .active_m(m_active), .done_s(done_s), .done_m(done_m),
        .f_time(time_now), .f_ov(ov_eff), .f_prog(prog_sel),
        .s_pc(s_pc), .s_instr(s_instr), .s_ret(s_ret), .s_time(s_time),
        .m_pc(m_pc), .m_ir(m_ir), .m_ret(m_ret), .m_time(m_time), .m_state(m_state),
        .s_regs(s_regs), .m_regs(m_regs),
        .vga_r(VGA_R), .vga_g(VGA_G), .vga_b(VGA_B), .vga_hs(VGA_HS), .vga_vs(VGA_VS),
        .vis_o(vis_o), .x_o(x_o), .y_o(y_o)
    );
endmodule
