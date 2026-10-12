export function childrenOf(v: any, sides: any, side: any): any[][];
export function decodePaint(v: any, hex: any, fallback?: number, dialect?: string): any[];
export function encodePaint(state: any, dialect?: string): string;
export function parsePaint(hex: any, dialect?: string, options?: {}, budget?: {
    nodes: number;
}): {
    split: number;
    side: number;
    children: any[];
    region?: undefined;
} | {
    region: number;
};
export function serializePaint(tree: any, dialect?: string, options?: {}): string;
/** Validate/count without allocating encoded strings or resolved geometry. */
export function paintStats(tree: any, options?: {}, budget?: {
    nodes: number;
}): {
    leaves: number;
    maxRegion: number;
};
export function resolvePaint(points: any, tree: any, fallback?: number, options?: {}): any[];
export function midpoint(a: any, b: any): any;
