"""Assembler ของ ISA ในสเปคหัวข้อ 6 -> ไฟล์ .mem 512 บรรทัด (hex 8 หลักต่อบรรทัด)

layout ของ .mem ตาม memory map (หัวข้อ 6.1):
    บรรทัด 0..255   = .text  (byte 0x000-0x3FF)
    บรรทัด 256..511 = .data  (byte 0x400-0x7FF)

ใช้เป็น CLI:
    python tools/asm.py programs/tests/t_add.s -o build/t_add.mem [--listing]
ใช้เป็น library:
    from asm import assemble; prog = assemble(source_text)

ไวยากรณ์:
    # comment (หรือ ;)
    label:  add $t0, $t1, $t2      ชื่อ register หรือ $8 ก็ได้ ลูกน้ำใส่หรือไม่ใส่ก็ได้
    .text / .data                  สลับ section
    .word 1, 0x10, -3, label       ใส่ word ทีละตัว
    .space 16                      จองที่ (byte, ต้องหาร 4 ลงตัว) ค่าเป็น 0
    pseudo: nop (= add $0,$0,$0), halt (= j ตัวเอง)
    immediate รับเลขฐาน 10, 0x.., 0b.. และชื่อ label (ได้ address แบบ byte)
"""
import argparse
import re
import sys
from pathlib import Path

TEXT_BASE = 0x000
DATA_BASE = 0x400
WORDS_PER_SECTION = 256
MEM_WORDS = 512

REG_NAMES = {
    "zero": 0, "at": 1, "v0": 2, "v1": 3, "a0": 4, "a1": 5, "a2": 6, "a3": 7,
    "t0": 8, "t1": 9, "t2": 10, "t3": 11, "t4": 12, "t5": 13, "t6": 14, "t7": 15,
    "s0": 16, "s1": 17, "s2": 18, "s3": 19, "s4": 20, "s5": 21, "s6": 22, "s7": 23,
    "t8": 24, "t9": 25, "k0": 26, "k1": 27, "gp": 28, "sp": 29, "fp": 30, "ra": 31,
}
REG_NUM_TO_NAME = {v: k for k, v in REG_NAMES.items()}

R_FUNCT = {"add": 0x20, "sub": 0x22, "and": 0x24, "or": 0x25, "slt": 0x2A}
OPCODE = {"addi": 0x08, "lw": 0x23, "sw": 0x2B, "beq": 0x04, "j": 0x02}
MNEMONICS = set(R_FUNCT) | set(OPCODE) | {"nop", "halt"}


class AsmError(Exception):
    pass


class Program:
    def __init__(self):
        self.words = [0] * MEM_WORDS
        self.symbols = {}
        self.listing = []        # (byte_addr, word, source_line)
        self.text_words = 0
        self.data_words = 0


def parse_reg(tok, line_no):
    t = tok.strip()
    if not t.startswith("$"):
        raise AsmError(f"line {line_no}: ต้องเป็น register แต่ได้ '{tok}'")
    name = t[1:].lower()
    if name.isdigit():
        n = int(name)
        if 0 <= n <= 31:
            return n
    elif name in REG_NAMES:
        return REG_NAMES[name]
    raise AsmError(f"line {line_no}: ไม่รู้จัก register '{tok}'")


def parse_int(tok, symbols, line_no):
    t = tok.strip()
    if t in symbols:
        return symbols[t]
    try:
        return int(t, 0)
    except ValueError:
        raise AsmError(f"line {line_no}: ตัวเลขหรือ label ไม่ถูกต้อง '{tok}'")


def imm16(value, line_no, what="immediate"):
    if not -0x8000 <= value <= 0xFFFF:
        raise AsmError(f"line {line_no}: {what} {value} เกิน 16 bit")
    return value & 0xFFFF


def split_operands(rest):
    rest = rest.strip()
    if not rest:
        return []
    return [p for p in re.split(r"[,\s]+", rest) if p]


def strip_comment(line):
    return re.split(r"[#;]", line, maxsplit=1)[0]


def tokenize(src):
    """คืน list ของ (line_no, labels, body) body อาจว่าง"""
    out = []
    for i, raw in enumerate(src.splitlines(), start=1):
        line = strip_comment(raw).strip()
        labels = []
        while True:
            m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$", line)
            if not m:
                break
            labels.append(m.group(1))
            line = m.group(2).strip()
        out.append((i, labels, line, raw.rstrip()))
    return out


