import "leaflet/dist/leaflet.css";
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import L, { type GeoJSON } from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { checkFlomLayer, clearIntersections } from "./intersections";
import RBush from "rbush";
import { BBoxEntry } from "./Types";

export class MapManager {
    static map: L.Map;
    static flomLayer: L.GeoJSON;
    static drawnItems: L.FeatureGroup<any>;

    static async initialize() {
        if (this.map || document.getElementById("map")?.children.length) return; // Prevent multiple initializations

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
        MapManager.map.addLayer(this.drawnItems as L.Layer);

        // Lag draw kontroller, legg til i kartet
        MapManager.map.pm.addControls({
            position: "topleft",
            drawCircle: false,
            drawMarker: false,
            drawPolyline: false,
            drawRectangle: true,
            drawCircleMarker: false,
            drawPolygon: true,
            editMode: true,      // Enable edit mode
            dragMode: true,      // Enable dragging of shapes
            removalMode: true,   // Enable removal of shapes
            snappingOption: false,
            rotateMode: false,
        })

        // Funksjoner for å håndtere draw-eventer
        MapManager.map.on("pm:create", async (e) => {
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

// Beholder for veidata (IKKE legg til kartet ennå)
const veiLayer = L.geoJSON(null, {
    style: {
        color: '#ffb200',      // Farge på polygonkant
        weight: 2,             // Tykkelse på kantlinje
        fillOpacity: 0.3       // Gjennomsiktighet på innsiden
    }
});

// Funksjonen kjører når DOM-innhold er lastet.
document.addEventListener('DOMContentLoaded', async function () {
    // Initialiser kart
    await MapManager.initialize();

    // Legg til OpenStreetMap lag
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(MapManager.map);

    // Henter feature_index.json fra lokal server
    // Henter veier_kristiansand.geojson fra lokal server
    const [featureIndexRes, veierRes] = await Promise.all([
        fetch('/feature_index.json'),
        fetch('/geodata/veier_kristiansand.geojson')
    ]);
    // Henter JSON fra responsene
    const [featureIndexJson, veierJson] = await Promise.all([
        featureIndexRes.json(),
        veierRes.json()
    ]);

    // Gjør hver entry klar for spatial søk
    const entries = featureIndexJson.map((e: BBoxEntry) => ({
        minX: e.bbox[0],
        minY: e.bbox[1],
        maxX: e.bbox[2],
        maxY: e.bbox[3],
        lokalId: e.lokalId
    }));

    // Bygg spatial indeks
    spatialTree.load(entries);

    // Nå kan du bruke spatialTree til å hente synlige IDs
    void loadFlomtiles(); // start

    // legg data inn i laget
    veiLayer.addData(veierJson);

    // Toggle synlighet for veier
    document.getElementById('toggleVeier')?.addEventListener('change', function (this: HTMLInputElement) {
        if (this.checked) {
            MapManager.map.addLayer(veiLayer as L.Layer);
        } else {
            MapManager.map.removeLayer(veiLayer as L.Layer);
        }
    });

    MapManager.map.on('moveend', () => {
            setTimeout(() => {  
                loadFlomtiles();
            }, 100); // venter 0.1 sek etter bevegelse
    });

    // Håndter synlighet via checkboxene
    document.getElementById('toggleFlom')?.addEventListener('change', function (this: HTMLInputElement) {
        if (this.checked) {
            MapManager.map.addLayer(MapManager.flomLayer as L.Layer);
            loadFlomtiles();  // Last inn flomdata hvis aktivert
        } else {
            MapManager.map.removeLayer(MapManager.flomLayer as L.Layer);
        }
    });

    // Kjør første gang
    await loadFlomtiles();
});

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

    layerStyle.style.weight = currentZoom >= ZOOM_LEVEL_THRESHOLDS.MEDIUM 
        ? 2 
        : 1;
    layerStyle.style.fillOpacity = currentZoom >= ZOOM_LEVEL_THRESHOLDS.MEDIUM 
        ? 0.3 
        : 0.2;

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

