using Microsoft.AspNetCore.Html;

namespace GIS_Prosjekt.Helpers;

public static class ViteHelper
{
    public static HtmlString ViteScripts(string entrypoint, bool isDevelopment)
    {
        if (isDevelopment)
        {
            return new HtmlString($@"
                <script type=""module"" src=""http://localhost:5173/@vite/client""></script>
                <script type=""module"" src=""http://localhost:5173/{entrypoint}""></script>
            ");
        }
        
        // Production - read from manifest
        return new HtmlString($@"<script type=""module"" src=""/dist/{entrypoint}""></script>");
    }
}