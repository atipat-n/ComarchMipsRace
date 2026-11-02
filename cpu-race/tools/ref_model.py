"""Reference model ของ ISA ในสเปคหัวข้อ 6 รันจาก memory image (.mem 512 word) แบบเดียวกับฮาร์ดแวร์

ใช้เทียบผลกับ RTL (และกับ cpuSim ผ่าน cpusim_adapter ในอนาคต)
    python tools/ref_model.py build/t_add.mem [--trace] [-o out.state]

พฤติกรรมที่ต้องตรงกับ RTL:
- PC เริ่ม 0, $0 = 0 เสมอ, ไม่มี overflow exception
- halt = `j` ที่กระโดดหาตัวเอง: หยุดก่อนรันคำสั่งนั้น และไม่นับ retired
- คำสั่งที่ไม่รู้จัก = NOP (นับ retired) และนับใน illegal
- lw/sw ต้องอยู่ในช่วง 0x400-0x7FF และลงตัว word ไม่อย่างนั้นถือว่าโปรแกรมผิด (RTL สองแบบจะให้ผลต่างกัน)
- step ของ multicycle (หัวข้อ 8.3): lw 5, sw/R/addi 4, beq/j 3, illegal 2 (FETCH+DECODE)
"""
import argparse
import sys
from pathlib import Path

MASK = 0xFFFFFFFF
MEM_WORDS = 512
DATA_BASE = 0x400
DATA_END = 0x800
TEXT_END = 0x400

R_FUNCT = {0x20: "add", 0x22: "sub", 0x24: "and", 0x25: "or", 0x2A: "slt"}
MC_STEPS = {"R": 4, "addi": 4, "lw": 5, "sw": 4, "beq": 3, "j": 3, "illegal": 2}


class ModelError(Exception):
    pass


def sext16(v):
    v &= 0xFFFF
    return v - 0x10000 if v & 0x8000 else v


def signed32(v):
    v &= MASK
    return v - (1 << 32) if v & 0x80000000 else v


def load_mem(path):
    words = []
    for line in Path(path).read_text(encoding="ascii").splitlines():
        line = line.split("//")[0].strip()
        if line:
            words.append(int(line, 16))
    if len(words) > MEM_WORDS:
        raise ModelError(f"{path}: เกิน {MEM_WORDS} word")
    return words + [0] * (MEM_WORDS - len(words))


def classify(word):
    """คืนชื่อกลุ่มคำสั่งสำหรับนับ step ของ multicycle"""
    op = word >> 26
    if op == 0x00:
        return "R" if (word & 0x3F) in R_FUNCT else "illegal"
    return {0x08: "addi", 0x23: "lw", 0x2B: "sw", 0x04: "beq", 0x02: "j"}.get(op, "illegal")


