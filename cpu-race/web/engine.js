/* CPU Race engine: assembler + reference model + single-cycle + multicycle + race control
 * ทำงานเหมือน RTL ใน rtl/ ทุกจังหวะ (ทดสอบเทียบกับ Python/Verilog ด้วย sim/test_web.js)
 * ใช้ได้ทั้งในเบราว์เซอร์ (window.CPURace) และ Node (require)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CPURace = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const u32 = (v) => v >>> 0;
  const s32 = (v) => v | 0;
  const sext16 = (v) => ((v & 0x8000) ? (v & 0xffff) - 0x10000 : (v & 0xffff));

  const TEXT_BASE = 0x000;
  const DATA_BASE = 0x400;
  const MEM_WORDS = 512;

  const REG_NAMES = ['zero', 'at', 'v0', 'v1', 'a0', 'a1', 'a2', 'a3',
    't0', 't1', 't2', 't3', 't4', 't5', 't6', 't7',
    's0', 's1', 's2', 's3', 's4', 's5', 's6', 's7',
    't8', 't9', 'k0', 'k1', 'gp', 'sp', 'fp', 'ra'];
  const REG_NUM = Object.fromEntries(REG_NAMES.map((n, i) => [n, i]));

  const R_FUNCT = { add: 0x20, sub: 0x22, and: 0x24, or: 0x25, slt: 0x2a };
  const FUNCT_NAME = Object.fromEntries(Object.entries(R_FUNCT).map(([k, v]) => [v, k]));
  const OPCODE = { addi: 0x08, lw: 0x23, sw: 0x2b, beq: 0x04, j: 0x02 };
  const MNEMONICS = new Set([...Object.keys(R_FUNCT), ...Object.keys(OPCODE), 'nop', 'halt']);
  const MC_STEPS = { R: 4, addi: 4, lw: 5, sw: 4, beq: 3, j: 3, illegal: 2 };

  const STATE_NAMES = ['FETCH', 'DECODE', 'MEM_ADDR', 'MEM_READ', 'MEM_WB', 'MEM_WRITE',
    'EXECUTE', 'ALU_WB', 'BRANCH', 'JUMP', 'ADDI_EXEC', 'ADDI_WB'];

  // ---------------------------------------------------------------- assembler (port ของ tools/asm.py)
  class AsmError extends Error {
    constructor(line, msg) { super(`บรรทัด ${line}: ${msg}`); this.line = line; this.short = msg; }
  }

  function parseNumber(t) {
    const s = t.trim();
    const m = /^([+-]?)(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+)$/i.exec(s);
    if (!m) return null;
    const body = m[2].toLowerCase();
    let v;
    if (body.startsWith('0x')) v = parseInt(body.slice(2), 16);
    else if (body.startsWith('0b')) v = parseInt(body.slice(2), 2);
    else if (body.startsWith('0o')) v = parseInt(body.slice(2), 8);
    else v = parseInt(body, 10);
    return m[1] === '-' ? -v : v;
  }

  function parseReg(tok, line) {
    const t = tok.trim();
    if (!t.startsWith('$')) throw new AsmError(line, `ต้องเป็น register แต่ได้ '${tok}'`);
    const name = t.slice(1).toLowerCase();
    if (/^\d+$/.test(name)) {
      const n = parseInt(name, 10);
      if (n >= 0 && n <= 31) return n;
    } else if (name in REG_NUM) return REG_NUM[name];
    throw new AsmError(line, `ไม่รู้จัก register '${tok}'`);
  }

  function parseInt2(tok, symbols, line) {
    const t = tok.trim();
    if (Object.prototype.hasOwnProperty.call(symbols, t)) return symbols[t];
    const v = parseNumber(t);
    if (v === null || Number.isNaN(v)) throw new AsmError(line, `ตัวเลขหรือ label ไม่ถูกต้อง '${tok}'`);
    return v;
  }

  function imm16(v, line, what) {
    if (v < -0x8000 || v > 0xffff) throw new AsmError(line, `${what || 'immediate'} ${v} เกิน 16 bit`);
    return v & 0xffff;
  }

  const splitOps = (rest) => rest.trim() ? rest.trim().split(/[,\s]+/).filter(Boolean) : [];
  const stripComment = (line) => line.split(/[#;]/)[0];

  function tokenize(src) {
    return src.split(/\r?\n/).map((raw, i) => {
      let line = stripComment(raw).trim();
      const labels = [];
      for (;;) {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
        if (!m) break;
        labels.push(m[1]);
        line = m[2].trim();
      }
      return { line: i + 1, labels, body: line, raw: raw.replace(/\s+$/, '') };
    });
  }

  function assemble(src) {
    const lines = tokenize(src);
    const prog = { words: new Array(MEM_WORDS).fill(0), symbols: {}, listing: [], textWords: 0, dataWords: 0,
      lineOfAddr: {} };

    // pass 1
    let section = 'text';
    const loc = { text: TEXT_BASE, data: DATA_BASE };
    for (const L of lines) {
      for (const lb of L.labels) {
        if (lb in prog.symbols) throw new AsmError(L.line, `label '${lb}' ซ้ำ`);
        prog.symbols[lb] = loc[section];
      }
      if (!L.body) continue;
      const head = L.body.split(/\s+/)[0].toLowerCase();
      if (head === '.text') section = 'text';
      else if (head === '.data') section = 'data';
      else if (head === '.word') loc[section] += 4 * splitOps(L.body.slice(5)).length;
      else if (head === '.space') {
        const n = parseNumber(L.body.split(/\s+/)[1] || '');
        if (n === null || n % 4) throw new AsmError(L.line, '.space ต้องเป็นจำนวน byte ที่หาร 4 ลงตัว');
        loc[section] += n;
      } else if (MNEMONICS.has(head)) {
        if (section !== 'text') throw new AsmError(L.line, 'คำสั่งต้องอยู่ใน .text');
        loc[section] += 4;
      } else throw new AsmError(L.line, `ไม่รู้จัก '${head}'`);
    }
    if (loc.text > TEXT_BASE + 4 * 256) throw new AsmError(0, '.text เกิน 256 word');
    if (loc.data > DATA_BASE + 4 * 256) throw new AsmError(0, '.data เกิน 256 word');

    // pass 2
    section = 'text';
    loc.text = TEXT_BASE; loc.data = DATA_BASE;
    const emit = (word, L, kind) => {
      const addr = loc[section];
      prog.words[addr >> 2] = u32(word);
      prog.listing.push({ addr, word: u32(word), raw: L.raw, line: L.line, kind });
      prog.lineOfAddr[addr] = L.line;
      loc[section] += 4;
    };

    for (const L of lines) {
      if (!L.body) continue;
      const sp = L.body.search(/\s/);
      const head = (sp < 0 ? L.body : L.body.slice(0, sp)).toLowerCase();
      const rest = sp < 0 ? '' : L.body.slice(sp + 1);
      const ops = splitOps(rest);
      if (head === '.text') { section = 'text'; continue; }
      if (head === '.data') { section = 'data'; continue; }
      if (head === '.word') { for (const o of ops) emit(parseInt2(o, prog.symbols, L.line), L, 'data'); continue; }
      if (head === '.space') { const n = parseNumber(ops[0]); for (let i = 0; i < n / 4; i++) emit(0, L, 'data'); continue; }

      const pc = loc[section];
      const need = (n) => { if (ops.length !== n) throw new AsmError(L.line, `'${head}' ต้องมี ${n} operand แต่ได้ ${ops.length}`); };
      let word;
      if (head in R_FUNCT) {
        need(3);
        const [rd, rs, rt] = ops.map((o) => parseReg(o, L.line));
        word = (rs << 21) | (rt << 16) | (rd << 11) | R_FUNCT[head];
      } else if (head === 'nop') {
        need(0); word = R_FUNCT.add;
      } else if (head === 'addi') {
        need(3);
        const rt = parseReg(ops[0], L.line), rs = parseReg(ops[1], L.line);
        const imm = imm16(parseInt2(ops[2], prog.symbols, L.line), L.line);
        word = (OPCODE.addi << 26) | (rs << 21) | (rt << 16) | imm;
      } else if (head === 'lw' || head === 'sw') {
        const m = /^\s*(\$\w+)\s*,?\s*([^(]*)\(\s*(\$\w+)\s*\)\s*$/.exec(rest);
        if (!m) throw new AsmError(L.line, `รูปแบบต้องเป็น ${head} $rt, off($rs)`);
        const rt = parseReg(m[1], L.line);
        const off = imm16(parseInt2(m[2].trim() || '0', prog.symbols, L.line), L.line, 'offset');
        const rs = parseReg(m[3], L.line);
        word = (OPCODE[head] << 26) | (rs << 21) | (rt << 16) | off;
      } else if (head === 'beq') {
        need(3);
        const rs = parseReg(ops[0], L.line), rt = parseReg(ops[1], L.line);
        const target = parseInt2(ops[2], prog.symbols, L.line);
        const diff = target - (pc + 4);
        if (diff % 4) throw new AsmError(L.line, 'เป้าหมาย branch ไม่ลงตัว word');
        const off = diff / 4;
        if (off < -0x8000 || off > 0x7fff) throw new AsmError(L.line, 'branch ไกลเกิน');
        word = (OPCODE.beq << 26) | (rs << 21) | (rt << 16) | (off & 0xffff);
      } else if (head === 'j' || head === 'halt') {
        let target;
        if (head === 'halt') { need(0); target = pc; } else { need(1); target = parseInt2(ops[0], prog.symbols, L.line); }
        if (target % 4) throw new AsmError(L.line, 'เป้าหมาย jump ไม่ลงตัว word');
        word = (OPCODE.j << 26) | ((target >>> 2) & 0x3ffffff);
      } else throw new AsmError(L.line, `ไม่รู้จัก '${head}'`);
      emit(word, L, 'text');
    }
    prog.textWords = (loc.text - TEXT_BASE) / 4;
    prog.dataWords = (loc.data - DATA_BASE) / 4;
    prog.expects = parseExpects(src);
    return prog;
  }

  function parseExpects(src) {
    const out = [];
    for (const raw of src.split(/\r?\n/)) {
      const m = /^#!\s*expect\s+(.+?)\s*=\s*(\S+)\s*$/.exec(raw.trim());
      if (m) out.push({ key: m[1].trim(), value: u32(parseNumber(m[2]) ?? 0) });
    }
    return out;
  }

  // ---------------------------------------------------------------- decode / disassemble
  function classify(w) {
    const op = w >>> 26;
    if (op === 0) return (w & 0x3f) in FUNCT_NAME ? 'R' : 'illegal';
    return { 8: 'addi', 0x23: 'lw', 0x2b: 'sw', 4: 'beq', 2: 'j' }[op] || 'illegal';
  }

  function fields(w) {
    w = u32(w);
    return {
      opcode: w >>> 26, rs: (w >>> 21) & 31, rt: (w >>> 16) & 31, rd: (w >>> 11) & 31,
      shamt: (w >>> 6) & 31, funct: w & 63, imm: w & 0xffff, target: w & 0x3ffffff,
    };
  }

  const rn = (n) => '$' + REG_NAMES[n];

  function jumpTarget(w, addr) { return u32(((addr + 4) & 0xf0000000) | ((w & 0x3ffffff) << 2)); }

  function disasm(w, addr, symbols) {
    w = u32(w);
    const f = fields(w);
    const k = classify(w);
    const lab = (a) => {
      if (symbols) for (const [n, v] of Object.entries(symbols)) if (v === a) return n;
      return '0x' + a.toString(16).padStart(4, '0');
    };
    switch (k) {
      case 'R': return w === 0x20 ? 'nop' : `${FUNCT_NAME[f.funct]} ${rn(f.rd)}, ${rn(f.rs)}, ${rn(f.rt)}`;
      case 'addi': return `addi ${rn(f.rt)}, ${rn(f.rs)}, ${sext16(f.imm)}`;
      case 'lw': case 'sw': return `${k} ${rn(f.rt)}, ${sext16(f.imm)}(${rn(f.rs)})`;
      case 'beq': return `beq ${rn(f.rs)}, ${rn(f.rt)}, ${addr == null ? sext16(f.imm) : lab(u32(addr + 4 + sext16(f.imm) * 4))}`;
      case 'j': {
        if (addr != null && jumpTarget(w, addr) === addr) return 'halt';
        return `j ${addr == null ? '0x' + (f.target << 2).toString(16) : lab(jumpTarget(w, addr))}`;
      }
      default: return `??? (0x${w.toString(16).padStart(8, '0')})`;
    }
  }

  function mnemonic(w) {
    const k = classify(w);
    if (k === 'R') return FUNCT_NAME[w & 0x3f];
    return k === 'illegal' ? '???' : k;
  }

  // ---------------------------------------------------------------- ALU (rtl/common/alu.v)
  function aluCtrl(aluOp, funct) {
    if (aluOp === 0) return 0b0010;
    if (aluOp === 1) return 0b0110;
    return { 0x20: 0b0010, 0x22: 0b0110, 0x24: 0b0000, 0x25: 0b0001, 0x2a: 0b0111 }[funct] ?? 0b0010;
  }
  const ALU_OP_NAME = { 0: 'AND', 1: 'OR', 2: 'บวก', 6: 'ลบ', 7: 'น้อยกว่า?', 12: 'NOR' };

  function alu(a, b, ctrl) {
    a = u32(a); b = u32(b);
    switch (ctrl) {
      case 0b0000: return u32(a & b);
      case 0b0001: return u32(a | b);
      case 0b0010: return u32(a + b);
      case 0b0110: return u32(a - b);
      case 0b0111: return s32(a) < s32(b) ? 1 : 0;
      case 0b1100: return u32(~(a | b));
      default: return 0;
    }
  }

  // ---------------------------------------------------------------- reference model (tools/ref_model.py)
  class ModelError extends Error {}

  function runRef(words, maxInstr = 100000) {
    const mem = words.slice();
    const regs = new Array(32).fill(0);
    let pc = 0, retired = 0, steps = 0, illegal = 0;
    const mix = { R: 0, addi: 0, lw: 0, sw: 0, beq: 0, j: 0, illegal: 0 };
    const dataIdx = (addr) => {
      if (addr % 4 || addr < DATA_BASE || addr >= 0x800)
        throw new ModelError(`PC=0x${pc.toString(16)}: เข้าถึงข้อมูลที่ 0x${u32(addr).toString(16)} นอกช่วง 0x400-0x7FF`);
      return addr >> 2;
    };
    for (;;) {
      if (pc % 4 || pc < 0 || pc >= 0x400) throw new ModelError(`PC=0x${u32(pc).toString(16)} ออกนอกช่วงโปรแกรม`);
      const w = mem[pc >> 2];
      const f = fields(w), k = classify(w), imm = sext16(f.imm), pc4 = u32(pc + 4);
      if (k === 'j' && jumpTarget(w, pc) === pc) break;
      if (retired >= maxInstr) throw new ModelError(`รันเกิน ${maxInstr} คำสั่งแล้วยังไม่เจอ halt`);
      let next = pc4, wr = null;
      if (k === 'R') {
        const a = regs[f.rs], b = regs[f.rt], fn = FUNCT_NAME[f.funct];
        const v = fn === 'add' ? a + b : fn === 'sub' ? a - b : fn === 'and' ? a & b : fn === 'or' ? a | b
          : (s32(a) < s32(b) ? 1 : 0);
        wr = [f.rd, v];
      } else if (k === 'addi') wr = [f.rt, regs[f.rs] + imm];
      else if (k === 'lw') wr = [f.rt, mem[dataIdx(u32(regs[f.rs] + imm))]];
      else if (k === 'sw') mem[dataIdx(u32(regs[f.rs] + imm))] = regs[f.rt];
      else if (k === 'beq') { if (regs[f.rs] === regs[f.rt]) next = u32(pc4 + imm * 4); }
      else if (k === 'j') next = jumpTarget(w, pc);
      else illegal++;
      if (wr && wr[0] !== 0) regs[wr[0]] = u32(wr[1]);
      pc = next; retired++; steps += MC_STEPS[k]; mix[k]++;
    }
    return { regs, mem, retired, steps, illegal, mix };
  }

  // ---------------------------------------------------------------- single-cycle (rtl/single)
  function scControl(op, funct) {
    const c = { regDst: 0, aluSrc: 0, memToReg: 0, regWrite: 0, memRead: 0, memWrite: 0, branch: 0, jump: 0, aluOp: 0, illegal: 0 };
    switch (op) {
      case 0x00:
        if (funct in FUNCT_NAME) { c.regDst = 1; c.regWrite = 1; c.aluOp = 2; } else c.illegal = 1;
        break;
      case 0x23: c.aluSrc = 1; c.memToReg = 1; c.regWrite = 1; c.memRead = 1; break;
      case 0x2b: c.aluSrc = 1; c.memWrite = 1; break;
      case 0x04: c.branch = 1; c.aluOp = 1; break;
      case 0x02: c.jump = 1; break;
      case 0x08: c.aluSrc = 1; c.regWrite = 1; break;
      default: c.illegal = 1;
    }
    return c;
  }

  class SingleCore {
    constructor(words) { this.mem = words.slice(); this.regs = new Array(32).fill(0); this.pc = 0; this.retired = 0; }

    view() {
      const instr = this.mem[(this.pc >>> 2) & 0xff];
      const f = fields(instr);
      const c = scControl(f.opcode, f.funct);
      const ext = u32(sext16(f.imm));
      const rd1 = f.rs ? this.regs[f.rs] : 0, rd2 = f.rt ? this.regs[f.rt] : 0;
      const aluB = c.aluSrc ? ext : rd2;
      const ctrl = aluCtrl(c.aluOp, f.funct);
      const aluY = alu(rd1, aluB, ctrl);
      const zero = aluY === 0 ? 1 : 0;
      const dIdx = 256 + ((aluY >>> 2) & 0xff);
      const dmemData = this.mem[dIdx];
      const wb = c.memToReg ? dmemData : aluY;
      const wa = c.regDst ? f.rd : f.rt;
      const pc4 = u32(this.pc + 4);
      const brTarget = u32(pc4 + ((ext << 2) >>> 0));
      const pcSrc = c.branch & zero;
      const jTarget = u32((pc4 & 0xf0000000) | (f.target << 2));
      const pcNext = c.jump ? jTarget : pcSrc ? brTarget : pc4;
      const done = c.jump && jTarget === this.pc;
      const legal = !c.illegal && !done, usesAlu = legal && !c.jump;
      const b = [!done, !done, usesAlu, legal && c.regDst && c.regWrite, legal && !c.regDst && c.regWrite,
        usesAlu, usesAlu && !c.aluSrc, usesAlu && c.aluSrc, legal && (c.memRead || c.memWrite), legal && c.memWrite,
        legal && c.memRead, legal && c.regWrite && !c.memToReg, legal && c.regWrite, legal && c.branch,
        legal && c.branch && zero, legal && c.branch, legal && c.jump, legal && c.jump,
        legal && (c.memRead || c.memWrite), usesAlu];
      const active = b.map(Boolean);
      // ค่าบนเส้น (สำหรับ tooltip)
      const wireVal = { 0: this.pc, 1: pc4, 5: rd1, 6: rd2, 7: ext, 8: aluY, 9: rd2, 10: dmemData, 11: aluY, 12: wb,
        13: u32(ext << 2), 14: brTarget, 15: zero, 16: jTarget, 17: jTarget };
      return { pc: this.pc, instr, f, c, ext, rd1, rd2, aluB, ctrl, aluY, zero, dAddr: aluY, dmemData, wb, wa, pc4,
        brTarget, pcSrc, jTarget, pcNext, done, active, wireVal, kind: classify(instr) };
    }

    get done() { return this.view().done; }

    step() {
      const v = this.view();
      if (v.done) return null;
      if (v.c.regWrite && v.wa !== 0) this.regs[v.wa] = v.wb;
      if (v.c.memWrite) this.mem[256 + ((v.aluY >>> 2) & 0xff)] = v.rd2;
      this.pc = v.pcNext;
      this.retired++;
      return v;
    }
  }

  // ---------------------------------------------------------------- multicycle (rtl/multi)
  function mcControl(state, op) {
    const c = { pcWrite: 0, pcWriteCond: 0, iorD: 0, memRead: 0, memWrite: 0, irWrite: 0, memToReg: 0, pcSource: 0,
      aluOp: 0, aluSrcA: 0, aluSrcB: 0, regWrite: 0, regDst: 0 };
    switch (state) {
      case 0: c.memRead = 1; c.irWrite = 1; c.aluSrcB = 1; c.pcWrite = 1; break;
      case 1: c.aluSrcB = 3; break;
      case 2: case 10: c.aluSrcA = 1; c.aluSrcB = 2; break;
      case 3: c.memRead = 1; c.iorD = 1; break;
      case 4: c.memToReg = 1; c.regWrite = 1; break;
      case 5: c.memWrite = 1; c.iorD = 1; break;
      case 6: c.aluSrcA = 1; c.aluOp = 2; break;
      case 7: c.regDst = 1; c.regWrite = 1; break;
      case 8: c.aluSrcA = 1; c.aluOp = 1; c.pcWriteCond = 1; c.pcSource = 1; break;
      case 9: c.pcWrite = 1; c.pcSource = 2; break;
      case 11: c.regWrite = 1; break;
      default: break;
    }
    return c;
  }

  function mcNext(state, op, illegal) {
    switch (state) {
      case 0: return 1;
      case 1:
        if (illegal) return 0;
        if (op === 0x23 || op === 0x2b) return 2;
        if (op === 0x00) return 6;
        if (op === 0x04) return 8;
        if (op === 0x02) return 9;
        return 10;
      case 2: return op === 0x23 ? 3 : 5;
      case 3: return 4;
      case 6: return 7;
      case 10: return 11;
      default: return 0;
    }
  }

  class MultiCore {
    constructor(words) {
      this.mem = words.slice(); this.regs = new Array(32).fill(0);
      this.pc = 0; this.ir = 0; this.mdr = 0; this.a = 0; this.b = 0; this.aluOut = 0; this.state = 0; this.retired = 0;
    }

    view() {
      const f = fields(this.ir);
      const op = f.opcode;
      const illegal = !((op === 0 && f.funct in FUNCT_NAME) || [2, 4, 8, 0x23, 0x2b].includes(op));
      const c = mcControl(this.state, op);
      const memAddr = c.iorD ? this.aluOut : this.pc;
      const memData = this.mem[(memAddr >>> 2) & 0x1ff];
      const pc4 = u32(this.pc + 4);
      const isHalt = (memData >>> 26) === 2 && u32((pc4 & 0xf0000000) | ((memData & 0x3ffffff) << 2)) === this.pc;
      const done = this.state === 0 && isHalt;
      const ext = u32(sext16(f.imm));
      const aluA = c.aluSrcA ? this.a : this.pc;
      const aluB = [this.b, 4, ext, u32(ext << 2)][c.aluSrcB];
      const ctrl = aluCtrl(c.aluOp, f.funct);
      const aluY = alu(aluA, aluB, ctrl);
      const zero = aluY === 0 ? 1 : 0;
      const pcNext = [aluY, this.aluOut, u32((this.pc & 0xf0000000) | (f.target << 2))][c.pcSource];
      const pcEn = c.pcWrite || (c.pcWriteCond && zero);
      const rd1 = f.rs ? this.regs[f.rs] : 0, rd2 = f.rt ? this.regs[f.rt] : 0;
      const wa = c.regDst ? f.rd : f.rt;
      const wd = c.memToReg ? this.mdr : this.aluOut;
      const next = mcNext(this.state, op, illegal);
      const s = (n) => !done && this.state === n;
      const s0 = !done && this.state === 0;
      const bits = [s0, s0 || s(3) || s(5), s0, s0 || s(1), s0, s0, s(1), s(1), s(1), s(1) || s(2) || s(6) || s(10),
        s(2) || s(6) || s(8) || s(10), s(6) || s(8), s(2) || s(10), s(3) || s(5), s(3), s(4), s(4) || s(11), s(5),
        s(7) || s(11), s(7), s(8) && zero, s(8), s(9), s0 || s(3) || s(5), s0 || s(1) || s(2) || s(6) || s(8) || s(10),
        s(1) || s(4) || s(7) || s(11)];
      const wireVal = { 0: this.pc, 1: memAddr, 2: memData, 3: this.pc, 4: 4, 5: aluY, 6: f.rs, 7: rd1, 8: u32(ext << 2),
        9: aluY, 10: this.a, 11: this.b, 12: ext, 13: this.aluOut, 14: memData, 15: this.mdr, 16: f.rt, 17: this.b,
        18: this.aluOut, 19: f.rd, 20: this.aluOut, 21: zero, 22: pcNext };
      return { state: this.state, next, pc: this.pc, ir: this.ir, f, c, illegal, memAddr, memData, done, ext, aluA, aluB,
        ctrl, aluY, zero, pcNext, pcEn, rd1, rd2, wa, wd, a: this.a, b: this.b, aluOut: this.aluOut, mdr: this.mdr,
        active: bits.map(Boolean), wireVal, kind: classify(this.ir) };
    }

    get done() { return this.view().done; }

    step() {
      const v = this.view();
      if (v.done) return null;
      if (v.pcEn) this.pc = v.pcNext;
      if (v.c.irWrite) this.ir = v.memData;
      this.mdr = v.memData;
      this.a = v.rd1;
      this.b = v.rd2;
      this.aluOut = v.aluY;
      if (v.c.regWrite && v.wa !== 0) this.regs[v.wa] = v.wd;
      if (v.c.memWrite) this.mem[(v.memAddr >>> 2) & 0x1ff] = v.b;
      if (v.state !== 0 && v.next === 0) this.retired++;
      this.state = v.next;
      return v;
    }
  }

  // ---------------------------------------------------------------- race (rtl/race/race_ctrl.v)
  class Race {
    constructor(words, ov = 0) {
      this.words = words.slice();
      this.ov = ov;
      this.reset();
    }

    reset() {
      this.s = new SingleCore(this.words);
      this.m = new MultiCore(this.words);
      this.time = 0;
      this.nextS = this.Ts; this.nextM = this.Tm;
      this.lastS = 0; this.lastM = 0;
      this.mSteps = 0;
      this.log = [];
    }

    get Ts() { return 50 + this.ov; }
    get Tm() { return 10 + this.ov; }
    get doneS() { return this.s.done; }
    get doneM() { return this.m.done; }
    get allDone() { return this.doneS && this.doneM; }
    get timeS() { return this.doneS ? this.lastS : this.time; }
    get timeM() { return this.doneM ? this.lastM : this.time; }

    nextEvent() {
      if (this.doneS) return this.nextM;
      if (this.doneM) return this.nextS;
      return Math.min(this.nextS, this.nextM);
    }

    advanceTo(t) {
      this.time = t;
      const ev = { t, s: null, m: null };
      if (!this.doneS && t >= this.nextS) { ev.s = this.s.step(); this.nextS += this.Ts; this.lastS = t; }
      if (!this.m.done && t >= this.nextM) { ev.m = this.m.step(); this.nextM += this.Tm; this.lastM = t; this.mSteps++; }
      if (ev.s || ev.m) this.log.push(ev);
      return ev;
    }

    stepEvent() {
      if (this.allDone) return null;
      return this.advanceTo(this.nextEvent());
    }

    runTo(t) {
      const evs = [];
      while (!this.allDone && this.nextEvent() <= t) evs.push(this.stepEvent());
      if (!this.allDone && t > this.time) this.time = t;
      return evs;
    }

    runToEnd(limit = 2000000) {
      let n = 0;
      while (!this.allDone && n++ < limit) this.stepEvent();
    }

    status(core) {
      const meDone = core === 's' ? this.doneS : this.doneM;
      const otherDone = core === 's' ? this.doneM : this.doneS;
      const me = core === 's' ? this.timeS : this.timeM, other = core === 's' ? this.timeM : this.timeS;
      if (!meDone) return '';
      if (!otherDone || me < other) return 'WINNER';
      if (me === other) return 'TIE';
      return 'FINISH';
    }
  }

  function raceTimes(retired, steps, ov) { return { s: retired * (50 + ov), m: steps * (10 + ov) }; }
  function flipOv(retired, steps) {
    for (let ov = 0; ov <= 15; ov++) { const t = raceTimes(retired, steps, ov); if (t.s < t.m) return ov; }
    return null;
  }

  function formatState(regs, mem, retired) {
    const h = (v) => u32(v).toString(16).padStart(8, '0');
    const lines = [`retired ${retired}`];
    for (let i = 0; i < 32; i++) lines.push(`r${String(i).padStart(2, '0')} ${h(regs[i])}`);
    for (let i = 0; i < 256; i++) lines.push(`m${(0x400 + 4 * i).toString(16).padStart(4, '0')} ${h(mem[256 + i])}`);
    return lines.join('\n') + '\n';
  }

  return {
    u32, s32, sext16, REG_NAMES, STATE_NAMES, MC_STEPS, ALU_OP_NAME, FUNCT_NAME, OPCODE, R_FUNCT,
    AsmError, ModelError, assemble, parseNumber, fields, classify, disasm, mnemonic, jumpTarget, alu, aluCtrl,
    runRef, SingleCore, MultiCore, Race, raceTimes, flipOv, formatState,
  };
});
