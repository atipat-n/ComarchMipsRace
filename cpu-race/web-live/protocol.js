/* โปรโตคอล UART ระหว่างเว็บกับบอร์ด (ตรงกับ rtl/io/uart_cmd.v, อธิบายใน docs/protocol.md)
 * ใช้ได้ทั้งในเบราว์เซอร์ (window.RaceProtocol) และ Node (require) — sim/test_uart.js ใช้ไฟล์นี้ทดสอบกับ RTL
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RaceProtocol = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 1;
  const PAYLOAD = 304;
  const DUMP_LEN = PAYLOAD + 2;     // 0xA5 + payload + checksum
  const BAUD = 115200;

  const ch = (s) => s.charCodeAt(0);

  // แต่ละคำสั่ง: bytes ที่ส่ง + คำตอบที่รอ (ack = 'K' 1 byte, id = 2 byte, dump = 306 byte)
  const cmd = {
    id: () => ({ name: 'id', bytes: [ch('I')], reply: 'id' }),
    dump: () => ({ name: 'dump', bytes: [ch('D')], reply: 'dump' }),
    step: () => ({ name: 'step', bytes: [ch('S')], reply: 'ack' }),
    run: () => ({ name: 'run', bytes: [ch('G')], reply: 'ack' }),
    pause: () => ({ name: 'pause', bytes: [ch('P')], reply: 'ack' }),
    reset: () => ({ name: 'reset', bytes: [ch('R')], reply: 'ack' }),
    release: () => ({ name: 'release', bytes: [ch('X')], reply: 'ack' }),
    boot: (prog) => ({ name: 'boot', bytes: [ch('B'), prog & 1], reply: 'ack' }),
    ov: (v) => ({ name: 'ov', bytes: [ch('O'), v == null ? 0 : 0x80 | (v & 15)], reply: 'ack' }),
    mode: (run, speed) => ({ name: 'mode', bytes: [ch('M'), run == null ? 0 : 0x80 | (run ? 8 : 0) | (speed & 7)], reply: 'ack' }),
    load: (addr, words) => {
      const n = words.length;
      const b = [ch('L'), (addr >> 8) & 255, addr & 255, (n >> 8) & 255, n & 255];
      for (const w of words) b.push((w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255);
      return { name: 'load', bytes: b, reply: 'ack' };
    },
  };

  const replyLen = (kind) => (kind === 'dump' ? DUMP_LEN : kind === 'id' ? 2 : 1);

  function be32(b, i) { return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0; }

  class ProtocolError extends Error {}

  function parseReply(kind, bytes) {
    if (kind === 'ack') {
      if (bytes[0] === ch('K')) return { ok: true };
      if (bytes[0] === ch('?')) throw new ProtocolError('บอร์ดไม่รู้จักคำสั่ง');
      throw new ProtocolError(`คาด 'K' แต่ได้ 0x${bytes[0].toString(16)}`);
    }
    if (kind === 'id') {
      if (bytes[0] !== ch('I')) throw new ProtocolError(`คาด 'I' แต่ได้ 0x${bytes[0].toString(16)}`);
      return { version: bytes[1] };
    }
    return parseDump(bytes);
  }

  function parseDump(b) {
    if (b.length !== DUMP_LEN) throw new ProtocolError(`แพ็กเก็ตยาว ${b.length} byte (คาด ${DUMP_LEN})`);
    if (b[0] !== 0xa5) throw new ProtocolError(`header 0x${b[0].toString(16)} (คาด 0xA5)`);
    let sum = 0;
    for (let i = 1; i <= PAYLOAD; i++) sum = (sum + b[i]) & 255;
    if (sum !== b[PAYLOAD + 1]) throw new ProtocolError(`checksum ไม่ตรง (คำนวณ ${sum} ได้ ${b[PAYLOAD + 1]})`);
    const p = (i) => be32(b, 1 + i);
    const flags = b[1 + 5];
    const regs = (base) => Array.from({ length: 32 }, (_, r) => be32(b, 1 + base + 4 * r));
    return {
      time: p(0),
      ov: b[1 + 4] & 15,
      flags: {
        doneS: !!(flags & 1), doneM: !!(flags & 2), running: !!(flags & 4), progB: !!(flags & 8),
        runMode: !!(flags & 16), ovOverride: !!(flags & 32), modeOverride: !!(flags & 64), loading: !!(flags & 128),
      },
      speed: b[1 + 6] & 7,
      s: { pc: p(8), instr: p(12), retired: p(16), last: p(20), active: p(24), regs: regs(48) },
      m: { pc: p(28), ir: p(32), retired: p(36), last: p(40), active: p(44), state: b[1 + 7] & 15, regs: regs(176) },
    };
  }

  // แยกบิต active เป็น array ของ boolean (ใช้กับภาพ datapath เดียวกับ web/)
  const bits = (v, n) => Array.from({ length: n }, (_, i) => !!((v >>> i) & 1));

  // byte ของแพ็กเก็ตตัวอย่าง (ใช้ทดสอบ parser)
  function buildDump(st) {
    const out = new Array(PAYLOAD).fill(0);
    const put = (i, v) => { out[i] = (v >>> 24) & 255; out[i + 1] = (v >>> 16) & 255; out[i + 2] = (v >>> 8) & 255; out[i + 3] = v & 255; };
    put(0, st.time); out[4] = st.ov; out[5] = st.flagsByte || 0; out[6] = st.speed || 0; out[7] = st.m.state;
    put(8, st.s.pc); put(12, st.s.instr); put(16, st.s.retired); put(20, st.s.last); put(24, st.s.active);
    put(28, st.m.pc); put(32, st.m.ir); put(36, st.m.retired); put(40, st.m.last); put(44, st.m.active);
    for (let r = 0; r < 32; r++) { put(48 + 4 * r, st.s.regs[r]); put(176 + 4 * r, st.m.regs[r]); }
    const sum = out.reduce((a, x) => (a + x) & 255, 0);
    return [0xa5, ...out, sum];
  }

  return { VERSION, PAYLOAD, DUMP_LEN, BAUD, cmd, replyLen, parseReply, parseDump, ProtocolError, bits, buildDump };
});
