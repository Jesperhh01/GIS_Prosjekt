using System.Text.Json.Serialization;

namespace GIS_Prosjekt.Models;

public class FlomFeatureRequest
{
    [JsonPropertyName("lokalIds")]
    public List<string> LokalIds { get; set; }
}

public class KvikkLeirePostBody
{
    public double minLng { get; set; }
    public double minLat { get; set; }
    public double maxLng { get; set; }
    public double maxLat { get; set; }
}

public class KvikkleireFaresone
{
    public int ObjId { get; set; }
    public string ObjType { get; set; }
    public string Geometry { get; set; }  // This will hold the GeoJSON string
}

