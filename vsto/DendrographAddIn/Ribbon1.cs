using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using Office = Microsoft.Office.Core;

namespace DendrographAddIn
{
    [ComVisible(true)]
    public class Ribbon1 : Office.IRibbonExtensibility
    {
        private Office.IRibbonUI _ribbon;

        private const string RibbonXml = @"<customUI xmlns=""http://schemas.microsoft.com/office/2009/07/customui"" onLoad=""OnLoad"" loadImage=""LoadImage"">
  <ribbon>
    <tabs>
      <tab id=""DendrographTab"" label=""Dendrograph"">
        <group id=""DendrographGroup"" label=""Dendrograph"">
          <button id=""DendrographButton"" label=""樹形図を挿入"" size=""large""
                  image=""DendrographIcon"" onAction=""OnButtonClick"" />
        </group>
      </tab>
    </tabs>
  </ribbon>
</customUI>";

        public string GetCustomUI(string ribbonID)
        {
            return RibbonXml;
        }

        public void OnLoad(Office.IRibbonUI ribbonUI)
        {
            _ribbon = ribbonUI;
        }

        public Bitmap LoadImage(string imageName)
        {
            if (imageName != "DendrographIcon") return null;
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("DendrographAddIn.Resources.icon-32.png"))
            {
                return stream != null ? new Bitmap(stream) : null;
            }
        }

        public void OnButtonClick(Office.IRibbonControl control)
        {
            var pane = ThisAddIn.TaskPane;
            if (pane != null)
            {
                pane.Visible = !pane.Visible;
            }
        }
    }
}
