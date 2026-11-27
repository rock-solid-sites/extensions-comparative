using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Windows;

internal static class Program
{
    const string HostName = "ChatWorkspaceWebViewGate";
    const string ModuleName = "workspace-module.json";
    static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes));
    static string Validate(byte[] data)
    {
        if (data.Length == 0 || data.Length > 2_000_000) throw new InvalidDataException("Invalid module size.");
        using var document = JsonDocument.Parse(data);
        var r = document.RootElement;
        var version = r.GetProperty("version").GetString() ?? "";
        var script = r.GetProperty("script").GetString() ?? "";
        if (r.GetProperty("contract").GetInt32() != 1 || version.Length != 40 || !version.All(Uri.IsHexDigit)
            || script.Length == 0 || !Hash(Encoding.UTF8.GetBytes(script)).Equals(r.GetProperty("sha256").GetString(), StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Module integrity or compatibility check failed.");
        return version;
    }
    static byte[] Payload()
    {
        using var stream = typeof(Program).Assembly.GetManifestResourceStream("ChatWorkspace.Module")
            ?? throw new InvalidDataException("Missing update payload.");
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        return memory.ToArray();
    }
    static void ValidateInstall(string exe)
    {
        if (!Path.GetFileName(exe).Equals(HostName + ".exe", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Not a Chat Workspace installation.");
        var root = Path.GetDirectoryName(exe)!;
        using var manifest = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(root, "baseline-manifest.json")));
        if (manifest.RootElement.GetProperty("contract").GetInt32() != 1)
            throw new InvalidDataException("Incompatible installed host.");
        foreach (var name in new[] { HostName + ".exe", HostName + ".dll", HostName + ".runtimeconfig.json" })
        {
            var entry = manifest.RootElement.GetProperty("files").EnumerateArray().Single(x => x.GetProperty("path").GetString() == name);
            var path = Path.Combine(root, name);
            if (!Hash(File.ReadAllBytes(path)).Equals(entry.GetProperty("sha256").GetString(), StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Installed host does not match its baseline manifest.");
        }
        Validate(File.ReadAllBytes(Path.Combine(root, ModuleName)));
    }
    static void Replace(string target, byte[] data, string backup)
    {
        Validate(data);
        var stage = Path.Combine(Path.GetDirectoryName(target)!, ".module-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using (var file = new FileStream(stage, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                file.Write(data);
                file.Flush(true);
            }
            Validate(File.ReadAllBytes(stage));
            File.Replace(stage, target, backup);
        }
        finally { if (File.Exists(stage)) File.Delete(stage); }
    }
    static Process SelectHost()
    {
        var processes = Process.GetProcessesByName(HostName);
        if (processes.Length == 1 && processes[0].SessionId == Process.GetCurrentProcess().SessionId) return processes[0];
        foreach (var p in processes) p.Dispose();
        throw new InvalidOperationException("Open exactly one Chat Workspace window, then run this update again.");
    }
    static Process StartHost(string exe) => Process.Start(new ProcessStartInfo(exe) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(exe)! })
        ?? throw new InvalidOperationException("Could not start Chat Workspace.");
    static void Apply()
    {
        var data = Payload();
        var version = Validate(data);
        using var mutex = new System.Threading.Mutex(false, @"Local\ChatWorkspace.ModuleUpdater.v1");
        bool held;
        try { held = mutex.WaitOne(0); } catch (System.Threading.AbandonedMutexException) { held = true; }
        if (!held) throw new InvalidOperationException("An update is already running.");
        try
        {
            using var host = SelectHost();
            var exe = host.MainModule?.FileName ?? throw new InvalidOperationException("Cannot locate the running host.");
            ValidateInstall(exe);
            var target = Path.Combine(Path.GetDirectoryName(exe)!, ModuleName);
            var old = File.ReadAllBytes(target);
            if (Validate(old) == version) { MessageBox.Show("This update is already installed.", "Chat Workspace"); return; }
            if (MessageBox.Show("Install the update and restart Chat Workspace? Finish any active turns and save unsent drafts first.", "Chat Workspace update", MessageBoxButton.OKCancel, MessageBoxImage.Information) != MessageBoxResult.OK) return;
            if (host.HasExited || !host.CloseMainWindow() || !host.WaitForExit(15000))
                throw new InvalidOperationException("Chat Workspace did not close normally. No files were changed.");
            var otherHosts = Process.GetProcessesByName(HostName);
            try { if (otherHosts.Length != 0) throw new InvalidOperationException("Another Chat Workspace process is running. No files were changed."); }
            finally { foreach (var p in otherHosts) p.Dispose(); }
            var backup = target + ".bak";
            bool applied = false;
            try
            {
                ValidateInstall(exe);
                Replace(target, data, backup);
                applied = true;
                using var restarted = StartHost(exe);
                if (restarted.WaitForExit(3000)) throw new InvalidOperationException("Updated app exited immediately.");
            }
            catch
            {
                if (applied) Replace(target, old, target + ".failed");
                var running = Process.GetProcessesByName(HostName);
                try { if (running.Length == 0) using (StartHost(exe)) { } }
                finally { foreach (var p in running) p.Dispose(); }
                throw;
            }
        }
        finally { mutex.ReleaseMutex(); }
    }
    static void SelfTest()
    {
        var bytes = Payload(); Validate(bytes);
        var root = Path.Combine(Path.GetTempPath(), "chatws-updater-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var target = Path.Combine(root, ModuleName);
            using var doc = JsonDocument.Parse(bytes);
            var r = doc.RootElement;
            var script = r.GetProperty("script").GetString()!;
            var old = JsonSerializer.SerializeToUtf8Bytes(new { contract = 1, version = new string('0', 40), sha256 = Hash(Encoding.UTF8.GetBytes(script)), script });
            File.WriteAllBytes(target, old);
            Replace(target, bytes, target + ".bak");
            if (!File.ReadAllBytes(target).SequenceEqual(bytes) || !File.ReadAllBytes(target + ".bak").SequenceEqual(old)) throw new Exception("Replacement failed.");
            bool rejected = false;
            try { Replace(target, Encoding.UTF8.GetBytes("{}"), target + ".bak"); } catch { rejected = true; }
            if (!rejected || !File.ReadAllBytes(target).SequenceEqual(bytes)) throw new Exception("Invalid payload changed target.");
            Replace(target, old, target + ".failed");
            if (!File.ReadAllBytes(target).SequenceEqual(old)) throw new Exception("Rollback failed.");
            rejected = false;
            try { ValidateInstall(Path.Combine(root, HostName + ".exe")); } catch { rejected = true; }
            if (!rejected) throw new Exception("Invalid installation accepted.");
            // Runner has no interactive installed host.
            rejected = false;
            try { using var p = SelectHost(); } catch (InvalidOperationException) { rejected = true; }
            if (!rejected) throw new Exception("Missing host not rejected.");
        }
        finally { Directory.Delete(root, true); }
    }
    [STAThread]
    static int Main(string[] args)
    {
        if (args.SequenceEqual(new[] { "--self-test" }))
        {
            try { SelfTest(); return 0; } catch { return 1; }
        }
        try { Apply(); return 0; }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Chat Workspace update", MessageBoxButton.OK, MessageBoxImage.Error); return 1; }
    }
}
