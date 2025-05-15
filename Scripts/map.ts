import "leaflet/dist/leaflet.css";
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import L, {type GeoJSON} from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { checkFlomLayer, clearIntersections } from "./intersections";
import RBush from "rbush";
import { BBoxEntry } from "./Types";

// Statisk klasse som inneholder kart, lag og instillinger
export class MapManager {
    static map: L.Map;
    static flomLayer: L.GeoJSON;
    static drawnItems: L.FeatureGroup<any>;
    static kvikkLeire: L.GeoJSON;
    static ZOOM_THRESHOLD = 12;
    static lowResFlomLayer: L.GeoJSON | null;
    static highRes = false;

    static async initialize() {
        // Unngå duplikat initialisering
        if (this.map || document.getElementById("map")?.children.length) return;

        // Oslo
        this.map = L.map('map').setView([59.91, 10.75], 10);
        this.flomLayer = L.geoJSON(null, {
            pmIgnore: true,
            style: {
                color: '#0077ff',
                weight: 2,
                fillOpacity: 0.3
            }
        }).addTo(this.map);

        // Ikke rediger alle layers.
        L.PM.setOptIn(true);
        
        this.drawnItems = new L.FeatureGroup([], { pmIgnore: false });
        this.drawnItems.pm.setOptions({
            allowSelfIntersection: false,
            allowSelfIntersectionEdit: false,
            allowEditing: true,
        })
        this.map.addLayer(this.drawnItems as L.Layer);

        // Lag draw kontroller, legg til i kartet
        this.map.pm.addControls({
            position: "topleft",
            drawCircle: false,
            drawMarker: false,
            drawPolyline: false,
            drawRectangle: true,
            drawCircleMarker: false,
            drawPolygon: true,
            editMode: true,      
            dragMode: true,     
            removalMode: true,
            snappingOption: false,
            rotateMode: false,
            cutPolygon: false
        });
        this.map.pm.setGlobalOptions({
            pathOptions: {
                color: '#ff6200',          
                fillColor: '#ff6200',      
                fillOpacity: 0.4,          
                weight: 2,                 
            }
        })

        // Skru av tegne kontroller til å begynne med
        this.map.pm.Toolbar.setButtonDisabled("drawRectangle", true);
        this.map.pm.Toolbar.setButtonDisabled("drawPolygon", true);

        // Funksjoner for å håndtere draw-eventer
        this.map.on("pm:create", async (e) => {
            const layer = e.layer;
            layer.options.pmIgnore = false;
            L.PM.reInitLayer(layer);
            this.drawnItems.addLayer(layer);
            return checkFlomLayer(layer);
        });

        // Rediger
        this.drawnItems.on("pm:update", ({layer}) => {
            void clearIntersections(layer);
            return checkFlomLayer(layer);
        });
        this.drawnItems.on("pm:cut", ({layer}) => {
            void clearIntersections(layer);
            return checkFlomLayer(layer);
        });

        // Slett
        this.drawnItems.on("pm:remove", function({layer}) {
            clearIntersections(layer);
        });
    }
}

// Minne-Cache for allerede hentet tiles
const tileCache = new Map();
const activeTiles = new Map();

// spatial tre
const spatialTree = new RBush<BBoxEntry>();

// Funksjonen kjører når DOM-innhold er lastet.
document.addEventListener('DOMContentLoaded', async () => {
    // Initialiser kart
    await MapManager.initialize();

    // Legg til OpenStreetMap lag
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(MapManager.map);

    // Henter feature_index.json fra lokal server
    // Henter veier_kristiansand.geojson fra lokal server
    const [featureIndexRes, flomsonerRes] = await Promise.all([
        fetch('/feature_index.json'),
        // Bare lav oppløsning av flomsoner
        fetch('/geodata/flomsoner.geojson')
    ]);
    // Henter JSON fra responsene
    const [featureIndexJSON, flomsonerJSON] = await Promise.all([
        featureIndexRes.json(),
        flomsonerRes.json()
    ]);

    MapManager.lowResFlomLayer = L.geoJSON(flomsonerJSON, {
        pmIgnore: true,
        style: {
            color: '#0077ff',
            weight: 1,
            fillOpacity: 0.2
        }
    });

    // Gjør hver entry klar for spatial søk
    const entries = featureIndexJSON.map((e: BBoxEntry) => ({
        minX: e.bbox[0],
        minY: e.bbox[1],
        maxX: e.bbox[2],
        maxY: e.bbox[3],
        lokalId: e.lokalId
    }));

    // Bygg spatial indeks
    spatialTree.load(entries);

    // // Toggle synlighet for kvikkleire
    // document.getElementById('toggleKvikkleire')?.addEventListener('change', function (this: HTMLInputElement) {
    //     if (this.checked) {
    //         MapManager.map.addLayer(kvikkLeire as L.Layer);
    //     } else {
    //         MapManager.map.removeLayer(kvikkLeire as L.Layer);
    //     }
    // });

    MapManager.map.on('zoomend', handleZoomAndMove);
    MapManager.map.on('moveend', handleZoomAndMove);

    // Håndter synlighet via checkboxene
    document.getElementById('toggleFlom')?.addEventListener('change', function (this: HTMLInputElement) {
        if (this.checked) {
            MapManager.map.addLayer(MapManager.flomLayer as L.Layer);
            loadFlomtiles();  // Last inn flomdata hvis aktivert
        } else {
            MapManager.map.removeLayer(MapManager.flomLayer as L.Layer);
        }
    });

    MapManager.lowResFlomLayer?.eachLayer((layer) => layer.addTo(MapManager.map));
});

