document.addEventListener('DOMContentLoaded', function () {
    const map = L.map('map').setView([59.91, 10.75], 6); // Oslo

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const flomLayer = L.geoJSON(null, {
        style: {
            color: '#0077ff',
            weight: 2,
            fillOpacity: 0.3
        }
    }).addTo(map);

    function loadFlomtiles() {
        const bounds = map.getBounds();
        const bbox = [
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth()
        ].join(',');

        console.log("bbox som sendes:", bbox);

        fetch(`/api/map/flomtiles?bbox=${bbox}`)
            .then(response => response.json())
            .then(data => {
                console.log("Flomtiles fra API:", data);
                flomLayer.clearLayers();
                flomLayer.addData(data);
            })
            .catch(error => {
                console.error("Feil ved henting av flomtiles:", error);
            });
    }

    let debounceTimer;
    map.on('moveend', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadFlomtiles, 500);
    });

    // Last inn første gang
    loadFlomtiles();
});