using System;
using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Word = Microsoft.Office.Interop.Word;

namespace DendrographAddIn
{
    public class TaskPaneHost : UserControl
    {
        private readonly WebView2 _webView = new WebView2 { Dock = DockStyle.Fill };
        private string _webAppFolder;

        public TaskPaneHost()
        {
            Controls.Add(_webView);
            Load += async (sender, e) => await InitializeAsync();
        }

        private async Task InitializeAsync()
        {
            // WebView2 defaults its user-data folder to the host executable's directory
            // (WINWORD.EXE's install folder under Program Files), which a non-admin process
            // cannot write to. Point it at a writable per-user folder instead.
            string userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "DendrographAddIn", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder, null);
            await _webView.EnsureCoreWebView2Async(environment);

            // Office add-ins run with shadow copying enabled, so Assembly.Location points at a
            // temp shadow-copy folder that doesn't contain WebAppContent. CodeBase is unaffected
            // by shadow copying and reflects the real build output location.
            string codeBase = Assembly.GetExecutingAssembly().CodeBase;
            string assemblyDir = Path.GetDirectoryName(new Uri(codeBase).LocalPath);
            _webAppFolder = Path.Combine(assemblyDir, "WebAppContent");

            _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "dendrograph.local", _webAppFolder, CoreWebView2HostResourceAccessKind.Allow);

            _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

            _webView.CoreWebView2.Navigate("https://dendrograph.local/index.html");
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
                    switch (type)
                    {
                        case "insertOoxml":
                            HandleInsertOoxml(doc.RootElement);
                            break;
                        case "openEditor":
                            HandleOpenEditor(doc.RootElement);
                            break;
                        case "openLibrary":
                            HandleOpenLibrary(doc.RootElement);
                            break;
                        case "saveLibraryAs":
                            HandleSaveLibraryAs(doc.RootElement);
                            break;
                        case "saveLibraryToPath":
                            HandleSaveLibraryToPath(doc.RootElement);
                            break;
                    }
                }
            }
            catch
            {
                // Malformed message from the page -- nothing we can usefully do with it.
            }
        }

        private void HandleInsertOoxml(JsonElement root)
        {
            int requestId = root.GetProperty("requestId").GetInt32();
            string ooxml = root.GetProperty("ooxml").GetString();

            bool ok = true;
            string error = null;
            try
            {
                Word.Range endRange = Globals.ThisAddIn.Application.ActiveDocument.Content;
                endRange.Collapse(Word.WdCollapseDirection.wdCollapseEnd);
                endRange.InsertXML(ooxml);
            }
            catch (Exception ex)
            {
                ok = false;
                error = ex.Message;
            }

            PostReply(new { type = "insertOoxmlResult", requestId, ok, error });
        }

        private void HandleOpenEditor(JsonElement root)
        {
            string stateJson = root.GetProperty("state").GetRawText();
            var popout = new PopoutEditorForm(_webAppFolder, stateJson, applied =>
            {
                string script = "window.__dendrographApplyFromPopout && window.__dendrographApplyFromPopout("
                    + JsonSerializer.Serialize(applied) + ")";
                _ = _webView.CoreWebView2.ExecuteScriptAsync(script);
            });
            popout.Show();
        }

        private void HandleOpenLibrary(JsonElement root)
        {
            int requestId = root.GetProperty("requestId").GetInt32();
            using (var dialog = new OpenFileDialog { Filter = "Dendrograph リスト (*.json)|*.json|すべてのファイル (*.*)|*.*" })
            {
                if (dialog.ShowDialog() != DialogResult.OK)
                {
                    PostReply(new { type = "openLibraryResult", requestId, canceled = true });
                    return;
                }
                try
                {
                    string text = File.ReadAllText(dialog.FileName);
                    PostReply(new
                    {
                        type = "openLibraryResult",
                        requestId,
                        ok = true,
                        path = dialog.FileName,
                        name = Path.GetFileName(dialog.FileName),
                        text,
                    });
                }
                catch (Exception ex)
                {
                    PostReply(new { type = "openLibraryResult", requestId, ok = false, error = ex.Message });
                }
            }
        }

        private void HandleSaveLibraryAs(JsonElement root)
        {
            int requestId = root.GetProperty("requestId").GetInt32();
            string text = root.GetProperty("text").GetString();
            string suggestedName = root.TryGetProperty("suggestedName", out var sn) ? sn.GetString() : "dendrograph-list.json";

            using (var dialog = new SaveFileDialog { Filter = "Dendrograph リスト (*.json)|*.json|すべてのファイル (*.*)|*.*", FileName = suggestedName })
            {
                if (dialog.ShowDialog() != DialogResult.OK)
                {
                    PostReply(new { type = "saveLibraryResult", requestId, canceled = true });
                    return;
                }
                try
                {
                    File.WriteAllText(dialog.FileName, text);
                    PostReply(new { type = "saveLibraryResult", requestId, ok = true, path = dialog.FileName, name = Path.GetFileName(dialog.FileName) });
                }
                catch (Exception ex)
                {
                    PostReply(new { type = "saveLibraryResult", requestId, ok = false, error = ex.Message });
                }
            }
        }

        private void HandleSaveLibraryToPath(JsonElement root)
        {
            int requestId = root.GetProperty("requestId").GetInt32();
            string path = root.GetProperty("path").GetString();
            string text = root.GetProperty("text").GetString();
            try
            {
                File.WriteAllText(path, text);
                PostReply(new { type = "saveLibraryResult", requestId, ok = true, path, name = Path.GetFileName(path) });
            }
            catch (Exception ex)
            {
                PostReply(new { type = "saveLibraryResult", requestId, ok = false, error = ex.Message });
            }
        }

        private void PostReply(object payload)
        {
            _webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(payload));
        }
    }
}
