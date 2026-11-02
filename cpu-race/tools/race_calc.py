"""คำนวณเวลาแข่งที่คาดไว้ (สเปคหัวข้อ 9) ของโปรแกรมใดๆ ที่ ov = 0..15

    python tools/race_calc.py programs/demoA_alu_heavy.s [programs/demoB_mem_heavy.s ...]

โมเดล: single ใช้ 50+ov ต่อคำสั่ง, multi ใช้ 10+ov ต่อ step
เวลาจบ = เวลาของ step สุดท้าย (step แรกเกิดที่เวลา T) => single = N*(50+ov), multi = S*(10+ov)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import asm         # noqa: E402
import ref_model   # noqa: E402

T_STEP = 10
T_SINGLE = 50


def times(retired, steps, ov):
    return retired * (T_SINGLE + ov), steps * (T_STEP + ov)


def analyze(path):
    src = Path(path).read_text(encoding="utf-8")
    prog = asm.assemble(src)
    m = ref_model.Machine(prog.words).run()
    return m


def flip_ov(retired, steps):
    """ov แรกที่ single ชนะ (เวลาน้อยกว่า multi) หรือ None"""
    for ov in range(16):
        s, mt = times(retired, steps, ov)
        if s < mt:
            return ov
    return None


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if not argv:
        sys.exit(__doc__)
    for path in argv:
        m = analyze(path)
        cpi = m.mc_steps / m.retired if m.retired else 0
        print(f"== {path}")
        print(f"   คำสั่ง {m.retired}, step ของ multi {m.mc_steps}, CPI multi {cpi:.3f}, สัดส่วน "
              + ", ".join(f"{k}={v}" for k, v in m.mix.items() if v))
        print("   ov  single  multi   ผล")
        for ov in range(16):
            s, mt = times(m.retired, m.mc_steps, ov)
            res = "multi ชนะ" if mt < s else ("เสมอ" if mt == s else "single ชนะ")
            print(f"   {ov:2d}  {s:6d}  {mt:6d}   {res} ({abs(s - mt)})")
        f = flip_ov(m.retired, m.mc_steps)
        print(f"   => single เริ่มชนะที่ ov = {f}" if f is not None else "   => multi ชนะทุกค่า ov")


if __name__ == "__main__":
    main(sys.argv[1:])