class Machine:
    def __init__(self, mem_words):
        self.mem = list(mem_words)
        self.regs = [0] * 32
        self.pc = 0
        self.retired = 0
        self.mc_steps = 0
        self.illegal = 0
        self.mix = {k: 0 for k in MC_STEPS}
        self.done = False

    def _data_index(self, addr):
        if addr % 4 or not DATA_BASE <= addr < DATA_END:
            raise ModelError(f"PC=0x{self.pc:04x}: เข้าถึงข้อมูลที่ 0x{addr:08x} นอกช่วง 0x400-0x7FF หรือไม่ลงตัว word")
        return addr // 4

    def step(self):
        """รันหนึ่งคำสั่ง คืน text อธิบาย หรือ None ถ้าเจอ halt"""
        if self.pc % 4 or not 0 <= self.pc < TEXT_END:
            raise ModelError(f"PC=0x{self.pc:08x} ออกนอกช่วงโปรแกรม 0x000-0x3FF")
        w = self.mem[self.pc // 4]
        op, rs, rt, rd = w >> 26, (w >> 21) & 31, (w >> 16) & 31, (w >> 11) & 31
        imm = sext16(w)
        pc4 = (self.pc + 4) & MASK
        kind = classify(w)

        if kind == "j":
            target = (pc4 & 0xF0000000) | ((w & 0x3FFFFFF) << 2)
            if target == self.pc:
                self.done = True
                return None

        r = self.regs
        next_pc = pc4
        wreg = None
        desc = kind
        if kind == "R":
            f = R_FUNCT[w & 0x3F]
            a, b = r[rs], r[rt]
            if f == "add":
                val = a + b
            elif f == "sub":
                val = a - b
            elif f == "and":
                val = a & b
            elif f == "or":
                val = a | b
            else:
                val = 1 if signed32(a) < signed32(b) else 0
            wreg = (rd, val)
            desc = f"{f} ${rd}, ${rs}, ${rt}"
        elif kind == "addi":
            wreg = (rt, r[rs] + imm)
            desc = f"addi ${rt}, ${rs}, {imm}"
        elif kind == "lw":
            wreg = (rt, self.mem[self._data_index((r[rs] + imm) & MASK)])
            desc = f"lw ${rt}, {imm}(${rs})"
        elif kind == "sw":
            self.mem[self._data_index((r[rs] + imm) & MASK)] = r[rt]
            desc = f"sw ${rt}, {imm}(${rs})"
        elif kind == "beq":
            if r[rs] == r[rt]:
                next_pc = (pc4 + (imm << 2)) & MASK
            desc = f"beq ${rs}, ${rt}, {imm}"
        elif kind == "j":
            next_pc = (pc4 & 0xF0000000) | ((w & 0x3FFFFFF) << 2)
            desc = f"j 0x{next_pc:x}"
        else:
            self.illegal += 1
            desc = f"illegal 0x{w:08x} (NOP)"

        if wreg and wreg[0] != 0:
            r[wreg[0]] = wreg[1] & MASK
        self.pc = next_pc
        self.retired += 1
        self.mc_steps += MC_STEPS[kind]
        self.mix[kind] += 1
        return desc

    def run(self, max_instr=100000, trace=None):
        while not self.done:
            if self.retired >= max_instr:
                raise ModelError(f"รันเกิน {max_instr} คำสั่งแล้วยังไม่เจอ halt")
            pc = self.pc
            desc = self.step()
            if trace and desc is not None:
                trace(f"{pc:04x}: {desc}")
        return self


def format_state(regs, dmem, retired):
    """รูปแบบเดียวกับที่ testbench เขียนออกมา ใช้ diff กันได้ทั้งไฟล์"""
    lines = [f"retired {retired}"]
    lines += [f"r{i:02d} {regs[i] & MASK:08x}" for i in range(32)]
    lines += [f"m{DATA_BASE + 4 * i:04x} {dmem[i] & MASK:08x}" for i in range(len(dmem))]
    return "\n".join(lines) + "\n"


def run_file(path, max_instr=100000, trace=None):
    return Machine(load_mem(path)).run(max_instr, trace)


def machine_state(m):
    return format_state(m.regs, m.mem[DATA_BASE // 4:DATA_END // 4], m.retired)


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="reference model ของ CPU Race ISA")
    ap.add_argument("mem")
    ap.add_argument("-o", "--out", help="เขียน state (รูปแบบเดียวกับ testbench)")
    ap.add_argument("--trace", action="store_true")
    ap.add_argument("--max", type=int, default=100000)
    args = ap.parse_args(argv)
    try:
        m = run_file(args.mem, args.max, print if args.trace else None)
    except ModelError as e:
        sys.exit(f"{args.mem}: {e}")
    state = machine_state(m)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(state, encoding="ascii")
    print(f"retired={m.retired} mc_steps={m.mc_steps} illegal={m.illegal} mix={m.mix}")
    for i in range(0, 32, 8):
        print("  " + " ".join(f"${j:<2}={m.regs[j]:08x}" for j in range(i, i + 8)))


if __name__ == "__main__":
    main()
