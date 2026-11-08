import builder from 'electron-builder';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { wrapSetup } from './setup-wrapper.js';

const { Arch, Platform, build } = builder;
const output = resolve(process.argv[2] ?? 'dist/setup');
const tempRoot = await realpath(tmpdir());
const staging = await mkdtemp(join(tempRoot, 'wintermas-package-'));
try {
  await build({
    targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
    publish: 'never',
    config: {
      appId: 'Wintermas',
      directories: { output: staging },
      electronDist: resolve('node_modules/electron/dist'),
      electronLanguages: ['en-US'],
      npmRebuild: false,
      asar: true,
      files: ['main.js', 'preload.cjs', 'ui/**/*'],
      extraResources: [{ from: 'native/desktop.exe', to: 'native/desktop.exe' }],
      win: { icon: 'ui/icon.png', signExecutable: false },
      nsis: {
        artifactName: 'Wintermas-Engine.exe',
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        differentialPackage: false,
        runAfterFinish: false,
      },
    },
  });
  const executable = join(output, 'Wintermas-Setup.exe');
  await wrapSetup(join(staging, 'Wintermas-Engine.exe'), executable, join(staging, 'setup.ico'));
  const { size } = await stat(executable);
  console.log(executable + ' (' + (size / 1024 ** 2).toFixed(1) + ' MiB)');
} finally {
  if (dirname(staging) === tempRoot) {
    await rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
  }
}

