"""สร้างภาพหน้าจอ VGA (สเปคหัวข้อ 10.2-10.4)

    python tools/gen_screen.py      -> mem/bg.mem, mem/text.mem, build/screen/*.png

bg.mem   : ภาพ datapath 640x320 (y จอ = 32..351) เก็บ wire-ID 6 bit ต่อ pixel (2 หลัก hex ต่อบรรทัด)
           0 = พื้นหลัง, 1 = เส้น/กล่อง/ตัวหนังสือคงที่, 2+bit = เส้นของ single, 32+bit = เส้นของ multi
           วาดด้วยโค้ด ไม่มี anti-aliasing ทุกเส้นมี ID ตาม docs/wire_map.md
text.mem : template ตัวหนังสือ 80x30 ช่อง 12 bit ต่อช่อง (รูปแบบอธิบายใน rtl/vga/vga_renderer.v)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BG_W, BG_H = 640, 320
COLS, ROWS = 80, 30
S_BASE, M_BASE = 2, 32


def load_font():
    data = [int(l, 16) for l in (ROOT / "mem" / "font.mem").read_text().split()]
    return [data[i * 16:(i + 1) * 16] for i in range(128)]


class Canvas:
    def __init__(self, font):
        self.px = [[0] * BG_W for _ in range(BG_H)]
        self.font = font
        self.ox = 0

    def set(self, x, y, v):
        x += self.ox
        if 0 <= x < BG_W and 0 <= y < BG_H:
            self.px[y][x] = v

    def hline(self, x0, x1, y, v, w=2):
        for x in range(min(x0, x1), max(x0, x1) + 1):
            for d in range(w):
                self.set(x, y + d, v)

    def vline(self, x, y0, y1, v, w=2):
        for y in range(min(y0, y1), max(y0, y1) + 1):
            for d in range(w):
                self.set(x + d, y, v)

    def wire(self, v, *pts):
        """เส้นหักมุมฉากผ่านจุด pts"""
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if y0 == y1:
                self.hline(x0, x1, y0, v)
            elif x0 == x1:
                self.vline(x0, y0, y1, v)
            else:
                raise ValueError(f"เส้นต้องตั้งหรือนอน: {(x0, y0)} -> {(x1, y1)}")

    def rect(self, x0, y0, x1, y1, v):
        self.hline(x0, x1, y0, v)
        self.hline(x0, x1, y1 - 1, v)
        self.vline(x0, y0, y1, v)
        self.vline(x1 - 1, y0, y1, v)

    def text(self, x, y, s, v=1):
        for i, ch in enumerate(s):
            g = self.font[ord(ch) & 0x7F]
            for yy in range(16):
                for xx in range(8):
                    if g[yy] & (0x80 >> xx):
                        self.set(x + i * 8 + xx, y + yy, v)

    def box(self, x0, y0, x1, y1, label="", v=1, ty=None):
        self.rect(x0, y0, x1, y1, v)
        if label:
            tx = (x0 + x1) // 2 - len(label) * 4
            self.text(tx, (y0 + y1) // 2 - 8 if ty is None else ty, label, 1)

    def mux(self, x0, y0, x1, y1):
        self.rect(x0, y0, x1, y1, 1)


def draw_single(c):
    """single-cycle ครึ่งซ้าย (สเปคหัวข้อ 10.3)"""
    W = lambda bit: S_BASE + bit          # noqa: E731
    c.ox = 0
    # กล่อง
    c.box(6, 140, 32, 172, "PC")
    c.box(42, 40, 76, 62, "+4")
    c.box(42, 118, 96, 206, "IMEM")
    c.box(122, 112, 172, 214, "REG")
    c.box(120, 238, 162, 260, "EXT")
    c.mux(186, 168, 194, 214)                 # ALUSrc
    c.box(204, 128, 236, 196, "ALU", v=W(19))
    c.box(250, 136, 298, 206, "DMEM", v=W(18))
    c.mux(304, 150, 312, 200)                 # MemtoReg
    c.mux(104, 178, 110, 204)                 # RegDst
    c.box(148, 34, 182, 56, "ADD")
    c.box(212, 80, 232, 96, "&")
    c.mux(236, 30, 244, 66)                   # PCSrc
    c.mux(262, 26, 270, 70)                   # Jump
    c.text(200, 56, "<<2")
    c.text(88, 70, "<<2")

    # เส้นคงที่
    c.wire(1, (110, 191), (122, 191))                     # RegDst -> write reg
    c.wire(1, (68, 206), (68, 248), (120, 248))           # IMEM[15:0] -> EXT
    c.wire(1, (232, 88), (240, 88), (240, 66))            # AND -> PCSrc select
    c.wire(1, (244, 48), (262, 48))                       # PCSrc -> Jump mux

    # เส้นที่ติดไฟได้
    c.wire(W(0), (32, 156), (42, 156))                                    # PC -> IMEM
    c.wire(W(1), (18, 140), (18, 51), (42, 51))                           # PC -> +4
    c.wire(W(1), (76, 51), (90, 51), (90, 26), (230, 26), (230, 36), (236, 36))  # +4 -> PCSrc
    c.wire(W(1), (120, 26), (120, 44), (148, 44))                         # PC+4 -> branch adder
    c.wire(W(2), (96, 128), (122, 128))                                   # rs
    c.wire(W(2), (96, 144), (122, 144))                                   # rt
    c.wire(W(3), (96, 184), (104, 184))                                   # [15:11]
    c.wire(W(4), (96, 198), (104, 198))                                   # [20:16]
    c.wire(W(5), (172, 140), (204, 140))                                  # RD1 -> ALU
    c.wire(W(6), (172, 176), (186, 176))                                  # RD2 -> ALUSrc
    c.wire(W(7), (162, 252), (180, 252), (180, 206), (186, 206))          # EXT -> ALUSrc
    c.wire(W(8), (236, 160), (250, 160))                                  # ALU -> DMEM addr
    c.wire(W(9), (176, 178), (176, 228), (244, 228), (244, 194), (250, 194))  # RD2 -> DMEM wdata
    c.wire(W(10), (298, 170), (304, 170))                                 # DMEM -> MemtoReg
    c.wire(W(11), (242, 160), (242, 120), (308, 120), (308, 150))         # ALU -> MemtoReg
    c.wire(W(12), (312, 176), (316, 176), (316, 302), (116, 302), (116, 208), (122, 208))  # -> REG wd
    c.wire(W(13), (140, 260), (140, 282), (198, 282), (198, 72), (166, 72), (166, 56))     # EXT -> <<2 -> ADD
    c.wire(W(14), (182, 46), (236, 46))                                   # ADD -> PCSrc
    c.wire(W(15), (222, 128), (222, 96))                                  # Zero -> AND
    c.wire(W(16), (84, 118), (84, 18), (266, 18), (266, 26))              # [25:0] -> <<2 -> Jump
    c.wire(W(17), (270, 48), (290, 48), (290, 108), (2, 108), (2, 156), (6, 156))  # Jump -> PC


def draw_multi(c):
    """multicycle ครึ่งขวา (docs/wire_map.md)"""
    W = lambda bit: M_BASE + bit          # noqa: E731
    c.ox = 320
    c.box(6, 140, 32, 172, "PC")
    c.mux(38, 136, 44, 182)                   # IorD
    c.box(52, 116, 100, 212, "MEM", v=W(23))
    c.box(110, 116, 140, 140, "IR")
    c.box(110, 186, 140, 210, "MDR")
    c.box(162, 116, 206, 212, "REG", v=W(25))
    c.box(160, 238, 200, 260, "EXT")
    c.box(214, 124, 232, 146, "A")
    c.box(214, 168, 232, 190, "B")
    c.mux(240, 108, 246, 152)                 # ALUSrcA
    c.mux(240, 164, 246, 232)                 # ALUSrcB
    c.box(254, 128, 282, 200, "ALU", v=W(24))
    c.box(288, 150, 316, 174, "OUT")
    c.mux(300, 34, 306, 84)                   # PCSource
    c.box(262, 84, 278, 100, "&")
    c.text(222, 194, "4")
    c.text(200, 262, "<<2")
    c.text(140, 30, "<<2")

    # เส้นคงที่
    c.wire(1, (125, 140), (125, 150), (150, 150), (150, 248), (160, 248))  # IR[15:0] -> EXT
    c.wire(1, (303, 34), (303, 22), (2, 22), (2, 156), (6, 156))           # PCSource -> PC

    c.wire(W(0), (32, 156), (38, 156))                                    # PC -> IorD
    c.wire(W(1), (44, 158), (52, 158))                                    # IorD -> MEM
    c.wire(W(2), (100, 128), (110, 128))                                  # MEM -> IR
    c.wire(W(3), (18, 140), (18, 100), (243, 100), (243, 108))            # PC -> ALUSrcA
    c.wire(W(4), (232, 202), (240, 202))                                  # 4 -> ALUSrcB
    c.wire(W(5), (282, 140), (288, 140), (288, 64), (300, 64))            # ALU -> PCSource
    c.wire(W(6), (140, 124), (162, 124))                                  # IR rs -> REG
    c.wire(W(6), (140, 134), (162, 134))                                  # IR rt -> REG
    c.wire(W(7), (206, 134), (214, 134))                                  # REG -> A
    c.wire(W(7), (206, 178), (214, 178))                                  # REG -> B
    c.wire(W(8), (200, 254), (236, 254), (236, 224), (240, 224))          # EXT -> <<2 -> ALUSrcB
    c.wire(W(9), (282, 162), (288, 162))                                  # ALU -> ALUOut
    c.wire(W(10), (232, 134), (240, 134))                                 # A -> ALUSrcA
    c.wire(W(11), (232, 178), (240, 178))                                 # B -> ALUSrcB
    c.wire(W(12), (200, 244), (230, 244), (230, 214), (240, 214))         # EXT -> ALUSrcB
    c.wire(W(13), (302, 174), (302, 292), (34, 292), (34, 172), (38, 172))  # ALUOut -> IorD
    c.wire(W(14), (100, 198), (110, 198))                                 # MEM -> MDR
    c.wire(W(15), (140, 198), (162, 198))                                 # MDR -> REG wd
    c.wire(W(16), (131, 140), (131, 160), (162, 160))                     # IR[20:16] -> write reg
    c.wire(W(17), (223, 190), (223, 282), (76, 282), (76, 212))           # B -> MEM wdata
    c.wire(W(18), (312, 174), (312, 302), (156, 302), (156, 206), (162, 206))  # ALUOut -> REG wd
    c.wire(W(19), (116, 140), (116, 170), (162, 170))                     # IR[15:11] -> write reg
    c.wire(W(20), (308, 150), (308, 94), (303, 94), (303, 84))            # ALUOut -> PCSource
    c.wire(W(21), (270, 128), (270, 100))                                 # Zero -> PCWriteCond
    c.wire(W(22), (125, 116), (125, 50), (300, 50))                       # IR[25:0] -> <<2 -> PCSource


def build_bg(font):
    c = Canvas(font)
    draw_single(c)
    draw_multi(c)
    # เส้นแบ่งครึ่งจอ
    c.ox = 0
    c.vline(319, 0, BG_H - 1, 1, w=1)
    return c.px


# ---------------- template ตัวหนังสือ ----------------
TYPE = {"MS": 1, "MM": 2, "ST": 3, "WS": 4, "WM": 5}
FIELD = {"TIME": 0, "OV": 1, "PROG": 2, "SPC": 3, "SIR": 4, "SRET": 5, "ST": 6,
         "MPC": 7, "MIR": 8, "MRET": 9, "MT": 10, "MSTATE": 11}
for i in range(8):
    FIELD[f"S{i}"] = 12 + i
    FIELD[f"M{i}"] = 20 + i

LINES = {
    0: " CPU RACE  single-cycle vs multicycle MIPS     PROG {PROG:1}  OV {OV:1}  TIME {TIME:8}",
    2: " SINGLE-CYCLE   1 clock = 50+ov        " + " MULTICYCLE  1 step = 10+ov  {ST}",
    22: " S  PC {SPC:8}  IR {SIR:8} {MS}  RETIRED {SRET:8}  TIME {ST_T:8}  {WS}",
    23: " M  PC {MPC:8}  IR {MIR:8} {MM}  RETIRED {MRET:8}  TIME {MT:8}  {WM}",
    24: " SINGLE",
    25: " MULTI",
    26: "     " + "".join(f"$t{i}      " for i in range(8)),
    27: " S   " + "".join(f"{{S{i}:8}} " for i in range(8)),
    28: " M   " + "".join(f"{{M{i}:8}} " for i in range(8)),
    29: " SW15 run/step  BTNC step  BTNR run/pause  BTNL reload  SW4 prog A/B  SW3-0 ov",
}

TOKEN = re.compile(r"\{(\w+)(?::(\d))?\}")
STR_LEN = {"MS": 4, "MM": 4, "ST": 9, "WS": 6, "WM": 6}


def build_text():
    cells = [[32] * COLS for _ in range(ROWS)]
    for row, line in LINES.items():
        out = []
        pos = 0
        for m in TOKEN.finditer(line):
            out += [ord(ch) for ch in line[pos:m.start()]]
            name, width = m.group(1), m.group(2)
            if name == "ST_T":
                name = "ST"
                width = width or "8"
                f = FIELD["ST"]
                out += [0x800 | (f << 3) | (8 - int(width) + k) for k in range(int(width))]
            elif width is not None:
                f = FIELD[name]
                n = int(width)
                out += [0x800 | (f << 3) | (8 - n + k) for k in range(n)]
            else:
                t = TYPE[name]
                out += [0x800 | (t << 8) | k for k in range(STR_LEN[name])]
            pos = m.end()
        out += [ord(ch) for ch in line[pos:]]
        if len(out) > COLS:
            sys.exit(f"แถว {row} ยาว {len(out)} เกิน {COLS} ช่อง")
        cells[row][:len(out)] = out
    return cells


def write_outputs(bg, cells, font):
    (ROOT / "mem" / "bg.mem").write_text("".join(f"{v:02x}\n" for row in bg for v in row), encoding="ascii")
    (ROOT / "mem" / "text.mem").write_text("".join(f"{v:03x}\n" for row in cells for v in row), encoding="ascii")
    print("wrote mem/bg.mem, mem/text.mem")

    # preview: ทุกเส้นติดไฟ (ส้ม/ฟ้า) กล่องคงที่สีเทา ตัวหนังสือ template แบบดิบ
    from PIL import Image
    img = Image.new("RGB", (640, 480), (17, 17, 34))
    px = img.load()
    for y in range(BG_H):
        for x in range(BG_W):
            v = bg[y][x]
            if v == 1:
                px[x, y + 32] = (136, 153, 170)
            elif 2 <= v < 32:
                px[x, y + 32] = (255, 136, 0)
            elif v >= 32:
                px[x, y + 32] = (34, 204, 255)
    for r in range(ROWS):
        for col in range(COLS):
            code = cells[r][col]
            ch = code if code < 0x800 else ord("#")
            g = font[ch & 0x7F]
            for yy in range(16):
                for xx in range(8):
                    if g[yy] & (0x80 >> xx):
                        px[col * 8 + xx, r * 16 + yy] = (255, 255, 255)
    out = ROOT / "build" / "screen" / "template_preview.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f"preview {out.relative_to(ROOT)}")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    font = load_font()
    write_outputs(build_bg(font), build_text(), font)


if __name__ == "__main__":
    main()
