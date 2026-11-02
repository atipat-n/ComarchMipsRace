/* CPU Race Lab: หน้าเว็บ (ใช้ engine.js, programs.js, geometry.js) */
(function () {
  'use strict';
  const E = window.CPURace;
  const PROGS = window.PROGRAMS;
  const GEO = window.GEOMETRY;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cpurace.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cpurace.' + k, JSON.stringify(v)); } catch (e) { /* ไม่มี storage ก็ใช้ได้ */ } },
  };

  const S = {
    base: store.get('base', 'hex'),
    level: store.get('level', 'easy'),
    progId: 'demoA_alu_heavy',
    customSrc: null,
    ov: 0,
    speed: 200,
    prog: null, ref: null, race: null,
    running: false, raf: 0, lastTs: 0,
    guess: null,
    log: [],
    prevRegs: { s: null, m: null },
  };

  // ================================================================ ตัวเลข
  function fmt(v, base) {
    v = v >>> 0;
    switch (base || S.base) {
      case 'dec': return String(v);
      case 'sdec': return String(v | 0);
      case 'bin': return v.toString(2).padStart(32, '0').replace(/(.{8})(?=.)/g, '$1 ');
      default: return '0x' + v.toString(16).toUpperCase().padStart(8, '0');
    }
  }
  function fmtAddr(v) {
    v = v >>> 0;
    switch (S.base) {
      case 'dec': case 'sdec': return String(v);
      case 'bin': return '0b' + v.toString(2).padStart(11, '0');
      default: return '0x' + v.toString(16).toUpperCase().padStart(4, '0');
    }
  }
  const hex = (v, n) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(n || 1, '0');
  const reg = (n) => '$' + E.REG_NAMES[n];
  const thai = (n) => n.toLocaleString('en-US');

  // ================================================================ ชื่อเส้น (docs/wire_map.md)
  const WIRE_S = ['PC → IMEM (address ของคำสั่ง)', 'PC → +4 → mux PCSrc', 'IMEM → rs, rt → RegFile', 'IMEM[15:11] (rd) → mux RegDst',
    'IMEM[20:16] (rt) → mux RegDst', 'ReadData1 → ALU ขา A', 'ReadData2 → mux ALUSrc', 'sign-extend → mux ALUSrc',
    'ผล ALU → address ของ DMEM', 'ReadData2 → ข้อมูลที่จะเขียนลง DMEM', 'ข้อมูลจาก DMEM → mux MemtoReg', 'ผล ALU → mux MemtoReg',
    'mux MemtoReg → RegFile (ค่าที่จะเขียน)', 'sign-extend << 2 → adder ของ branch', 'adder ของ branch → mux PCSrc', 'Zero ของ ALU → AND',
    'IMEM[25:0] << 2 → address ของ jump', 'mux Jump → PC', 'กล่อง DMEM', 'กล่อง ALU'];
  const WIRE_M = ['PC → mux IorD', 'mux IorD → address ของ Memory', 'Memory → IR', 'PC → mux ALUSrcA', 'ค่าคงที่ 4 → mux ALUSrcB',
    'ALU → PC (PCSource = 00)', 'IR rs, rt → RegFile', 'RegFile → A, B', 'sign-extend << 2 → mux ALUSrcB', 'ALU → ALUOut',
    'A → mux ALUSrcA', 'B → mux ALUSrcB', 'sign-extend → mux ALUSrcB', 'ALUOut → mux IorD', 'Memory → MDR',
    'MDR → mux MemtoReg → RegFile', 'IR[20:16] (rt) → เลข register ที่จะเขียน', 'B → ข้อมูลที่จะเขียนลง Memory',
    'ALUOut → mux MemtoReg → RegFile', 'IR[15:11] (rd) → เลข register ที่จะเขียน', 'ALUOut → PC (PCSource = 01)',
    'Zero → PCWriteCond', 'IR[25:0] << 2 → PC (PCSource = 10)', 'กล่อง Memory', 'กล่อง ALU', 'กล่อง RegFile'];
  const STATE_TH = ['หยิบคำสั่ง', 'ถอดรหัส', 'คำนวณ address', 'อ่าน memory', 'เขียนผลจาก memory', 'เขียน memory',
    'คำนวณ', 'เขียนผล', 'เทียบ branch', 'กระโดด', 'คำนวณ addi', 'เขียนผล addi'];

  // ================================================================ datapath SVG
  const SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function buildDP(svg, items, core) {
    svg.innerHTML = '';
    const refs = { wires: {}, boxes: {}, core };
    const gW = sv('g', {}, svg), gB = sv('g', {}, svg), gT = sv('g', {}, svg), gF = sv('g', {}, svg), gH = sv('g', {}, svg);
    for (const it of items) {
      if (it.t === 'box' || it.t === 'mux') {
        const r = sv('rect', { x: it.x0 + 1, y: it.y0 + 1, width: it.x1 - it.x0 - 2, height: it.y1 - it.y0 - 2,
          rx: it.t === 'mux' ? 3 : 4, class: it.t === 'mux' ? 'mux' : 'box' }, gB);
        if (it.label) sv('text', { x: (it.x0 + it.x1) / 2, y: (it.y0 + it.y1) / 2 + 4, 'text-anchor': 'middle' }, gT).textContent = it.label;
        if (it.w != null) { refs.boxes[it.w] = r; addHit(r, core, it.w); }
      } else if (it.t === 'text') {
        sv('text', { x: it.x, y: it.y + 12 }, gT).textContent = it.s;
      } else if (it.t === 'wire') {
        const pts = it.pts.map(([x, y]) => `${x + 1},${y + 1}`).join(' ');
        const line = sv('polyline', { points: pts, class: 'w ' + (it.w == null ? 'static' : 'off') }, gW);
        if (it.w != null) {
          const flow = sv('polyline', { points: pts, class: 'flow' }, gF);
          flow.style.display = 'none';
          const hit = sv('polyline', { points: pts, class: 'hit' }, gH);
          addHit(hit, core, it.w);
          (refs.wires[it.w] = refs.wires[it.w] || []).push({ line, flow });
        }
      }
    }
    return refs;
  }

  const tip = () => $('#tip');
  let tipInfo = null;
  function addHit(elm, core, bit) {
    elm.addEventListener('mousemove', (e) => {
      tipInfo = { core, bit };
      const t = tip();
      t.innerHTML = tipHTML(core, bit);
      t.style.display = 'block';
      const x = Math.min(e.clientX + 14, window.innerWidth - 300);
      t.style.left = x + 'px'; t.style.top = (e.clientY + 14) + 'px';
    });
    elm.addEventListener('mouseleave', () => { tip().style.display = 'none'; tipInfo = null; });
  }
  function tipHTML(core, bit) {
    const names = core === 's' ? WIRE_S : WIRE_M;
    const v = S.race ? (core === 's' ? S.race.s.view() : S.race.m.view()) : null;
    let html = `<div>${esc(names[bit] || '')}</div>`;
    if (v) {
      html += `<div class="small">${v.active[bit] ? 'ใช้งานในจังหวะนี้' : 'ไม่ได้ใช้ในจังหวะนี้'}</div>`;
      if (v.wireVal && v.wireVal[bit] != null) html += `<div>ค่า <b>${esc(fmt(v.wireVal[bit]))}</b></div>`;
    }
    return html;
  }

  function paintDP(refs, active) {
    const on = refs.core === 's' ? 'on-s' : 'on-m';
    for (const k in refs.wires) {
      const a = !!active[k];
      for (const { line, flow } of refs.wires[k]) {
        line.setAttribute('class', 'w ' + (a ? on : 'off'));
        flow.style.display = a ? '' : 'none';
      }
    }
    for (const k in refs.boxes) refs.boxes[k].setAttribute('class', 'box ' + (active[k] ? (refs.core === 's' ? 'hot-s' : 'hot-m') : 'cold'));
  }

  // ================================================================ 7-segment
  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
    a: 'abcefg', b: 'cdefg', c: 'adef', d: 'bcdeg', e: 'adefg', f: 'aefg' };
  const SEGPOLY = {
    a: '3,1 13,1 11,3 5,3', b: '13,2 15,4 15,13 13,14 13,4', c: '13,16 15,17 15,26 13,28 13,18', d: '5,27 11,27 13,29 3,29',
    e: '1,17 3,16 3,26 1,28', f: '1,4 3,2 3,14 1,13', g: '3,15 5,14 11,14 13,15 11,16 5,16',
  };
  function seven(container, text) {
    container.innerHTML = '';
    for (const ch of text.toLowerCase()) {
      const s = sv('svg', { viewBox: '0 0 16 30', 'aria-hidden': 'true' }, container);
      const lit = SEG[ch] || '';
      for (const k of 'abcdefg') sv('polygon', { points: SEGPOLY[k], class: lit.includes(k) ? 'on' : 'off' }, s);
    }
    container.setAttribute('aria-label', 'เวลา ' + text);
  }

  // ================================================================ คำอธิบาย (narration)
  const OPNAME = { add: 'บวก', sub: 'ลบ', and: 'AND', or: 'OR', slt: 'เทียบน้อยกว่า' };
  function opSym(fn) { return { add: '+', sub: '−', and: '&', or: '|', slt: '<' }[fn]; }

  function narrSingle(v) {
    if (v.done) return { head: 'จบโปรแกรมแล้ว', body: 'PC ชี้ที่คำสั่ง halt (j กระโดดหาตัวเอง) วงจรตั้ง done = 1 แล้วหยุดเดิน', eq: '' };
    const f = v.f, k = v.kind, lv = S.level;
    const fn = k === 'R' ? E.FUNCT_NAME[f.funct] : k;
    const asm = E.disasm(v.instr, v.pc, S.prog && S.prog.symbols);
    let body = '', eq = '';
    const imm = E.sext16(f.imm);
    if (lv === 'easy') {
      switch (k) {
        case 'R': body = `หยิบ ${reg(f.rs)} (${fmt(v.rd1)}) กับ ${reg(f.rt)} (${fmt(v.rd2)}) มา${OPNAME[fn]}กัน ได้ ${fmt(v.aluY)} แล้ววางลง ${reg(f.rd)}`; break;
        case 'addi': body = `เอา ${reg(f.rs)} (${fmt(v.rd1)}) บวกเลขที่ฝังในคำสั่ง (${imm}) ได้ ${fmt(v.aluY)} แล้ววางลง ${reg(f.rt)}`; break;
        case 'lw': body = `คำนวณว่าต้องไปหยิบที่ช่องไหน: ${reg(f.rs)} + ${imm} = ${fmtAddr(v.aluY)} แล้วหยิบค่า ${fmt(v.dmemData)} ออกมาวางที่ ${reg(f.rt)}`; break;
        case 'sw': body = `คำนวณช่อง: ${reg(f.rs)} + ${imm} = ${fmtAddr(v.aluY)} แล้วเอา ${reg(f.rt)} (${fmt(v.rd2)}) ไปเก็บไว้ที่นั่น`; break;
        case 'beq': body = `เทียบ ${reg(f.rs)} (${fmt(v.rd1)}) กับ ${reg(f.rt)} (${fmt(v.rd2)}): ${v.zero ? 'เท่ากัน → กระโดดไป ' + fmtAddr(v.brTarget) : 'ไม่เท่ากัน → ทำบรรทัดถัดไป'}`; break;
        case 'j': body = `กระโดดไปทำคำสั่งที่ ${fmtAddr(v.jTarget)}`; break;
        default: body = 'คำสั่งนี้ CPU ไม่รู้จัก ทำเป็นไม่เห็นแล้วไปบรรทัดถัดไป (NOP)';
      }
      body += ' · ทั้งหมดนี้เสร็จใน 1 clock';
    } else if (lv === 'class') {
      switch (k) {
        case 'R': eq = `R[${f.rd}] ← R[${f.rs}] ${opSym(fn)} R[${f.rt}] = ${fmt(v.rd1)} ${opSym(fn)} ${fmt(v.rd2)} = ${fmt(v.aluY)}`; break;
        case 'addi': eq = `R[${f.rt}] ← R[${f.rs}] + sext(${hex(f.imm, 4)}) = ${fmt(v.rd1)} + ${fmt(v.ext)} = ${fmt(v.aluY)}`; break;
        case 'lw': eq = `R[${f.rt}] ← Mem[R[${f.rs}] + sext(imm)] = Mem[${fmtAddr(v.aluY)}] = ${fmt(v.dmemData)}`; break;
        case 'sw': eq = `Mem[R[${f.rs}] + sext(imm)] = Mem[${fmtAddr(v.aluY)}] ← R[${f.rt}] = ${fmt(v.rd2)}`; break;
        case 'beq': eq = `if (R[${f.rs}] − R[${f.rt}] == 0) PC ← PC+4 + (sext(imm) << 2) = ${fmtAddr(v.brTarget)}  → Zero = ${v.zero}`; break;
        case 'j': eq = `PC ← {PC+4[31:28], target, 00} = ${fmtAddr(v.jTarget)}`; break;
        default: eq = 'illegal → NOP';
      }
      if (k !== 'j' && k !== 'beq') eq += `   ;  PC ← PC + 4 = ${fmtAddr(v.pc4)}`;
      const c = v.c;
      body = `RegDst=${c.regDst} ALUSrc=${c.aluSrc} MemtoReg=${c.memToReg} RegWrite=${c.regWrite} MemRead=${c.memRead} MemWrite=${c.memWrite} Branch=${c.branch} Jump=${c.jump} ALUOp=${c.aluOp.toString(2).padStart(2, '0')}`;
    } else {
      const bits = v.active.map((a, i) => (a ? i : null)).filter((x) => x != null);
      body = `sc_control: opcode ${hex(f.opcode, 2)}${k === 'R' ? ' funct ' + hex(f.funct, 2) : ''} → ALU ctrl ${v.ctrl.toString(2).padStart(4, '0')} (${E.ALU_OP_NAME[v.ctrl]}), ` +
        `ขา B ของ ALU = ${v.c.aluSrc ? 'imm_ext' : 'rd2'} = ${fmt(v.aluB)}, alu_y = ${fmt(v.aluY)}, zero = ${v.zero}` +
        (v.c.memRead || v.c.memWrite ? `, dmem index = alu_y[9:2] = ${(v.aluY >>> 2) & 0xff}` : '') +
        `, pc_next = ${fmtAddr(v.pcNext)}`;
      eq = `active_s bits: ${bits.join(', ')}  (rtl/single/single_cycle_cpu.v)`;
    }
    return { head: asm, body, eq };
  }

  function narrMulti(v) {
    if (v.done) return { head: 'จบโปรแกรมแล้ว', body: 'อยู่ที่ FETCH และคำสั่งที่ PC ชี้คือ halt จึงตั้ง done = 1', eq: '' };
    const st = v.state, f = v.f, lv = S.level, k = v.kind;
    const fn = k === 'R' ? E.FUNCT_NAME[f.funct] : k;
    const head = `S${st} ${E.STATE_NAMES[st]} · ${STATE_TH[st]}`;
    let body = '', eq = '';
    const ends = v.next === 0 && st !== 0;
    const imm = E.sext16(f.imm);
    if (lv === 'easy') {
      body = [
        `ไปหยิบคำสั่งที่ PC (${fmtAddr(v.pc)}) มาแปะไว้ใน IR (ได้ ${fmt(v.memData)}) และเลื่อน PC ไปข้างหน้า 4`,
        `อ่านคำสั่งใน IR: เป็น ${E.disasm(v.ir, null)} → ดึงค่า ${reg(f.rs)} กับ ${reg(f.rt)} มาวางบนถาด A กับ B และให้ ALU คำนวณเป้าหมาย branch เผื่อไว้ (ALU ว่างพอดี)`,
        `ใช้ ALU หาช่องใน memory: A (${fmt(v.a)}) + ${imm} = ${fmtAddr(v.aluY)} เก็บพักไว้ใน ALUOut`,
        `ไปหยิบของใน memory ช่อง ${fmtAddr(v.aluOut)} ได้ ${fmt(v.memData)} มาพักไว้ใน MDR`,
        `เอาของจาก MDR (${fmt(v.mdr)}) ไปวางลง ${reg(f.rt)}`,
        `เอาค่าใน B (${fmt(v.b)}) ไปเก็บใน memory ช่อง ${fmtAddr(v.aluOut)}`,
        `ให้ ALU ${OPNAME[fn] || 'คำนวณ'} A (${fmt(v.a)}) กับ B (${fmt(v.b)}) ได้ ${fmt(v.aluY)} พักไว้ใน ALUOut`,
        `เอาผลใน ALUOut (${fmt(v.aluOut)}) ไปวางลง ${reg(f.rd)}`,
        `เทียบ A (${fmt(v.a)}) กับ B (${fmt(v.b)}) ด้วยการลบ: ${v.zero ? 'เท่ากัน → PC เปลี่ยนเป็นเป้าหมายที่คำนวณไว้ ' + fmtAddr(v.aluOut) : 'ไม่เท่ากัน → PC ไม่เปลี่ยน'}`,
        `เปลี่ยน PC เป็น ${fmtAddr(v.pcNext)} (กระโดด)`,
        `ให้ ALU บวก A (${fmt(v.a)}) กับเลขในคำสั่ง (${imm}) ได้ ${fmt(v.aluY)} พักไว้ใน ALUOut`,
        `เอาผลใน ALUOut (${fmt(v.aluOut)}) ไปวางลง ${reg(f.rt)}`,
      ][st] || '';
      body += ' · ใช้ 1 step';
    } else if (lv === 'class') {
      eq = [
        `IR ← Mem[PC] = ${fmt(v.memData)} ;  PC ← PC + 4 = ${fmtAddr(v.aluY)}`,
        `A ← R[${f.rs}] = ${fmt(v.rd1)} ;  B ← R[${f.rt}] = ${fmt(v.rd2)} ;  ALUOut ← PC + (sext(imm) << 2) = ${fmtAddr(v.aluY)}`,
        `ALUOut ← A + sext(imm) = ${fmt(v.a)} + ${fmt(v.ext)} = ${fmt(v.aluY)}`,
        `MDR ← Mem[ALUOut] = Mem[${fmtAddr(v.aluOut)}] = ${fmt(v.memData)}`,
        `R[${f.rt}] ← MDR = ${fmt(v.mdr)}`,
        `Mem[ALUOut] = Mem[${fmtAddr(v.aluOut)}] ← B = ${fmt(v.b)}`,
        `ALUOut ← A ${opSym(fn) || 'op'} B = ${fmt(v.a)} ${opSym(fn) || 'op'} ${fmt(v.b)} = ${fmt(v.aluY)}`,
        `R[${f.rd}] ← ALUOut = ${fmt(v.aluOut)}`,
        `if (A − B == 0) PC ← ALUOut  → Zero = ${v.zero}${v.zero ? ', PC = ' + fmtAddr(v.aluOut) : ''}`,
        `PC ← {PC[31:28], IR[25:0], 00} = ${fmtAddr(v.pcNext)}`,
        `ALUOut ← A + sext(imm) = ${fmt(v.a)} + ${fmt(v.ext)} = ${fmt(v.aluY)}`,
        `R[${f.rt}] ← ALUOut = ${fmt(v.aluOut)}`,
      ][st] || '';
      const c = v.c;
      const on = Object.entries({ PCWrite: c.pcWrite, PCWriteCond: c.pcWriteCond, IorD: c.iorD, MemRead: c.memRead, MemWrite: c.memWrite,
        IRWrite: c.irWrite, MemtoReg: c.memToReg, RegWrite: c.regWrite, RegDst: c.regDst, ALUSrcA: c.aluSrcA }).filter(([, x]) => x).map(([n]) => n);
      body = `สัญญาณที่เป็น 1: ${on.join(', ') || '-'} · ALUSrcB=${c.aluSrcB.toString(2).padStart(2, '0')} ALUOp=${c.aluOp.toString(2).padStart(2, '0')} PCSource=${c.pcSource.toString(2).padStart(2, '0')}`;
    } else {
      const bits = v.active.map((a, i) => (a ? i : null)).filter((x) => x != null);
      body = `mc_fsm: state ${st} → ${v.next} · mem_addr = ${v.c.iorD ? 'ALUOut' : 'PC'} = ${fmtAddr(v.memAddr)} · alu_a = ${v.c.aluSrcA ? 'A' : 'PC'} = ${fmt(v.aluA)} · ` +
        `alu_b = ${['B', '4', 'imm_ext', 'imm_ext<<2'][v.c.aluSrcB]} = ${fmt(v.aluB)} · alu_y = ${fmt(v.aluY)} · pc_en = ${v.pcEn ? 1 : 0}` +
        ` · A, B, ALUOut, MDR รับค่าใหม่ทุก step (IR เฉพาะตอน IRWrite)`;
      eq = `active_m bits: ${bits.join(', ')}  (rtl/multi/multi_cycle_cpu.v)`;
    }
    if (ends) body += ' · ✔ คำสั่งนี้จบหลัง step นี้';
    return { head, body, eq };
  }

  function renderNarr(box, n, kind) {
    box.innerHTML = `<div class="t">${esc(kind)}</div><div><b class="mono">${esc(n.head)}</b></div>` +
      (n.body ? `<div class="small">${esc(n.body)}</div>` : '') + (n.eq ? `<span class="eq">${esc(n.eq)}</span>` : '');
  }

  // ================================================================ RACE
  let refsS = null, refsM = null;

  function programSrc() {
    if (S.progId === '__custom') return S.customSrc || '';
    return (PROGS.find((p) => p.id === S.progId) || PROGS[0]).src;
  }

  function loadProgram() {
    try {
      S.prog = E.assemble(programSrc());
      S.ref = E.runRef(S.prog.words);
    } catch (e) {
      S.prog = null; S.ref = null;
      $('#prog-desc').textContent = 'โปรแกรมนี้มีปัญหา: ' + e.message;
      return;
    }
    const p = PROGS.find((x) => x.id === S.progId);
    $('#prog-desc').textContent = p ? p.desc : 'โปรแกรมที่เขียนเองในแท็บ "เขียนโปรแกรม"';
    newRace();
    renderAnalysis();
  }

  function newRace() {
    stopRun();
    if (!S.prog) return;
    S.race = new E.Race(S.prog.words, S.ov);
    S.log = [];
    S.guess = null;
    S.prevRegs = { s: null, m: null };
    $$('#predict [data-guess]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    $('#guess-result').textContent = '';
    renderRace();
  }

  function pushEvents(evs) {
    for (const ev of evs) {
      if (!ev) continue;
      S.log.push(ev);
    }
    if (S.log.length > 400) S.log.splice(0, S.log.length - 400);
  }

  function doStep() {
    if (!S.race || S.race.allDone) return;
    pushEvents([S.race.stepEvent()]);
    renderRace();
  }

  function stopRun() {
    S.running = false;
    cancelAnimationFrame(S.raf);
    const b = $('#b-run');
    if (b) b.textContent = '▶ วิ่ง';
  }

  function toggleRun() {
    if (!S.race) return;
    if (S.running) { stopRun(); return; }
    if (S.race.allDone) newRace();
    S.running = true;
    $('#b-run').textContent = '⏸ หยุด';
    S.lastTs = performance.now();
    let acc = 0;
    const frame = (ts) => {
      if (!S.running) return;
      acc += (ts - S.lastTs) / 1000 * S.speed;
      S.lastTs = ts;
      const units = Math.floor(acc);
      if (units > 0) {
        acc -= units;
        pushEvents(S.race.runTo(S.race.time + units));
        renderRace();
      }
      if (S.race.allDone) { stopRun(); renderRace(); return; }
      S.raf = requestAnimationFrame(frame);
    };
    S.raf = requestAnimationFrame(frame);
  }

  function runToEnd() {
    if (!S.race) return;
    stopRun();
    const before = S.race.log.length;
    S.race.runToEnd();
    pushEvents(S.race.log.slice(before));
    renderRace();
  }

  function badge(elm, status) {
    const map = { WINNER: ['win', 'WINNER'], TIE: ['tie', 'TIE'], FINISH: ['fin', 'FINISH'], '': ['run', 'กำลังวิ่ง'] };
    const [cls, txt] = map[status];
    elm.className = 'badge ' + cls;
    elm.textContent = txt;
  }

  function regsHTML(regs, prev, list) {
    return list.map((i) => {
      const ch = prev && prev[i] !== regs[i];
      return `<div class="reg${ch ? ' changed' : ''}" title="${esc(reg(i) + ' = ' + fmt(regs[i], 'hex') + ' = ' + (regs[i] | 0))}"><span>${reg(i)}</span><span>${esc(fmt(regs[i]))}</span></div>`;
    }).join('');
  }
  const REG_LIST = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

  function renderRace() {
    const R = S.race;
    if (!R) return;
    const ts = 50 + S.ov, tm = 10 + S.ov;
    $('#ts').textContent = ts; $('#tm').textContent = tm;
    $('#ov-val').textContent = S.ov;

    // scoreboard
    seven($('#seg-time'), (R.time >>> 0).toString(16).padStart(4, '0'));
    $('#time-dec').textContent = thai(R.time);
    const exp = S.ref ? E.raceTimes(S.ref.retired, S.ref.steps, S.ov) : { s: 1, m: 1 };
    const scale = Math.max(exp.s, exp.m) * 1.04 || 1;
    $('#fill-s').style.width = Math.min(100, R.timeS / scale * 100) + '%';
    $('#fill-m').style.width = Math.min(100, R.timeM / scale * 100) + '%';
    $('#ghost-s').style.left = (exp.s / scale * 100) + '%';
    $('#ghost-m').style.left = (exp.m / scale * 100) + '%';
    $('#t-s').textContent = `${thai(R.timeS)} หน่วย`;
    $('#t-m').textContent = `${thai(R.timeM)} หน่วย`;
    $('#r-s').textContent = `${R.s.retired} คำสั่ง`;
    $('#r-m').textContent = `${R.m.retired} คำสั่ง · ${R.mSteps} step`;
    badge($('#st-s'), R.status('s'));
    badge($('#st-m'), R.status('m'));
    $('#sb-hint').textContent = R.time === 0
      ? `เส้นบางในแถบคือเวลาจบที่คำนวณไว้ล่วงหน้า (single ${thai(exp.s)}, multi ${thai(exp.m)}) · กด "ทีละจังหวะ" เพื่อดูทีละเหตุการณ์ หรือ "วิ่ง" ให้แข่งเอง`
      : R.allDone ? `จบแล้ว: single ${thai(R.lastS)} หน่วย vs multi ${thai(R.lastM)} หน่วย` : `จังหวะถัดไปที่เวลา ${thai(R.nextEvent())}`;

    // prediction
    if (R.allDone && S.guess) {
      const actual = R.lastS < R.lastM ? 's' : R.lastM < R.lastS ? 'm' : 't';
      const name = { s: 'single', m: 'multi', t: 'เสมอ' };
      $('#guess-result').innerHTML = S.guess === actual
        ? `<span class="ok">ทายถูก ✔</span> ${name[actual]} ชนะ`
        : `<span class="err">ทายผิด</span> ผลจริง: ${name[actual]} (ดูเหตุผลในกล่อง "ทำไมถึงชนะ")`;
    }

    // cores
    const vs = R.s.view(), vm = R.m.view();
    $('#next-s').textContent = vs.done ? 'halt (จบแล้ว)' : `${fmtAddr(vs.pc)}:  ${E.disasm(vs.instr, vs.pc, S.prog.symbols)}`;
    $('#next-m').textContent = vm.done ? 'halt (จบแล้ว)' : (vm.state === 0 ? `(กำลังจะหยิบคำสั่งที่ ${fmtAddr(vm.pc)})` : `${E.disasm(vm.ir, null)}`);
    $('#state-m').textContent = vm.done ? 'DONE' : `S${vm.state} ${E.STATE_NAMES[vm.state]}`;
    $('#leds-m').innerHTML = Array.from({ length: 12 }, (_, i) => `<span class="led${!vm.done && vm.state === 11 - i ? ' on' : ''}" title="LED${11 - i} = S${11 - i}"></span>`).join('');
    paintDP(refsS, vs.active);
    paintDP(refsM, vm.active);
    renderNarr($('#narr-s'), narrSingle(vs), vs.done ? 'สถานะ' : 'จังหวะถัดไป (เส้นที่ติดสี)');
    renderNarr($('#narr-m'), narrMulti(vm), vm.done ? 'สถานะ' : 'step ถัดไป (เส้นที่ติดสี)');
    $('#regs-s').innerHTML = regsHTML(R.s.regs, S.prevRegs.s, REG_LIST);
    $('#regs-m').innerHTML = regsHTML(R.m.regs, S.prevRegs.m, REG_LIST);
    S.prevRegs = { s: R.s.regs.slice(), m: R.m.regs.slice() };
    $('#regs-s').classList.toggle('bin', S.base === 'bin');
    $('#regs-m').classList.toggle('bin', S.base === 'bin');
    const inner = [['PC', vm.pc], ['IR', vm.ir], ['A', vm.a], ['B', vm.b], ['ALUOut', vm.aluOut], ['MDR', vm.mdr]];
    $('#inner-m').innerHTML = inner.map(([n, x]) => `<div class="reg" title="${n} = ${fmt(x, 'hex')}"><span>${n}</span><span>${esc(fmt(x))}</span></div>`).join('');

    // log
    const rows = S.log.slice(-14).reverse().map((ev) => {
      const s = ev.s ? E.disasm(ev.s.instr, ev.s.pc, S.prog.symbols) : '';
      const m = ev.m ? `S${ev.m.state} ${E.STATE_NAMES[ev.m.state]}${ev.m.next === 0 && ev.m.state !== 0 ? ' ✔' : ''}` : '';
      return `<div><span class="num">t=${ev.t}</span><span class="ls">${esc(s)}</span><span class="lm">${esc(m)}</span></div>`;
    });
    $('#log').innerHTML = rows.join('') || '<div><span></span><span class="muted">ยังไม่มีเหตุการณ์</span><span></span></div>';

    // ปุ่ม
    $('#b-step').disabled = R.allDone;
    $('#b-end').disabled = R.allDone;
    renderFormula();
    drawChart();
  }

  // ---------- วิเคราะห์ ----------
  const MIX_COLORS = { R: '#7b8cde', addi: '#5fb3a1', lw: '#e0a43a', sw: '#d1735b', beq: '#a87fc9', j: '#8a9bb0', illegal: '#cc4444' };
  const MIX_NAMES = { R: 'R-type (4 step)', addi: 'addi (4)', lw: 'lw (5)', sw: 'sw (4)', beq: 'beq (3)', j: 'j (3)', illegal: 'illegal (2)' };

  function renderAnalysis() {
    if (!S.ref) return;
    const mix = S.ref.mix, total = S.ref.retired || 1;
    $('#mix').innerHTML = Object.entries(mix).filter(([, n]) => n).map(([k, n]) =>
      `<div style="width:${n / total * 100}%;background:${MIX_COLORS[k]}" title="${MIX_NAMES[k]}: ${n} คำสั่ง"></div>`).join('');
    $('#mixlegend').innerHTML = Object.entries(mix).filter(([, n]) => n).map(([k, n]) =>
      `<span><i style="background:${MIX_COLORS[k]}"></i>${MIX_NAMES[k]} × ${n}</span>`).join('');
  }

  function renderFormula() {
    if (!S.ref) return;
    const { retired: ic, steps } = S.ref;
    const cpi = steps / ic;
    const ts = 50 + S.ov, tm = 10 + S.ov;
    const t = E.raceTimes(ic, steps, S.ov);
    const w = t.s < t.m ? 'single' : t.m < t.s ? 'multi' : 'เสมอ';
    const flip = E.flipOv(ic, steps);
    $('#formula').innerHTML =
      `<div style="color:var(--single)">single = ${ic} คำสั่ง × CPI 1 × ${ts} = <b>${thai(t.s)}</b></div>` +
      `<div style="color:var(--multi)">multi&nbsp; = ${ic} คำสั่ง × CPI ${cpi.toFixed(3)} × ${tm} = ${steps} step × ${tm} = <b>${thai(t.m)}</b></div>` +
      `<div style="margin-top:6px">ผล: <b>${w}</b>${w !== 'เสมอ' ? ' เร็วกว่า ' + thai(Math.abs(t.s - t.m)) + ' หน่วย' : ''}</div>` +
      `<div class="muted">multi ชนะเมื่อ CPI × (10 + ov) &lt; 50 + ov → ${cpi.toFixed(3)} × (10 + ov) &lt; 50 + ov → ` +
      (flip == null ? 'ชนะทุกค่า ov ที่ตั้งได้ (0–15)' : `ov ≤ ${flip - 1} (single เริ่มชนะที่ ov = ${flip})`) + '</div>';
  }

  function drawChart() {
    const svg = $('#chart');
    if (!S.ref) { svg.innerHTML = ''; return; }
    const { retired: ic, steps } = S.ref;
    const W = 520, H = 260, L = 56, Rr = 16, T = 16, B = 40;
    const pts = Array.from({ length: 16 }, (_, ov) => ({ ov, ...E.raceTimes(ic, steps, ov) }));
    const lo = Math.min(...pts.map((p) => Math.min(p.s, p.m))), hi = Math.max(...pts.map((p) => Math.max(p.s, p.m)));
    const span = hi - lo || 1;
    const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000].find((st) => span / st <= 6) || 100000;
    const y0 = Math.floor(lo / nice) * nice, y1 = Math.ceil(hi / nice) * nice;
    const X = (ov) => L + ov / 15 * (W - L - Rr);
    const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
    let g = '';
    const flip = E.flipOv(ic, steps);
    if (flip != null) g += `<rect class="flip" x="${X(flip) - (X(1) - X(0)) / 2}" y="${T}" width="${X(15) - X(flip) + (X(1) - X(0)) / 2}" height="${H - T - B}"></rect>` +
      `<text x="${X(flip)}" y="${T + 12}" style="fill:var(--ink)">single ชนะ →</text>`;
    for (let v = y0; v <= y1 + 1e-9; v += nice) g += `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}"></line><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${thai(Math.round(v))}</text>`;
    for (let ov = 0; ov <= 15; ov += 1) g += `<text x="${X(ov)}" y="${H - B + 16}" text-anchor="middle">${ov}</text>`;
    g += `<text x="${(L + W - Rr) / 2}" y="${H - 6}" text-anchor="middle">ov (overhead ต่อการผ่าน register 1 ครั้ง)</text>`;
    g += `<text x="12" y="${T + (H - T - B) / 2}" transform="rotate(-90 12 ${T + (H - T - B) / 2})" text-anchor="middle">เวลาจบ (หน่วย)</text>`;
    g += `<polyline class="ls" points="${pts.map((p) => `${X(p.ov)},${Y(p.s)}`).join(' ')}"></polyline>`;
    g += `<polyline class="lm" points="${pts.map((p) => `${X(p.ov)},${Y(p.m)}`).join(' ')}"></polyline>`;
    for (const p of pts) {
      g += `<circle class="ds" cx="${X(p.ov)}" cy="${Y(p.s)}" r="${p.ov === S.ov ? 5 : 2.5}"><title>ov ${p.ov}: single ${p.s}</title></circle>`;
      g += `<circle class="dm" cx="${X(p.ov)}" cy="${Y(p.m)}" r="${p.ov === S.ov ? 5 : 2.5}"><title>ov ${p.ov}: multi ${p.m}</title></circle>`;
    }
    g += `<line class="cur" x1="${X(S.ov)}" x2="${X(S.ov)}" y1="${T}" y2="${H - B}"></line>`;
    const cur = pts[S.ov];
    const lx = X(S.ov) > W / 2 ? X(S.ov) - 6 : X(S.ov) + 6;
    g += `<text x="${lx}" y="${T + 28}" text-anchor="${X(S.ov) > W / 2 ? 'end' : 'start'}" style="fill:var(--ink)">ov ${S.ov}: S ${thai(cur.s)} · M ${thai(cur.m)}</text>`;
    svg.innerHTML = g;
    $('#chart-note').textContent = `เส้นส้ม = single (${ic} × (50 + ov)) ชันน้อย เพราะเสีย ov ครั้งเดียวต่อคำสั่ง · เส้นฟ้า = multi (${steps} × (10 + ov)) ชันกว่า เพราะเสีย ov ทุก step` +
      (flip != null ? ` · เส้นตัดกันระหว่าง ov ${flip - 1} กับ ${flip}` : '');
  }

  // ================================================================ LEARN
  const LESSONS = [
    {
      id: 'cpu', title: '1. CPU คืออะไร',
      easy: `<p>นึกถึง <b>พ่อครัว</b> ที่ทำตามสมุดสูตรทีละบรรทัด</p>
<div class="tblwrap"><table><tr><th>ในครัว</th><th>ใน CPU</th><th>หน้าที่</th></tr>
<tr><td>สมุดสูตร</td><td>โปรแกรม</td><td>คำสั่งเรียงทีละบรรทัด</td></tr>
<tr><td>นิ้วชี้บรรทัด</td><td>PC</td><td>จำว่ากำลังทำคำสั่งไหน</td></tr>
<tr><td>ตู้เย็น</td><td>Memory</td><td>เก็บของได้เยอะ แต่ต้องเดินไปหยิบ</td></tr>
<tr><td>ของบนเขียง</td><td>Register (32 ช่อง)</td><td>วางใกล้มือ หยิบได้ทันที</td></tr>
<tr><td>มีด เครื่องปั่น</td><td>ALU</td><td>บวก ลบ เทียบ</td></tr>
<tr><td>หัวหน้าครัว</td><td>Control</td><td>อ่านสูตรแล้วสั่งว่าใครทำอะไร</td></tr></table></div>
<p>พ่อครัวทำซ้ำ 3 อย่าง: <b>ดูบรรทัด → ทำตาม → เลื่อนนิ้ว</b> นี่คือทั้งหมดที่ CPU ทำ</p>`,
      class: `<p>CPU วน <b>fetch → decode → execute</b> ไปเรื่อยๆ: อ่านคำสั่งที่ address = PC, แยกช่องในคำสั่ง, ทำงานแล้วอัปเดต PC (ปกติ +4)</p>
<p>แบ่งเป็น <b>datapath</b> (ทางเดินข้อมูล: register, ALU, memory, mux) กับ <b>control</b> (ถอดรหัส opcode แล้วสร้างสัญญาณคุม mux และการเขียน) สไลด์ w04a หน้า 2–5</p>`,
      deep: `<p>ในโปรเจค datapath ของ single-cycle อยู่ที่ <code>rtl/single/single_cycle_cpu.v</code> control อยู่ที่ <code>rtl/single/sc_control.v</code> ALU, register file, sign-extend ใช้ร่วมกันใน <code>rtl/common/</code></p>
<p>ทั้งสอง CPU มี port เหมือนกัน (สเปคหัวข้อ 16): <code>en</code> = เดินหนึ่งจังหวะ, loader port เขียนโปรแกรมลง memory, debug port ให้จออ่าน register, <code>active</code> = 32 bit บอกว่าเส้นไหนในภาพติดไฟ</p>`,
      facts: ['<b>Mux = สวิตช์รางรถไฟ</b> หลายทางเข้า ทางออกเดียว สัญญาณ control เป็นคนโยก สไลด์ w04a หน้า 5: "Can\'t just join wires together → use multiplexers"'],
    },
    {
      id: 'code', title: '2. คำสั่งคือตัวเลข',
      easy: `<p>CPU อ่านภาษาคนไม่ออก <code>add $t2, $t0, $t1</code> ต้องแปลงเป็นตัวเลข 32 bit ก่อน เหมือนร้านอาหารที่จดออเดอร์เป็นรหัส ทุกคนในครัวรู้ว่าแต่ละช่องคืออะไร ตัวแปลงเรียกว่า <b>assembler</b></p>
<p>ลองพิมพ์โค้ดในแท็บ "เขียนโปรแกรม" แล้วกดแปลง จะเห็นตัวเลขของทุกบรรทัด</p>`,
      class: `<pre class="ascii">R  │ opcode 6 │ rs 5 │ rt 5 │ rd 5 │ shamt 5 │ funct 6 │
I  │ opcode 6 │ rs 5 │ rt 5 │      immediate 16        │
J  │ opcode 6 │            target 26                   │</pre>
<p><code>add $t2, $t0, $t1</code> → opcode 0, rs = 8, rt = 9, rd = 10, funct 0x20 → <code>0x01095020</code></p>
<p><code>lw $t0, 0x400($zero)</code> → opcode 0x23, rs = 0, rt = 8, imm 0x0400 → <code>0x8C080400</code></p>`,
      deep: `<p>assembler ของโปรเจค (<code>tools/asm.py</code> และ engine.js ในเว็บนี้) ทำ 2 รอบ: รอบแรกหา address ของทุก label รอบสองประกอบ bit ด้วย <code>(rs &lt;&lt; 21) | (rt &lt;&lt; 16) | (rd &lt;&lt; 11) | funct</code> ผลลัพธ์เป็นไฟล์ .mem 512 word (0–255 = โปรแกรม, 256–511 = ข้อมูล)</p>
<p>ฝั่งวงจรแยกช่องด้วย <code>instr[25:21]</code>, <code>instr[20:16]</code>, <code>instr[15:11]</code></p>`,
      facts: ['<b>ทำไมทุกคำสั่งยาว 32 bit เท่ากัน?</b> "Simplicity favors regularity" (w02a) PC + 4 ได้ทุกครั้ง ต่างจาก x86 ที่ยาว 1 ถึง 15 byte'],
      try: { label: 'เปิดตัวถอดรหัส', hash: 'bits' },
    },
    {
      id: 'isa', title: '3. ชุดคำสั่ง 10 ตัว',
      easy: `<div class="tblwrap"><table><tr><th>คำสั่ง</th><th>ทำอะไร</th></tr>
<tr><td><code>add sub and or</code></td><td>คำนวณ register สองตัว เก็บลงตัวที่สาม</td></tr>
<tr><td><code>slt</code></td><td>ได้ 1 ถ้าตัวแรกน้อยกว่า ไม่งั้นได้ 0</td></tr>
<tr><td><code>addi</code></td><td>บวกเลขที่ฝังในคำสั่ง</td></tr>
<tr><td><code>lw</code></td><td>หยิบจากตู้เย็น (memory) มาวางบนเขียง (register)</td></tr>
<tr><td><code>sw</code></td><td>เอาของบนเขียงไปเก็บตู้เย็น</td></tr>
<tr><td><code>beq</code></td><td>ถ้าเท่ากันให้กระโดด</td></tr>
<tr><td><code>j</code></td><td>กระโดดเสมอ</td></tr></table></div>
<p><code>$zero</code> เป็น 0 เสมอ เขียนเท่าไรก็ไม่ติด จบโปรแกรมด้วย <code>halt</code> (= j กระโดดหาตัวเอง)</p>`,
      class: `<ul><li><code>slt</code> เทียบแบบมีเครื่องหมาย: 0xFFFFFFFF คือ −1</li><li><code>addi</code> sign-extend immediate 16 bit ก่อนบวก (w02a หน้า 32)</li>
<li><code>beq</code>: PC = PC + 4 + offset × 4 (นับเป็นจำนวนคำสั่งจากคำสั่งถัดไป)</li><li><code>j</code>: PC = {PC+4[31:28], target, 00} (w04a หน้า 34)</li>
<li>ไม่มี bne, blt, mul ต้องประกอบเอง เช่น ลูปใช้ slt + beq</li></ul>`,
      deep: `<p>คำสั่งที่ไม่รู้จักถือเป็น NOP (นับ retired) multicycle ใช้ 2 step แล้วกลับ FETCH · halt ตรวจแบบ combinational: <code>done = jump &amp; (jump_target == pc)</code> จึงไม่รันและไม่นับคำสั่ง halt · lw/sw ต้องอยู่ใน 0x400–0x7FF ไม่งั้น single กับ multi จะให้ผลต่างกัน (multi ใช้ memory ก้อนเดียว)</p>`,
      facts: ['<b>SPIM จบโปรแกรมด้วย syscall 10</b> ซึ่งต้องมี OS คอยรับ CPU ของเราไม่มี OS เลยใช้ j หาตัวเองแทน'],
    },
    {
      id: 'clock', title: '4. Clock: จังหวะกลอง',
      easy: `<p>นึกถึงวงโยธวาทิตที่ทุกคนก้าวพร้อมกันตามเสียงกลอง ระหว่างเสียงกลองแต่ละครั้งทุกคนเตรียมตัว พอกลองดังทุกคนก้าวพร้อมกัน <b>กลองต้องช้าพอให้คนที่คิดช้าที่สุดคิดทัน</b></p>
<p>Register คือคนในแถว เปลี่ยนค่าเฉพาะตอนกลองดัง ส่วน ALU, mux คือความคิดในหัว เปลี่ยนตามตลอดแต่ใช้เวลา</p>`,
      class: `<p>sequential element อัปเดตที่ขอบขาขึ้นของ clock combinational element มี delay · clock period ≥ delay ของ critical path (w04a หน้า 15)</p>
<p><b>เวลา = จำนวนคำสั่ง × CPI × clock period</b> (w01b หน้า 12)</p>`,
      deep: `<p>บอร์ดใช้ clock 25 MHz ตัวเดียว (MMCM แปลงจาก 100 MHz ใน <code>rtl/clk_gen.v</code>) แต่ CPU เดินเฉพาะตอนได้ <code>en</code> จาก <code>race_ctrl</code> · Vivado รายงานว่า path ที่ยาวที่สุดยังเหลือเวลาว่าง 19.2 ns จาก 40 ns</p>`,
      facts: ['<b>ที่ 3–4 GHz</b> แม้แต่แสงยังเดินทางได้แค่ราว 10 cm ต่อหนึ่งจังหวะ ขนาดชิปจึงมีผลกับความเร็วจริงๆ'],
    },
    {
      id: 'single', title: '5. Single-cycle',
      easy: `<p>ร้านที่ <b>ทุกออเดอร์ได้เวลา 50 นาทีเท่ากัน</b> เพราะเมนูที่นานที่สุด (lw) ใช้ 50 นาที สั่งน้ำเปล่าก็ต้องรอ 50 นาที จัดคิวง่าย แต่เสียเวลาเปล่ากับเมนูง่าย</p>
<p>ทุกคำสั่งเสร็จใน <b>1 clock</b> ข้อมูลไหลจากซ้ายไปขวาจนสุดภาพใน clock เดียว</p>`,
      class: `<pre class="ascii">PC → IMEM → RegFile(อ่าน) → ALU → DMEM → RegFile(เขียน)
 ① fetch     ② อ่าน reg     ③ คำนวณ  ④ memory  ⑤ เขียนผล</pre>
<p>ต้องมี IMEM กับ DMEM แยกกัน เพราะ lw ต้องอ่านทั้งคำสั่งและข้อมูลใน clock เดียว (w04a หน้า 22) · critical path = lw (w04a หน้า 36)</p>
<div class="tblwrap"><table><tr><th>สัญญาณ</th><th>เป็น 1 แปลว่า</th></tr>
<tr><td>RegDst</td><td>เขียนลง rd (R-type) แทน rt</td></tr><tr><td>ALUSrc</td><td>ALU ใช้ immediate แทน register ตัวที่สอง</td></tr>
<tr><td>MemtoReg</td><td>ค่าที่เขียนกลับมาจาก memory (lw)</td></tr><tr><td>RegWrite / MemRead / MemWrite</td><td>เขียน register / อ่าน / เขียน memory</td></tr>
<tr><td>Branch / Jump</td><td>เป็น beq / j</td></tr></table></div>`,
      deep: `<p>ทั้ง datapath เป็น combinational (<code>assign</code>) ยกเว้น PC, register file, DMEM ที่เปลี่ยนตอน <code>posedge clk</code> เมื่อ <code>step = en &amp; ~done</code> · memory ต้องเป็น LUTRAM (อ่านได้ทันที) เพราะ BRAM ได้ค่าช้าไป 1 clock</p>`,
      facts: ['<b>ไม่มี CPU ขายจริงตัวไหนเป็น single-cycle</b> เพราะ clock ถูกบังคับให้ช้าเท่าคำสั่งที่ช้าที่สุด (w04a หน้า 36: "violates making the common case fast")'],
      try: { label: 'ดู lw วิ่งในหน้าแข่ง', prog: 'ex_lw_add', steps: 0 },
    },
    {
      id: 'multi', title: '6. Multicycle',
      easy: `<p>ร้านใหม่ <b>แบ่งเวลาเป็นช่วงละ 10 นาที</b> น้ำเปล่า 3 ช่วง ข้าวผัด 4 ช่วง สเต๊ก 5 ช่วง เมนูง่ายจึงเสร็จเร็วขึ้น และใช้เตาเดียวซ้ำได้หลายช่วง</p>
<p>แต่ต้องมี <b>ถาดพักของ</b> ระหว่างช่วง (IR, A, B, ALUOut, MDR) และ <b>ทุกครั้งที่จบช่วงเสียเวลาย้ายของลงถาด</b> นั่นคือ ov</p>`,
      class: `<div class="tblwrap"><table><tr><th>step</th><th>ทุกคำสั่ง / R / lw / sw / beq / j</th></tr>
<tr><td>1</td><td>IR ← Mem[PC]; PC ← PC + 4</td></tr><tr><td>2</td><td>A ← R[rs]; B ← R[rt]; ALUOut ← PC + (sext(imm) &lt;&lt; 2)</td></tr>
<tr><td>3</td><td>R: ALUOut ← A op B · lw/sw: ALUOut ← A + sext(imm) · beq: if A == B PC ← ALUOut · j: PC ← jump</td></tr>
<tr><td>4</td><td>R: R[rd] ← ALUOut · lw: MDR ← Mem[ALUOut] · sw: Mem[ALUOut] ← B</td></tr><tr><td>5</td><td>lw: R[rt] ← MDR</td></tr></table></div>
<p>lw 5 step · R, sw, addi 4 · beq, j 3 · memory ก้อนเดียว ALU ตัวเดียว (w04c หน้า 3–4)</p>`,
      deep: `<pre class="ascii">S0 FETCH → S1 DECODE ─┬─ lw/sw → S2 MEM_ADDR ─┬─ lw → S3 MEM_READ → S4 MEM_WB
                      │                        └─ sw → S5 MEM_WRITE
                      ├─ R    → S6 EXECUTE → S7 ALU_WB
                      ├─ beq  → S8 BRANCH
                      ├─ j    → S9 JUMP
                      └─ addi → S10 ADDI_EXEC → S11 ADDI_WB        (ทุกทางกลับ S0)</pre>
<p><code>rtl/multi/mc_fsm.v</code>: บล็อกแรก = state register, บล็อกสอง = ลูกศร, บล็อกสาม = สัญญาณของแต่ละ state · A, B, ALUOut, MDR รับค่าใหม่ทุก step แบบในสไลด์</p>`,
      facts: ['<b>ทำไม DECODE คำนวณเป้าหมาย branch ทั้งที่ยังไม่รู้ว่าเป็น beq?</b> ALU ว่างอยู่แล้ว คำนวณเผื่อฟรีๆ ถ้าเป็น beq จริงก็ประหยัด 1 step แนวคิด "ทำเผื่อตอนว่าง" นี้ CPU สมัยใหม่ใช้หนักมาก (speculative execution)'],
      try: { label: 'ดู multicycle ทีละ step', prog: 'ex_lw_add', steps: 3 },
    },
    {
      id: 'race', title: '7. ใครเร็วกว่ากันจริงๆ',
      easy: `<p>ถ้าย้ายของลงถาดไม่เสียเวลาเลย ร้านแบ่งช่วง (multi) ชนะแน่ แต่ถ้าย้ายแต่ละครั้งเสีย ov นาที ร้าน multi เสียบ่อยกว่า (3–5 ครั้งต่อออเดอร์) ร้าน single เสียแค่ครั้งเดียว <b>ov สูงพอ ผลจะพลิก</b></p>
<p>โปรแกรมที่มี lw เยอะ (5 ช่วง) multi ได้เปรียบน้อย ส่วนโปรแกรมที่มี beq/j เยอะ (3 ช่วง) multi ได้เปรียบมาก</p>`,
      class: `<p><b>เวลา = IC × CPI × T</b> · single: CPI = 1, T = 50 + ov · multi: CPI = 3–5, T = 10 + ov</p>
<p>multi ชนะเมื่อ <code>CPI × (10 + ov) &lt; 50 + ov</code> · โปรแกรม A (CPI 3.63) ชนะถึง ov = 5 · โปรแกรม B (CPI 3.97) ชนะถึง ov = 3 · <b>ที่ ov = 4 ผู้ชนะต่างกันตามโปรแกรม</b></p>`,
      deep: `<p><code>rtl/race/race_ctrl.v</code> มีนาฬิการ่วม <code>time_now</code> และ <code>next_s</code>, <code>next_m</code> ทุกครั้งที่เวลาถึง ปล่อย <code>en</code> ให้ core นั้นแล้วบวก T ของมัน · step mode กระโดดไป min(next_s, next_m) · เวลาจบ = เวลาของ step สุดท้าย ⇒ single = N × (50 + ov), multi = S × (10 + ov) ตรวจด้วยการจำลองทั้งบอร์ดแล้ว</p>`,
      facts: ['<b>ov ในโลกจริง</b> คือ setup time + clock-to-Q ของ flip-flop + clock skew เวลาที่ไม่ได้ทำงานอะไรเลยแต่ต้องเสียทุกครั้งที่ข้อมูลผ่าน register',
        '<b>Megahertz Myth:</b> ต้นยุค 2000 Pentium 4 มี GHz สูงแต่แบ่งงานเป็นช่วงสั้นมาก (รุ่น Prescott มี pipeline 31 stage) บางงานแพ้ CPU ที่ GHz ต่ำกว่า บทเรียนเดียวกับโปรเจคนี้: ดูเวลาจริง อย่าดูแค่ clock'],
      try: { label: 'แข่งโปรแกรม B ที่ ov = 4', prog: 'demoB_mem_heavy', ov: 4, end: true },
    },
    {
      id: 'project', title: '8. เบื้องหลังโปรเจค',
      easy: `<p>เราสร้าง CPU ทั้งสองตัวเป็นวงจรจริงบนชิป FPGA แล้วให้จอ VGA วาดรูปครัวทั้งสองร้าน ส่วนที่ทำงานติดไฟ เว็บนี้ใช้ภาพชุดเดียวกับจอบนบอร์ด</p>`,
      class: `<p><b>FPGA</b> คือชิปที่ต่อวงจรใหม่ได้ ข้างในมี LUT (ตารางความจริงเล็กๆ ~63,000 ตัว), flip-flop, BRAM เขียนวงจรด้วย Verilog แล้ว Vivado แปลงเป็น bitstream</p>
<p><b>wire-ID:</b> ภาพพื้นหลังเก็บ "เลขประจำเส้น" แทนสี วงจรอ่านเลขนี้ทีละ pixel แล้วเลือกสีตาม active จาก CPU</p>`,
      deep: `<p>ตรวจความถูกต้อง 4 ทาง: ref_model.py, <b>cpuSim ของอาจารย์</b> (ผ่าน adapter), single, multi ต้องตรงกันทุก register, ทุก word และจำนวน clock + ค่าที่คิดเองใน <code>#! expect</code> + จำลองทั้งบอร์ดแข่งแล้วเช็กเวลา · engine.js ของเว็บนี้ก็ถูกเทียบกับผลเหล่านั้น (<code>node sim/test_web.js</code>)</p>`,
      facts: ['<b>MIPS</b> มาจาก Stanford ต้นทศวรรษ 1980 ทีมของ John Hennessy ซึ่งได้รางวัล Turing Award ร่วมกับ David Patterson (ผู้เขียนตำรา P&amp;H ที่สไลด์อ้างถึง)',
        '<b>MIPS เคยอยู่ในเครื่องเกม:</b> PlayStation รุ่นแรก (ตระกูล R3000) และ Nintendo 64 (R4300i)'],
    },
  ];

  function renderLearn() {
    $('#toc').innerHTML = LESSONS.map((l) => `<a href="#learn" data-jump="${l.id}">${esc(l.title)}</a>`).join('');
    const lvName = { easy: 'ภาษาชาวบ้าน', class: 'ภาษาในห้องเรียน', deep: 'ในโค้ดของเรา' };
    $('#lessons').innerHTML = LESSONS.map((l) => `
      <article class="card lesson" id="lesson-${l.id}">
        <h2>${esc(l.title)}</h2>
        <span class="lvtag">ระดับ: ${lvName[S.level]} (เปลี่ยนได้ที่ปุ่ม "คำอธิบาย" ด้านบน)</span>
        <div class="lv">${l[S.level]}</div>
        ${(l.facts || []).map((f) => `<div class="fact">💡 ${f}</div>`).join('')}
        ${l.try ? `<div><button class="btn" type="button" data-try="${l.id}">${esc(l.try.label)} →</button></div>` : ''}
      </article>`).join('');
  }

  function tryLesson(id) {
    const t = LESSONS.find((l) => l.id === id).try;
    if (t.hash) { location.hash = t.hash; return; }
    setProgram(t.prog);
    if (t.ov != null) setOv(t.ov);
    location.hash = 'race';
    newRace();
    for (let i = 0; i < (t.steps || 0); i++) pushEvents([S.race.stepEvent()]);
    if (t.end) runToEnd();
    renderRace();
  }

  // ================================================================ CODE
  let codeProg = null, codeSel = null;

  function fieldsSpec(w) {
    const k = E.classify(w), f = E.fields(w);
    if (k === 'j') return [['opcode', 6, f.opcode, 'f-op', 'J-format: j'], ['target', 26, f.target, 'f-tg', `× 4 = ${hex(f.target << 2, 4)}`]];
    if (k === 'R' || (f.opcode === 0)) return [['opcode', 6, f.opcode, 'f-op', 'R-format'], ['rs', 5, f.rs, 'f-rs', reg(f.rs)], ['rt', 5, f.rt, 'f-rt', reg(f.rt)],
      ['rd', 5, f.rd, 'f-rd', reg(f.rd)], ['shamt', 5, f.shamt, 'f-sh', ''], ['funct', 6, f.funct, 'f-fn', E.FUNCT_NAME[f.funct] || '?']];
    return [['opcode', 6, f.opcode, 'f-op', k === 'illegal' ? '?' : k], ['rs', 5, f.rs, 'f-rs', reg(f.rs)], ['rt', 5, f.rt, 'f-rt', reg(f.rt)],
      ['immediate', 16, f.imm, 'f-imm', `= ${E.sext16(f.imm)}`]];
  }

  function fieldsHTML(w) {
    return fieldsSpec(w).map(([n, bits, v, cls, note]) =>
      `<div class="field"><span class="n">${n} (${bits})</span><span class="b ${cls}">${v.toString(2).padStart(bits, '0').replace(/(.{4})(?=.)/g, '$1 ')}</span><span class="v ${cls}">${bits > 6 ? hex(v, Math.ceil(bits / 4)) : v}${note ? ' · ' + esc(note) : ''}</span></div>`).join('');
  }

  function codeWordHTML(w) {
    if (S.base !== 'bin') return esc(fmt(w));
    return fieldsSpec(w).map(([, bits, v, cls]) => `<span class="${cls}">${v.toString(2).padStart(bits, '0')}</span>`).join(' ');
  }

  function assembleEditor() {
    const src = $('#editor').value;
    const status = $('#asm-status');
    try {
      codeProg = E.assemble(src);
    } catch (e) {
      codeProg = null;
      status.innerHTML = `<span class="err">${esc(e.message)}</span>`;
      $('#listing').innerHTML = '';
      $('#code-result').innerHTML = '';
      highlightErrLine(e.line);
      return null;
    }
    status.innerHTML = `<span class="ok">แปลงได้</span> โปรแกรม ${codeProg.textWords} คำสั่ง · ข้อมูล ${codeProg.dataWords} word`;
    const rows = codeProg.listing.map((r, i) =>
      `<tr data-i="${i}"><td>${esc(fmtAddr(r.addr))}</td><td>${codeWordHTML(r.word)}</td><td>${r.kind === 'text' ? esc(E.disasm(r.word, r.addr, codeProg.symbols)) : '<span class="muted">.word</span>'}</td><td class="src">${esc(r.raw.trim())}</td></tr>`);
    $('#listing').innerHTML = `<tr><th>address</th><th>machine code</th><th>ถอดกลับ</th><th>บรรทัดต้นฉบับ</th></tr>` + rows.join('');
    const first = codeProg.listing.findIndex((r) => r.kind === 'text');
    selectRow(first >= 0 ? first : 0);
    runCodeResult();
    return codeProg;
  }

  function highlightErrLine(line) {
    if (!line) return;
    const ta = $('#editor');
    const lines = ta.value.split('\n');
    let start = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) start += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(start, start + (lines[line - 1] || '').length);
  }

  function selectRow(i) {
    if (!codeProg || !codeProg.listing[i]) { $('#code-fields').innerHTML = ''; return; }
    codeSel = i;
    $$('#listing tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.i === String(i)));
    const r = codeProg.listing[i];
    $('#code-fields').innerHTML = r.kind === 'text' ? fieldsHTML(r.word) : `<span class="small muted">ข้อมูลใน .data: ${esc(fmt(r.word))} = ${r.word | 0}</span>`;
  }

  function runCodeResult() {
    const out = $('#code-result');
    let r;
    try { r = E.runRef(codeProg.words); } catch (e) {
      out.innerHTML = `<p class="err">${esc(e.message)}</p><p class="small muted">ตรวจว่ามี halt และ lw/sw อยู่ในช่วง .data (0x400 ขึ้นไป)</p>`;
      return;
    }
    const changed = r.regs.map((v, i) => [i, v]).filter(([i, v]) => i && v);
    const exp = codeProg.expects.map((x) => {
      let got;
      if (x.key === 'retired') got = r.retired; else if (x.key === 'steps') got = r.steps; else if (x.key === 'illegal') got = r.illegal;
      else if (x.key.startsWith('$')) { try { got = r.regs[E.REG_NAMES.indexOf(x.key.slice(1).toLowerCase())] ?? r.regs[parseInt(x.key.slice(1), 10)]; } catch (e) { got = undefined; } }
      else {
        const mm = /^mem\[(.+)\]$/.exec(x.key);
        if (mm) { const addr = codeProg.symbols[mm[1]] ?? E.parseNumber(mm[1]); got = r.mem[addr >> 2]; }
      }
      const ok = got >>> 0 === x.value >>> 0;
      const count = ['retired', 'steps', 'illegal'].includes(x.key);
      const show = (v) => (count ? String(v) : fmt(v));
      return `<div class="${ok ? 'ok' : 'err'} small">${ok ? '✔' : '✘'} ${esc(x.key)} = ${esc(show(x.value))}${ok ? '' : ' (ได้ ' + esc(show(got)) + ')'}</div>`;
    });
    const t0 = E.raceTimes(r.retired, r.steps, 0), flip = E.flipOv(r.retired, r.steps);
    out.innerHTML = `<h3 style="margin:6px 0">ผลเมื่อรันจนจบ</h3>
      <p class="small">${r.retired} คำสั่ง · multicycle ${r.steps} step (CPI ${(r.steps / (r.retired || 1)).toFixed(2)}) · ov = 0: single ${thai(t0.s)} vs multi ${thai(t0.m)} · ${flip == null ? 'multi ชนะทุก ov' : 'single เริ่มชนะที่ ov = ' + flip}</p>
      <div class="regs" style="margin-top:6px">${changed.map(([i, v]) => `<div class="reg"><span>${reg(i)}</span><span>${esc(fmt(v))}</span></div>`).join('') || '<span class="small muted">ไม่มี register ที่เปลี่ยน</span>'}</div>
      ${exp.length ? `<div style="margin-top:8px">${exp.join('')}</div>` : ''}`;
  }

  // ================================================================ BITS
  let convVal = 0xfffffffb;
  function renderBits() {
    const v = convVal >>> 0;
    $('#bitgrid').innerHTML = Array.from({ length: 32 }, (_, k) => {
      const i = 31 - k, b = (v >>> i) & 1;
      return `<button type="button" class="bit${b ? ' one' : ''}${i === 31 ? ' sign' : ''}" data-bit="${i}" aria-label="bit ${i} = ${b}">${b}<small>${i}</small></button>`;
    }).join('');
    const rows = [['HEX', '0x' + v.toString(16).toUpperCase().padStart(8, '0'), 'ฐาน 16: 1 หลัก = 4 bit'],
      ['DEC (unsigned)', String(v), 'มองทุก bit เป็นค่าบวก 0 ถึง 4,294,967,295'],
      ['DEC (signed)', String(v | 0), 'two\'s complement: bit 31 มีค่า −2³¹'],
      ['BIN', v.toString(2).padStart(32, '0').replace(/(.{4})(?=.)/g, '$1 '), '32 bit'],
      ['ต่ำสุด 16 bit → addi', `${E.sext16(v & 0xffff)}`, 'ถ้าใส่ค่านี้เป็น immediate จะเหลือแค่ 16 bit ล่าง']];
    $('#convout').innerHTML = rows.map(([a, b, c]) => `<span class="small muted">${a}</span><span class="v">${esc(b)}</span><span class="small muted">${esc(c)}</span>`).join('');
    const neg = (v | 0) < 0;
    $('#conv-explain').innerHTML = neg
      ? `เลขติดลบ ${v | 0}: เก็บเป็น 2³² − ${-(v | 0)} = ${v} · วิธีลัดหาค่าลบของ x: <b>กลับทุก bit แล้วบวก 1</b> (w02a หน้า 31) เช่น −(${-(v | 0)}) = ~${-(v | 0)} + 1`
      : `เลขบวก: bit 31 เป็น 0 ค่า signed กับ unsigned จึงเท่ากัน ลองคลิก bit 31 ดูว่าค่า signed กลายเป็นเท่าไร`;
  }

  function renderDecoder() {
    const raw = $('#dec-in').value.trim();
    const n = E.parseNumber(raw.startsWith('0x') || raw.startsWith('0b') || raw.startsWith('-') || /^\d+$/.test(raw) ? raw : '0x' + raw);
    if (n == null || Number.isNaN(n)) { $('#dec-fields').innerHTML = ''; $('#dec-out').innerHTML = '<p class="err small">พิมพ์เป็น hex เช่น 0x8c080400</p>'; return; }
    const w = n >>> 0, k = E.classify(w), f = E.fields(w);
    $('#dec-fields').innerHTML = fieldsHTML(w);
    const asm = E.disasm(w, null);
    const meaning = {
      R: () => `${reg(f.rd)} = ${reg(f.rs)} ${opSym(E.FUNCT_NAME[f.funct])} ${reg(f.rt)}`,
      addi: () => `${reg(f.rt)} = ${reg(f.rs)} + ${E.sext16(f.imm)}`,
      lw: () => `${reg(f.rt)} = Mem[${reg(f.rs)} + ${E.sext16(f.imm)}]`,
      sw: () => `Mem[${reg(f.rs)} + ${E.sext16(f.imm)}] = ${reg(f.rt)}`,
      beq: () => `ถ้า ${reg(f.rs)} == ${reg(f.rt)} กระโดดไป ${E.sext16(f.imm)} คำสั่งจากคำสั่งถัดไป`,
      j: () => `กระโดดไป address ${hex(f.target << 2, 4)} (4 bit บนมาจาก PC+4)`,
      illegal: () => 'ไม่อยู่ใน ISA ของเรา CPU จะทำเป็น NOP',
    }[k]();
    const steps = E.MC_STEPS[k];
    $('#dec-out').innerHTML = `<p><b class="mono">${esc(asm)}</b></p><p class="small">${esc(meaning)}</p>
      <p class="small muted">single ใช้ 1 clock (50 + ov) · multicycle ใช้ ${steps} step (${steps} × (10 + ov))</p>`;
  }

  function renderSignExt() {
    const n = E.parseNumber($('#se-in').value);
    if (n == null) { $('#se-out').innerHTML = '<p class="err small">พิมพ์ตัวเลข เช่น 0xfffb หรือ -5</p>'; return; }
    const v16 = n & 0xffff, ext = E.sext16(v16) >>> 0, sb = (v16 >> 15) & 1;
    const b16 = v16.toString(2).padStart(16, '0');
    $('#se-out').innerHTML = `<div class="formula">
      <div>16 bit : <span class="muted">${'·'.repeat(16)}</span> <b>${b16.replace(/(.{4})(?=.)/g, '$1 ')}</b></div>
      <div>32 bit : <span style="color:var(--bad)">${String(sb).repeat(16).replace(/(.{4})(?=.)/g, '$1 ')}</span> <b>${b16.replace(/(.{4})(?=.)/g, '$1 ')}</b></div>
      <div style="margin-top:6px">= ${hex(ext, 8)} = ${ext | 0}</div></div>
      <p class="small muted">bit 15 = ${sb} จึงเติม ${sb} อีก 16 ตัวด้านซ้าย (สีแดง) ค่าตัวเลขจึงยังเท่าเดิม ถ้าเติม 0 เสมอ ${E.sext16(v16) < 0 ? 'เลขลบจะกลายเป็น ' + v16 : 'ผลจะเหมือนกันเพราะเป็นเลขบวก'}</p>`;
  }

  // ================================================================ QUIZ
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const REGS_Q = [8, 9, 10, 11, 12, 13, 16, 17, 18];
  let quiz = { right: 0, total: 0, cur: null };

  function genInstr() {
    const t = pick(['add', 'sub', 'and', 'or', 'slt', 'addi', 'lw', 'sw']);
    const a = pick(REGS_Q), b = pick(REGS_Q), c = pick(REGS_Q);
    if (t === 'addi') return `addi ${reg(a)}, ${reg(b)}, ${pick([1, 4, 10, -1, -8, 100, 255])}`;
    if (t === 'lw' || t === 'sw') return `${t} ${reg(a)}, ${pick([0, 4, 8, 12, 0x400])}(${reg(b)})`;
    return `${t} ${reg(a)}, ${reg(b)}, ${reg(c)}`;
  }

  const CONCEPTS = [
    { q: 'ทำไม single-cycle ต้องมี memory สองก้อน (IMEM, DMEM)?', a: ['เพราะใน 1 clock ต้องอ่านคำสั่งและอ่าน/เขียนข้อมูลพร้อมกัน', 'เพราะ memory ก้อนเดียวเก็บไม่พอ', 'เพราะ MIPS กำหนดให้แยก', 'เพื่อให้ clock เร็วขึ้น'], e: 'memory หนึ่งก้อนให้บริการได้ทีละ address ต่อ clock แต่ lw ต้องใช้ทั้งคำสั่งและข้อมูลใน clock เดียว (w04a หน้า 22)' },
    { q: 'ใน multicycle ถ้าไม่มี MDR จะเกิดอะไร?', a: ['step เขียนกลับจะได้ค่าจาก address = PC แทนข้อมูลที่อ่านไว้', 'ไม่มีผล', 'CPU จะเร็วขึ้น 1 step', 'beq จะทำงานผิด'], e: 'ใน S4 mux IorD กลับเป็น 0 memory จึงส่งค่าที่ PC ออกมา MDR ช่วย "พัก" ค่าที่อ่านใน S3 ข้ามขอบ clock' },
    { q: 'โปรแกรมที่มีแต่ lw ใครชนะที่ ov = 0?', a: ['เสมอ', 'single', 'multi', 'บอกไม่ได้'], e: 'lw: single 50, multi 5 × 10 = 50 เท่ากันพอดี ถ้า ov > 0 single ชนะ' },
    { q: 'ทำไม DECODE (S1) คำนวณเป้าหมาย branch ทั้งที่ยังไม่รู้ว่าเป็น beq?', a: ['ALU ว่างอยู่แล้ว คำนวณเผื่อไว้ ถ้าเป็น beq จะประหยัด 1 step', 'เพราะทุกคำสั่งต้องใช้', 'เพื่อเช็ก overflow', 'เป็นบั๊กของสไลด์'], e: 'ถ้าไม่ใช่ beq ก็ทิ้งไป ไม่เสียอะไร (แนวคิดเดียวกับ speculative execution)' },
    { q: 'ov ในโลกจริงคือเวลาของอะไร?', a: ['setup time + clock-to-Q ของ flip-flop และ clock skew', 'เวลาที่ ALU บวกเลข', 'เวลาอ่าน memory', 'เวลาเปิดเครื่อง'], e: 'เป็นเวลาที่เสียทุกครั้งที่ข้อมูลผ่าน register แบ่ง step ยิ่งมากยิ่งเสียบ่อย' },
    { q: 'slt $t0, $t1, $t2 เมื่อ $t1 = 0xFFFFFFFF, $t2 = 1 ได้เท่าไร?', a: ['1', '0', '0xFFFFFFFF', '2'], e: 'slt เทียบแบบมีเครื่องหมาย 0xFFFFFFFF = −1 < 1 จึงได้ 1' },
    { q: 'addi $t0, $zero, 0xFFFF ได้ค่าเท่าไร?', a: ['0xFFFFFFFF (−1)', '0x0000FFFF (65535)', '0xFFFF0000', 'error'], e: 'immediate ถูก sign-extend: bit 15 = 1 จึงเติม 1 ด้านซ้าย ได้ −1' },
    { q: 'ทำไม beq ใน multicycle ใช้ 3 step เสมอ ไม่ว่าจะกระโดดหรือไม่?', a: ['S8 เทียบและเขียน PC เฉพาะเมื่อเท่ากันในจังหวะเดียวกัน', 'ถ้าไม่กระโดดใช้ 2 step', 'ถ้ากระโดดใช้ 4 step', 'ขึ้นกับ ov'], e: 'PCWriteCond: PC ถูกเขียนเมื่อ Zero = 1 เท่านั้น แต่ step ยังเท่าเดิม' },
    { q: 'ใน single-cycle ทำไมใช้ BRAM เป็น memory ของ CPU ไม่ได้?', a: ['BRAM อ่านแล้วได้ค่า clock ถัดไป แต่ single ต้องได้ค่าภายใน clock เดียว', 'BRAM เล็กไป', 'BRAM เขียนไม่ได้', 'Vivado ไม่อนุญาต'], e: 'จึงใช้ LUTRAM ที่อ่านแบบ asynchronous (สเปคหัวข้อ 5.2)' },
  ];

  function newQuestion() {
    const type = $('#qtype').value === 'any' ? pick(['enc', 'dec', 'steps', 'race', 'concept']) : $('#qtype').value;
    let q;
    if (type === 'enc') {
      const src = genInstr();
      const w = E.assemble(src).words[0];
      q = { type, html: `<p>แปลงคำสั่งนี้เป็น machine code (hex 8 หลัก)</p><p class="mono" style="font-size:1.1rem"><b>${esc(src)}</b></p>
        <div class="row"><input type="text" id="q-ans" placeholder="0x........" style="width:12rem"><button class="btn primary" type="button" id="q-check">ตรวจ</button></div>`,
        check: () => { const n = E.parseNumber($('#q-ans').value.trim().startsWith('0x') ? $('#q-ans').value.trim() : '0x' + $('#q-ans').value.trim()); return n != null && (n >>> 0) === w; },
        explain: `คำตอบ <b class="mono">${hex(w, 8)}</b><div class="fields" style="margin-top:6px">${fieldsHTML(w)}</div>` };
    } else if (type === 'dec') {
      const src = genInstr();
      const w = E.assemble(src).words[0];
      const right = E.disasm(w, null);
      const opts = new Set([right]);
      while (opts.size < 4) opts.add(E.disasm(E.assemble(genInstr()).words[0], null));
      const arr = [...opts].sort(() => Math.random() - 0.5);
      q = { type, html: `<p>machine code <b class="mono">${hex(w, 8)}</b> คือคำสั่งไหน?</p>`, opts: arr, answer: right,
        explain: `<div class="fields">${fieldsHTML(w)}</div>` };
    } else if (type === 'steps') {
      const n = 3 + rnd(3);
      const lines = Array.from({ length: n }, () => genInstr());
      const prog = ['.data', 'buf: .space 64', '.text', ...lines.map((l) => l.replace(/(lw|sw) (\$\w+), \S+\((\$\w+)\)/, '$1 $2, buf($zero)')), 'halt'];
      const shown = prog.slice(3, -1);
      const r = E.runRef(E.assemble(prog.join('\n')).words);
      q = { type, html: `<p>multicycle ใช้กี่ step สำหรับคำสั่งเหล่านี้ (ไม่นับ halt)?</p><pre class="ascii">${esc(shown.join('\n'))}</pre>
        <div class="row"><input type="number" id="q-ans" style="width:7rem"><button class="btn primary" type="button" id="q-check">ตรวจ</button></div>`,
        check: () => parseInt($('#q-ans').value, 10) === r.steps,
        explain: `คำตอบ <b>${r.steps}</b> step: ${shown.map((l) => { const k = l.split(' ')[0]; const s = E.MC_STEPS[['add', 'sub', 'and', 'or', 'slt'].includes(k) ? 'R' : k]; return `${k} ${s}`; }).join(' + ')} · single ใช้ ${r.retired} clock` };
    } else if (type === 'race') {
      const c = { R: rnd(6), addi: rnd(5), lw: rnd(6), sw: rnd(3), beq: 1 + rnd(4), j: rnd(3) };
      const ic = Object.values(c).reduce((a, b) => a + b, 0);
      const steps = c.R * 4 + c.addi * 4 + c.lw * 5 + c.sw * 4 + c.beq * 3 + c.j * 3;
      const ov = rnd(9);
      const t = E.raceTimes(ic, steps, ov);
      const right = t.s < t.m ? 'single' : t.m < t.s ? 'multi' : 'เสมอ';
      q = { type, html: `<p>โปรแกรมรันคำสั่ง: ${Object.entries(c).filter(([, n]) => n).map(([k, n]) => `${k} × ${n}`).join(', ')} ที่ <b>ov = ${ov}</b> ใครชนะ?</p>`,
        opts: ['single', 'multi', 'เสมอ'], answer: right,
        explain: `single = ${ic} × ${50 + ov} = ${t.s} · multi = ${steps} step × ${10 + ov} = ${t.m} · CPI ของ multi = ${(steps / ic).toFixed(2)}` };
    } else {
      const c = pick(CONCEPTS);
      q = { type, html: `<p>${esc(c.q)}</p>`, opts: c.a.slice().sort(() => Math.random() - 0.5), answer: c.a[0], explain: esc(c.e) };
    }
    quiz.cur = q;
    q.done = false;
    const box = $('#q');
    box.innerHTML = q.html + (q.opts ? `<div class="opts">${q.opts.map((o, i) => `<button class="btn" type="button" data-opt="${i}">${esc(o)}</button>`).join('')}</div>` : '') + '<div id="q-explain"></div>';
    if (q.check) {
      $('#q-check').addEventListener('click', () => answer(q.check()));
      $('#q-ans').addEventListener('keydown', (e) => { if (e.key === 'Enter') answer(q.check()); });
    }
  }

  function answer(ok, btn) {
    const q = quiz.cur;
    if (!q || q.done) return;
    q.done = true;
    quiz.total++;
    if (ok) quiz.right++;
    $('#score').textContent = `ทำถูก ${quiz.right} / ${quiz.total}`;
    if (q.opts) $$('#q [data-opt]').forEach((b) => { if (b.textContent === q.answer) b.classList.add('right'); else if (b === btn) b.classList.add('wrong'); });
    $('#q-explain').innerHTML = `<div class="explain"><b class="${ok ? 'ok' : 'err'}">${ok ? 'ถูกต้อง ✔' : 'ยังไม่ถูก'}</b><div>${q.explain}</div></div>`;
  }

  // ================================================================ BOARD
  function renderBoard() {
    const prog = +$('#bd-prog').value, ov = Math.max(0, Math.min(15, +$('#bd-ov').value || 0)), run = +$('#bd-mode').value;
    const sw = (run << 15) | (3 << 12) | (prog << 4) | ov;
    const use = new Set([15, 14, 13, 12, 4, 3, 2, 1, 0]);
    $('#sws').innerHTML = Array.from({ length: 16 }, (_, k) => {
      const i = 15 - k, up = (sw >> i) & 1;
      return `<div class="sw${up ? ' up' : ''}${use.has(i) ? ' use' : ''}" title="SW${i} ${up ? 'ขึ้น' : 'ลง'}"><div class="body"><div class="knob"></div></div>SW${i}</div>`;
    }).join('');
    const p = PROGS.find((x) => x.id === (prog ? 'demoB_mem_heavy' : 'demoA_alu_heavy'));
    const words = E.assemble(p.src).words;
    const race = new E.Race(words, ov);
    const steps = [`ตั้ง SW3–0 = ${ov.toString(2).padStart(4, '0')} (ov = ${ov}), SW4 ${prog ? 'ขึ้น (B)' : 'ลง (A)'}, SW15 ${run ? 'ขึ้น (run)' : 'ลง (step)'}${run ? ', SW14–12 = 011 (200 หน่วย/วิ)' : ''}`,
      'กด BTNL (ปุ่มซ้าย) เพื่อโหลดโปรแกรมใหม่ เวลากลับเป็น 0'];
    if (run) {
      steps.push('กด BTNR (ปุ่มขวา) ให้เริ่มวิ่ง');
      race.runToEnd();
      const st = race.status('s') || 'กำลังวิ่ง', mt = race.status('m') || 'กำลังวิ่ง';
      const h = (v) => (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
      $('#bd-expect').innerHTML = `<dt>จอแถว S</dt><dd>RETIRED ${h(race.s.retired)} · TIME ${h(race.lastS)} · ${st}</dd>
        <dt>จอแถว M</dt><dd>RETIRED ${h(race.m.retired)} · TIME ${h(race.lastM)} · ${mt}</dd>
        <dt>ฐานสิบ</dt><dd>single ${thai(race.lastS)} หน่วย · multi ${thai(race.lastM)} หน่วย</dd>
        <dt>7-seg (BTNU = เวลา)</dt><dd>${h(race.lastS).slice(4)}.${h(race.lastM).slice(4)}</dd>
        <dt>ใช้เวลาจริงบนบอร์ด</dt><dd>~${Math.round(Math.max(race.lastS, race.lastM) / 200)} วินาที (ที่ 200 หน่วย/วิ)</dd>`;
    } else {
      steps.push('กด BTNC (ปุ่มกลาง) ทีละครั้ง');
      const ts = [];
      for (let i = 0; i < 6; i++) { race.stepEvent(); ts.push(`${race.time} (${race.time.toString(16).toUpperCase()})`); }
      $('#bd-expect').innerHTML = `<dt>TIME หลังกดแต่ละครั้ง</dt><dd>${ts.join(' → ')}</dd>
        <dt>LED11–0</dt><dd>ไล่ตาม state ของ multicycle: S0 → S1 → S10 → S11 → S0 …</dd>`;
    }
    $('#bd-steps').innerHTML = steps.map((s) => `<li>${esc(s)}</li>`).join('');
  }

  // ================================================================ wiring
  function setProgram(id) {
    S.progId = id;
    $('#prog').value = id;
    loadProgram();
  }
  function setOv(ov) {
    S.ov = ov;
    $('#ov').value = ov;
    if (S.race) { S.race.ov = ov; newRace(); }
  }

  function fillProgramSelect(sel, withCustom) {
    const groups = {};
    for (const p of PROGS) (groups[p.groupLabel] = groups[p.groupLabel] || []).push(p);
    sel.innerHTML = Object.entries(groups).map(([g, ps]) =>
      `<optgroup label="${esc(g)}">${ps.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</optgroup>`).join('') +
      (withCustom ? '<optgroup label="ของฉัน"><option value="__custom">โปรแกรมที่เขียนเอง</option></optgroup>' : '');
  }

  function setBase(b) {
    S.base = b; store.set('base', b);
    $$('#base-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.base === b)));
    rerender();
  }
  function setLevel(l) {
    S.level = l; store.set('level', l);
    $$('#level-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.level === l)));
    rerender();
  }
  function rerender() {
    renderRace();
    renderLearn();
    if (codeProg) {
      $$('#listing tr[data-i]').forEach((tr) => {
        const r = codeProg.listing[+tr.dataset.i];
        tr.children[0].textContent = fmtAddr(r.addr);
        tr.children[1].innerHTML = codeWordHTML(r.word);
      });
      runCodeResult();
    }
  }

  const TABS = ['race', 'learn', 'code', 'bits', 'quiz', 'board'];
  function showTab() {
    const t = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'race';
    TABS.forEach((x) => $('#page-' + x).classList.toggle('on', x === t));
    $$('nav.tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === t ? 'page' : 'false'));
    if (t !== 'race') stopRun();
    if (t === 'quiz' && !quiz.cur) newQuestion();
    if (t === 'board') renderBoard();
  }

  function init() {
    refsS = buildDP($('#dp-s'), GEO.single, 's');
    refsM = buildDP($('#dp-m'), GEO.multi, 'm');
    fillProgramSelect($('#prog'), true);
    fillProgramSelect($('#code-load'), false);
    $('#prog').value = S.progId;

    $$('#base-seg button').forEach((b) => b.addEventListener('click', () => setBase(b.dataset.base)));
    $$('#level-seg button').forEach((b) => b.addEventListener('click', () => setLevel(b.dataset.level)));
    setBase(S.base); setLevel(S.level);

    $('#prog').addEventListener('change', (e) => {
      if (e.target.value === '__custom' && !S.customSrc) { S.customSrc = $('#editor').value; }
      setProgram(e.target.value);
    });
    $('#ov').addEventListener('input', (e) => setOv(+e.target.value));
    $('#speed').addEventListener('change', (e) => { S.speed = +e.target.value; });
    $('#b-reset').addEventListener('click', newRace);
    $('#b-step').addEventListener('click', doStep);
    $('#b-run').addEventListener('click', toggleRun);
    $('#b-end').addEventListener('click', runToEnd);
    $$('#predict [data-guess]').forEach((b) => b.addEventListener('click', () => {
      if (S.race && S.race.time > 0 && !S.race.allDone) { $('#guess-result').textContent = 'ทายได้ตอนเวลา = 0 เท่านั้น กด เริ่มใหม่ ก่อน'; return; }
      if (S.race && S.race.allDone) newRace();
      S.guess = b.dataset.guess;
      $$('#predict [data-guess]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#guess-result').textContent = 'บันทึกแล้ว กด วิ่ง หรือ จบเลย เพื่อดูผล';
    }));
    document.addEventListener('keydown', (e) => {
      if (!$('#page-race').classList.contains('on') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); doStep(); }
      else if (e.key === 'r' || e.key === 'R') toggleRun();
    });

    // learn
    $('#lessons').addEventListener('click', (e) => { const b = e.target.closest('[data-try]'); if (b) tryLesson(b.dataset.try); });
    $('#toc').addEventListener('click', (e) => {
      const a = e.target.closest('[data-jump]');
      if (!a) return;
      e.preventDefault();
      $('#lesson-' + a.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // code
    $('#code-load').value = 'ex_lw_add';
    $('#editor').value = store.get('draft', null) || PROGS.find((p) => p.id === 'ex_lw_add').src;
    $('#code-load').addEventListener('change', (e) => { $('#editor').value = PROGS.find((p) => p.id === e.target.value).src; assembleEditor(); });
    $('#editor').addEventListener('input', () => store.set('draft', $('#editor').value));
    $('#b-asm').addEventListener('click', assembleEditor);
    $('#b-torace').addEventListener('click', () => {
      if (!assembleEditor()) return;
      S.customSrc = $('#editor').value;
      setProgram('__custom');
      location.hash = 'race';
    });
    $('#listing').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) selectRow(+tr.dataset.i); });
    assembleEditor();

    // bits
    const parseConv = () => { const n = E.parseNumber($('#conv-in').value); if (n != null && !Number.isNaN(n)) { convVal = n >>> 0; renderBits(); } };
    $('#conv-in').addEventListener('input', parseConv);
    $('#conv-neg').addEventListener('click', () => { convVal = (-(convVal | 0)) >>> 0; $('#conv-in').value = String(convVal | 0); renderBits(); });
    $('#conv-rand').addEventListener('click', () => { convVal = (Math.random() * 2 ** 32) >>> 0; $('#conv-in').value = '0x' + convVal.toString(16); renderBits(); });
    $('#bitgrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bit]');
      if (!b) return;
      convVal = (convVal ^ (1 << +b.dataset.bit)) >>> 0;
      $('#conv-in').value = '0x' + convVal.toString(16).toUpperCase();
      renderBits();
    });
    parseConv();
    $('#dec-in').addEventListener('input', renderDecoder);
    $('#dec-rand').addEventListener('click', () => { $('#dec-in').value = hex(E.assemble(genInstr()).words[0], 8).toLowerCase(); renderDecoder(); });
    renderDecoder();
    $('#se-in').addEventListener('input', renderSignExt);
    renderSignExt();

    // quiz
    $('#q-next').addEventListener('click', newQuestion);
    $('#qtype').addEventListener('change', newQuestion);
    $('#q').addEventListener('click', (e) => {
      const b = e.target.closest('[data-opt]');
      if (b && quiz.cur && quiz.cur.opts) answer(b.textContent === quiz.cur.answer, b);
    });

    // board
    ['#bd-prog', '#bd-ov', '#bd-mode'].forEach((s) => $(s).addEventListener('input', renderBoard));

    loadProgram();
    renderLearn();
    window.addEventListener('hashchange', showTab);
    showTab();
  }

  // ทดสอบตัวเอง: เปิด index.html#selftest แล้วดูผลใน <title> (ใช้ตอนพัฒนา ไม่มีปุ่มในหน้าเว็บ)
  function selfTest() {
    const errs = [];
    const tryIt = (name, fn) => { try { fn(); } catch (e) { errs.push(`${name}: ${e.message}`); } };
    const walk = (id, max) => { setProgram(id); for (let i = 0; i < max && !S.race.allDone; i++) { pushEvents([S.race.stepEvent()]); renderRace(); } };
    for (const p of PROGS) tryIt(`${p.id}/all`, () => walk(p.id, 5000));
    for (const base of ['hex', 'dec', 'sdec', 'bin']) {
      for (const level of ['easy', 'class', 'deep']) {
        S.base = base; S.level = level;
        // ex_lw_add ผ่านเกือบทุก state, t_beq มี beq ที่กระโดด, t_j มี JUMP, t_illegal มีคำสั่งที่ไม่รู้จัก
        for (const id of ['ex_lw_add', 't_beq', 't_j', 't_illegal', 't_addi']) tryIt(`${id}/${base}/${level}`, () => walk(id, 80));
        tryIt(`learn/${level}`, renderLearn);
      }
    }
    tryIt('lessons', () => LESSONS.filter((l) => l.try && !l.try.hash).forEach((l) => tryLesson(l.id)));
    tryIt('quiz', () => { for (let i = 0; i < 200; i++) { newQuestion(); if (quiz.cur.check) quiz.cur.check(); } });
    tryIt('code', () => PROGS.forEach((p) => { $('#editor').value = p.src; assembleEditor(); }));
    tryIt('bits', () => { for (let i = 0; i < 50; i++) { $('#dec-rand').click(); $('#conv-rand').click(); } });
    tryIt('board', () => { for (const pr of ['0', '1']) for (const m of ['0', '1']) { $('#bd-prog').value = pr; $('#bd-mode').value = m; renderBoard(); } });
    document.title = errs.length ? 'SELFTEST FAIL ' + errs.slice(0, 3).join(' | ') : 'SELFTEST PASS';
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99;padding:16px;font:20px monospace;background:' + (errs.length ? '#c2352b' : '#16824c') + ';color:#fff';
    bar.textContent = document.title + (errs.length > 3 ? ` (+${errs.length - 3})` : '');
    document.body.appendChild(bar);
  }

  init();
  if (location.hash === '#selftest') selfTest();
})();
