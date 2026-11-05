/* global require, __dirname, process, console */
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('node:child_process');
const path = require('node:path');

const forge = path.join(__dirname, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');
const detached = process.platform === 'win32';
const child = spawn(process.execPath, [forge, 'start'], {
  cwd: __dirname,
  detached,
  windowsHide: detached,
  stdio: detached ? 'ignore' : 'inherit',
  env: process.env,
});
child.on('error', error => { console.error('프로그램 실행 실패:', error.message); process.exitCode = 1; });
if (detached) child.unref();
else child.on('exit', code => { process.exitCode = code ?? 1; });
