document.addEventListener('DOMContentLoaded', async function () {
    // Initialiser kart og sett koordinater og zoom-nivå
    const map = L.map('map').setView([59.91, 10.75], 10); // Oslo

    // Legg til OpenStreetMap lag
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    let featureIndex = [];
    let spatialTree = new RBush();

// Etter at du har hentet feature_index.json
    fetch('/feature_index.json')
        .then(res => res.json())
        .then(data => {
            featureIndex = data;

            // Gjør hver entry klar for spatial søk
            const entries = featureIndex.map(e => ({
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
        });

    // Beholder for flomdata
    const flomLayer = L.geoJSON(null, {
        style: {
            color: '#0077ff',      // Farge på polygonkant
            weight: 2,             // Tykkelse på kantlinje
            fillOpacity: 0.3       // Gjennomsiktighet på innsiden
        }
    }).addTo(map);


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

    // Minne-Cache for allerede hentet tiles
    const tileCache = new Map();

    const activeTiles = new Map();

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

        fromCache.forEach(id => {
            const feature = tileCache.get(id); // GeoJSON-data
            const layer = L.geoJSON(feature, {
                style: {
                    color: '#0077ff',
                    weight: 2,
                    fillOpacity: 0.3
                }

            }).addTo(flomLayer); // Tegner i kartet
            activeTiles.set(id, layer); // Husk at vi har tegnet denne
        });

        if (toFetch.length > 0) {
            console.log("toFetch:", toFetch);
            fetch('/api/map/features', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    lokalIds: toFetch
                })
            })
                .then(res => res.json()) // Tolker svaret som JSON
                .then(featureCollection => {
                    // Nå har vi GeoJSON-featureCollection
                    // For hver feature:
                    featureCollection.features.forEach(feature => {
                        const id = feature.properties.lokalId;

                        tileCache.set(id, feature); // lagre i cache

                        const layer = L.geoJSON(feature, {
                            style: {
                                color: '#0077ff',
                                weight: 2,
                                fillOpacity: 0.3
                            }
                        }).addTo(flomLayer); // legg i kartet

                        activeTiles.set(id, layer); // registrer at den er tegnet
                    });
                })
                .catch(err => {
                    console.warn("Feil ved henting av features:", err);
                });
        }
    }

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