import { type Document, type Part, type Mesh, type Target } from "./document";
export interface GeometryObject {
    id: string;
    name: string;
    transform: number[];
    parts: {
        name: string;
        kind: Part["kind"];
        mesh: Mesh;
    }[];
}
/** World-space processing geometry. No archive, XML resources or vendor IDs. */
export interface GeometryView {
    name: string;
    objects: GeometryObject[];
    warnings: string[];
    format?: Exclude<Target, "universal"> | "generic";
    suggestedHeight?: number;
    sourceBacked?: boolean;
}
export declare function geometryView(document: Document): GeometryView;
export declare function fromGeometryView(project: Pick<GeometryView, "name" | "objects" | "sourceBacked">): Document;
