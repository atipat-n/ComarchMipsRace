"""สร้างไฟล์ทั้งหมดใน mem/ ที่ RTL ใช้ตอน synthesize (รันทุกครั้งที่แก้โปรแกรม demo หรือหน้าจอ)

    python tools/build_mems.py

  programs/demoA_alu_heavy.s -> mem/progA.mem
  programs/demoB_mem_heavy.s -> mem/progB.mem
  mem/font.mem  (tools/gen_font.py, ข้ามได้ด้วย --keep-font)
  mem/bg.mem, mem/text.mem (tools/gen_screen.py)
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import asm   # noqa: E402

DEMOS = {"progA.mem": "programs/demoA_alu_heavy.s", "progB.mem": "programs/demoB_mem_heavy.s"}


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    for out, src in DEMOS.items():
        prog = asm.assemble((ROOT / src).read_text(encoding="utf-8"))
        asm.write_mem(prog, ROOT / "mem" / out)
        print(f"wrote mem/{out} <- {src} (text {prog.text_words} words, data {prog.data_words} words)")
    if "--keep-font" not in argv:
        subprocess.run([sys.executable, str(ROOT / "tools" / "gen_font.py")], check=True)
    subprocess.run([sys.executable, str(ROOT / "tools" / "gen_screen.py")], check=True)


if __name__ == "__main__":
    main(sys.argv[1:])
