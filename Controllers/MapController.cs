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
    
    [HttpGet("flomtiles/{tileId}")]
    public IActionResult GetTile(string tileId)
    {
        string filePath = Path.Combine("tiles", $"{tileId}.geojson");

        if (!System.IO.File.Exists(filePath))
        {
            return NotFound(new { error = "Tile not found" });        
        }

        string json = System.IO.File.ReadAllText(filePath);
        
        return Content(json, "application/json");
    }
    
    
    
    
}