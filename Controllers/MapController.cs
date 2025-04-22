namespace GIS_Prosjekt.Controllers;
using Microsoft.AspNetCore.Mvc;
using System.IO;
using Newtonsoft.Json.Linq;
using System.Collections.Generic;
using System.Globalization;

[ApiController]
[Route("api/[controller]")]
public class MapController : ControllerBase
{
    [HttpGet("test")]
    public IActionResult Test()
    {
        return Ok("Test successful");
    }
    
    [HttpGet("flomtiles")]
    public IActionResult Flomtiles([FromQuery] string bbox)
    {
        if (string.IsNullOrWhiteSpace(bbox))
            return BadRequest("Du må sende inn bbox som parameter");
        
        var parts = bbox.Split(',');
        
        if (!double.TryParse(parts[0], NumberStyles.Any, CultureInfo.InvariantCulture, out double minLon) ||
            !double.TryParse(parts[1], NumberStyles.Any, CultureInfo.InvariantCulture, out double minLat) ||
            !double.TryParse(parts[2], NumberStyles.Any, CultureInfo.InvariantCulture, out double maxLon) ||
            !double.TryParse(parts[3], NumberStyles.Any, CultureInfo.InvariantCulture, out double maxLat))
        {
            return BadRequest("Ugyldig bbox format");
        }
        
        double tileSize = 0.1;

        int minX = (int)Math.Floor(minLon / tileSize);
        int maxX = (int)Math.Floor(maxLon / tileSize);
        int minY = (int)Math.Floor(minLat / tileSize);
        int maxY = (int)Math.Floor(maxLat / tileSize);
        
        var allFeatures = new List<string>();

        for (int x = minX; x <= maxX; x++)
        {
            for (int y = minY; y <= maxY; y++)
            {
                string tileName = $"tile_{x}_{y}.geojson";
                string filePath = Path.Combine("tiles", tileName);

                if (System.IO.File.Exists(filePath))
                {
                    var json = System.IO.File.ReadAllText(filePath);
                    var content = JObject.Parse(json);
                    var features = content["features"];

                    if (features != null)
                    {
                        foreach (var feature in features)
                        {
                            allFeatures.Add(feature.ToString(Newtonsoft.Json.Formatting.None));
                        }
                    }
                }
                

            }
        }
        var geojson = $"{{\"type\": \"FeatureCollection\", \"features\": [{string.Join(",", allFeatures)}]}}";
        return Content(geojson, "application/json");
    }
    
    
    
    
}