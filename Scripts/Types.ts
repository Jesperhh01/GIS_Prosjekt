import { Feature, Point, Properties } from "@turf/turf";
import { GeoJSON } from "leaflet";

export interface IntersectionPoint {
    lokalId?: number,
    point: Feature<Point, Properties>;
}

declare module 'leaflet' {
    interface Layer {
        _leaflet_id: number;
        toGeoJSON(): GeoJSON.Feature | GeoJSON.FeatureCollection;
        properties: {
            lokalId?: number;
        }
    }
}

export interface BBoxEntry {
    bbox: [number, number, number, number];
    lokalId: string;
}

export type FeatureIndex = BBoxEntry[];

export interface KvikkleireFaresone {
    objId: number;
    objType: string;
    geometry: string;  // GeoJSON string
}
