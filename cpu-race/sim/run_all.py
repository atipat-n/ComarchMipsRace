"""รันการทดสอบทั้งหมด (สเปคหัวข้อ 14) ใช้ได้ทั้ง Windows และ Linux

    python sim/run_all.py              ทุกโปรแกรม
    python sim/run_all.py t_add t_slt  เฉพาะบางตัว (ชื่อไฟล์ไม่ต้องมี .s)

แต่ละโปรแกรมใน programs/ และ programs/tests/:
  1. assemble ด้วย tools/asm.py -> build/sim/<name>.mem
  2. รัน tools/ref_model.py แล้วเช็กกับบรรทัด `#! expect ...` ในไฟล์ .s
  3. รัน tb_cpu ของ single-cycle และ multicycle ด้วย Icarus Verilog แล้ว
     - เทียบ state (retired + register + data memory) ทั้งไฟล์กับ ref_model
     - เช็กจำนวน en ที่ใช้: single = จำนวนคำสั่ง, multi = จำนวน step ตามสเปคหัวข้อ 8.3
ถ้าไม่มี iverilog ข้อ 3 จะถูกข้าม (และรายงานว่าข้าม)
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import asm         # noqa: E402
import ref_model   # noqa: E402

BUILD = ROOT / "build" / "sim"
RTL_COMMON = sorted((ROOT / "rtl" / "common").glob("*.v"))
RTL_MEM = [ROOT / "rtl" / "mem" / "lutram.v"]
CORES = {
    # ชื่อ: (define ของ tb_cpu, ไฟล์ RTL, ฟังก์ชันคำนวณ cycles ที่ควรได้จาก ref_model)
    "single": ([], RTL_COMMON + RTL_MEM + sorted((ROOT / "rtl" / "single").glob("*.v")), lambda m: m.retired),
    "multi": (["-DMULTI"], RTL_COMMON + RTL_MEM + sorted((ROOT / "rtl" / "multi").glob("*.v")), lambda m: m.mc_steps),
}

EXPECT_RE = re.compile(r"^#!\s*expect\s+(.+?)\s*=\s*(\S+)\s*$")
CYCLES_RE = re.compile(r"cycles=(\d+)")


def rel(p):
    return Path(p).resolve().relative_to(ROOT).as_posix()


def find_tool(name):
    found = shutil.which(name)
    if found:
        return found
    for cand in (Path("C:/iverilog/bin") / f"{name}.exe", Path("C:/Program Files/iverilog/bin") / f"{name}.exe"):
        if cand.exists():
            return str(cand)
    return None


def compile_tb(iverilog, tb, sources, out, defines=()):
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [iverilog, "-g2001", "-Wall", "-Wno-timescale", *defines, "-o", str(out), str(tb)] + [str(s) for s in sources]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    msg = (r.stdout + r.stderr).strip()
    label = f"{rel(tb)} {' '.join(defines)}".strip()
    if r.returncode != 0:
        print(f"[FAIL] compile {label}\n{msg}")
        return False
    if msg:
        print(f"[warn] compile {label}:\n  " + "\n  ".join(msg.splitlines()))
    return True


def parse_expects(src):
    out = []
    for line in src.splitlines():
        m = EXPECT_RE.match(line.strip())
        if m:
            out.append((m.group(1).strip(), int(m.group(2), 0) & 0xFFFFFFFF))
    return out


def check_expects(expects, m, symbols):
    errors = []
    for key, want in expects:
        if key in ("retired", "steps", "illegal"):
            got = {"retired": m.retired, "steps": m.mc_steps, "illegal": m.illegal}[key]
        elif key.startswith("$"):
            got = m.regs[asm.parse_reg(key, 0)]
        elif key.startswith("mem[") and key.endswith("]"):
            inner = key[4:-1]
            addr = symbols[inner] if inner in symbols else int(inner, 0)
            got = m.mem[addr // 4]
        else:
            errors.append(f"ไม่รู้จัก expect '{key}'")
            continue
        if got != want:
            errors.append(f"{key}: ได้ 0x{got:08x} ({got}) แต่คาด 0x{want:08x} ({want})")
    return errors


def diff_states(a, b, limit=8):
    la, lb = a.splitlines(), b.splitlines()
    diffs = [f"  ref: {x:<22} rtl: {y}" for x, y in zip(la, lb) if x != y]
    if len(la) != len(lb):
        diffs.append(f"  จำนวนบรรทัดต่างกัน ref={len(la)} rtl={len(lb)}")
    return diffs[:limit] + ([f"  ... อีก {len(diffs) - limit} บรรทัด"] if len(diffs) > limit else [])


def run_core(vvp, core, name, mem_path, m, ref_state):
    """คืน (ป้ายสั้น, list ของปัญหา)"""
    vvp_file = BUILD / f"tb_{core}.vvp"
    out = BUILD / f"{name}.{core}.state"
    out.unlink(missing_ok=True)
    r = subprocess.run([vvp, "-n", str(vvp_file), f"+MEM={mem_path.name}", f"+OUT={out.name}"],
                       capture_output=True, text=True, cwd=BUILD)
    if "TIMEOUT" in r.stdout or not out.exists():
        return f"{core}:ERR", [f"{core}: " + (r.stdout + r.stderr).strip()]
    problems = []
    d = diff_states(ref_state, out.read_text(encoding="ascii"))
    if d:
        problems.append(f"{core} ไม่ตรง ref_model:\n" + "\n".join(d))
    cm = CYCLES_RE.search(r.stdout)
    want = CORES[core][2](m)
    got = int(cm.group(1)) if cm else -1
    if got != want:
        problems.append(f"{core}: ใช้ {got} cycle แต่ ref_model คาด {want}")
    return (f"{core}!=ref" if problems else f"{core}=ref"), problems


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    BUILD.mkdir(parents=True, exist_ok=True)
    programs = (sorted((ROOT / "programs" / "tests").glob("*.s")) + sorted((ROOT / "programs" / "examples").glob("*.s"))
                + sorted((ROOT / "programs").glob("*.s")))
    if argv:
        programs = [p for p in programs if p.stem in argv]
        if not programs:
            sys.exit(f"ไม่พบโปรแกรม {argv}")

    iverilog, vvp = find_tool("iverilog"), find_tool("vvp")
    fails = 0

    cores_ok = []
    if iverilog and vvp:
        if compile_tb(iverilog, ROOT / "sim" / "tb_common.v", RTL_COMMON, BUILD / "tb_common.vvp"):
            r = subprocess.run([vvp, "-n", str(BUILD / "tb_common.vvp")], capture_output=True, text=True, cwd=BUILD)
            ok = "ALL PASS" in r.stdout
            print(f"[{'PASS' if ok else 'FAIL'}] tb_common (alu, alu_control, regfile, sign_ext)")
            if not ok:
                print(r.stdout + r.stderr)
                fails += 1
        else:
            fails += 1
        for core, (defines, sources, _) in CORES.items():
            if compile_tb(iverilog, ROOT / "sim" / "tb_cpu.v", sources, BUILD / f"tb_{core}.vvp", defines):
                cores_ok.append(core)
            else:
                fails += 1
    else:
        print("[skip] ไม่พบ iverilog/vvp: ข้ามการรัน RTL (ทำแค่ asm + ref_model + expect)")

    for src_path in programs:
        name = src_path.stem
        src = src_path.read_text(encoding="utf-8")
        problems = []
        try:
            prog = asm.assemble(src)
        except asm.AsmError as e:
            print(f"[FAIL] {name}: assemble: {e}")
            fails += 1
            continue
        mem_path = BUILD / f"{name}.mem"
        asm.write_mem(prog, mem_path)

        try:
            m = ref_model.Machine(prog.words).run()
        except ref_model.ModelError as e:
            print(f"[FAIL] {name}: ref_model: {e}")
            fails += 1
            continue
        ref_state = ref_model.machine_state(m)
        (BUILD / f"{name}.ref.state").write_text(ref_state, encoding="ascii")

        expects = parse_expects(src)
        problems += [f"expect {e}" for e in check_expects(expects, m, prog.symbols)]

        notes = []
        for core in cores_ok:
            note, p = run_core(vvp, core, name, mem_path, m, ref_state)
            notes.append(note)
            problems += p
        if not cores_ok:
            notes.append("rtl skipped")

        status = "FAIL" if problems else "PASS"
        print(f"[{status}] {name:<18} retired={m.retired:<5} mc_steps={m.mc_steps:<5} expects={len(expects):<3} {' '.join(notes)}")
        for p in problems:
            print("       " + p.replace("\n", "\n       "))
        fails += bool(problems)

    print("-" * 60)
    print("ALL PASS" if fails == 0 else f"{fails} FAIL")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
