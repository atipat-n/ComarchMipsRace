// ตัวแปลคำสั่งจากคอมผ่าน UART (สเปคหัวข้อ 11.1, รายละเอียดใน docs/protocol.md)
//
// คอม -> บอร์ด (ทุกคำสั่งตอบ 'K' ยกเว้น I, D และคำสั่งที่ไม่รู้จักตอบ '?')
//   'I'                 ตอบ 'I' VERSION
//   'D'                 ตอบแพ็กเก็ตสถานะ: 0xA5 + payload 304 byte + checksum (ผลรวม payload mod 256)
//   'S' / 'G' / 'P'     step / run / pause
//   'R'                 reset core + เวลา (ไม่ copy โปรแกรมใหม่)
//   'B' n               โหลดโปรแกรม n (0 = A, 1 = B) จาก boot ROM เหมือนกด BTNL
//   'O' v               v[7] = 1: ใช้ ov = v[3:0] แทนสวิตช์, v[7] = 0: กลับไปใช้สวิตช์
//   'M' v               v[7] = 1: run mode = v[3], speed = v[2:0] แทนสวิตช์, v[7] = 0: กลับไปใช้สวิตช์
//   'X'                 ยกเลิกการแทนค่าทั้งหมด
//   'L' a_hi a_lo n_hi n_lo + n x 4 byte (big-endian)  เขียน n word ลง memory ของทั้งสอง core เริ่มที่ word a
//                       ระหว่างนั้น core อยู่ใน reset (โหลดเสร็จ = เริ่มใหม่) ถ้าข้อมูลขาดหาย > ~0.3 s จะยกเลิก
module uart_cmd #(
    parameter integer TIMEOUT = 8_000_000       // clock ที่รอ byte ถัดไปของ L ก่อนยกเลิก
) (
    input             clk,
    input             rst,

    input      [7:0]  rx_data,
    input             rx_valid,
    output reg [7:0]  tx_data,
    output reg        tx_start,
    input             tx_busy,

    // สถานะสำหรับแพ็กเก็ต D
    input      [31:0] st_time,
    input      [3:0]  st_ov,
    input      [7:0]  st_flags,
    input      [2:0]  st_speed,
    input      [3:0]  st_mstate,
    input      [31:0] st_s_pc, st_s_instr, st_s_ret, st_s_last, st_s_active,
    input      [31:0] st_m_pc, st_m_ir, st_m_ret, st_m_last, st_m_active,
    output     [4:0]  dbg_addr,
    output            dbg_own,          // 1 = ตอนนี้ใช้ debug port อยู่
    input      [31:0] dbg_s,
    input      [31:0] dbg_m,

    // สั่งงาน
    output reg        step_pulse,
    output reg        run_set,
    output reg        run_clr,
    output reg        reset_pulse,
    output reg        boot_pulse,
    output reg        boot_sel,
    output reg        ov_ovr_en,
    output reg [3:0]  ov_ovr,
    output reg        mode_ovr_en,
    output reg        run_ovr,
    output reg [2:0]  speed_ovr,

    // loader port
    output reg        ld_we,
    output reg [8:0]  ld_addr,
    output reg [31:0] ld_data,
    output            loading
);
    localparam [7:0] VERSION = 8'd1;
    localparam integer PAYLOAD = 304;

    // ---------------- รับคำสั่ง ----------------
    localparam C_IDLE = 3'd0, C_ARG = 3'd1, C_LHDR = 3'd2, C_LDATA = 3'd3, C_REPLY = 3'd4;
    reg [2:0]  cst = C_IDLE;
    reg [7:0]  cmd = 8'd0;
    reg [1:0]  hcnt = 2'd0;
    reg [15:0] laddr = 16'd0, lleft = 16'd0;
    reg [1:0]  bcnt = 2'd0;
    reg [23:0] wbuf = 24'd0;
    reg [23:0] idle = 24'd0;

    // ---------------- ส่งคำตอบ ----------------
    localparam R_ACK = 2'd0, R_ID = 2'd1, R_ERR = 2'd2, R_DUMP = 2'd3;
    reg [1:0]  rkind = R_ACK;
    reg [8:0]  rp = 9'd0;          // ตำแหน่ง byte ที่จะส่งถัดไป
    reg [8:0]  rlen = 9'd0;
    reg [7:0]  csum = 8'd0;
    reg        sending = 1'b0;
    reg [383:0] snap = 384'd0;     // payload byte 0..47 (ค่าที่ไม่ใช่ register) ถ่ายไว้ตอนเริ่มส่ง

    assign loading = (cst == C_LHDR) || (cst == C_LDATA);

    // payload index ของ byte ที่จะส่ง (rp = 0 คือ 0xA5)
    wire [8:0] q = rp - 9'd1;
    wire       q_sreg = (rkind == R_DUMP) && sending && (rp >= 9'd49) && (rp <= 9'd176);
    wire       q_mreg = (rkind == R_DUMP) && sending && (rp >= 9'd177) && (rp <= 9'd304);
    wire [8:0] qr = q_sreg ? (q - 9'd48) : (q - 9'd176);
    assign dbg_addr = qr[6:2];
    assign dbg_own  = q_sreg | q_mreg;

    reg [7:0] pbyte;
    always @(*) begin
        if (q < 9'd48)    pbyte = snap[383 - q * 8 -: 8];
        else if (q_sreg)  pbyte = dbg_s[31 - qr[1:0] * 8 -: 8];
        else              pbyte = dbg_m[31 - qr[1:0] * 8 -: 8];
    end

    reg [7:0] rbyte;
    always @(*) begin
        case (rkind)
            R_ACK:  rbyte = "K";
            R_ID:   rbyte = (rp == 9'd0) ? "I" : VERSION;
            R_ERR:  rbyte = "?";
            default: rbyte = (rp == 9'd0) ? 8'hA5 : (rp == PAYLOAD + 1) ? csum : pbyte;
        endcase
    end

    task reply;
        input [1:0] kind;
        begin
            rkind   <= kind;
            rp      <= 9'd0;
            csum    <= 8'd0;
            sending <= 1'b1;
            rlen    <= (kind == R_DUMP) ? PAYLOAD + 2 : (kind == R_ID) ? 9'd2 : 9'd1;
            if (kind == R_DUMP)
                snap <= {st_time, 4'd0, st_ov, st_flags, 5'd0, st_speed, 4'd0, st_mstate,
                         st_s_pc, st_s_instr, st_s_ret, st_s_last, st_s_active,
                         st_m_pc, st_m_ir, st_m_ret, st_m_last, st_m_active};
        end
    endtask

    initial begin
        tx_data = 8'd0; tx_start = 1'b0;
        step_pulse = 1'b0; run_set = 1'b0; run_clr = 1'b0; reset_pulse = 1'b0; boot_pulse = 1'b0; boot_sel = 1'b0;
        ov_ovr_en = 1'b0; ov_ovr = 4'd0; mode_ovr_en = 1'b0; run_ovr = 1'b0; speed_ovr = 3'd0;
        ld_we = 1'b0; ld_addr = 9'd0; ld_data = 32'd0;
    end

    always @(posedge clk) begin
        step_pulse  <= 1'b0;
        run_set     <= 1'b0;
        run_clr     <= 1'b0;
        reset_pulse <= 1'b0;
        boot_pulse  <= 1'b0;
        ld_we       <= 1'b0;
        tx_start    <= 1'b0;

        if (rst) begin
            cst <= C_IDLE;
            sending <= 1'b0;
            ov_ovr_en <= 1'b0;
            mode_ovr_en <= 1'b0;
        end else begin
            // ---------- ส่ง ----------
            if (sending && !tx_busy && !tx_start) begin
                tx_data  <= rbyte;
                tx_start <= 1'b1;
                if (rkind == R_DUMP && rp != 9'd0 && rp <= PAYLOAD) csum <= csum + rbyte;
                if (rp + 9'd1 == rlen) sending <= 1'b0;
                rp <= rp + 9'd1;
            end

            // ---------- รับ ----------
            idle <= rx_valid ? 24'd0 : (idle + 24'd1);
            case (cst)
                C_IDLE: if (rx_valid && !sending) begin
                    cmd <= rx_data;
                    case (rx_data)
                        "I": reply(R_ID);
                        "D": reply(R_DUMP);
                        "S": begin step_pulse <= 1'b1; reply(R_ACK); end
                        "G": begin run_set <= 1'b1; reply(R_ACK); end
                        "P": begin run_clr <= 1'b1; reply(R_ACK); end
                        "R": begin reset_pulse <= 1'b1; reply(R_ACK); end
                        "X": begin ov_ovr_en <= 1'b0; mode_ovr_en <= 1'b0; reply(R_ACK); end
                        "B", "O", "M": cst <= C_ARG;
                        "L": begin cst <= C_LHDR; hcnt <= 2'd0; end
                        default: reply(R_ERR);
                    endcase
                end
                C_ARG: if (rx_valid) begin
                    case (cmd)
                        "B": begin boot_sel <= rx_data[0]; boot_pulse <= 1'b1; end
                        "O": begin ov_ovr_en <= rx_data[7]; ov_ovr <= rx_data[3:0]; end
                        default: begin mode_ovr_en <= rx_data[7]; run_ovr <= rx_data[3]; speed_ovr <= rx_data[2:0]; end
                    endcase
                    cst <= C_IDLE;
                    reply(R_ACK);
                end
                C_LHDR: begin
                    if (rx_valid) begin
                        case (hcnt)
                            2'd0: laddr[15:8] <= rx_data;
                            2'd1: laddr[7:0]  <= rx_data;
                            2'd2: lleft[15:8] <= rx_data;
                            default: begin
                                lleft[7:0] <= rx_data;
                                bcnt <= 2'd0;
                                if ({lleft[15:8], rx_data} == 16'd0) begin cst <= C_IDLE; reply(R_ACK); end
                                else cst <= C_LDATA;
                            end
                        endcase
                        hcnt <= hcnt + 2'd1;
                    end else if (idle > TIMEOUT) cst <= C_IDLE;
                end
                C_LDATA: begin
                    if (rx_valid) begin
                        if (bcnt == 2'd3) begin
                            ld_we   <= 1'b1;
                            ld_addr <= laddr[8:0];
                            ld_data <= {wbuf, rx_data};
                            laddr   <= laddr + 16'd1;
                            lleft   <= lleft - 16'd1;
                            if (lleft == 16'd1) begin cst <= C_IDLE; reply(R_ACK); end
                        end else begin
                            wbuf <= {wbuf[15:0], rx_data};
                        end
                        bcnt <= bcnt + 2'd1;
                    end else if (idle > TIMEOUT) cst <= C_IDLE;
                end
                default: cst <= C_IDLE;
            endcase
        end
    end
endmodule
