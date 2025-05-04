using System.Text.Json.Serialization;

namespace GIS_Prosjekt.Models;

public class FlomFeatureRequest
{
    [JsonPropertyName("lokalIds")]
    public List<string> LokalIds { get; set; }
}