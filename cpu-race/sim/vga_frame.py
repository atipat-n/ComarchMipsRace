"""จำลองทั้งบอร์ด (rtl/top.v) แล้วจับภาพหน้าจอ VGA จริงที่วงจรสร้าง เป็น PNG

    python sim/vga_frame.py                        โปรแกรม A, ov=0, วิ่งจนจบ
    python sim/vga_frame.py --prog B --ov 4
    python sim/vga_frame.py --units 900            หยุดกลางทาง (เวลา 900 หน่วย) แล้วถ่าย
    python sim/vga_frame.py --steps 7              ใช้ step mode กด BTNC 7 ครั้งแล้วถ่าย

ผลอยู่ที่ build/frames/*.png
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_all import ROOT, find_tool, compile_tb  # noqa: E402

OUT = ROOT / "build" / "frames"


def rtl_sources():
    files = []
    for d in ("common", "single", "multi", "mem", "race", "io", "vga"):
        files += sorted((ROOT / "rtl" / d).glob("*.v"))
    return files + [ROOT / "rtl" / "clk_gen.v", ROOT / "rtl" / "top.v"]


def compile_top(iverilog, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in (ROOT / "mem").glob("*.mem"):
        shutil.copy(f, out_dir / f.name)
    vvp_file = out_dir / "tb_top.vvp"
    if not compile_tb(iverilog, ROOT / "sim" / "tb_top.v", rtl_sources(), vvp_file, ["-DSIM"]):
        sys.exit(1)
    return vvp_file


def run_top(vvp, vvp_file, cwd, prog=0, ov=0, units=None, steps=None, frame=None):
    cmd = [vvp, "-n", str(vvp_file), f"+PROG={prog}", f"+OV={ov}"]
    if units is not None:
        cmd.append(f"+UNITS={units}")
    if steps is not None:
        cmd.append(f"+STEPS={steps}")
    if frame:
        cmd.append(f"+FRAME={frame}")
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    return r.stdout + r.stderr


def ppm_to_png(ppm, png):
    from PIL import Image
    tok = Path(ppm).read_text().split()
    w, h, mx = int(tok[1]), int(tok[2]), int(tok[3])
    vals = [int(v) * 255 // mx for v in tok[4:]]
    img = Image.frombytes("RGB", (w, h), bytes(vals))
    img.save(png)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--prog", choices=["A", "B"], default="A")
    ap.add_argument("--ov", type=int, default=0)
    ap.add_argument("--units", type=int)
    ap.add_argument("--steps", type=int)
    ap.add_argument("--name")
    args = ap.parse_args()

    iverilog, vvp = find_tool("iverilog"), find_tool("vvp")
    if not (iverilog and vvp):
        sys.exit("ไม่พบ iverilog/vvp")
    vvp_file = compile_top(iverilog, OUT)
    name = args.name or f"prog{args.prog}_ov{args.ov}" + (f"_u{args.units}" if args.units else "") \
        + (f"_s{args.steps}" if args.steps is not None else "")
    out = run_top(vvp, vvp_file, OUT, 0 if args.prog == "A" else 1, args.ov, args.units, args.steps, f"{name}.ppm")
    print(out.strip())
    ppm = OUT / f"{name}.ppm"
    if ppm.exists():
        png = OUT / f"{name}.png"
        ppm_to_png(ppm, png)
        ppm.unlink()
        print(f"png: {png.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
