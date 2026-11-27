using System.Windows;
using System.Windows.Controls;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

internal static class Program
{
    // Contract 1: same local page adapter; no network fetching or host messaging.
    static (string Script, string Version) LoadWorkspace()
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, "workspace-module.json");
            if (File.Exists(path) && new FileInfo(path).Length <= 2_000_000)
            {
                using var json = JsonDocument.Parse(File.ReadAllText(path));
                var r = json.RootElement;
                var script = r.GetProperty("script").GetString() ?? "";
                var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(script)));
                var version = r.GetProperty("version").GetString() ?? "";
                if (r.GetProperty("contract").GetInt32() == 1 && script.Length > 0
                    && version.Length == 40 && version.All(Uri.IsHexDigit)
                    && hash.Equals(r.GetProperty("sha256").GetString(), StringComparison.OrdinalIgnoreCase))
                    return (script, version[..12]);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException
            or InvalidOperationException or KeyNotFoundException or FormatException) { }
        using var stream = typeof(Program).Assembly.GetManifestResourceStream("ChatWorkspace.workspace.js")
            ?? throw new InvalidOperationException("Missing bundled workspace script");
        using var reader = new StreamReader(stream);
        return (reader.ReadToEnd(), "bundled fallback");
    }

    [STAThread]
    static void Main()
    {
        var app = new Application();
        var window = new Window { Title = "Chat Workspace — WebView2 (unofficial)", Width = 1100, Height = 800 };
        var panel = new DockPanel();
        var status = new TextBlock { Text = "Initializing isolated WebView2 profile...", Margin = new Thickness(8), TextWrapping = TextWrapping.Wrap };
        DockPanel.SetDock(status, Dock.Top);
        panel.Children.Add(status);
        var view = new WebView2();
        panel.Children.Add(view);
        window.Content = panel;
        window.Loaded += async (_, _) =>
        {
            try
            {
                var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ChatWorkspaceWebViewGate", "WebView2");
                var env = await CoreWebView2Environment.CreateAsync(null, folder);
                await view.EnsureCoreWebView2Async(env);
                var core = view.CoreWebView2;
                core.Settings.AreHostObjectsAllowed = false;
                core.Settings.IsWebMessageEnabled = false;
                // No host objects, web messages, custom user agent, credential access or popup interception.
                // The bundled script self-guards top frame and exact HTTPS origin; no remote code.
                var (script, moduleVersion) = LoadWorkspace();
                await core.AddScriptToExecuteOnDocumentCreatedAsync(script);
                void ShowOrigin(string? source)
                {
                    status.Text = Uri.TryCreate(source, UriKind.Absolute, out var uri)
                        ? $"WebView2 {env.BrowserVersionString} | {uri.Scheme}://{uri.Host} | module {moduleVersion}"
                        : $"WebView2 {env.BrowserVersionString} | navigating";
                }
                core.SourceChanged += (_, _) => ShowOrigin(core.Source);
                core.NavigationCompleted += (_, e) =>
                {
                    ShowOrigin(core.Source);
                    if (!e.IsSuccess) status.Text += $" | navigation error: {e.WebErrorStatus}";
                };
                core.ProcessFailed += (_, e) => status.Text = $"WebView2 process failure: {e.ProcessFailedKind}";
                core.Navigate("https://chatgpt.com/");
            }
            catch (Exception ex)
            {
                status.Text = $"Initialization failed: {ex.GetType().Name} (0x{ex.HResult:X8})";
            }
        };
        window.Closed += (_, _) => view.Dispose();
        app.Run(window);
    }
}
