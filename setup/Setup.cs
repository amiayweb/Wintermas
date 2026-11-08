using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Bootstrap
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        AppDomain.CurrentDomain.AssemblyResolve += (sender, args) => {
            var name = new AssemblyName(args.Name).Name;
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name + ".dll")) {
                if (stream == null) return null;
                using (var bytes = new MemoryStream()) {
                    stream.CopyTo(bytes);
                    return Assembly.Load(bytes.ToArray());
                }
            }
        };
        Launch();
    }

    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
    private static void Launch()
    {
        Application.Run(new SetupWindow());
    }
}

internal sealed class SetupWindow : Form
{
    private const string PageUrl = "https://wintermas.setup/index.html";
    private readonly WebView2 browser = new WebView2 { Dock = DockStyle.Fill };
    private readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private bool installing;
    private string installedApp;
    private string defaultFolder;
    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr LoadLibrary(string path);

    public SetupWindow()
    {
        Text = "Wintermas Setup";
        Icon = new Icon(Resource("Wintermas.Icon"));
        ClientSize = new Size(760, 475);
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        BackColor = Color.FromArgb(14, 31, 25);
        browser.DefaultBackgroundColor = BackColor;
        Controls.Add(browser);
        defaultFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs", "Wintermas");
        FormClosing += (sender, e) => { if (installing) e.Cancel = true; };
        Shown += StartBrowser;
    }

    private async void StartBrowser(object sender, EventArgs args)
    {
        try {
            var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "WintermasSetup", "webview-1.0.3537.50");
            Directory.CreateDirectory(directory);
            var loader = Path.Combine(directory, "WebView2Loader.dll");
            if (!File.Exists(loader)) {
                var temporary = loader + "." + Guid.NewGuid().ToString("N");
                try {
                    using (var source = Resource("WebView2Loader.dll"))
                    using (var destination = File.Create(temporary))
                        source.CopyTo(destination);
                    try { File.Move(temporary, loader); }
                    catch (IOException) { if (!File.Exists(loader)) throw; }
                } finally { File.Delete(temporary); }
            }
            if (LoadLibrary(loader) == IntPtr.Zero) throw new InvalidOperationException("WebView2 could not start.");
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(directory, "Browser"));
            await browser.EnsureCoreWebView2Async(environment);
            var core = browser.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.NavigationStarting += (s, e) => { e.Cancel = e.Uri != PageUrl; };
            core.NewWindowRequested += (s, e) => { e.Handled = true; };
            core.WebMessageReceived += OnMessage;
            byte[] page;
            using (var reader = new StreamReader(Resource("Wintermas.Page")))
            using (var icon = Resource("Wintermas.Artwork"))
            using (var bytes = new MemoryStream()) {
                icon.CopyTo(bytes);
                page = System.Text.Encoding.UTF8.GetBytes(reader.ReadToEnd()
                    .Replace("WINTERMAS_LOGO_BASE64", Convert.ToBase64String(bytes.ToArray())));
            }
            core.AddWebResourceRequestedFilter(PageUrl, CoreWebView2WebResourceContext.Document);
            core.WebResourceRequested += (s, e) => {
                e.Response = environment.CreateWebResourceResponse(new MemoryStream(page, false),
                    200, "OK", "Content-Type: text/html; charset=utf-8");
            };
            core.Navigate(PageUrl);
        } catch (Exception error) {
            MessageBox.Show(this, "Wintermas Setup needs Microsoft Edge WebView2 Runtime.\n\n" + error.Message,
                "Wintermas Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private void Send(string state, string value)
    {
        browser.CoreWebView2.PostWebMessageAsJson(json.Serialize(new { state = state, value = value }));
    }

    private async void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (args.Source != PageUrl) return;
        var message = args.TryGetWebMessageAsString();
        if (message == "ready") { Send("folder", defaultFolder); return; }
        if (message == "drag" && !installing) {
            ReleaseCapture();
            SendMessage(Handle, 0xA1, new IntPtr(2), IntPtr.Zero);
            return;
        }
        if (installing) return;
        if (message == "close") { Close(); return; }
        if (message == "open" && installedApp != null) {
            try { Process.Start(installedApp); Close(); }
            catch (Exception error) { Send("error", error.Message); }
            return;
        }
        if (message.StartsWith("browse:", StringComparison.Ordinal)) {
            using (var dialog = new FolderBrowserDialog { SelectedPath = message.Substring(7) }) {
                if (dialog.ShowDialog(this) == DialogResult.OK) Send("folder", dialog.SelectedPath);
            }
            return;
        }
        if (!message.StartsWith("install:", StringComparison.Ordinal) || installedApp != null) return;
        try {
            string target = ValidateFolder(message.Substring(8).Trim());
            installing = true;
            Send("installing", "");
            installedApp = await Task.Run(() => InstallFiles(target));
            Send("done", "");
        } catch (Exception error) { Send("error", error.Message); }
        finally { installing = false; }
    }

    private static string ValidateFolder(string input)
    {
        if (input.Length < 3 || input[1] != ':' || (input[2] != Path.DirectorySeparatorChar && input[2] != '/'))
            throw new ArgumentException("Choose a full path on a local drive.");
        var target = Path.GetFullPath(input).TrimEnd(Path.DirectorySeparatorChar);
        if (target.Length <= Path.GetPathRoot(input).TrimEnd(Path.DirectorySeparatorChar).Length)
            throw new ArgumentException("Choose a folder inside the drive.");
        if (Directory.Exists(target) && Directory.GetFileSystemEntries(target).Length != 0 &&
            !(File.Exists(Path.Combine(target, "Wintermas.exe")) &&
              File.Exists(Path.Combine(target, "Uninstall Wintermas.exe"))))
            throw new ArgumentException("Choose an empty folder or the existing Wintermas folder.");
        return target;
    }

    private static Stream Resource(string name)
    {
        return Assembly.GetExecutingAssembly().GetManifestResourceStream(name);
    }

    private static string InstallFiles(string target)
    {
        var temporary = Path.Combine(Path.GetTempPath(), "wintermas-setup-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temporary);
        var payload = Path.Combine(temporary, "Install.exe");
        try {
            using (var source = Resource("Wintermas.Payload"))
            using (var file = File.Create(payload))
                source.CopyTo(file);
            var options = new ProcessStartInfo(payload, "/S /currentuser /D=" + target) {
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            using (var installer = Process.Start(options)) {
                installer.WaitForExit();
                if (installer.ExitCode != 0)
                    throw new InvalidOperationException("Installation failed (code " + installer.ExitCode + ").");
            }
            var installed = Path.Combine(target, "Wintermas.exe");
            if (!File.Exists(installed))
                throw new InvalidOperationException("Wintermas could not be found in the selected folder.");
            return installed;
        } finally {
            try { File.Delete(payload); Directory.Delete(temporary); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }
}

