import { config } from 'dotenv';

config({ quiet: true });

import { spawn } from 'node:child_process';

const children = ['dev:api', 'dev:web'].map((script) =>
  spawn('pnpm', [script], { stdio: 'inherit', env: process.env }),
);
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250);
}
for (const child of children) {
  child.on('error', () => close(1));
  child.on('exit', (code) => close(code || 0));
}
process.on('SIGINT', () => close());
process.on('SIGTERM', () => close());
