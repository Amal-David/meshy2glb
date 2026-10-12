export interface Mesh {
    vertices: number[];
    triangles: number[];
}
export interface ModelPart {
    name: string;
    kind: string;
    mesh: Mesh;
}
export interface ModelObject {
    id: string;
    name: string;
    parts: ModelPart[];
    resourceId: string;
    buildIndex: number;
    transform: number[];
}
export type SlicerFormat = "prusa" | "prusa3" | "bambu" | "orca";
export interface Project {
    name: string;
    objects: ModelObject[];
    warnings: string[];
    source?: {
        files: Record<string, Uint8Array>;
        modelPath: string;
    };
    suggestedHeight?: number;
    format?: SlicerFormat | "generic";
}
/** Internal adapter input; app geometry algorithms and settings live outside this library. */
export interface BrimResult {
    parentOverrides?: import("../document").PrintOverrides;
    applicationMetadata?: {
        name: string;
        data: unknown;
    };
    objects: {
        id: string;
        mesh: Mesh;
        name?: string;
        printOverrides?: import("../document").PrintOverrides;
    }[];
    settings: {
        perimeters: number;
        height: number;
    };
}
