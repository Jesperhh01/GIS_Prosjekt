document.addEventListener('DOMContentLoaded', function () {
    
    // Initialiser kart og sett koordinater og zoom-nivå
    const map = L.map('map').setView([59.91, 10.75], 10); // Oslo

    // Legg til OpenStreetMap lag
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    
    // Beholder for flomdata
    const flomLayer = L.geoJSON(null, {
        style: {
            color: '#0077ff',      // Farge på polygonkant
            weight: 2,             // Tykkelse på kantlinje
            fillOpacity: 0.3       // Gjennomsiktighet på innsiden
        }
    }).addTo(map);

    // Regner ut synlige flomdata basert på kartutsnitt
    function getVisibleTileIds(bounds, tileSize = 0.1) {
        const minX = Math.floor(bounds.getWest() / tileSize);
        const maxX = Math.floor(bounds.getEast() / tileSize);
        const minY = Math.floor(bounds.getSouth() / tileSize);
        const maxY = Math.floor(bounds.getNorth() / tileSize);

        const tileIds = [];
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                tileIds.push(`tile_${x}_${y}`);
            }
        }
        return tileIds;
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
        const tileIds = getVisibleTileIds(bounds);

        flomLayer.clearLayers();

        tileIds.forEach(tileId => {
            if (tileCache.has(tileId)) {
                flomLayer.addData(tileCache.get(tileId));
            } else {
                fetch(`/api/map/flomtiles/${tileId}`)
                    .then(res => res.json())
                    .then(data => {
                        flomLayer.addData(data);
                        addTileToCache(tileId, data); // bruker LRU-logikken vår
                    })
                    .catch(err => {
                        console.warn(`Tile ${tileId} feilet:`, err);
                    });
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

// Kjør første gang
    loadFlomtiles();
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
});