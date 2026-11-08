using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class Desktop {
    const int GwlStyle = -16;
    const int GwlExStyle = -20;
    const int WsCaption = 0x00c00000;
    const int WsThickFrame = 0x00040000;
    const int WsExAppWindow = 0x00040000;
    const int WsExTransparent = 0x00000020;
    const int WsExToolWindow = 0x00000080;
    const int WsExNoActivate = 0x08000000;
    [StructLayout(LayoutKind.Sequential)]
    struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    struct Point { public int X, Y; }
    delegate bool WindowCallback(IntPtr hwnd, IntPtr data);
    [DllImport("user32")] static extern bool EnumWindows(WindowCallback callback, IntPtr data);
    [DllImport("user32")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32")] static extern bool GetCursorPos(out Point point);
    [DllImport("user32", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int length);
    [DllImport("user32")] static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("dwmapi")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int key, out Rect rect, int size);
    [DllImport("dwmapi")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int key, out int value, int size);

    static bool IsApplicationSurface(IntPtr hwnd) {
        int extended = GetWindowLong(hwnd, GwlExStyle);
        // Drag previews and shell overlays are not solid surfaces, even when DWM reports a large rectangle.
        if ((extended & (WsExTransparent | WsExToolWindow | WsExNoActivate)) != 0) return false;
        int style = GetWindowLong(hwnd, GwlStyle);
        return (style & WsCaption) == WsCaption || (style & WsThickFrame) != 0 ||
            (extended & WsExAppWindow) != 0;
    }

    static int Main(string[] args) {
        uint parent;
        if (args.Length != 1 || !uint.TryParse(args[0], out parent)) return 2;
        SetProcessDpiAwarenessContext(new IntPtr(-4));
        // A closed parent pipe signals shutdown, including if Electron crashes.
        new Thread(delegate() { Console.ReadLine(); Environment.Exit(0); }) { IsBackground = true }.Start();

        string last = null;
        Point lastCursor = new Point();
        int lastSent = 0;
        while (true) {
            var windows = new List<string>();
            EnumWindows(delegate(IntPtr hwnd, IntPtr ignored) {
                uint owner;
                GetWindowThreadProcessId(hwnd, out owner);
                if (owner == parent || !IsWindowVisible(hwnd) || IsIconic(hwnd)) return true;
                int cloaked;
                if (DwmGetWindowAttribute(hwnd, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
                var buffer = new StringBuilder(128);
                GetClassName(hwnd, buffer, buffer.Capacity);
                string name = buffer.ToString();
                bool taskbar = name == "Shell_TrayWnd" || name == "Shell_SecondaryTrayWnd";
                if (name == "Progman" || name == "WorkerW" || name == "DV2ControlHost") return true;
                if (!taskbar && !IsApplicationSurface(hwnd)) return true;
                Rect bounds;
                if (DwmGetWindowAttribute(hwnd, 9, out bounds, 16) != 0 && !GetWindowRect(hwnd, out bounds)) return true;
                if (bounds.Right - bounds.Left < 32 || bounds.Bottom - bounds.Top < 16) return true;
                windows.Add(string.Format(CultureInfo.InvariantCulture,
                    "{{\"id\":\"{0:X}\",\"left\":{1},\"top\":{2},\"right\":{3},\"bottom\":{4},\"taskbar\":{5}}}",
                    hwnd.ToInt64(), bounds.Left, bounds.Top, bounds.Right, bounds.Bottom, taskbar ? "true" : "false"));
                return true;
            }, IntPtr.Zero);
            bool pressed = GetAsyncKeyState(1) < 0;
            bool control = GetAsyncKeyState(0x11) < 0;
            string snapshot = "{\"pressed\":" + (pressed ? "true" : "false") +
                ",\"control\":" + (control ? "true" : "false") + ",\"windows\":[" + string.Join(",", windows) + "]}";
            Point cursor;
            GetCursorPos(out cursor);
            int now = Environment.TickCount;
            bool moved = cursor.X != lastCursor.X || cursor.Y != lastCursor.Y;
            if (snapshot != last || moved ||
                unchecked(now - lastSent) >= 96) {
                Console.WriteLine(snapshot);
                last = snapshot;
                lastCursor = cursor;
                lastSent = now;
            }
            Thread.Sleep(pressed || moved ? 14 : 30);
        }
    }
}

