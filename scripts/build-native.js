import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';

const compiler = join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
try {
  await promisify(execFile)(compiler, ['/nologo', '/optimize+', '/out:' + resolve('native', 'desktop.exe'), resolve('native', 'Desktop.cs')]);
} catch (error) {
  console.error(error.stdout || error.message);
  process.exitCode = 1;
}

