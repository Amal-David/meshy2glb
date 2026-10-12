import { type LimitOptions } from "./limits";
import type { VirtualExtruderOptions, VirtualExtruderPlan } from "./virtual-extruders";
export type Target = "universal" | "prusa" | "prusa3" | "bambu" | "orca";
export type Paint = {
    region: number;
} | {
    split: 1 | 2 | 3;
    side: 0 | 1 | 2;
    children: Paint[];
};
export type Role = "ModelPart" | "NegativeVolume" | "ParameterModifier" | "SupportEnforcer" | "SupportBlocker";
export interface PrintOverrides {
    perimeterCount?: number;
    infillPercent?: number;
    topLayers?: number;
    bottomLayers?: number;
    topThickness?: number;
    bottomThickness?: number;
    elephantFootCompensation?: number;
    gapFill?: boolean;
    verticalShells?: boolean;
    firstLayerSingleWall?: boolean;
    topSingleWall?: boolean;
    ironing?: boolean;
    wipeIntoInfill?: boolean;
    sourceName?: string;
}
export interface Mesh {
    id?: string;
    vertices: number[];
    triangles: number[];
}
export interface Part {
    id: string;
    name: string;
    kind: Role;
    mesh: Mesh;
    transform: number[];
    paint: Paint[];
    defaultRegion?: number;
    overrides: PrintOverrides;
    paintedTriangleCount?: number;
    derivedFrom?: string[];
}
export interface Model {
    id: string;
    name: string;
    parts: Part[];
    transform: number[];
    printable: boolean;
    defaultRegion?: number;
    overrides: PrintOverrides;
}
export interface Document {
    schemaVersion: 1;
    name: string;
    objects: Model[];
    palette: string[];
    format: Target | "generic";
    warnings: string[];
    sourceTriangles: number;
    paintedTriangles: number;
}
export interface Change {
    objectId: string;
    kind: "added" | "removed" | "replaced";
    reason: string;
}
export interface ExportResult {
    bytes: Uint8Array;
    changes: Change[];
    warnings: string[];
    droppedPaths: string[];
    /** Present only for opt-in virtual export; maps source regions to native IDs. */
    virtualExtruders?: VirtualExtruderPlan;
}
export interface WriteOptions {
    mode: "create" | "update";
    target?: Target;
    limits?: LimitOptions;
    /** Create-only ColorMix export. Omit to retain the existing physical-region workflow. */
    virtualExtruders?: VirtualExtruderOptions;
}
export declare const identity: () => import("three").Matrix4Tuple;
export declare function readDocument(input: ArrayBuffer | Uint8Array, name?: string, progress?: (_message: string) => void, options?: {
    limits?: LimitOptions;
}): Document;
/** Use this rather than structuredClone when the copy must retain its source archive. */
export declare function editDocument(document: Document): Document;
export declare function originalBytes(document: Document): Uint8Array | undefined;
export declare function createDocument(objects: Model[], palette?: string[], name?: string): Document;
/** Replacements have explicit lineage; an individual instance owns its parts. */
export declare function replacePart(document: Document, objectId: string, partId: string, replacements: Part[]): Document;
export declare function compareDocument(document: Document): Change[];
export declare function validateDocument(document: Document, target: Target, options?: LimitOptions): void;
export declare function worldParts(document: Document, { printableOnly }?: {
    printableOnly?: boolean;
}): {
    objectId: string;
    partId: string;
    name: string;
    kind: Role;
    mesh: Mesh;
    paint: Paint[];
    defaultRegion: number;
    transform: number[];
}[];
/** Expand partial-face paint only when the consuming algorithm needs geometry. */
export declare function resolvePart(part: ReturnType<typeof worldParts>[number], options?: LimitOptions): any[];
export declare function writeDocument(document: Document, options: WriteOptions): ExportResult;
/** Internal compatibility boundary for the existing native append writers. */
export declare function sourceContext(document: Document): any;
