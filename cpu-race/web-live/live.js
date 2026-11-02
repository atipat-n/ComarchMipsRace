/* CPU Race Live: คุยกับบอร์ดผ่าน Web Serial (ใช้ protocol.js + engine/geometry/programs จาก web/) */
(function () {
  'use strict';
  const E = window.CPURace;
  const P = window.RaceProtocol;
  const PROGS = window.PROGRAMS;
  const GEO = window.GEOMETRY;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cpurace.live.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cpurace.live.' + k, JSON.stringify(v)); } catch (e) { /* ไม่มี storage ก็ใช้ได้ */ } },
  };

  const POLL_MS = 100;
  const SELFTEST = location.hash === '#selftest';
  const SERIAL = SELFTEST ? fakeSerial() : navigator.serial;
  const SPEED_NAME = ['20', '50', '100', '200', '400', '1000', '4000', 'เร็วสุด'];
  const REG_LIST = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

  const ST = {
    base: store.get('base', 'hex'),
    conn: 'dead', reason: 'ยังไม่ได้เชื่อมต่อกับบอร์ด',
    port: null, reader: null, writer: null,
    rx: [], waiter: null, queue: Promise.resolve(),
    pollOn: false, pollTimer: 0, retryTimer: 0, fails: 0,
    d: null, prevRegs: { s: null, m: null },
    prog: null,                 // { name, words, symbols, source: 'A' | 'B' | 'custom' }
    sim: null,                  // { key, race }
    stats: { ok: 0, err: 0, rxBytes: 0, txBytes: 0, lastMs: 0, since: performance.now() },
  };

  // ================================================================ ตัวเลข
  function fmt(v) {
    v = v >>> 0;
    switch (ST.base) {
      case 'dec': return String(v);
      case 'sdec': return String(v | 0);
      case 'bin': return v.toString(2).padStart(32, '0').replace(/(.{8})(?=.)/g, '$1 ');
      default: return '0x' + v.toString(16).toUpperCase().padStart(8, '0');
    }
  }
  const fmtAddr = (v) => (ST.base === 'hex' || ST.base === 'bin' ? '0x' + (v >>> 0).toString(16).toUpperCase().padStart(4, '0') : String(v >>> 0));
  const thai = (n) => n.toLocaleString('en-US');
  const reg = (n) => '$' + E.REG_NAMES[n];
  const hexb = (arr) => arr.map((b) => b.toString(16).padStart(2, '0')).join(' ');

  // ================================================================ datapath (ภาพเดียวกับ web/ และจอ VGA)
  const SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, parent) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function buildDP(svg, items, core) {
    svg.innerHTML = '';
    const refs = { wires: {}, boxes: {}, core };
    const gW = sv('g', {}, svg), gB = sv('g', {}, svg), gT = sv('g', {}, svg), gF = sv('g', {}, svg);
    for (const it of items) {
      if (it.t === 'box' || it.t === 'mux') {
        const r = sv('rect', { x: it.x0 + 1, y: it.y0 + 1, width: it.x1 - it.x0 - 2, height: it.y1 - it.y0 - 2, rx: it.t === 'mux' ? 3 : 4, class: it.t === 'mux' ? 'mux' : 'box' }, gB);
        if (it.label) sv('text', { x: (it.x0 + it.x1) / 2, y: (it.y0 + it.y1) / 2 + 4, 'text-anchor': 'middle' }, gT).textContent = it.label;
        if (it.w != null) refs.boxes[it.w] = r;
      } else if (it.t === 'text') {
        sv('text', { x: it.x, y: it.y + 12 }, gT).textContent = it.s;
      } else if (it.t === 'wire') {
        const pts = it.pts.map(([x, y]) => `${x + 1},${y + 1}`).join(' ');
        const line = sv('polyline', { points: pts, class: 'w ' + (it.w == null ? 'static' : 'off') }, gW);
        if (it.w != null) {
          const flow = sv('polyline', { points: pts, class: 'flow' }, gF);
          flow.style.display = 'none';
          (refs.wires[it.w] = refs.wires[it.w] || []).push({ line, flow });
        }
      }
    }
    return refs;
  }
  function paintDP(refs, active) {
    const on = refs.core === 's' ? 'on-s' : 'on-m';
    for (const k in refs.wires) for (const { line, flow } of refs.wires[k]) { line.setAttribute('class', 'w ' + (active[k] ? on : 'off')); flow.style.display = active[k] ? '' : 'none'; }
    for (const k in refs.boxes) refs.boxes[k].setAttribute('class', 'box ' + (active[k] ? (refs.core === 's' ? 'hot-s' : 'hot-m') : 'cold'));
  }
  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', a: 'abcefg', b: 'cdefg', c: 'adef', d: 'bcdeg', e: 'adefg', f: 'aefg', '-': 'g' };
  const SEGPOLY = { a: '3,1 13,1 11,3 5,3', b: '13,2 15,4 15,13 13,14 13,4', c: '13,16 15,17 15,26 13,28 13,18', d: '5,27 11,27 13,29 3,29', e: '1,17 3,16 3,26 1,28', f: '1,4 3,2 3,14 1,13', g: '3,15 5,14 11,14 13,15 11,16 5,16' };
  function seven(container, text) {
    container.innerHTML = '';
    for (const ch of text.toLowerCase()) {
      const s = sv('svg', { viewBox: '0 0 16 30', 'aria-hidden': 'true' }, container);
      for (const k of 'abcdefg') sv('polygon', { points: SEGPOLY[k], class: (SEG[ch] || '').includes(k) ? 'on' : 'off' }, s);
    }
  }

  // ================================================================ console
  function logLine(cls, text) {
    const c = $('#console');
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = `${new Date().toLocaleTimeString('th-TH', { hour12: false })}  ${text}`;
    c.prepend(div);
    while (c.childNodes.length > 200) c.removeChild(c.lastChild);
  }

  // ================================================================ สถานะการเชื่อมต่อ
  function setConn(state, reason) {
    ST.conn = state;
    if (reason) ST.reason = reason;
    const pill = $('#pill');
    const text = { dead: 'DISCONNECTED', wait: 'CONNECTING', live: 'CONNECTED' }[state];
    pill.className = 'pill ' + state;
    $('#pill-text').textContent = text;
    $('#veil-text').textContent = text;
    $('#board-area').classList.toggle('off', state !== 'live');
    $('#offline').hidden = state === 'live';
    $('#off-title').textContent = text;
    $('#off-title').style.color = state === 'wait' ? 'var(--wait)' : 'var(--dead)';
    $('#off-reason').textContent = ST.reason;
    $('#b-connect').hidden = !!ST.port;
    $('#b-disconnect').hidden = !ST.port;
    $$('#board-area button, #board-area input, #board-area select, #board-area textarea').forEach((e) => { e.disabled = state !== 'live'; });
    document.title = `CPU Race Live · ${text}`;
  }

  function serialSupported() {
    if (SERIAL) return true;
    const reason = location.protocol === 'file:'
      ? 'เบราว์เซอร์นี้ไม่เปิด Web Serial ให้ไฟล์ที่เปิดตรงจากเครื่อง ให้เปิดผ่าน live.bat ในโฟลเดอร์โปรเจค (จะเปิดที่ http://localhost) หรือใช้ Chrome / Edge รุ่นใหม่'
      : 'เบราว์เซอร์นี้ไม่รองรับ Web Serial ให้ใช้ Chrome หรือ Edge บนคอม (Windows / macOS / Linux)';
    setConn('dead', reason);
    $('#b-connect').disabled = true;
    return false;
  }

  // ---------------- เปิด / ปิดพอร์ต ----------------
  async function connectManual() {
    if (!serialSupported()) return;
    let port;
    try {
      port = await SERIAL.requestPort({ filters: [{ usbVendorId: 0x0403 }] });
    } catch (e) {
      if (e.name === 'NotFoundError') { setConn('dead', 'ยังไม่ได้เลือกพอร์ต (ถ้าไม่เห็นพอร์ต FTDI ในรายการ: เช็กสาย USB และสวิตช์เปิดบอร์ด)'); return; }
      setConn('dead', 'ขอใช้พอร์ตไม่ได้: ' + e.message);
      return;
    }
    await openPort(port);
  }

  async function autoConnect() {
    if (!SERIAL) return;
    const ports = await SERIAL.getPorts();
    if (ports.length) await openPort(ports[0], true);
  }

  async function openPort(port, auto) {
    if (ST.port) return;
    setConn('wait', auto ? 'พบพอร์ตที่เคยอนุญาตไว้ กำลังเชื่อมต่อ…' : 'กำลังเปิดพอร์ต…');
    try {
      await port.open({ baudRate: P.BAUD, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', bufferSize: 8192 });
    } catch (e) {
      if (e.name !== 'InvalidStateError') {
        setConn('dead', `เปิดพอร์ตไม่ได้ (${e.message}) ถ้ามีโปรแกรมอื่นใช้พอร์ตนี้อยู่ เช่น PuTTY, Tera Term หรือแท็บอื่นของเว็บนี้ ให้ปิดก่อน`);
        return;
      }
    }
    ST.port = port;
    ST.writer = port.writable.getWriter();
    ST.rx = [];
    readLoop(port);
    logLine('tx', `เปิดพอร์ตแล้ว ${portName(port)} @ ${P.BAUD} baud`);
    handshake();
  }

  function portName(port) {
    const i = port.getInfo ? port.getInfo() : {};
    return i.usbVendorId ? `(USB ${i.usbVendorId.toString(16).padStart(4, '0')}:${(i.usbProductId || 0).toString(16).padStart(4, '0')})` : '';
  }

  async function readLoop(port) {
    try {
      while (port.readable && ST.port === port) {
        const reader = port.readable.getReader();
        ST.reader = reader;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) onBytes(value);
          }
        } finally {
          reader.releaseLock();
        }
        break;
      }
    } catch (e) {
      if (ST.port === port) logLine('er', 'อ่านพอร์ตผิดพลาด: ' + e.message);
    }
    if (ST.port === port) lost('การเชื่อมต่อหลุด (ถอดสาย USB หรือปิดบอร์ด?)');
  }

  async function lost(reason) {
    const port = ST.port;
    ST.port = null;
    stopPolling();
    clearTimeout(ST.retryTimer);
    if (ST.waiter) { clearTimeout(ST.waiter.timer); ST.waiter.reject(new Error('disconnected')); ST.waiter = null; }
    try { if (ST.reader) await ST.reader.cancel(); } catch (e) { /* ปิดอยู่แล้ว */ }
    try { if (ST.writer) { ST.writer.releaseLock(); } } catch (e) { /* ปิดอยู่แล้ว */ }
    ST.reader = null; ST.writer = null;
    try { if (port) await port.close(); } catch (e) { /* ปิดอยู่แล้ว */ }
    ST.d = null;
    setConn('dead', reason);
    logLine('er', reason);
  }

  // ---------------- request / reply ----------------
  function onBytes(chunk) {
    ST.stats.rxBytes += chunk.length;
    for (const b of chunk) ST.rx.push(b);
    const w = ST.waiter;
    if (w && ST.rx.length >= w.n) {
      ST.waiter = null;
      clearTimeout(w.timer);
      w.resolve(ST.rx.splice(0, w.n));
    }
  }

  class Timeout extends Error {}

  function request(c) {
    const run = async () => {
      if (!ST.writer) throw new Error('ยังไม่ได้เชื่อมต่อ');
      ST.rx = [];
      const n = P.replyLen(c.reply);
      const ms = 300 + (c.bytes.length + n) * 0.12;     // 1 byte ≈ 0.087 ms ที่ 115200
      const t0 = performance.now();
      const got = new Promise((resolve, reject) => {
        ST.waiter = { n, resolve, reject, timer: setTimeout(() => { ST.waiter = null; reject(new Timeout(`บอร์ดไม่ตอบคำสั่ง ${c.name} ภายใน ${Math.round(ms)} ms`)); }, ms) };
      });
      await ST.writer.write(new Uint8Array(c.bytes));
      ST.stats.txBytes += c.bytes.length;
      if (c.name !== 'dump') logLine('tx', `→ ${c.name}  ${c.bytes.length > 12 ? hexb(c.bytes.slice(0, 5)) + ` … (${c.bytes.length} byte)` : hexb(c.bytes)}`);
      const bytes = await got;
      ST.stats.lastMs = performance.now() - t0;
      const r = P.parseReply(c.reply, bytes);
      ST.stats.ok++;
      if (c.name !== 'dump') logLine('rx', `← ${hexb(bytes.slice(0, 4))}${bytes.length > 4 ? ' …' : ''}`);
      return r;
    };
    const p = ST.queue.then(run, run);
    ST.queue = p.catch(() => {});
    return p.catch((e) => { ST.stats.err++; throw e; });
  }

  async function handshake() {
    if (!ST.port) return;
    setConn('wait', 'เปิดพอร์ตแล้ว กำลังถามบอร์ด…');
    for (let i = 0; i < 3 && ST.port; i++) {
      try {
        const r = await request(P.cmd.id());
        if (r.version !== P.VERSION) logLine('er', `บอร์ดใช้โปรโตคอลรุ่น ${r.version} เว็บรุ่น ${P.VERSION}`);
        setConn('live');
        logLine('rx', `บอร์ดตอบแล้ว (โปรโตคอลรุ่น ${r.version})`);
        ST.fails = 0;
        startPolling();
        return;
      } catch (e) {
        logLine('er', e.message);
      }
    }
    if (!ST.port) return;
    setConn('dead', 'เปิดพอร์ตได้แต่บอร์ดไม่ตอบ: เช็กว่าเปิดสวิตช์บอร์ดและโหลด bitstream รุ่นที่มี UART แล้ว หรือเลือกพอร์ตผิด (ลองตัดการเชื่อมต่อแล้วเลือกพอร์ตอื่น) · จะลองถามใหม่ทุก 2 วินาที');
    ST.retryTimer = setTimeout(handshake, 2000);
  }

  // ---------------- polling ----------------
  function startPolling() {
    if (ST.pollOn) return;
    ST.pollOn = true;
    const tick = async () => {
      if (!ST.pollOn) return;
      try {
        const d = await request(P.cmd.dump());
        ST.fails = 0;
        ST.d = d;
        render();
      } catch (e) {
        ST.fails++;
        if (ST.fails >= 3) {
          stopPolling();
          logLine('er', e.message);
          setConn('dead', 'บอร์ดหยุดตอบ (ถูก reset, โหลด bitstream ใหม่ หรือสายหลวม?) กำลังลองใหม่…');
          ST.retryTimer = setTimeout(handshake, 1000);
          return;
        }
      }
      renderStats();
      ST.pollTimer = setTimeout(tick, POLL_MS);
    };
    tick();
  }
  function stopPolling() { ST.pollOn = false; clearTimeout(ST.pollTimer); }

  async function act(...cmds) {
    if (ST.conn !== 'live') return;
    try {
      for (const c of cmds) await request(c);
      ST.d = await request(P.cmd.dump());
      render();
    } catch (e) {
      logLine('er', e.message);
    }
  }

  // ================================================================ โปรแกรมที่คาดว่าอยู่ในบอร์ด
  function demo(b) {
    const p = PROGS.find((x) => x.id === (b ? 'demoB_mem_heavy' : 'demoA_alu_heavy'));
    const a = E.assemble(p.src);
    return { name: b ? 'B: รวม array' : 'A: บวก 1..10', words: a.words, symbols: a.symbols, source: b ? 'B' : 'A' };
  }
  const DEMO = [demo(0), demo(1)];

  // ถ้าเวลา 0 และคำสั่งแรกไม่ตรงกับที่คาด แปลว่ามีคนกด BTNL หรือ reset บนบอร์ด -> เดาจาก flag
  function syncProgram(d) {
    const want = DEMO[d.flags.progB ? 1 : 0];
    if (!ST.prog) { ST.prog = want; return; }
    if (d.time === 0 && d.s.pc === 0 && ST.prog.words[0] !== d.s.instr && want.words[0] === d.s.instr) ST.prog = want;
  }

  function simAt(d) {
    const key = ST.prog.source + ':' + ST.prog.words.join(',').length + ':' + d.ov;
    if (!ST.sim || ST.sim.key !== key || ST.sim.race.time > d.time || ST.sim.words !== ST.prog.words) {
      ST.sim = { key, words: ST.prog.words, race: new E.Race(ST.prog.words, d.ov) };
    }
    ST.sim.race.runTo(d.time);
    return ST.sim.race;
  }

  // ================================================================ render
  function badge(elm, status) {
    const map = { WINNER: ['win', 'WINNER'], TIE: ['tie', 'TIE'], FINISH: ['fin', 'FINISH'], '': ['run', 'กำลังวิ่ง'] };
    const [cls, txt] = map[status];
    elm.className = 'badge ' + cls;
    elm.textContent = txt;
  }
  function status(meDone, otherDone, me, other) {
    if (!meDone) return '';
    if (!otherDone || me < other) return 'WINNER';
    return me === other ? 'TIE' : 'FINISH';
  }
  function regsHTML(regs, prev) {
    return REG_LIST.map((i) => `<div class="reg${prev && prev[i] !== regs[i] ? ' changed' : ''}" title="${reg(i)} = ${regs[i] | 0}"><span>${reg(i)}</span><span>${esc(fmt(regs[i]))}</span></div>`).join('');
  }

  function render() {
    const d = ST.d;
    if (!d) return;
    syncProgram(d);
    const f = d.flags;
    const timeS = f.doneS ? d.s.last : d.time, timeM = f.doneM ? d.m.last : d.time;

    // แผงสั่งงาน
    $('#prog-now').innerHTML = `ในบอร์ดตอนนี้: <b>${esc(ST.prog.name)}</b>${f.loading ? ' <span class="warnc">(กำลังโหลด…)</span>' : ''}`;
    $('#ov-src').textContent = `บอร์ดใช้ ov = ${d.ov} · มาจาก${f.ovOverride ? 'เว็บ (สวิตช์ SW3–0 ไม่มีผล)' : 'สวิตช์ SW3–0'}`;
    $('#ov-sw').checked = !f.ovOverride;
    if (!f.ovOverride && document.activeElement !== $('#ov')) { $('#ov').value = d.ov; $('#ov-val').textContent = d.ov; }
    $('#mode-sw').checked = !f.modeOverride;
    if (document.activeElement !== $('#speed')) $('#speed').value = String(d.speed);
    $('#mode-src').textContent = `โหมด ${f.runMode ? 'run' : 'step'} · ความเร็ว ${SPEED_NAME[d.speed]}${d.speed < 7 ? ' หน่วย/วิ' : ''} · ${f.running ? 'กำลังวิ่ง' : 'หยุดอยู่'} · มาจาก${f.modeOverride ? 'เว็บ' : 'สวิตช์ SW15, SW14–12'}`;
    $('#b-pause').disabled = !f.running;

    // สนามแข่ง
    seven($('#seg-time'), (d.time >>> 0).toString(16).padStart(4, '0'));
    $('#time-dec').textContent = thai(d.time);
    const ref = (() => { try { return E.runRef(ST.prog.words); } catch (e) { return null; } })();
    const exp = ref ? E.raceTimes(ref.retired, ref.steps, d.ov) : null;
    const scale = exp ? Math.max(exp.s, exp.m) * 1.04 : Math.max(timeS, timeM, 1) * 1.1;
    $('#fill-s').style.width = Math.min(100, timeS / scale * 100) + '%';
    $('#fill-m').style.width = Math.min(100, timeM / scale * 100) + '%';
    $('#ghost-s').style.left = exp ? (exp.s / scale * 100) + '%' : '-10px';
    $('#ghost-m').style.left = exp ? (exp.m / scale * 100) + '%' : '-10px';
    $('#t-s').textContent = `${thai(timeS)} หน่วย`;
    $('#t-m').textContent = `${thai(timeM)} หน่วย`;
    $('#r-s').textContent = `${d.s.retired} คำสั่ง`;
    $('#r-m').textContent = `${d.m.retired} คำสั่ง`;
    badge($('#st-s'), status(f.doneS, f.doneM, timeS, timeM));
    badge($('#st-m'), status(f.doneM, f.doneS, timeM, timeS));
    $('#led-chip').textContent = `LED15 ${f.doneS ? '●' : '○'} LED14 ${f.doneM ? '●' : '○'} LED13 ${f.running ? '●' : '○'} LED12 ${f.progB ? '●' : '○'}`;

    // core
    const actS = P.bits(d.s.active, 20), actM = P.bits(d.m.active, 26);
    paintDP(refsS, actS);
    paintDP(refsM, actM);
    $('#next-s').textContent = f.doneS ? 'halt (จบแล้ว)' : `${fmtAddr(d.s.pc)}:  ${E.disasm(d.s.instr, d.s.pc, ST.prog.symbols)}`;
    $('#next-m').textContent = f.doneM ? 'halt (จบแล้ว)' : d.m.state === 0 ? `(กำลังจะหยิบคำสั่งที่ ${fmtAddr(d.m.pc)})` : E.disasm(d.m.ir, null);
    $('#state-m').textContent = f.doneM ? 'DONE' : `S${d.m.state} ${E.STATE_NAMES[d.m.state] || '?'}`;
    $('#leds-m').innerHTML = Array.from({ length: 12 }, (_, i) => `<span class="led${!f.doneM && d.m.state === 11 - i ? ' on' : ''}" title="LED${11 - i}"></span>`).join('');
    $('#regs-s').innerHTML = regsHTML(d.s.regs, ST.prevRegs.s);
    $('#regs-m').innerHTML = regsHTML(d.m.regs, ST.prevRegs.m);
    $('#regs-s').classList.toggle('bin', ST.base === 'bin');
    $('#regs-m').classList.toggle('bin', ST.base === 'bin');
    ST.prevRegs = { s: d.s.regs.slice(), m: d.m.regs.slice() };

    renderVerify(d, ref, exp, timeS, timeM);
  }

  function renderVerify(d, ref, exp, timeS, timeM) {
    const rows = [];
    const row = (ok, html) => rows.push(`<div class="vrow"><span class="${ok === true ? 'ok' : ok === false ? 'err' : 'warnc'}">${ok === true ? '✔' : ok === false ? '✘' : '…'}</span><span>${html}</span></div>`);
    if (!ref) { $('#verify').innerHTML = '<p class="err">จำลองโปรแกรมนี้ไม่ได้</p>'; return; }
    const sim = simAt(d);
    const vs = sim.s.view(), vm = sim.m.view();
    const same = d.s.pc === sim.s.pc && d.s.retired === sim.s.retired && d.m.pc === sim.m.pc && d.m.state === sim.m.state && d.m.retired === sim.m.retired &&
      d.s.regs.every((v, i) => v === sim.s.regs[i]) && d.m.regs.every((v, i) => v === sim.m.regs[i]);
    const activeSame = d.s.active === (vs.active.reduce((a, x, i) => a + (x ? 2 ** i : 0), 0) >>> 0) && d.m.active === (vm.active.reduce((a, x, i) => a + (x ? 2 ** i : 0), 0) >>> 0);
    const chip = $('#sync-chip');
    if (same && activeSame) { chip.className = 'chip good'; chip.textContent = 'ตรงกับตัวจำลอง ✔'; }
    else { chip.className = 'chip bad'; chip.textContent = 'ไม่ตรงกับตัวจำลอง'; }
    row(same && activeSame, `ที่เวลา ${thai(d.time)}: PC, state, จำนวนคำสั่ง, register และเส้นที่ติดไฟ ${same && activeSame ? 'ตรงกับตัวจำลองทุกค่า' : 'ไม่ตรง (ถ้าเปลี่ยน ov กลางทางหรือกดปุ่มบนบอร์ดระหว่างนั้น ให้กด เริ่มใหม่)'}`);
    const fs = d.flags;
    row(fs.doneS ? d.s.last === exp.s : null, `single จบที่ ${fs.doneS ? thai(d.s.last) : '…'} · สูตร ${ref.retired} × (50 + ${d.ov}) = ${thai(exp.s)}`);
    row(fs.doneM ? d.m.last === exp.m : null, `multi จบที่ ${fs.doneM ? thai(d.m.last) : '…'} · สูตร ${ref.steps} step × (10 + ${d.ov}) = ${thai(exp.m)}`);
    if (fs.doneS && fs.doneM) {
      const badS = d.s.regs.map((v, i) => [i, v]).filter(([i, v]) => v !== ref.regs[i]);
      const badM = d.m.regs.map((v, i) => [i, v]).filter(([i, v]) => v !== ref.regs[i]);
      row(!badS.length && !badM.length, !badS.length && !badM.length
        ? 'register ทั้ง 32 ตัวของทั้งสอง core ตรงกับ reference model'
        : `register ไม่ตรง: ${[...badS.map(([i]) => 'S ' + reg(i)), ...badM.map(([i]) => 'M ' + reg(i))].join(', ')}`);
      const w = timeS < timeM ? 'single' : timeM < timeS ? 'multi' : 'เสมอ';
      rows.push(`<p class="small" style="margin-top:6px">ผล: <b>${w}</b> ${w !== 'เสมอ' ? 'ชนะ ' + thai(Math.abs(timeS - timeM)) + ' หน่วย' : ''} · CPI ของ multi = ${(ref.steps / ref.retired).toFixed(3)} · single เริ่มชนะที่ ov = ${E.flipOv(ref.retired, ref.steps) ?? '-'}</p>`);
    } else {
      row(null, 'register ตอนจบ: รอให้ทั้งสองตัวจบก่อน');
    }
    $('#verify').innerHTML = rows.join('');
  }

  function renderStats() {
    const s = ST.stats;
    $('#stats').innerHTML = `<span>คำตอบที่ถูกต้อง ${s.ok}</span><span>ผิดพลาด ${s.err}</span><span>ส่ง ${thai(s.txBytes)} byte</span><span>รับ ${thai(s.rxBytes)} byte</span><span>คำตอบล่าสุดใช้ ${s.lastMs.toFixed(0)} ms</span>`;
  }

  // ================================================================ init
  let refsS, refsM;
  function init() {
    refsS = buildDP($('#dp-s'), GEO.single, 's');
    refsM = buildDP($('#dp-m'), GEO.multi, 'm');

    $$('#base-seg button').forEach((b) => b.addEventListener('click', () => {
      ST.base = b.dataset.base; store.set('base', ST.base);
      $$('#base-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    }));
    $$('#base-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.base === ST.base)));

    $('#b-connect').addEventListener('click', connectManual);
    $('#b-disconnect').addEventListener('click', () => lost('ตัดการเชื่อมต่อแล้ว (กด เชื่อมต่อบอร์ด เพื่อต่อใหม่)'));

    $('#b-progA').addEventListener('click', () => { ST.prog = DEMO[0]; act(P.cmd.boot(0)); });
    $('#b-progB').addEventListener('click', () => { ST.prog = DEMO[1]; act(P.cmd.boot(1)); });
    $('#b-reset').addEventListener('click', () => act(P.cmd.reset()));
    $('#b-step').addEventListener('click', () => {
      const d = ST.d;
      if (d && d.flags.runMode && d.flags.running) act(P.cmd.pause(), P.cmd.step());
      else act(P.cmd.step());
    });
    $('#b-run').addEventListener('click', () => {
      const d = ST.d;
      const speed = +$('#speed').value;
      if (d && !d.flags.runMode) act(P.cmd.mode(true, speed), P.cmd.run());       // SW15 อยู่โหมด step: ให้เว็บแทนค่า
      else act(P.cmd.run());
    });
    $('#b-pause').addEventListener('click', () => act(P.cmd.pause()));
    $('#speed').addEventListener('change', () => {
      const d = ST.d;
      act(P.cmd.mode(d ? d.flags.runMode : true, +$('#speed').value));
    });
    $('#mode-sw').addEventListener('change', (e) => {
      const d = ST.d;
      act(e.target.checked ? P.cmd.mode(null) : P.cmd.mode(d ? d.flags.runMode : false, +$('#speed').value));
    });
    let ovTimer = 0;
    $('#ov').addEventListener('input', (e) => {
      $('#ov-val').textContent = e.target.value;
      clearTimeout(ovTimer);
      ovTimer = setTimeout(() => act(P.cmd.ov(+e.target.value), P.cmd.reset()), 150);
    });
    $('#ov-sw').addEventListener('change', (e) => act(e.target.checked ? P.cmd.ov(null) : P.cmd.ov(+$('#ov').value), P.cmd.reset()));

    // ส่งโปรแกรม
    $('#send-pick').innerHTML = PROGS.map((p) => `<option value="${p.id}">${esc(p.groupLabel)} · ${esc(p.title)}</option>`).join('');
    $('#send-pick').value = 'ex_lw_add';
    $('#send-src').value = store.get('draft', null) || PROGS.find((p) => p.id === 'ex_lw_add').src;
    $('#send-pick').addEventListener('change', (e) => { $('#send-src').value = PROGS.find((p) => p.id === e.target.value).src; });
    $('#send-src').addEventListener('input', () => store.set('draft', $('#send-src').value));
    $('#b-send').addEventListener('click', async () => {
      const st = $('#send-status');
      let a;
      try { a = E.assemble($('#send-src').value); E.runRef(a.words); } catch (e) { st.innerHTML = `<span class="err">${esc(e.message)}</span>`; return; }
      st.textContent = `กำลังส่ง ${a.textWords} คำสั่ง + ${a.dataWords} word ข้อมูล…`;
      const pick = PROGS.find((p) => p.src === $('#send-src').value);
      ST.prog = { name: pick ? pick.title : 'โปรแกรมที่เขียนเอง', words: a.words, symbols: a.symbols, source: 'custom' };
      await act(P.cmd.load(0, a.words));
      st.innerHTML = ST.conn === 'live' ? '<span class="ok">ส่งแล้ว</span> บอร์ดเริ่มใหม่ที่เวลา 0 กด ทีละจังหวะ หรือ วิ่ง ได้เลย' : '<span class="err">ส่งไม่สำเร็จ</span>';
    });

    if (SERIAL) {
      SERIAL.addEventListener('disconnect', (e) => { if (e.target === ST.port || !e.target) lost('ถอดสาย USB แล้ว หรือบอร์ดถูกปิด'); });
      SERIAL.addEventListener('connect', (e) => { if (!ST.port) openPort(e.target, true); });
    }
    setConn('dead');
    if (serialSupported()) autoConnect();
    renderStats();
    if (SELFTEST) selfTest();
  }

  // ================================================================ โหมดทดสอบ (index.html#selftest เท่านั้น)
  // บอร์ดปลอมตอบตามโปรโตคอลเดียวกับ rtl/io/uart_cmd.v โดยใช้ engine จำลอง ไม่ถูกใช้ในการทำงานปกติ
  function fakeSerial() {
    const target = new EventTarget();
    const board = { words: null, race: null, ov: 0, ovO: false, modeO: false, run: false, speed: 3, running: false, progB: false };
    const boot = (b) => {
      board.progB = !!b;
      board.words = E.assemble(PROGS.find((p) => p.id === (b ? 'demoB_mem_heavy' : 'demoA_alu_heavy')).src).words;
      board.race = new E.Race(board.words, board.ov);
      board.running = false;
    };
    boot(0);
    let ctrl = null;
    const send = (bytes) => ctrl && ctrl.enqueue(new Uint8Array(bytes));
    const mask = (a) => a.reduce((acc, x, i) => acc + (x ? 2 ** i : 0), 0) >>> 0;
    const dump = () => {
      const R = board.race;
      if (board.running) { R.runTo(R.time + 250); if (R.allDone) board.running = false; }
      const vs = R.s.view(), vm = R.m.view();
      const flags = (R.doneS ? 1 : 0) | (R.doneM ? 2 : 0) | (board.running ? 4 : 0) | (board.progB ? 8 : 0) |
        (board.run ? 16 : 0) | (board.ovO ? 32 : 0) | (board.modeO ? 64 : 0);
      return P.buildDump({ time: R.time, ov: board.ov, flagsByte: flags, speed: board.speed,
        s: { pc: R.s.pc, instr: vs.instr, retired: R.s.retired, last: R.lastS, active: mask(vs.active), regs: R.s.regs },
        m: { pc: R.m.pc, ir: R.m.ir, retired: R.m.retired, last: R.lastM, active: mask(vm.active), state: R.m.state, regs: R.m.regs } });
    };
    let st = 'idle', cmd = '', hdr = [], left = 0, addr = 0, wb = [];
    const ACK = [75];
    const onByte = (b) => {
      const R = board.race;
      if (st === 'idle') {
        cmd = String.fromCharCode(b);
        if (cmd === 'I') send([73, P.VERSION]);
        else if (cmd === 'D') send(dump());
        else if (cmd === 'S') { if (!(board.run && board.running)) R.stepEvent(); send(ACK); }
        else if (cmd === 'G') { if (board.run) board.running = true; send(ACK); }
        else if (cmd === 'P') { board.running = false; send(ACK); }
        else if (cmd === 'R') { board.race = new E.Race(board.words, board.ov); board.running = false; send(ACK); }
        else if (cmd === 'X') { board.ovO = false; board.modeO = false; send(ACK); }
        else if ('BOM'.includes(cmd)) st = 'arg';
        else if (cmd === 'L') { st = 'lhdr'; hdr = []; }
        else send([63]);
      } else if (st === 'arg') {
        if (cmd === 'B') boot(b & 1);
        if (cmd === 'O') { board.ovO = !!(b & 128); board.ov = board.ovO ? b & 15 : 0; board.race.ov = board.ov; }
        if (cmd === 'M') { board.modeO = !!(b & 128); board.run = board.modeO && !!(b & 8); board.speed = board.modeO ? b & 7 : 3; if (!board.run) board.running = false; }
        st = 'idle';
        send(ACK);
      } else if (st === 'lhdr') {
        hdr.push(b);
        if (hdr.length === 4) {
          addr = (hdr[0] << 8) | hdr[1]; left = (hdr[2] << 8) | hdr[3]; wb = [];
          st = left ? 'ldata' : 'idle';
          if (!left) send(ACK);
        }
      } else {
        wb.push(b);
        if (wb.length === 4) {
          board.words[addr++] = ((wb[0] << 24) | (wb[1] << 16) | (wb[2] << 8) | wb[3]) >>> 0;
          wb = [];
          if (--left === 0) { st = 'idle'; board.race = new E.Race(board.words, board.ov); board.running = false; send(ACK); }
        }
      }
    };
    const port = {
      open: async () => {},
      close: async () => {},
      getInfo: () => ({ usbVendorId: 0x0403, usbProductId: 0x6010 }),
      readable: new ReadableStream({ start(c) { ctrl = c; } }),
      writable: new WritableStream({ write(chunk) { const bytes = Array.from(chunk); setTimeout(() => bytes.forEach(onByte), 2); } }),
      unplug() { ctrl.close(); },
    };
    target.getPorts = async () => [];
    target.requestPort = async () => port;
    target.port = port;
    return target;
  }

  async function selfTest() {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (fn, ms) => { const t0 = performance.now(); while (!fn() && performance.now() - t0 < ms) await wait(20); return fn(); };
    const errs = [];
    const expect = (c, msg) => { if (!c) errs.push(msg); };
    expect(ST.conn === 'dead' && $('#pill-text').textContent === 'DISCONNECTED', 'เริ่มต้นต้องเป็น DISCONNECTED');
    await connectManual();
    expect(await until(() => ST.conn === 'live' && ST.d, 2000), 'เชื่อมต่อแล้วต้องเป็น CONNECTED');
    for (let i = 0; i < 5; i++) { $('#b-step').click(); await wait(60); }
    expect(await until(() => ST.d && ST.d.time === 50, 2000), 'step 5 ครั้งต้องได้เวลา 50 (ได้ ' + (ST.d && ST.d.time) + ')');
    expect($('#sync-chip').textContent.includes('✔'), 'หลัง step ต้องตรงกับตัวจำลอง');
    $('#b-run').click();
    expect(await until(() => ST.d && ST.d.flags.doneS && ST.d.flags.doneM, 8000), 'วิ่งจนจบ');
    await wait(250);
    expect(!$('#verify').innerHTML.includes('✘') && $('#verify').innerHTML.includes('register ทั้ง 32'), 'ตรวจผลตอนจบต้องผ่านทุกข้อ');
    $('#send-pick').value = 't_factorial';
    $('#send-pick').dispatchEvent(new Event('change'));
    $('#b-send').click();
    const first = E.assemble($('#send-src').value).words[0];
    expect(await until(() => ST.prog && ST.prog.source === 'custom' && ST.d && ST.d.time === 0 && ST.d.s.instr === first, 3000), 'ส่งโปรแกรมลงบอร์ด');
    $('#b-run').click();
    expect(await until(() => ST.d && ST.d.flags.doneS && ST.d.flags.doneM, 15000), 'วิ่งโปรแกรมที่ส่ง');
    await wait(250);
    expect(!$('#verify').innerHTML.includes('✘'), 'ผลโปรแกรมที่ส่งต้องตรง');
    for (const b of ['dec', 'sdec', 'bin', 'hex']) $(`#base-seg [data-base="${b}"]`).click();
    SERIAL.port.unplug();
    expect(await until(() => ST.conn === 'dead' && $('#pill-text').textContent === 'DISCONNECTED', 2000), 'ถอดสายแล้วต้องกลับเป็น DISCONNECTED');
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99;padding:16px;font:20px monospace;color:#fff;background:' + (errs.length ? '#c2352b' : '#16824c');
    bar.textContent = errs.length ? 'SELFTEST FAIL: ' + errs.join(' | ') : 'SELFTEST PASS';
    document.body.appendChild(bar);
  }

  init();
})();
