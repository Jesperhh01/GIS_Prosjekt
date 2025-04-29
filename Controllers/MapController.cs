using System.Text.Json.Nodes;
using GIS_Prosjekt.Models;
using Microsoft.AspNetCore.Mvc.Diagnostics;

namespace GIS_Prosjekt.Controllers;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using System.Text.Json;



[ApiController]
[Route("api/[controller]")]
public class MapController : ControllerBase
{
    [HttpGet("test")]
    public IActionResult Test()
    {
        return Ok("Test successful");
    }
    
    [HttpPost("features")]
    public IActionResult GetFeatures([FromBody] FlomFeatureRequest request) 
    {
        var connString = "Host=localhost;Port=5432;Username=postgres;Password=solsikke123;Database=geodata";
        using var conn = new NpgsqlConnection(connString);
        conn.Open();
        
        if (request == null || request.LokalIds == null || request.Bbox == null)
        {
            return BadRequest("Ugyldig data");
        }
        
        double minLon = request.Bbox[0];
        double minLat = request.Bbox[1];
        double maxLon = request.Bbox[2];
        double maxLat = request.Bbox[3];
      
        var envelopeWkt = string.Format(System.Globalization.CultureInfo.InvariantCulture,
            "POLYGON(({0} {1}, {2} {1}, {2} {3}, {0} {3}, {0} {1}))",
            minLon, minLat, maxLon, maxLat);
        
        var sql = @"
        SELECT lokalid, ST_AsGeoJSON(geom)
        FROM flomfeatures
        WHERE lokalid = ANY (@ids)
        AND geom && ST_GeomFromText(@bbox, 4326);
         ";

        using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("ids", request.LokalIds);
        cmd.Parameters.AddWithValue("bbox", envelopeWkt);

        using var reader = cmd.ExecuteReader();
        var result = new List<object>();

        while (reader.Read())
        {
            var lokalid = reader.GetString(0);
            var geojson = reader.GetString(1);
            
            var feature = new
            {
                type = "Feature",
                properties = new { lokalId = lokalid },
                geometry = JsonSerializer.Deserialize<object>(geojson)            };
            result.Add(feature);
        }
        return Ok(new {
            type = "FeatureCollection",
            features = result
        });
    }
    
    
    
    
}