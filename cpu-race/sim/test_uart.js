// ทดสอบ UART ทั้งวงจร: web-live/protocol.js สร้างคำสั่ง -> tb_uart.v (top.v ทั้งตัว) -> protocol.js อ่านคำตอบ
// แล้วเทียบกับ web/engine.js
//   node sim/test_uart.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const P = require(path.join(ROOT, 'web-live', 'protocol.js'));
const E = require(path.join(ROOT, 'web', 'engine.js'));
const PROGS = require(path.join(ROOT, 'web', 'programs.js'));
const OUT = path.join(ROOT, 'build', 'uart');

const IVERILOG = ['C:/iverilog/bin/iverilog.exe', 'iverilog'].find((p) => { try { execFileSync(p, ['-V'], { stdio: 'ignore' }); return true; } catch (e) { return false; } });
const VVP = IVERILOG && IVERILOG.replace(/iverilog(\.exe)?$/, 'vvp$1');
if (!IVERILOG) { console.log('[skip] ไม่พบ iverilog'); process.exit(0); }

let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log('[FAIL] ' + msg); } else console.log('[PASS] ' + msg); };

// ---------- สร้าง script ----------
const OV = 3;
const prog = E.assemble(PROGS.find((p) => p.id === 'ex_lw_add').src);
const progB = E.assemble(PROGS.find((p) => p.id === 'demoB_mem_heavy').src);
const lines = [];
const expect = [];
const send = (c) => { for (const b of c.bytes) lines.push(`1 ${b}`); lines.push(`2 ${P.replyLen(c.reply)}`); expect.push(c); };
send(P.cmd.id());
send(P.cmd.mode(false, 0));
send(P.cmd.ov(OV));
send(P.cmd.load(0, prog.words));
for (let i = 0; i < 5; i++) send(P.cmd.step());
send(P.cmd.dump());                                   // [9]  หลัง step 5 ครั้ง
send(P.cmd.mode(true, 7));
send(P.cmd.run());
lines.push('4 0');
send(P.cmd.dump());                                   // [12] จบการแข่ง
send(P.cmd.release());
send(P.cmd.boot(1));
lines.push('3 1500');
send(P.cmd.dump());                                   // [15] หลังโหลดโปรแกรม B จาก boot ROM
lines.push('1 90', '2 1');                            // 'Z' คำสั่งที่ไม่รู้จัก -> '?'
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'script.txt'), lines.join('\n') + '\n');

// ---------- compile + run ----------
for (const f of fs.readdirSync(path.join(ROOT, 'mem'))) if (f.endsWith('.mem')) fs.copyFileSync(path.join(ROOT, 'mem', f), path.join(OUT, f));
const rtl = [];
for (const d of ['common', 'single', 'multi', 'mem', 'race', 'io', 'vga']) for (const f of fs.readdirSync(path.join(ROOT, 'rtl', d)).sort()) if (f.endsWith('.v')) rtl.push(path.join(ROOT, 'rtl', d, f));
rtl.push(path.join(ROOT, 'rtl', 'clk_gen.v'), path.join(ROOT, 'rtl', 'top.v'));
execFileSync(IVERILOG, ['-g2001', '-Wall', '-Wno-timescale', '-DSIM', '-o', path.join(OUT, 'tb_uart.vvp'), path.join(ROOT, 'sim', 'tb_uart.v'), ...rtl], { stdio: 'inherit' });
const log = execFileSync(VVP, ['-n', 'tb_uart.vvp', '+SCRIPT=script.txt', '+RX=rx.hex'], { cwd: OUT, encoding: 'utf8' });
if (/TIMEOUT/.test(log)) console.log(log);

// ---------- แยกคำตอบ ----------
const rx = fs.readFileSync(path.join(OUT, 'rx.hex'), 'ascii').trim().split(/\s+/).map((h) => parseInt(h, 16));
let pos = 0;
const replies = expect.map((c) => { const n = P.replyLen(c.reply); const b = rx.slice(pos, pos + n); pos += n; return { c, b }; });
const unknown = rx.slice(pos);
check(rx.length === pos + 1, `ได้คำตอบครบ ${rx.length} byte`);

