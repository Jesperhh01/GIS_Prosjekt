import L from "leaflet";
import * as turf from "@turf/turf";
import {IntersectionPoint} from "./Types";
import {MapManager} from "./map";
import { FeatureCollection } from "geojson";

let intersectionMarkers: L.FeatureGroup | null = null;
function getIntersectionMarkers() {
    if (!intersectionMarkers) {
        intersectionMarkers = L.featureGroup([], {pmIgnore: true}).addTo(MapManager.map);
    }
    return intersectionMarkers;
}
// For å lagre markerte områder og tilhørende tegning ID
const markerToDrawnLayerMap = new Map();

// Sjekker om flomlag krysser markert område
async function checkFlomLayer(layer: L.Layer) {
    // Sjekk om det er en flomzone på tegningen
    const intersectionPointsPromises: Promise<IntersectionPoint | undefined>[] = [];
    MapManager.flomLayer.eachLayer(async (flomLayer) => intersectionPointsPromises.push(checkIntersection(layer, flomLayer)));
    // Pass på å gjøre alle promises til objekter
    // Filtrer punkter som er for nærme
    const filteredPoints = await filterIntersections(await Promise.all(intersectionPointsPromises));
    // Marker resterende punkter
    void markIntersections(filteredPoints, layer._leaflet_id);
}

async function clearIntersections(layer: L.Layer) {
    // Hent relevante markører
    const markersToRemove: any[] = [];
    markerToDrawnLayerMap.forEach((drawnLayerId, markerId) => {
        if (drawnLayerId === layer._leaflet_id) {
            markersToRemove.push(markerId);
        }
    });

    // Til slutt fjern markører
    markersToRemove.forEach(markerId => {
        const marker = intersectionMarkers?.getLayer(markerId);
        if (marker) {
            getIntersectionMarkers().removeLayer(marker);
            markerToDrawnLayerMap.delete(markerId);
        }
    });
}

async function checkIntersection(drawLayer: L.Layer, flomLayer: L.Layer) {
    const [drawGeoJSON, flomGeoJSON] = [drawLayer.toGeoJSON(), (flomLayer.toGeoJSON() as FeatureCollection).features[0]];
    // Krysser områdene?
    // @ts-ignore
    const intersect = turf.intersect(drawGeoJSON, flomGeoJSON)

    if (!intersect) return;
    
    return {
        point: turf.centroid(intersect!),
        lokalId: flomLayer.properties?.lokalId,
    };
}

async function filterIntersections(intersectionPoints: (IntersectionPoint | undefined)[]) {
    // Filtrer nullverdier 
    const filteredIntersectionPoints = intersectionPoints.filter(Boolean) as IntersectionPoint[];

    // Ingen punkter, ingen intersections
    if (filteredIntersectionPoints.length === 0) return [];

    const MINIMUM_POINT_DISTANCE = 250; // meters

    return filteredIntersectionPoints.filter((point, index) => {
        // Sjekk om dette punktet er for nært noen av de tidligere punktene
        return !filteredIntersectionPoints.slice(0, index).some(prevPoint =>
            turf.distance(point.point, prevPoint.point, {units: 'meters'}) < MINIMUM_POINT_DISTANCE
        );
    });
}

async function markIntersections(filteredPoints: IntersectionPoint[], drawnLayerId: number) {
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

        getIntersectionMarkers().addLayer(marker);

        markerToDrawnLayerMap.set(marker._leaflet_id, drawnLayerId);
    }
}

export { checkFlomLayer, clearIntersections, checkIntersection, filterIntersections, markIntersections };