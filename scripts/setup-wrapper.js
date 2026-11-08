import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const sdkVersion = '1.0.3537.50';

export async function wrapSetup(payload, executable, icon) {
  const staging = dirname(icon);
  const sdk = join(staging, 'webview-sdk');
  await mkdir(sdk, { recursive: true });
  const archive = process.env.WINTERMAS_WEBVIEW2_SDK || join(staging, 'webview2.nupkg');
  if (!process.env.WINTERMAS_WEBVIEW2_SDK) {
    const url = 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/' + sdkVersion +
      '/microsoft.web.webview2.' + sdkVersion + '.nupkg';
    await run('curl.exe', ['-fsSL', '--max-time', '60', url, '-o', archive]);
  }
  await run('tar.exe', ['-xf', archive, '-C', sdk]);

  const artwork = resolve('ui/icon.png');
  const iconScript = (await readFile(resolve('setup/make-icon.ps1'), 'utf8')).replace(/^\uFEFF/, '');
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(iconScript, 'utf16le').toString('base64')], {
    env: { ...process.env, WINTERMAS_ICON_SOURCE: artwork, WINTERMAS_ICON_OUTPUT: icon },
  });
  const compiler = join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  const managed = ['Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll'];
  await mkdir(dirname(executable), { recursive: true });
  try {
    await run(compiler, [
      '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/win32icon:' + icon, '/out:' + executable,
      '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll',
      ...managed.flatMap(name => {
        const path = join(sdk, 'lib', 'net462', name);
        return ['/reference:' + path, '/resource:' + path + ',' + name];
      }),
      '/resource:' + join(sdk, 'runtimes', 'win-x64', 'native', 'WebView2Loader.dll') + ',WebView2Loader.dll',
      '/resource:' + payload + ',Wintermas.Payload',
      '/resource:' + icon + ',Wintermas.Icon',
      '/resource:' + artwork + ',Wintermas.Artwork',
      '/resource:' + resolve('setup/index.html') + ',Wintermas.Page',
      resolve('setup/Setup.cs'),
    ]);
  } catch (error) {
    throw new Error(error.stdout || error.message, { cause: error });
  }
}
