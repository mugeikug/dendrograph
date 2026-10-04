using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DendrographAddIn
{
    /// <summary>
    /// The "大きな画面で編集" popout: a plain, independently resizable window with its own
    /// WebView2 instance, standing in for Office.js's Dialog API (which doesn't exist outside
    /// an Office.js host). Reuses the same page, virtual host mapping and
    /// ?dendrographDialog=1&amp;state=... URL convention as the Office.js edition's dialog.
    /// </summary>
    public class PopoutEditorForm : Form
    {
        private readonly WebView2 _webView = new WebView2 { Dock = DockStyle.Fill };
        private readonly string _webAppFolder;
        private readonly string _initialStateJson;
        private readonly Action<string> _onApply;

        public PopoutEditorForm(string webAppFolder, string initialStateJson, Action<string> onApply)
        {
            _webAppFolder = webAppFolder;
            _initialStateJson = initialStateJson;
            _onApply = onApply;

            Text = "Dendrograph - 編集ウィンドウ";
            Width = Properties.Settings.Default.PopoutWidth;
            Height = Properties.Settings.Default.PopoutHeight;

            Controls.Add(_webView);
            Load += async (sender, e) => await InitializeAsync();
            FormClosing += (sender, e) =>
            {
                Properties.Settings.Default.PopoutWidth = Width;
                Properties.Settings.Default.PopoutHeight = Height;
                Properties.Settings.Default.Save();
            };
        }

        private async Task InitializeAsync()
        {
            string userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "DendrographAddIn", "WebView2Popout");
            var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder, null);
            await _webView.EnsureCoreWebView2Async(environment);

            _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "dendrograph.local", _webAppFolder, CoreWebView2HostResourceAccessKind.Allow);

            _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

            string encodedState = Uri.EscapeDataString(_initialStateJson);
            _webView.CoreWebView2.Navigate($"https://dendrograph.local/index.html?dendrographDialog=1&state={encodedState}");
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string raw = e.TryGetWebMessageAsString();
            if (string.IsNullOrEmpty(raw)) return;

            try
            {
                using (var doc = JsonDocument.Parse(raw))
                {
                    string type = doc.RootElement.TryGetProperty("type", out var t) ? t.GetString() : null;
                    if (type == "editorApply")
                    {
                        string stateJson = doc.RootElement.GetProperty("state").GetRawText();
                        _onApply(stateJson);
                        Close();
                    }
                }
            }
            catch
            {
                // Malformed message from the page -- nothing we can usefully do with it.
            }
        }
    }
}
