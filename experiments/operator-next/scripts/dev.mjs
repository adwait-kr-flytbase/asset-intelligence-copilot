import { spawn } from 'node:child_process';
const jobs = [
  spawn('pnpm', ['dev:web'], { stdio: 'inherit' }),
  spawn('pnpm', ['dev:api'], { stdio: 'inherit' }),
];
let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  for (const job of jobs) job.kill('SIGTERM');
};
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, close);
for (const job of jobs)
  job.on('exit', (code) => {
    if (!closing) {
      close();
      process.exitCode = code || 0;
    }
  });
