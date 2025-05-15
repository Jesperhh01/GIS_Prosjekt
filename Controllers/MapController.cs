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
        return Ok("API svarer!");
    }
    
    [HttpPost("master")]
    public IActionResult GetMasterFeatures([FromBody] MasterFeatureRequest req)
    {
        if (req?.MasterIds == null || !req.MasterIds.Any())
            return BadRequest(new { error = "Mangler MasterIds" });

        const string sql = @"
            SELECT masterid, ST_AsGeoJSON(geom) AS geojson
            FROM master
            WHERE masterid = ANY(@ids);
        ";
        
        var connString = "Host=localhost;Port=5432;Username=postgres;Password=pannekake1;Database=geodata";
        
        using var conn = new NpgsqlConnection(connString);
        conn.Open();

        using var cmd = new NpgsqlCommand(sql, conn);
        // Merk: parameternavnet "@ids" må stemme med SQL‐spørringen
        cmd.Parameters.AddWithValue("ids", req.MasterIds.ToArray());

        var features = new List<object>();
        using var rdr = cmd.ExecuteReader();
        while (rdr.Read())
        {
            var id       = rdr.GetString(0);
            var geojson  = rdr.GetString(1);

            features.Add(new
            {
                type       = "Feature",
                properties = new { masterId = id },
                geometry   = JsonSerializer.Deserialize<object>(geojson)
            });
        }

        return Ok(new
        {
            type     = "FeatureCollection",
            features = features
        });
    }
    
    
    [HttpPost("features")]
    public IActionResult GetFeatures([FromBody] FlomFeatureRequest request) 
    {
        if (request?.LokalIds == null || request.LokalIds.Count == 0)
            return BadRequest(new { error = "Mangler lokalIds" });

        var connString = "Host=localhost;Port=5432;Username=postgres;Password=pannekake1;Database=geodata";
        using var conn = new NpgsqlConnection(connString);
        conn.Open();

        // Kun hent basert på ID-er – all bounding skjer i klienten
        var sql = @"
        SELECT lokalid, ST_AsGeoJSON(geom) AS geojson
        FROM flomfeatures
        WHERE lokalid = ANY(@ids);
    ";

        using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.Add(new NpgsqlParameter<string[]>("ids", request.LokalIds.ToArray()));
        
        var features = new List<object>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            var lokalid = reader.GetString(0);
            var geojson = reader.GetString(1);

            features.Add(new {
                type       = "Feature",
                properties = new { lokalId = lokalid },
                geometry   = JsonSerializer.Deserialize<object>(geojson)
            });
        }

        return Ok(new {
            type     = "FeatureCollection",
            features = features
        });
    }
}