const parsed = replies.map(({ c, b }) => { try { return P.parseReply(c.reply, b); } catch (e) { return { error: e.message }; } });
check(parsed[0].version === P.VERSION, `คำสั่ง I: version ${parsed[0].version}`);
check(parsed.filter((x, i) => expect[i].reply === 'ack').every((x) => x.ok), 'ทุกคำสั่งตอบ K');
check(unknown[0] === '?'.charCodeAt(0), "คำสั่งที่ไม่รู้จักตอบ '?'");

// dump หลัง step 5 ครั้ง เทียบกับ engine
const d1 = parsed[9];
const r1 = new E.Race(prog.words, OV);
for (let i = 0; i < 5; i++) r1.stepEvent();
const vs = r1.s.view(), vm = r1.m.view();
const mask = (a) => a.reduce((acc, x, i) => acc + (x ? 2 ** i : 0), 0) >>> 0;
check(!d1.error, 'dump หลัง step อ่านได้ ' + (d1.error || ''));
if (!d1.error) {
  check(d1.time === r1.time && d1.ov === OV && !d1.flags.runMode && d1.flags.modeOverride && d1.flags.ovOverride,
    `step x5: time ${d1.time} (engine ${r1.time}), ov ${d1.ov}, mode override`);
  check(d1.s.pc === r1.s.pc && d1.s.retired === r1.s.retired && d1.s.active === mask(vs.active), `single: pc ${d1.s.pc} retired ${d1.s.retired} active ${d1.s.active.toString(16)}`);
  check(d1.m.pc === r1.m.pc && d1.m.ir === r1.m.ir && d1.m.state === r1.m.state && d1.m.active === mask(vm.active),
    `multi: pc ${d1.m.pc} state S${d1.m.state} active ${d1.m.active.toString(16)}`);
  check(d1.s.regs.every((v, i) => v === r1.s.regs[i]) && d1.m.regs.every((v, i) => v === r1.m.regs[i]), 'register 32 ตัวของทั้งสอง core ตรง engine');
}

// dump หลังแข่งจบ
const d2 = parsed[12];
const r2 = new E.Race(prog.words, OV);
r2.runToEnd();
const ref = E.runRef(prog.words);
check(!d2.error, 'dump หลังแข่งจบอ่านได้ ' + (d2.error || ''));
if (!d2.error) {
  check(d2.flags.doneS && d2.flags.doneM && d2.s.last === r2.lastS && d2.m.last === r2.lastM,
    `จบ: single ${d2.s.last} (คาด ${r2.lastS}) multi ${d2.m.last} (คาด ${r2.lastM})`);
  check(d2.s.regs.every((v, i) => v === ref.regs[i]) && d2.m.regs.every((v, i) => v === ref.regs[i]), 'register ตอนจบตรง ref_model ($t2 = ' + d2.s.regs[10] + ')');
}

// dump หลังโหลดโปรแกรม B
const d3 = parsed[15];
check(!d3.error && d3.flags.progB && d3.time === 0 && d3.s.pc === 0 && d3.s.instr === progB.words[0] && !d3.flags.ovOverride && !d3.flags.modeOverride,
  'B 1: โหลดโปรแกรม B จาก boot ROM, เวลา 0, ยกเลิกการแทนค่าแล้ว');

// parser กับแพ็กเก็ตเสีย
let threw = false;
try { const bad = P.buildDump({ time: 1, ov: 0, s: { regs: new Array(32).fill(0) }, m: { state: 0, regs: new Array(32).fill(0) } }); bad[10] ^= 1; P.parseDump(bad); } catch (e) { threw = e instanceof P.ProtocolError; }
check(threw, 'parser จับ checksum ผิดได้');

console.log('-'.repeat(50));
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
