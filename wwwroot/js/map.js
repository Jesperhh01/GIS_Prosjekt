// Minne-Cache for allerede hentet tiles
const tileCache = new Map();
const activeTiles = new Map();

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
const mastLayer = L.geoJSON(null, {
    pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, { radius: 5, color: '#ffb200', fillOpacity: 0.8 })
});

async function loadFlomtiles() {
    return flomManager.loadTiles(map);
}

let mastSpatialTree = null;

// Funksjonen kjører når DOM-innhold er lastet.
document.addEventListener('DOMContentLoaded', async function () {
    // Initialiser kart og sett koordinater og zoom-nivå

    // Legg til OpenStreetMap lag
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    
    // Henter feature_index.json fra lokal server
    // Henter veier_kristiansand.geojson fra lokal server
    // Hent én enkelt URL
    const featureIndexRes  = await fetch('/feature_index.json');
// Sjekk at det gikk fint
    if (!featureIndexRes.ok) {
        throw new Error('Kunne ikke hente feature_index.json: ' + featureIndexRes.status);
    }
// Parse JSON
    const featureIndexJson = await featureIndexRes.json();
    
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

    await (async function initMastIndex() {
        const mastIndex = await fetch('/feature_index_master.json').then(r => r.json());
        mastSpatialTree = new RBush();
        mastSpatialTree.load(
            mastIndex.map(e => ({
                minX: e.bbox[0],
                minY: e.bbox[1],
                maxX: e.bbox[2],
                maxY: e.bbox[3],
                id: e.id
            }))
        );
        console.log('✅ mastSpatialTree klar med', mastSpatialTree.all().length, 'entries');
    })();
    console.log(
        'master treff:',
        mastSpatialTree.search({
            minX: map.getBounds().getWest(),
            minY: map.getBounds().getSouth(),
            maxX: map.getBounds().getEast(),
            maxY: map.getBounds().getNorth(),
        })
    );

    fetch('/feature_index_master.json')
        .then(r => r.json())
        .then(idx => {
            console.log('✅ Antall poster i master-index:', idx.length);
            console.log('❓ Første 5 boksedefinisjoner (bbox):', idx.slice(0,5).map(e => e.bbox));
        });

    console.log('🌍 Map bounds:', map.getBounds().toBBoxString(), map.getBounds());


    // Toggle synlighet for veier
    document.getElementById('toggleMaster').addEventListener('change', function () {
        if (this.checked) {
            map.addLayer(mastLayer);
            mastManager.loadTiles(map);
        } else {
            map.removeLayer(mastLayer);
            mastLayer.clearLayers();
        }
    });
    
    const toggleMaster = document.getElementById('toggleMaster');
    toggleMaster.addEventListener('change', async function () {
        if (this.checked) {
            map.addLayer(mastLayer);
            await mastManager.loadTiles(map);
        } else {
            map.removeLayer(mastLayer);
            mastLayer.clearLayers();
        }
    });

    // Last én gang hvis avhuket ved start
    if (toggleMaster.checked) {
        map.addLayer(mastLayer);
        await mastManager.loadTiles(map);
    }
    
    let debounceTimer;
    map.on('moveend', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            loadFlomtiles();
            mastManager.loadTiles(map);
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
    void checkFlomLayer(layer);
});

// Rediger
map.on('draw:edited', (e) => {
    const layers = e.layers;
    layers.eachLayer(async function(layer) {
        void clearIntersections(layer);
        void checkFlomLayer(layer);
    });
});

// Slett
map.on('draw:deleted', function(e) {
    const layers = e.layers;
    layers.eachLayer(async (layer) => clearIntersections(layer));
});

const intersectionMarkers = L.featureGroup().addTo(map);
// For å lagre markerte områder og tilhørende tegning ID
const markerToDrawnLayerMap = new Map();

// Sjekker om flomlag krysser markert område
async function checkFlomLayer(layer) {
    // Sjekk om det er en flomzone på tegningen
    const intersectionPointsPromises = [];
    flomLayer.eachLayer(async (flomLayer) => intersectionPointsPromises.push(checkIntersection(layer, flomLayer)));
    // Pass på å gjøre alle promises til objekter
    // Filtrer punkter som er for nærme
    const filteredPoints = await filterIntersections(await Promise.all(intersectionPointsPromises));
    // Marker resterende punkter
    void markIntersections(filteredPoints, layer._leaflet_id);
}

async function clearIntersections(layer) {
    // Hent relevante markører
    const markersToRemove = [];
    markerToDrawnLayerMap.forEach((drawnLayerId, markerId) => {
        if (drawnLayerId === layer._leaflet_id) {
            markersToRemove.push(markerId);
        }
    });

    // Til slutt fjern markører
    markersToRemove.forEach(markerId => {
        const marker = intersectionMarkers.getLayer(markerId);
        if (marker) {
            intersectionMarkers.removeLayer(marker);
            markerToDrawnLayerMap.delete(markerId);
        }
    });
}

async function checkIntersection(drawLayer, flomLayer) {
    const [drawGeoJSON, flomGeoJSON] = [drawLayer.toGeoJSON(), flomLayer.toGeoJSON().features[0]];
    // Krysser områdene?
    const intersect = turf.intersect(drawGeoJSON, flomGeoJSON)

    if (intersect) {
        // Hent senter punkt
        const centroid = turf.centroid(intersect);
        return {
            point: centroid,
            lokalId: flomGeoJSON.properties.lokalId,
        };
    }
}

async function filterIntersections(intersectionPoints) {
    // Filtrer nullverdier 
    intersectionPoints = intersectionPoints.filter(Boolean);

    // Ingen punkter, ingen intersections
    if (intersectionPoints.length === 0) return [];

    const MINIMUM_POINT_DISTANCE = 250; // meters

    return intersectionPoints.filter((point, index) => {
        // Sjekk om dette punktet er for nært noen av de tidligere punktene
        return !intersectionPoints.slice(0, index).some(prevPoint =>
            turf.distance(point.point, prevPoint.point, {units: 'meters'}) < MINIMUM_POINT_DISTANCE
        );
    });
}

async function markIntersections(filteredPoints, drawnLayerId) {
    // Marker resterende punkter
    for (const item of filteredPoints) {
        const marker = L
            .marker([item.point.geometry.coordinates[1], item.point.geometry.coordinates[0]])
            .setIcon(L.divIcon({
                // Instillinger for ikon
                html: `<div style="font-size: 32px;">💧</div>`,
                className: "",
                iconSize: [64, 64],
                iconAnchor: [32, 32],
                popupAnchor: [-2, -20]
            }))
            .bindPopup("Markert område er i flomsone");
        
        intersectionMarkers.addLayer(marker);

        markerToDrawnLayerMap.set(marker._leaflet_id, drawnLayerId);
    }
}

function createLayerManager(options) {
    const {
        apiUrl,
        layer,
        style,
        spatialTree,
        zoomThresholds,
        simplificationLevels,
        idParam   = 'lokalIds',
        idField   = 'lokalId',
        simpleLoad = false
    } = options;

    const tileCache   = new Map();
    const activeTiles = new Map();

    function getVisibleIds(bounds) {
        return spatialTree
            .search({
                minX: bounds.getWest(),
                minY: bounds.getSouth(),
                maxX: bounds.getEast(),
                maxY: bounds.getNorth()
            })
            .map(r => r[idField]);
    }

    function getSimplificationLevel(zoom) {
        if (zoom >= zoomThresholds.HIGH)   return simplificationLevels.HIGH;
        if (zoom >= zoomThresholds.MEDIUM) return simplificationLevels.MEDIUM;
        return simplificationLevels.LOW;
    }

    async function addFromServer(feature) {
        const id = feature.properties[idField];
        tileCache.set(id, feature);

        const geoOpts = { style };
        if (layer.options && layer.options.pointToLayer) {
            geoOpts.pointToLayer = layer.options.pointToLayer;
        }

        const lyr = L.geoJSON(feature, geoOpts).addTo(layer);
        activeTiles.set(id, lyr);
    }

    async function addFromCache(id) {
        const feature = tileCache.get(id);
        const geoOpts = { style };
        if (layer.options && layer.options.pointToLayer) {
            geoOpts.pointToLayer = layer.options.pointToLayer;
        }
        const lyr = L.geoJSON(feature, geoOpts).addTo(layer);
        activeTiles.set(id, lyr);
    }

    async function loadTiles(map) {
        const bounds = map.getBounds();
        const zoom   = map.getZoom();
        const visible = new Set(getVisibleIds(bounds));

        // remove layers no longer visible
        for (const id of activeTiles.keys()) {
            if (!visible.has(id)) {
                layer.removeLayer(activeTiles.get(id));
                activeTiles.delete(id);
            }
        }

        // simple one-shot loader
        if (simpleLoad) {
            const toFetch   = [...visible].filter(id => !tileCache.has(id));
            const fromCache = [...visible].filter(id =>  tileCache.has(id));

            // draw cache
            await Promise.all(fromCache.map(addFromCache));

            if (toFetch.length) {
                const payload = {
                    [idParam]:             toFetch,
                    simplificationLevel:   getSimplificationLevel(zoom)
                };
                const res = await fetch(apiUrl, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(payload)
                });
                const fc = await res.json();
                await Promise.all(fc.features.map(addFromServer));
            }
            return;
        }

        // chunked loader for large sets
        const CHUNK = 500;
        const ids   = [...visible];
        for (let i = 0; i < ids.length; i += CHUNK) {
            const slice = ids.slice(i, i + CHUNK);
            const fromCache = slice.filter(id => tileCache.has(id));
            fromCache.forEach(addFromCache);

            const toFetch = slice.filter(id => !tileCache.has(id));
            if (!toFetch.length) continue;

            const payload = {
                [idParam]:           toFetch,
                simplificationLevel: getSimplificationLevel(zoom)
            };
            const res = await fetch(apiUrl, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(payload)
            });
            if (!res.ok) continue;
            const fc = await res.json();
            if (fc.features) {
                await Promise.all(fc.features.map(addFromServer));
            }
        }
    }

    return { loadTiles };
}

const flomManager = createLayerManager({
    apiUrl: '/api/map/features',
    layer: flomLayer,
    style: {
        color: '#0077ff',
        weight: 2,
        fillOpacity: 0.3
    },
    spatialTree: spatialTree, // eller flomIndex
    zoomThresholds: ZOOM_LEVEL_THRESHOLDS,
    simplificationLevels: SIMPLIFICATION_TOLERANCES,
    simpleLoad: true
});

const mastManager = createLayerManager({
    apiUrl: '/api/map/master',
    layer: mastLayer,
    style: { color: '#ffb200', weight: 2, fillOpacity: 0.3 },
    spatialTree: { // vi gir et lite wrapper-objekt istedenfor ‘roadSpatialTree’ direkte
        search: (bbox) => mastSpatialTree.search(bbox).map(r => ({ lokalId: r.id }))
    },
    zoomThresholds: ZOOM_LEVEL_THRESHOLDS,
    simplificationLevels: SIMPLIFICATION_TOLERANCES,
    idParam: 'masterIds',
    idField: 'lokalId',
    simpleLoad: false
});


