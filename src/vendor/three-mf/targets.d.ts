export function getTarget(id: any): Readonly<{
    id: import("./document").Target;
    name: string;
    maxPaintRegions: number;
    supportsVirtualExtruders: boolean;
    virtualExtruderNote?: string;
    flatOnly?: boolean;
    experimental?: boolean;
    note?: string;
    cleanNote?: string;
}>;
/** @type {ReadonlyArray<Readonly<{id: import('./document').Target, name: string, maxPaintRegions: number, supportsVirtualExtruders: boolean, virtualExtruderNote?: string, flatOnly?: boolean, experimental?: boolean, note?: string, cleanNote?: string}>>} */
export const TARGETS: ReadonlyArray<Readonly<{
    id: import("./document").Target;
    name: string;
    maxPaintRegions: number;
    supportsVirtualExtruders: boolean;
    virtualExtruderNote?: string;
    flatOnly?: boolean;
    experimental?: boolean;
    note?: string;
    cleanNote?: string;
}>>;
export const DEFAULT_TARGET: "prusa";
export function outputTarget(format: any): import("./document").Target;
export function preferredPaintTarget(format: any): any;
export function paintTargets({ virtualExtruders }?: {
    virtualExtruders?: boolean;
}): Readonly<{
    id: import("./document").Target;
    name: string;
    maxPaintRegions: number;
    supportsVirtualExtruders: boolean;
    virtualExtruderNote?: string;
    flatOnly?: boolean;
    experimental?: boolean;
    note?: string;
    cleanNote?: string;
}>[];
export function noticesForMode(warnings: any, mode: any): any;
export const SLICER_NAMES: {
    [k: string]: string;
};
