"""สร้าง web/programs.js จากไฟล์ .s ใน programs/ (ให้เว็บใช้โปรแกรมชุดเดียวกับบอร์ดและเทสต์)

    python tools/build_web.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

GROUPS = [
    ("demo", "โปรแกรม demo (มีบนบอร์ด)", ["programs/demoA_alu_heavy.s", "programs/demoB_mem_heavy.s"]),
    ("example", "ตัวอย่าง", sorted(str(p.relative_to(ROOT).as_posix()) for p in (ROOT / "programs" / "examples").glob("*.s"))),
    ("test", "เทสต์ทีละคำสั่ง", sorted(str(p.relative_to(ROOT).as_posix()) for p in (ROOT / "programs" / "tests").glob("*.s"))),
]

TITLES = {
    "demoA_alu_heavy": "A: บวก 1..10 (ALU เยอะ)",
    "demoB_mem_heavy": "B: รวม array (lw เยอะ)",
    "ex_lw_add": "โหลด 2 ค่ามาบวกแล้วเก็บ",
    "t_add": "add", "t_sub": "sub", "t_and_or": "and / or", "t_slt": "slt (มีเครื่องหมาย)",
    "t_addi": "addi", "t_lw_sw": "lw / sw", "t_beq": "beq", "t_j": "j",
    "t_factorial": "5! ด้วยการบวกซ้ำ", "t_illegal": "คำสั่งที่ไม่รู้จัก",
}


class Recorder:
    """รับคำสั่งวาดแบบเดียวกับ gen_screen.Canvas แต่เก็บเป็นรายการรูปทรง (ภาพในเว็บจึงตรงกับจอ VGA)"""

    def __init__(self):
        self.ox = 0
        self.items = {0: [], 320: []}

    def _wid(self, v):
        if v <= 1:
            return None
        return v - 2 if v < 32 else v - 32

    def box(self, x0, y0, x1, y1, label="", v=1, ty=None):
        self.items[self.ox].append({"t": "box", "x0": x0, "y0": y0, "x1": x1, "y1": y1, "label": label,
                                    "w": self._wid(v)})

    def mux(self, x0, y0, x1, y1):
        self.items[self.ox].append({"t": "mux", "x0": x0, "y0": y0, "x1": x1, "y1": y1})

    def text(self, x, y, s, v=1):
        self.items[self.ox].append({"t": "text", "x": x, "y": y, "s": s})

    def wire(self, v, *pts):
        self.items[self.ox].append({"t": "wire", "w": self._wid(v), "pts": [list(p) for p in pts]})


def build_geometry():
    sys.path.insert(0, str(ROOT / "tools"))
    import gen_screen
    r = Recorder()
    gen_screen.draw_single(r)
    gen_screen.draw_multi(r)
    out = ROOT / "web" / "geometry.js"
    out.write_text("/* สร้างโดย tools/build_web.py จาก tools/gen_screen.py (ภาพเดียวกับจอ VGA) ห้ามแก้มือ */\n"
                   "(function (root) {\n  const GEOMETRY = " + json.dumps({"single": r.items[0], "multi": r.items[320]})
                   + ";\n  if (typeof module === 'object' && module.exports) module.exports = GEOMETRY;\n"
                   "  else root.GEOMETRY = GEOMETRY;\n})(typeof self !== 'undefined' ? self : this);\n", encoding="utf-8")
    print(f"wrote web/geometry.js ({len(r.items[0])} + {len(r.items[320])} shapes)")


def build_index():
    """web/page.html (เนื้อหา ใช้เผยแพร่เป็น Artifact) -> web/index.html (เอกสารเต็ม เปิดในเครื่องได้เลย)"""
    body = (ROOT / "web" / "page.html").read_text(encoding="utf-8")
    html = ('<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<!-- สร้างโดย tools/build_web.py จาก web/page.html ห้ามแก้ไฟล์นี้ -->\n'
            '</head>\n<body>\n' + body + '\n</body>\n</html>\n')
    (ROOT / "web" / "index.html").write_text(html, encoding="utf-8")
    print("wrote web/index.html")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    build_geometry()
    build_index()
    progs = []
    for group, label, paths in GROUPS:
        for p in paths:
            path = ROOT / p
            src = path.read_text(encoding="utf-8")
            first = next((l.lstrip("# ").strip() for l in src.splitlines() if l.startswith("#") and not l.startswith("#!")), "")
            progs.append({"id": path.stem, "group": group, "groupLabel": label,
                          "title": TITLES.get(path.stem, path.stem), "desc": first, "file": p, "src": src})
    out = ROOT / "web" / "programs.js"
    out.write_text("/* สร้างโดย tools/build_web.py จาก programs/*.s ห้ามแก้มือ */\n"
                   "(function (root) {\n  const PROGRAMS = " + json.dumps(progs, ensure_ascii=False, indent=1) + ";\n"
                   "  if (typeof module === 'object' && module.exports) module.exports = PROGRAMS;\n"
                   "  else root.PROGRAMS = PROGRAMS;\n})(typeof self !== 'undefined' ? self : this);\n",
                   encoding="utf-8")
    print(f"wrote web/programs.js ({len(progs)} programs)")


if __name__ == "__main__":
    main()
