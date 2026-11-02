"""สร้างไฟล์ .xdc จาก Nexys-A7-100T-Master.xdc ของ Digilent โดย uncomment เฉพาะกลุ่มขาที่ต้องใช้

ไม่พิมพ์ขาเอง (สเปคหัวข้อ 4.1) ทุกขามาจากไฟล์ master เท่านั้น

    python tools/make_xdc.py smoke     -> constr/smoke.xdc
    python tools/make_xdc.py full      -> constr/nexys_a7_100t.xdc
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "constr" / "Nexys-A7-100T-Master.xdc"

# ชื่อ port ใน get_ports (ไม่รวม index) ที่แต่ละ target ใช้
TARGETS = {
    "smoke": {
        "out": "smoke.xdc",
        "ports": ["CLK100MHZ", "SW", "LED", "CA", "CB", "CC", "CD", "CE", "CF", "CG", "DP", "AN",
                  "CPU_RESETN", "BTNC"],
    },
    "full": {
        "out": "nexys_a7_100t.xdc",
        "ports": ["CLK100MHZ", "SW", "LED", "CA", "CB", "CC", "CD", "CE", "CF", "CG", "DP", "AN",
                  "CPU_RESETN", "BTNC", "BTNU", "BTNL", "BTNR",
                  "VGA_R", "VGA_G", "VGA_B", "VGA_HS", "VGA_VS",
                  "UART_TXD_IN", "UART_RXD_OUT"],
    },
}

PORT_RE = re.compile(r"get_ports\s*\{\s*([A-Za-z0-9_]+)(\[\d+\])?\s*\}")


def build(target):
    spec = TARGETS[target]
    wanted = set(spec["ports"])
    found = set()
    out = [f"## สร้างโดย tools/make_xdc.py {target} จาก {MASTER.name} ห้ามแก้มือ\n"]
    for line in MASTER.read_text(encoding="utf-8").splitlines(keepends=True):
        m = PORT_RE.search(line)
        if m and line.startswith("#") and m.group(1) in wanted:
            line = line[1:]
            found.add(m.group(1))
        out.append(line)
    missing = wanted - found
    if missing:
        sys.exit(f"ไม่พบ port ใน master: {sorted(missing)}")
    # bank 0 ของ Nexys A7 ใช้ 3.3 V (แก้ DRC CFGBVS-1)
    out.append("\n## Configuration bank voltage\n"
               "set_property CFGBVS VCCO [current_design]\n"
               "set_property CONFIG_VOLTAGE 3.3 [current_design]\n")
    path = ROOT / "constr" / spec["out"]
    path.write_text("".join(out), encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    targets = sys.argv[1:] or list(TARGETS)
    for t in targets:
        build(t)
