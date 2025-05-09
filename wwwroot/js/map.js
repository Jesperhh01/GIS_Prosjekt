// Minne-Cache for allerede hentet tiles
const tileCache = new Map();

const activeTiles = new Map();

const map = L.map('map').setView([59.91, 10.75], 10); // Oslo

const spatialTree = new RBush();

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
        }, 10); // venter 0.5 sek etter bevegelse
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

async function loadFlomtiles() {
    const bounds = map.getBounds();
    const visibleIds = new Set(getVisibleLokalIds(bounds));

    for (let id of activeTiles.keys()) {
        if (!visibleIds.has(id)) {
            const layer = activeTiles.get(id);
            flomLayer.removeLayer(layer);
            activeTiles.delete(id);
        }
    }
    
    const toAdd = Array.from(visibleIds).filter(id => !activeTiles.has(id));
    const fromCache = toAdd.filter(id => tileCache.has(id));
    const toFetch = toAdd.filter(id => !tileCache.has(id));

    if (toFetch.length > 0) {
        console.log("toFetch:", toFetch);
        const mapFeaturesRes = await fetch('/api/map/features', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                lokalIds: toFetch
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

