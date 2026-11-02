"""รันโปรแกรมของเราบน cpuSim V7 ของอาจารย์ (tools/third_party/cpusim_v7) แล้วคืน state ในรูปแบบเดียวกับ ref_model

    python tools/cpusim_adapter.py programs/tests/t_add.s

สิ่งที่ adapter ทำ (สเปคหัวข้อ 2.3, การตัดสินใจ D3):
- แปลง machine code ของเรากลับเป็น assembly ในรูปที่ cpuSim อ่านได้: `ADD $10 $8 $9`, `LW $8 1024($0)`,
  เลขฐานสิบ, ใส่ `.ORG 0` บรรทัดแรก, `j` หาตัวเอง -> `HALT`
- ใส่ค่าใน .data ลง memory ของ cpuSim ก่อนรัน (cpuSim ไม่มี directive .data)
- ครอบ class CPU: เติม SUB/AND/OR/SLT ที่ cpuSim ไม่มี, แก้ ADD ที่ใช้ ops[3], ตัดค่า register ให้อยู่ใน 32 bit
- ไม่แก้ไฟล์ของอาจารย์ และปิด output ที่ cpuSim พิมพ์ระหว่างรัน
- โปรแกรมที่มีคำสั่งที่ไม่รู้จัก (illegal) แปลงไม่ได้ -> คืน None
"""
import contextlib
import io
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "third_party" / "cpusim_v7"))

import asm                 # noqa: E402
import ref_model           # noqa: E402
import cpu as cpusim_cpu   # noqa: E402  (ของอาจารย์)
import memory as cpusim_memory  # noqa: E402

MASK = 0xFFFFFFFF
R_NAMES = {0x20: "ADD", 0x22: "SUB", 0x24: "AND", 0x25: "OR", 0x2A: "SLT"}
PATCHED = {"ADD", "SUB", "AND", "OR", "SLT"}


class Unsupported(Exception):
    pass


def to_cpusim_line(word, addr):
    op, rs, rt, rd = word >> 26, (word >> 21) & 31, (word >> 16) & 31, (word >> 11) & 31
    imm = ref_model.sext16(word)
    if op == 0x00 and (word & 0x3F) in R_NAMES:
        return f"{R_NAMES[word & 0x3F]} ${rd} ${rs} ${rt}"
    if op == 0x08:
        return f"ADDI ${rt} ${rs} {imm}"
    if op == 0x23:
        return f"LW ${rt} {imm}(${rs})"
    if op == 0x2B:
        return f"SW ${rt} {imm}(${rs})"
    if op == 0x04:
        return f"BEQ ${rs} ${rt} {imm}"
    if op == 0x02:
        target = ((addr + 4) & 0xF0000000) | ((word & 0x3FFFFFF) << 2)
        return "HALT" if target == addr else f"J {target}"
    raise Unsupported(f"0x{addr:04x}: 0x{word:08x} cpuSim ไม่รองรับ")


class PatchedCPU(cpusim_cpu.CPU):
    MAX_INSTR = 100000

    def __init__(self, *a, **kw):
        self.retired = 0
        super().__init__(*a, **kw)

    def execute(self, instr):
        op, o = instr.opcode, instr.operands
        r = self.registers
        if op in PATCHED:
            rd, rs, rt = o[0], o[1], o[2]
            a, b = r[rs] & MASK, r[rt] & MASK
            if op == "ADD":
                v = a + b
            elif op == "SUB":
                v = a - b
            elif op == "AND":
                v = a & b
            elif op == "OR":
                v = a | b
            else:
                v = 1 if ref_model.signed32(a) < ref_model.signed32(b) else 0
            r[rd] = v & MASK
        else:
            super().execute(instr)
        for i in range(32):
            r[i] &= MASK
        r[0] = 0
        if op not in (".ORG", "HALT"):
            self.retired += 1
            if self.retired > self.MAX_INSTR:
                raise RuntimeError("cpuSim รันเกินจำนวนคำสั่งที่กำหนด")


def run_words(words, text_words):
    """คืน (state text แบบ ref_model.format_state, รายการบรรทัดที่ส่งให้ cpuSim) หรือ raise Unsupported"""
    lines = [".ORG 0"] + [to_cpusim_line(words[i], i * 4) for i in range(text_words)]
    if "HALT" not in lines:
        lines.append("HALT")
    mem = cpusim_memory.Memory()
    for i in range(256, 512):
        if words[i]:
            mem.write(i * 4, words[i])
    with contextlib.redirect_stdout(io.StringIO()):
        c = PatchedCPU(lines, mem)
        c.run()
    dmem = [mem.read(a) & MASK for a in range(0x400, 0x800, 4)]
    return ref_model.format_state(c.registers, dmem, c.retired), lines


def run_source(src):
    prog = asm.assemble(src)
    return run_words(prog.words, prog.text_words)


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if not argv:
        sys.exit(__doc__)
    for path in argv:
        try:
            state, lines = run_source(Path(path).read_text(encoding="utf-8"))
        except Unsupported as e:
            print(f"{path}: ข้าม ({e})")
            continue
        print(f"== {path}  (ส่งให้ cpuSim {len(lines)} บรรทัด)")
        for l in lines:
            print(f"   {l}")
        print("".join(l + "\n" for l in state.splitlines()[:33] if not l.endswith(" 00000000") or l.startswith("retired")))


if __name__ == "__main__":
    main(sys.argv[1:])
