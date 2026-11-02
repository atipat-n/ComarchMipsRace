"""ดูโปรแกรมหนึ่งตัววิ่งบน CPU ทีละ step (เหมาะกับการเรียนรู้และ debug)

    python sim/trace.py programs/examples/ex_lw_add.s                 ทั้ง single และ multi
    python sim/trace.py programs/examples/ex_lw_add.s --core multi    เฉพาะ multicycle
    python sim/trace.py my.s --reg 10                                 โชว์ค่า $10 ในทุกบรรทัด
    python sim/trace.py my.s --vcd                                    เขียน waveform ไว้เปิดด้วย GTKWave

ผลลัพธ์อยู่ใน build/trace/
"""
import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_all import ROOT, CORES, asm, ref_model, find_tool, compile_tb  # noqa: E402

OUT = ROOT / "build" / "trace"
STATE_NAMES = ["FETCH", "DECODE", "MEM_ADDR", "MEM_READ", "MEM_WB", "MEM_WRITE",
               "EXECUTE", "ALU_WB", "BRANCH", "JUMP", "ADDI_EXEC", "ADDI_WB"]


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="trace โปรแกรมบน single/multi")
    ap.add_argument("src", help="ไฟล์ .s")
    ap.add_argument("--core", choices=["single", "multi", "both"], default="both")
    ap.add_argument("--reg", default="8", help="register ที่จะโชว์ทุกบรรทัด เช่น 10 หรือ $t2 (ค่าเริ่มต้น $8 = $t0)")
    ap.add_argument("--vcd", action="store_true", help="เขียนไฟล์ .vcd ไว้ดูด้วย GTKWave")
    args = ap.parse_args(argv)

    src_path = Path(args.src)
    try:
        prog = asm.assemble(src_path.read_text(encoding="utf-8"))
    except asm.AsmError as e:
        sys.exit(f"{src_path}: {e}")
    reg = asm.parse_reg(args.reg if args.reg.startswith("$") else f"${args.reg}", 0)

    OUT.mkdir(parents=True, exist_ok=True)
    name = src_path.stem
    mem = OUT / f"{name}.mem"
    asm.write_mem(prog, mem)

    print(f"== {src_path}  (โชว์ ${reg} = ${asm.REG_NUM_TO_NAME[reg]})")
    print("-- machine code")
    for addr, word, raw in prog.listing:
        print(f"   {addr:04x}  {word:08x}  {raw.strip()}")

    try:
        m = ref_model.Machine(prog.words).run()
    except ref_model.ModelError as e:
        sys.exit(f"ref_model: {e}")
    print(f"-- ref_model: retired={m.retired} คำสั่ง, multicycle ใช้ {m.mc_steps} step, สัดส่วน {m.mix}")

    iverilog, vvp = find_tool("iverilog"), find_tool("vvp")
    if not (iverilog and vvp):
        sys.exit("ไม่พบ iverilog/vvp (ดู docs/manual.md หัวข้อติดตั้ง)")

    cores = ["single", "multi"] if args.core == "both" else [args.core]
    for core in cores:
        defines, sources, _ = CORES[core]
        vvp_file = OUT / f"tb_{core}.vvp"
        if not compile_tb(iverilog, ROOT / "sim" / "tb_cpu.v", sources, vvp_file, defines):
            sys.exit(1)
        cmd = [vvp, "-n", str(vvp_file), f"+MEM={mem.name}", f"+OUT={name}.{core}.state", "+TRACE", f"+REG={reg}"]
        if args.vcd:
            cmd.append(f"+VCD={name}.{core}.vcd")
        r = subprocess.run(cmd, capture_output=True, text=True, cwd=OUT)
        print(f"\n-- {core}")
        for line in r.stdout.splitlines():
            if line.startswith("cycle") and core == "multi":
                s = int(line.split("state=S")[1].split()[0])
                line = line.replace(f"state=S{s:<2d}", f"S{s:<2d} {STATE_NAMES[s]:<9}")
            elif line.startswith("cycle"):
                line = line.replace("state=S0   ", "")
            if "$finish" not in line:
                print("   " + line)
        if args.vcd:
            print(f"   waveform: {(OUT / f'{name}.{core}.vcd').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
