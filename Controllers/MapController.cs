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
    [HttpPost("features")]
    public IActionResult GetFeatures([FromBody] FlomFeatureRequest request) 
    {
        if (request?.LokalIds == null || request.LokalIds.Count == 0)
            return BadRequest(new { error = "Mangler lokalIds" });

        var connString = "Host=localhost;Port=5432;Username=postgres;Password=solsikke123;Database=geodata";
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