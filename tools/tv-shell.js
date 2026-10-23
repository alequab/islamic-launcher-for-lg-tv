// Runs shell commands as root on a rooted LG TV through Homebrew Channel's telnet (port 23) and prints the output.
//   node tools/tv-shell.js <tv-ip> "<command>"
//   node tools/tv-shell.js <tv-ip> - < commands.sh      (several lines, from stdin)
'use strict';
const net = require('net');
const fs = require('fs');

const host = process.argv[2];
let cmd = process.argv.slice(3).join(' ');
if (!host || !cmd) {
  console.error('usage: node tv-shell.js <tv-ip> "<command>" | -');
  process.exit(1);
}
if (cmd === '-') cmd = fs.readFileSync(0, 'utf8');
cmd = cmd.replace(/^﻿/, '').replace(/\r/g, '');

const MARK = '__AFNON_DONE_' + Date.now() + '__';
const s = net.connect(23, host);
let buf = '', sent = false, done = false;
const timer = setTimeout(() => { process.stdout.write(buf); console.error('\n[timeout]'); process.exit(2); }, 180000);

s.on('data', (d) => {
  if (done) return;
  // Telnet option negotiation: refuse everything (IAC DO x -> WONT x, IAC WILL x -> DONT x).
  const bytes = [];
  for (let i = 0; i < d.length; i++) {
    if (d[i] === 255 && i + 2 < d.length) {
      if (d[i + 1] === 253) s.write(Buffer.from([255, 252, d[i + 2]]));
      else if (d[i + 1] === 251) s.write(Buffer.from([255, 254, d[i + 2]]));
      i += 2;
      continue;
    }
    bytes.push(d[i]);
  }
  buf += Buffer.from(bytes).toString('utf8');
  if (!sent) {
    if (!/[#$] ?$/.test(buf.trimEnd() + ' ')) return;
    sent = true;
    buf = '';
    // Everything runs in one subshell with its output fenced by the marker, so the echo of the typed lines
    // and the prompts are left out.
    s.write('stty -echo 2>/dev/null; echo ' + MARK + 'S; (\n' + cmd + '\n) 2>&1; echo ' + MARK + 'E\n');
    return;
  }
  const a = buf.indexOf(MARK + 'S\n') >= 0 ? buf.indexOf(MARK + 'S\n') : buf.indexOf(MARK + 'S\r\n');
  const b = buf.indexOf(MARK + 'E', a + 1);
  if (a >= 0 && b > a && /\r?\n/.test(buf.slice(b))) {
    clearTimeout(timer);
    done = true;
    process.stdout.write(buf.slice(buf.indexOf('\n', a) + 1, b).replace(/\r/g, ''));
    s.end('exit\n');
    setTimeout(() => process.exit(0), 100);
  }
});
s.on('error', (e) => { console.error('[error] ' + e.message); process.exit(1); });
