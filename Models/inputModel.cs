namespace GIS_Prosjekt.Models;

public class FlomFeatureRequest
{
    public List<string> LokalIds { get; set; }
    public List<double> Bbox { get; set; }
}