document.addEventListener('DOMContentLoaded', function () {
    
    // Initialiser kart og sett koordinater og zoom-nivå
    const map = L.map('map').setView([59.91, 10.75], 10); // Oslo

    // Legg til OpenStreetMap lag
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    
    let featureIndex = []
    fetch('/feature_index.json')
        .then(res => res.json())
        .then(data => {
            featureIndex = data;
            loadFlomtiles(); // start når index er klar
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
        const visibleIds = [];

        const minLon = bounds.getWest();
        const minLat = bounds.getSouth();
        const maxLon = bounds.getEast();
        const maxLat = bounds.getNorth();

        featureIndex.forEach(entry => {
            const [entryMinLon, entryMinLat, entryMaxLon, entryMaxLat] = entry.bbox;

            const overlap =
                entryMaxLon >= minLon &&
                entryMinLon <= maxLon &&
                entryMaxLat >= minLat &&
                entryMinLat <= maxLat;

            if (overlap) {
                visibleIds.push(entry.lokalId);
            }
        });

        return visibleIds;
    }
    
    // Minne-Cache for allerede hentet tiles
    const tileCache = new Map();
    const MAX_CACHE_SIZE = 10; // Maks antall tiles i cache
    
    // funksjon for å legge til tiles i cache
    function addTileToCache(tileId, data) {
        if (tileCache.has(tileId)) {
            tileCache.delete(tileId); // Fjern eksisterende tile for å oppdatere
        }
        tileCache.set(tileId, data);
        
        if (tileCache.size > MAX_CACHE_SIZE) {
            const oldestTile = tileCache.keys().next().value;
            tileCache.delete(oldestTile); // Fjern eldste tile
        }
    }

    function loadFlomtiles() {
        const bounds = map.getBounds();
        const bbox = [
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth()
        ];
        
        

        const visibleIds = getVisibleLokalIds(bounds);
        const uncachedIds = visibleIds.filter(id => !tileCache.has(id));

        // Hvis alt allerede er i cache
        if (uncachedIds.length === 0) {
            visibleIds.forEach(id => {
                flomLayer.addData(tileCache.get(id));
            });
            return;
        }
        
        flomLayer.clearLayers();

        // Hent manglende features fra backend
        fetch('/api/map/features', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                lokalIds: uncachedIds,
                bbox: bbox
            })
        })
            .then(res => res.json())
            .then(featureCollection => {
                featureCollection.features.forEach(feature => {
                    const lokalId = feature.properties.lokalId;
                    flomLayer.addData(feature);
                    addTileToCache(lokalId, feature);
                });
            })
            .catch(err => {
                console.warn("Feil ved henting av features:", err);
            });

        // Legg til de som allerede er i cache
        visibleIds.forEach(id => {
            if (tileCache.has(id)) {
                flomLayer.addData(tileCache.get(id));
            }
        });
    }

    let debounceTimer;

    map.on('moveend', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            loadFlomtiles();
        }, 500); // venter 0.5 sek etter bevegelse
    });

    // Håndter synlighet via checkboxene
    document.getElementById('toggleFlom').addEventListener('change', function() {
        if (this.checked) {
            map.addLayer(flomLayer);
            loadFlomtiles();  // Last inn flomdata hvis aktivert
        } else {
            map.removeLayer(flomLayer);
        }
    });

// Kjør første gang
    loadFlomtiles();
});