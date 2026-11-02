// ทดสอบ web/engine.js ให้ตรงกับ Python (asm.py, ref_model.py) และ RTL
//   node sim/test_web.js          (ต้องรัน python sim/run_all.py ก่อน เพื่อให้มี build/sim/*.mem และ *.ref.state)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const E = require(path.join(ROOT, 'web', 'engine.js'));
const PROGRAMS = require(path.join(ROOT, 'web', 'programs.js'));
const BUILD = path.join(ROOT, 'build', 'sim');

let fails = 0;
const fail = (msg) => { fails++; console.log('[FAIL] ' + msg); };

for (const p of PROGRAMS) {
  const prog = E.assemble(p.src);
  const memFile = path.join(BUILD, `${p.id}.mem`);
  const refFile = path.join(BUILD, `${p.id}.ref.state`);
  if (!fs.existsSync(memFile) || !fs.existsSync(refFile)) { fail(`${p.id}: ไม่มี ${memFile} (รัน run_all.py ก่อน)`); continue; }
  const pyWords = fs.readFileSync(memFile, 'ascii').trim().split(/\s+/).map((h) => parseInt(h, 16) >>> 0);
  const diffAt = prog.words.findIndex((w, i) => w !== pyWords[i]);
  if (diffAt >= 0) { fail(`${p.id}: machine code ต่างจาก asm.py ที่ word ${diffAt}`); continue; }

  const before = fails;
  const refState = fs.readFileSync(refFile, 'ascii').replace(/\r\n/g, '\n');   // Python บน Windows เขียน CRLF
  const r = E.runRef(prog.words);
  if (E.formatState(r.regs, r.mem, r.retired) !== refState) fail(`${p.id}: runRef ต่างจาก ref_model.py`);

  const s = new E.SingleCore(prog.words);
  let sc = 0; while (!s.done && sc < 1e6) { s.step(); sc++; }
  if (E.formatState(s.regs, s.mem, s.retired) !== refState) fail(`${p.id}: SingleCore ต่างจาก ref`);
  if (sc !== r.retired) fail(`${p.id}: SingleCore ใช้ ${sc} cycle คาด ${r.retired}`);

  const m = new E.MultiCore(prog.words);
  let mc = 0; while (!m.done && mc < 1e6) { m.step(); mc++; }
  if (E.formatState(m.regs, m.mem, m.retired) !== refState) fail(`${p.id}: MultiCore ต่างจาก ref`);
  if (mc !== r.steps) fail(`${p.id}: MultiCore ใช้ ${mc} step คาด ${r.steps}`);

  for (const ov of [0, 4, 7, 15]) {
    const race = new E.Race(prog.words, ov);
    race.runToEnd();
    const want = E.raceTimes(r.retired, r.steps, ov);
    if (race.lastS !== want.s || race.lastM !== want.m) fail(`${p.id} ov=${ov}: race ${race.lastS}/${race.lastM} คาด ${want.s}/${want.m}`);
  }
  if (fails === before) console.log(`[PASS] ${p.id.padEnd(18)} words=asm.py state=ref single=${sc} multi=${mc} race ov 0/4/7/15`);
}

// race ต้องได้ผลเดียวกันไม่ว่าจะเดินทีละเหตุการณ์หรือทีละหน่วยเวลา
{
  const p = PROGRAMS.find((x) => x.id === 'demoA_alu_heavy');
  const w = E.assemble(p.src).words;
  const a = new E.Race(w, 3), b = new E.Race(w, 3);
  a.runToEnd();
  for (let t = 1; !b.allDone && t < 100000; t++) b.runTo(t);
  if (a.lastS !== b.lastS || a.lastM !== b.lastM) fail('race: runTo ทีละหน่วยไม่ตรงกับ stepEvent');
  else console.log('[PASS] race runTo == stepEvent');
}

// ตัวเลขใน docs/demo_script.md (step mode)
{
  const p = PROGRAMS.find((x) => x.id === 'demoA_alu_heavy');
  const race = new E.Race(E.assemble(p.src).words, 0);
  const times = [];
  for (let i = 0; i < 5; i++) { race.stepEvent(); times.push(race.time); }
  if (times.join(',') !== '10,20,30,40,50' || race.s.retired !== 1 || race.m.retired !== 1) fail(`step mode: ${times}`);
  else console.log('[PASS] step mode 10,20,30,40,50');
}

// active bits ต้องตรงกับ RTL (ค่าจาก trace ของ tb_cpu ใน docs/wire_map.md)
{
  const p = PROGRAMS.find((x) => x.id === 'ex_lw_add');
  const w = E.assemble(p.src).words;
  const mask = (bits) => (bits.reduce((acc, b, i) => acc + (b ? 2 ** i : 0), 0) >>> 0).toString(16).padStart(8, '0');
  const s = new E.SingleCore(w), sGot = [];
  while (!s.done) { sGot.push(mask(s.view().active)); s.step(); }
  const sWant = ['000c15b7', '000c15b7', '0008186f', '000c03a7', '0008a067'];
  const m = new E.MultiCore(w), mGot = [];
  while (!m.done) { mGot.push(mask(m.view().active)); m.step(); }
  const mWant = ['0180003f', '030003c8', '01001600', '00806002', '02018000', '0180003f', '030003c8', '01001600',
    '00806002', '02018000', '0180003f', '030003c8', '01000e00', '020c0000', '0180003f', '030003c8', '01001600',
    '00822002', '0180003f', '030003c8', '01200c00'];
  if (sGot.join() !== sWant.join()) fail(`active_s ${sGot}`);
  else if (mGot.join() !== mWant.join()) fail(`active_m ${mGot}`);
  else console.log('[PASS] active bits == RTL trace');
}

console.log('-'.repeat(50));
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