def assemble(src):
    lines = tokenize(src)
    prog = Program()

    # ---------- pass 1: หา address ของ label ----------
    section = "text"
    loc = {"text": TEXT_BASE, "data": DATA_BASE}
    for line_no, labels, body, _ in lines:
        for lb in labels:
            if lb in prog.symbols:
                raise AsmError(f"line {line_no}: label '{lb}' ซ้ำ")
            prog.symbols[lb] = loc[section]
        if not body:
            continue
        head = body.split()[0].lower()
        if head == ".text":
            section = "text"
        elif head == ".data":
            section = "data"
        elif head == ".word":
            loc[section] += 4 * len(split_operands(body[len(".word"):]))
        elif head == ".space":
            n = int(body.split()[1], 0)
            if n % 4:
                raise AsmError(f"line {line_no}: .space ต้องหาร 4 ลงตัว")
            loc[section] += n
        elif head in MNEMONICS:
            if section != "text":
                raise AsmError(f"line {line_no}: คำสั่งต้องอยู่ใน .text")
            loc[section] += 4
        else:
            raise AsmError(f"line {line_no}: ไม่รู้จัก '{head}'")

    if loc["text"] > TEXT_BASE + 4 * WORDS_PER_SECTION:
        raise AsmError(".text เกิน 256 word")
    if loc["data"] > DATA_BASE + 4 * WORDS_PER_SECTION:
        raise AsmError(".data เกิน 256 word")

    # ---------- pass 2: สร้าง machine code ----------
    section = "text"
    loc = {"text": TEXT_BASE, "data": DATA_BASE}

    def emit(word, raw):
        addr = loc[section]
        prog.words[addr // 4] = word & 0xFFFFFFFF
        prog.listing.append((addr, word & 0xFFFFFFFF, raw))
        loc[section] += 4

    for line_no, labels, body, raw in lines:
        if not body:
            continue
        parts = body.split(None, 1)
        head = parts[0].lower()
        rest = parts[1] if len(parts) > 1 else ""
        ops = split_operands(rest)

        if head == ".text":
            section = "text"
            continue
        if head == ".data":
            section = "data"
            continue
        if head == ".word":
            for o in ops:
                emit(parse_int(o, prog.symbols, line_no), raw)
            continue
        if head == ".space":
            for _ in range(int(ops[0], 0) // 4):
                emit(0, raw)
            continue

        pc = loc[section]

        def need(n):
            if len(ops) != n:
                raise AsmError(f"line {line_no}: '{head}' ต้องมี {n} operand แต่ได้ {len(ops)}")

        if head in R_FUNCT:
            need(3)
            rd, rs, rt = (parse_reg(o, line_no) for o in ops)
            word = (rs << 21) | (rt << 16) | (rd << 11) | R_FUNCT[head]
        elif head == "nop":
            need(0)
            word = R_FUNCT["add"]
        elif head == "addi":
            need(3)
            rt, rs = parse_reg(ops[0], line_no), parse_reg(ops[1], line_no)
            imm = imm16(parse_int(ops[2], prog.symbols, line_no), line_no)
            word = (OPCODE["addi"] << 26) | (rs << 21) | (rt << 16) | imm
        elif head in ("lw", "sw"):
            m = re.match(r"^\s*(\$\w+)\s*,?\s*([^(]*)\(\s*(\$\w+)\s*\)\s*$", rest)
            if not m:
                raise AsmError(f"line {line_no}: รูปแบบต้องเป็น {head} $rt, off($rs)")
            rt = parse_reg(m.group(1), line_no)
            off_tok = m.group(2).strip() or "0"
            off = imm16(parse_int(off_tok, prog.symbols, line_no), line_no, "offset")
            rs = parse_reg(m.group(3), line_no)
            word = (OPCODE[head] << 26) | (rs << 21) | (rt << 16) | off
        elif head == "beq":
            need(3)
            rs, rt = parse_reg(ops[0], line_no), parse_reg(ops[1], line_no)
            target = parse_int(ops[2], prog.symbols, line_no)
            diff = target - (pc + 4)
            if diff % 4:
                raise AsmError(f"line {line_no}: เป้าหมาย branch ไม่ลงตัว word")
            off = diff // 4
            if not -0x8000 <= off <= 0x7FFF:
                raise AsmError(f"line {line_no}: branch ไกลเกิน")
            word = (OPCODE["beq"] << 26) | (rs << 21) | (rt << 16) | (off & 0xFFFF)
        elif head in ("j", "halt"):
            if head == "halt":
                need(0)
                target = pc
            else:
                need(1)
                target = parse_int(ops[0], prog.symbols, line_no)
            if target % 4:
                raise AsmError(f"line {line_no}: เป้าหมาย jump ไม่ลงตัว word")
            if (target & 0xF0000000) != ((pc + 4) & 0xF0000000):
                raise AsmError(f"line {line_no}: jump ข้าม region 256 MB")
            word = (OPCODE["j"] << 26) | ((target >> 2) & 0x3FFFFFF)
        else:
            raise AsmError(f"line {line_no}: ไม่รู้จัก '{head}'")
        emit(word, raw)

    prog.text_words = (loc["text"] - TEXT_BASE) // 4
    prog.data_words = (loc["data"] - DATA_BASE) // 4
    return prog


def write_mem(prog, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(f"{w:08x}\n" for w in prog.words), encoding="ascii")


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="MIPS subset assembler -> .mem")
    ap.add_argument("src")
    ap.add_argument("-o", "--out", help="ไฟล์ .mem (ค่าเริ่มต้น: ชื่อเดียวกับ src)")
    ap.add_argument("--listing", action="store_true", help="พิมพ์ address/machine code/source")
    args = ap.parse_args(argv)

    src = Path(args.src).read_text(encoding="utf-8")
    try:
        prog = assemble(src)
    except AsmError as e:
        sys.exit(f"{args.src}: {e}")
    out = args.out or str(Path(args.src).with_suffix(".mem"))
    write_mem(prog, out)
    if args.listing:
        for addr, word, raw in prog.listing:
            print(f"{addr:04x}  {word:08x}  {raw.strip()}")
    print(f"{args.src}: text={prog.text_words} words, data={prog.data_words} words -> {out}")


if __name__ == "__main__":
    main()
