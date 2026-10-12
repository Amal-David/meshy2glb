/** Work budgets, not a limit on the uploaded ZIP's compressed size. */
export interface ProcessingLimits {
    maxExpandedBytes: number;
    maxEntryBytes: number;
    maxArchiveEntries: number;
    maxSourceTriangles: number;
    maxResolvedTriangles: number;
    maxPaintNodes: number;
    maxPaintDepth: number;
}
export declare const DEFAULT_LIMITS: Readonly<ProcessingLimits>;
export type LimitOptions = Partial<ProcessingLimits>;
export declare function processingLimits(options?: LimitOptions): ProcessingLimits;
export declare function budgetError(what: string, key: keyof ProcessingLimits): never;
