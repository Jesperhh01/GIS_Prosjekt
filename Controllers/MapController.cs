namespace GIS_Prosjekt.Controllers;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class MapController : ControllerBase
{
    [HttpGet("test")]
    public IActionResult Test()
    {
        return Ok("Test successful");
    }
}