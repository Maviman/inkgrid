// Inkgrid.exe: opens the installed app (app\index.html) in its own Microsoft Edge app window.
// Built in CI with the .NET Framework csc.exe that ships with Windows, so it stays C# 5.
//
//   Inkgrid.exe                  open the app
//   Inkgrid.exe --smoke [log]    headless check that the app renders; exit 0 = OK (used by CI)
//   Inkgrid.exe --check          print what was detected (Edge path, app path) to a message box
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Inkgrid")]
[assembly: AssemblyProduct("Inkgrid")]
[assembly: AssemblyDescription("Image and video to ASCII art")]

static class Launcher
{
    const string AppName = "Inkgrid";

    [STAThread]
    static int Main(string[] args)
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string index = Path.Combine(baseDir, "app", "index.html");
        string dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), AppName);
        string edge = FindEdge();

        if (!File.Exists(index))
        {
            Fail("The app files are missing:\n" + index + "\n\nRe-run the Inkgrid installer to repair it.");
            return 2;
        }
        string uri = new Uri(index).AbsoluteUri;

        if (args.Length > 0 && args[0] == "--smoke")
        {
            string log = args.Length > 1 ? args[1] : Path.Combine(Path.GetTempPath(), "inkgrid-smoke.log");
            return Smoke(edge, uri, log);
        }
        if (args.Length > 0 && args[0] == "--check")
        {
            MessageBox.Show("App: " + index + "\nEdge: " + (edge ?? "not found (default browser will be used)") + "\nSettings: " + dataDir,
                AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        try
        {
            if (edge != null)
            {
                string profile = Path.Combine(dataDir, "EdgeProfile");
                Directory.CreateDirectory(profile);
                var psi = new ProcessStartInfo(edge,
                    "--app=\"" + uri + "\" --user-data-dir=\"" + profile + "\" --no-first-run --no-default-browser-check --window-size=1440,900");
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
            else
            {
                NoticeOnce(dataDir);
                var psi = new ProcessStartInfo(index);
                psi.UseShellExecute = true;
                Process.Start(psi);
            }
            return 0;
        }
        catch (Exception e)
        {
            Fail("Inkgrid could not start.\n\n" + e.Message);
            return 1;
        }
    }

    // Edge's own registration first (per-machine, then per-user), then the standard install folders.
    static string FindEdge()
    {
        string[] hives = { "HKEY_LOCAL_MACHINE", "HKEY_CURRENT_USER" };
        foreach (string hive in hives)
        {
            object v = Registry.GetValue(hive + @"\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe", "", null);
            string p = v as string;
            if (!string.IsNullOrEmpty(p) && File.Exists(p)) return p;
        }
        string[] roots = {
            Environment.GetEnvironmentVariable("ProgramFiles(x86)"),
            Environment.GetEnvironmentVariable("ProgramFiles"),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
        };
        foreach (string r in roots)
        {
            if (string.IsNullOrEmpty(r)) continue;
            string p = Path.Combine(r, @"Microsoft\Edge\Application\msedge.exe");
            if (File.Exists(p)) return p;
        }
        return null;
    }

    static int Smoke(string edge, string uri, string log)
    {
        var sb = new StringBuilder();
        sb.AppendLine("uri: " + uri);
        sb.AppendLine("edge: " + (edge ?? "(none)"));
        int code;
        if (edge == null)
        {
            sb.AppendLine("FAIL: Microsoft Edge not found");
            code = 3;
        }
        else
        {
            string profile = Path.Combine(Path.GetTempPath(), "inkgrid-smoke-" + Guid.NewGuid().ToString("N"));
            var psi = new ProcessStartInfo(edge,
                "--headless=new --disable-gpu --no-first-run --no-default-browser-check --user-data-dir=\"" + profile +
                "\" --virtual-time-budget=10000 --dump-dom \"" + uri + "\"");
            psi.UseShellExecute = false;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.CreateNoWindow = true;
            using (var p = Process.Start(psi))
            {
                var errTask = p.StandardError.ReadToEndAsync();
                string dom = p.StandardOutput.ReadToEnd();
                if (!p.WaitForExit(90000)) { try { p.Kill(); } catch { } }
                bool ready = dom.Contains("data-ready=\"1\"");
                int at = dom.IndexOf("cells");
                sb.AppendLine("dom bytes: " + dom.Length);
                sb.AppendLine("info line: " + (at > 60 ? dom.Substring(at - 60, 65) : "(not found)"));
                if (!ready) sb.AppendLine("stderr: " + errTask.Result);
                sb.AppendLine(ready ? "PASS: app rendered" : "FAIL: app did not render");
                code = ready ? 0 : 1;
            }
            try { Directory.Delete(profile, true); } catch { }
        }
        File.WriteAllText(log, sb.ToString());
        return code;
    }

    static void NoticeOnce(string dataDir)
    {
        try
        {
            Directory.CreateDirectory(dataDir);
            string flag = Path.Combine(dataDir, "no-edge-notice.txt");
            if (File.Exists(flag)) return;
            File.WriteAllText(flag, "shown");
            MessageBox.Show("Microsoft Edge was not found, so Inkgrid will open in your default browser.\n\n" +
                "Everything still works. Install Edge (microsoft.com/edge) if you want Inkgrid in its own window.",
                AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch { }
    }

    static void Fail(string msg)
    {
        MessageBox.Show(msg, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
