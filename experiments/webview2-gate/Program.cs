using System.Windows;
using System.Windows.Controls;
using System.IO;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        var app = new Application();
        var window = new Window { Title = "ChatGPT WebView2 compatibility gate (unofficial)", Width = 1100, Height = 800 };
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
                // No injected code, custom user agent, credential access or popup interception.
                void ShowOrigin(string? source)
                {
                    status.Text = Uri.TryCreate(source, UriKind.Absolute, out var uri)
                        ? $"WebView2 {env.BrowserVersionString} | {uri.Scheme}://{uri.Host}"
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
