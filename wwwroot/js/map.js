// Minne-Cache for allerede hentet tiles
const tileCache = new Map();
const activeTiles = new Map();

let intersectionPoints = [];

// Kart
const map = L.map('map').setView([59.91, 10.75], 10); // Oslo

// spatial tre
const spatialTree = new RBush();

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Beholder for flomdata
const flomLayer = L.geoJSON(null, {
    style: {
        color: '#0077ff',      // Farge på polygonkant
        weight: 2,             // Tykkelse på kantlinje
        fillOpacity: 0.3       // Gjennomsiktighet på innsiden
    }
}).addTo(map);

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
    // Initialiser kart og sett koordinater og zoom-nivå

    // Legg til OpenStreetMap lag
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);


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
    const entries = featureIndexJson.map(e => ({
        minX: e.bbox[0],
        minY: e.bbox[1],
        maxX: e.bbox[2],
        maxY: e.bbox[3],
        lokalId: e.lokalId
    }));

    // Bygg spatial indeks
    spatialTree.load(entries);

    // Nå kan du bruke spatialTree til å hente synlige IDs
    loadFlomtiles(); // start

    // legg data inn i laget
    veiLayer.addData(veierJson);

    // Toggle synlighet for veier
    document.getElementById('toggleVeier').addEventListener('change', function () {
        if (this.checked) {
            map.addLayer(veiLayer);
        } else {
            map.removeLayer(veiLayer);
        }
    });

    let debounceTimer;
    map.on('moveend', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            loadFlomtiles();
        }, 100); // venter 0.1 sek etter bevegelse
    });

    // Håndter synlighet via checkboxene
    document.getElementById('toggleFlom').addEventListener('change', function () {
        if (this.checked) {
            map.addLayer(flomLayer);
            loadFlomtiles();  // Last inn flomdata hvis aktivert
        } else {
            map.removeLayer(flomLayer);
        }
    });

    // Kjør første gang
    await loadFlomtiles();
});

// Regner ut synlige flomdata basert på kartutsnitt
function getVisibleLokalIds(bounds) {
    const results = spatialTree.search({
        minX: bounds.getWest(),
        minY: bounds.getSouth(),
        maxX: bounds.getEast(),
        maxY: bounds.getNorth()
    });

    return results.map(r => r.lokalId);
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
    const bounds = map.getBounds();
    const currentZoom = map.getZoom();
    const visibleIds = new Set(getVisibleLokalIds(bounds));

    layerStyle.weight = currentZoom >= ZOOM_LEVEL_THRESHOLDS.MEDIUM 
        ? 2 
        : 1;
    layerStyle.fillOpacity = currentZoom >= ZOOM_LEVEL_THRESHOLDS.MEDIUM 
        ? 0.3 
        : 0.2;

    const idsToRemove = [...activeTiles.keys()].filter(id => !visibleIds.has(id));
    for (const id of idsToRemove) {
        const layer = activeTiles.get(id);
        flomLayer.removeLayer(layer);
        activeTiles.delete(id);
    }

    const toAdd = [...visibleIds].filter(id => !activeTiles.has(id));
    const {fromCache, toFetch} = toAdd.reduce((acc, id) => {
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

function getSimplificationLevel(zoom) {
    if (zoom >= ZOOM_LEVEL_THRESHOLDS.HIGH) {
        return SIMPLIFICATION_TOLERANCES.HIGH;
    } else if (zoom >= ZOOM_LEVEL_THRESHOLDS.MEDIUM) {
        return SIMPLIFICATION_TOLERANCES.MEDIUM;
    } else {
        return SIMPLIFICATION_TOLERANCES.LOW;
    }
}

async function addFeatureFromCache(id) {
    const feature = tileCache.get(id); // GeoJSON-data
    const layer = L.geoJSON(feature, layerStyle).addTo(flomLayer); // Tegner i kartet
    activeTiles.set(id, layer); // Husk at vi har tegnet denne
}

async function addFeatureFromServer(feature) {
    const id = feature.properties.lokalId;
    tileCache.set(id, feature); // lagre i cache
    const layer = L.geoJSON(feature, layerStyle).addTo(flomLayer); // legg i kartet
    activeTiles.set(id, layer); // registrer at den er tegnet
}

// Lag draw kontroller, legg til i kartet
map.addControl(new L.Control.Draw({
    edit: {
        featureGroup: drawnItems,
        poly: {
            allowIntersection: false
        }
    },
    draw: {
        polygon: {
            allowIntersection: false,
            showArea: true,
            shapeOptions: {
                color: '#ff6200',
            }
        },
        circle: false,
        circlemarker: false,
        marker: false,
        polyline: false,
        rectangle: true
    }
}));

// Funksjoner for å håndtere draw-eventer
map.on('draw:created', async (e) => {
    const layer = e.layer;
    drawnItems.addLayer(layer);

    // Sjekk om det er en flomzone på tegningen
    intersectionPoints = [];
    flomLayer.eachLayer(async (flomLayer) => checkIntersection(layer, flomLayer));
    void createIntersectionMarkers();
});

// Rediger
map.on('draw:edited', (e) => {
    const layers = e.layers;
    layers.eachLayer(async function(layer) {
        checkIntersection(layer)
        const geoJSON = layer.toGeoJSON();
    });
});

// Slett
map.on('draw:deleted', function(e) {
    const layers = e.layers;
    layers.eachLayer(function(layer) {
        const geoJSON = layer.toGeoJSON();
    });
});

const intersectionMarkers = L.featureGroup().addTo(map);

async function checkIntersection(drawLayer, flomLayer) {
    const [drawGeoJSON, flomGeoJSON] = [drawLayer.toGeoJSON(), flomLayer.toGeoJSON().features[0]];
    const intersect = turf.intersect(drawGeoJSON, flomGeoJSON)
    
    if (intersect) {
        const centroid = turf.centroid(intersect);
        intersectionPoints.push({
            point: centroid,
            lokalId: flomGeoJSON.properties.lokalId,
        });
    }
}

async function createIntersectionMarkers() {
    const filteredPoints = [];
    const radius = 250;
    // Ingen punkter, ingen intersections
    if (intersectionPoints.length === 0) return;

    // Filtrer ut punkter som er for nærme
    await Promise.all(intersectionPoints.map(async item => {

        const tooClose = filteredPoints.some(existing => {
            const distance = turf.distance(
                item.point,
                existing.point,
                { units: 'meters' }
            );
            return distance < radius;
        });

        if (!tooClose) {
            filteredPoints.push(item);
        }
    }));

    // Create markers for filtered points
    filteredPoints.forEach(item => {
        const marker = L
            .marker([item.point.geometry.coordinates[1], item.point.geometry.coordinates[0]])
            .setIcon(L.divIcon({
                html: `<div style="font-size: 32px;">💧</div>`,
                className: "",
                iconSize: [64, 64],
                iconAnchor: [32, 32],
                popupAnchor: [-2, -20]
            }))
            .bindPopup("Markert område er i flomsone");
        
        intersectionMarkers.addLayer(marker);
    });
}