// Oppdater Kart ved bevegelse eller zooming
async function handleZoomAndMove() {
    const currentZoom = MapManager.map.getZoom();
    if (currentZoom >= MapManager.ZOOM_THRESHOLD) {
        // Fjern lav oppløsning av flomdata når zoom er over grensen
        MapManager.lowResFlomLayer?.eachLayer(async (layer) => MapManager.map.removeLayer(layer));
        if (!MapManager.highRes) {
            // Legg til lag om vi ikke allerede har det
            MapManager.flomLayer?.eachLayer((layer) => layer.addTo(MapManager.map));
        }
        MapManager.highRes = true;
        toggleController();
        void loadFlomtiles();
    } else if (currentZoom < MapManager.ZOOM_THRESHOLD) {
        if (MapManager.highRes) {
            MapManager.flomLayer.eachLayer(async (layer) => MapManager.map.removeLayer(layer));
        }
        MapManager.highRes = false;
        toggleController();
        MapManager.lowResFlomLayer?.eachLayer((layer) => layer.addTo(MapManager.map));
    }
}

// Regner ut synlige flomdata basert på kartutsnitt
function getVisibleLokalIds(bounds: L.LatLngBounds) {
    const results = spatialTree.search({
        minX: bounds.getWest(),
        minY: bounds.getSouth(),
        maxX: bounds.getEast(),
        maxY: bounds.getNorth()
    });

    return results.map((r) => r.lokalId);
}

const layerStyle = {
    style: {
        color: '#0077ff',
        weight: 2,
        fillOpacity: 0.3
    }
}

const ZOOM_LEVEL_THRESHOLDS = {
    HIGH: 12,    // Full detail above this zoom level
    MEDIUM: 8,   // Medium simplification
    LOW: 5       // High simplification below this zoom level
};

const SIMPLIFICATION_TOLERANCES = {
    HIGH: 0,      // No simplification
    MEDIUM: 0.001, // Medium simplification
    LOW: 0.005    // High simplification
};

async function loadFlomtiles() {
    const bounds = MapManager.map.getBounds();
    const currentZoom = MapManager.map.getZoom();
    const visibleIds = new Set(getVisibleLokalIds(bounds));

    const idsToRemove = [...activeTiles.keys()].filter(id => !visibleIds.has(id));
    for (const id of idsToRemove) {
        const layer = activeTiles.get(id);
        MapManager.flomLayer.removeLayer(layer);
        activeTiles.delete(id);
    }

    const toAdd = [...visibleIds].filter(id => !activeTiles.has(id));
    const {fromCache, toFetch} = toAdd.reduce((acc: { fromCache: string[], toFetch: string[] }, id) => {
        tileCache.has(id) ? acc.fromCache.push(id) : acc.toFetch.push(id);
        return acc;
    }, { fromCache: [], toFetch: [] });

    if (toFetch.length > 0) {
        console.log("toFetch:", toFetch);
        const mapFeaturesRes = await fetch('/api/map/features', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                lokalIds: toFetch,
                simplificationLevel: getSimplificationLevel(currentZoom)
            })
        });
        const featureCollection = await mapFeaturesRes.json();

        // Nå har vi GeoJSON-featureCollection
        // For hver feature:
        void Promise.all([
            ...featureCollection.features.map(addFeatureFromServer),
            ...fromCache.map(addFeatureFromCache)
        ]);
    }
    
    else {
        void Promise.all(fromCache.map(addFeatureFromCache));
    }
}

function getSimplificationLevel(zoom: number) {
    if (zoom >= ZOOM_LEVEL_THRESHOLDS.HIGH) {
        return SIMPLIFICATION_TOLERANCES.HIGH;
    } else if (zoom >= ZOOM_LEVEL_THRESHOLDS.MEDIUM) {
        return SIMPLIFICATION_TOLERANCES.MEDIUM;
    } else {
        return SIMPLIFICATION_TOLERANCES.LOW;
    }
}

async function addFeatureFromCache(id: string) {
    const feature = tileCache.get(id); // GeoJSON-data
    const layer = L.geoJSON(feature, layerStyle).addTo(MapManager.flomLayer); // Tegner i kartet
    activeTiles.set(id, layer); // Husk at vi har tegnet denne
}

async function addFeatureFromServer(feature: GeoJSON.Feature) {
    const id = feature.properties?.lokalId;
    tileCache.set(id, feature); // lagre i cache
    const layer = L.geoJSON(feature, layerStyle).addTo(MapManager.flomLayer); // legg i kartet
    activeTiles.set(id, layer); // registrer at den er tegnet
}

// Skrur av eller på tegne kontroller
function toggleController() {
    MapManager.map.pm.Toolbar.setButtonDisabled("drawRectangle", !MapManager.highRes);
    MapManager.map.pm.Toolbar.setButtonDisabled("drawPolygon", !MapManager.highRes);
}