using GIS_Prosjekt.Models;

namespace GIS_Prosjekt.Controllers;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using System.Text.Json;

[ApiController]
[Route("api/[controller]")]
public class MapController : ControllerBase
{
    private readonly IConfiguration _configuration;

    public MapController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    private NpgsqlConnection RequestDatabase()
    {
        var connString = _configuration.GetConnectionString("DefaultConnection");
        var conn = new NpgsqlConnection(connString);
        conn.Open();
        return conn;
    }
    
    [HttpPost("features")]
    public IActionResult GetFeatures([FromBody] FlomFeatureRequest request) 
    {
        if (request?.LokalIds == null || request.LokalIds.Count == 0)
            return BadRequest(new { error = "Mangler lokalIds" });

        var conn = RequestDatabase();

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
    
    [HttpGet("kvikkleire")]
    public async Task<IActionResult> GetKvikkleire(
        [FromQuery] double minLat,
        [FromQuery] double minLng,
        [FromQuery] double maxLat,
        [FromQuery] double maxLng,
        [FromQuery] int zoom)
    {
        await using var conn = RequestDatabase();

        var sql = @"
            SELECT 
                objid, 
                objtype, 
                ST_AsGeoJSON(
                    ST_Transform(
                        COALESCE(
                            ST_SimplifyPreserveTopology(
                                ST_BuildArea(grense),
                                CASE 
                                    WHEN :zoom >= 12 THEN 0 
                                    WHEN :zoom >= 8 THEN 15
                                    ELSE 25
                                END
                            ),
                            ST_Buffer(grense, 0.000001)
                        ),
                        4326
                    )
                ) as geometry
            FROM kvikkleire_669727049c5c4c3b8b6269676f1fab53.kvikkleirefaresoneavgr
            WHERE ST_Intersects(
                grense,
                ST_Transform(
                    ST_MakeEnvelope(:minLng, :minLat, :maxLng, :maxLat, 4326),
                    25833
                )
            )
            LIMIT 1000;
        ";

        var results = new List<KvikkleireFaresone>();
        
        using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("minLng", NpgsqlTypes.NpgsqlDbType.Double, minLng);
        cmd.Parameters.AddWithValue("minLat", NpgsqlTypes.NpgsqlDbType.Double, minLat);
        cmd.Parameters.AddWithValue("maxLng", NpgsqlTypes.NpgsqlDbType.Double, maxLng);
        cmd.Parameters.AddWithValue("maxLat", NpgsqlTypes.NpgsqlDbType.Double, maxLat);
        cmd.Parameters.AddWithValue("zoom", NpgsqlTypes.NpgsqlDbType.Integer, zoom);
        
        using var reader = await cmd.ExecuteReaderAsync();
        
        while (await reader.ReadAsync())
        {
            results.Add(new KvikkleireFaresone
            {
                ObjId = reader.GetInt32(0),
                ObjType = reader.GetString(1),
                Geometry = reader.GetString(2)
            });
        }

        return Ok(results);
    }
}
