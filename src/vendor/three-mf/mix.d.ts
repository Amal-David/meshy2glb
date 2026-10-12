/** Logical tool contributions. Tool numbers are one-based; ratios use any positive units. */
export interface MixComponent {
    extruder: number;
    ratio: number;
}
/** Merge repeated tools, remove zeros and normalize without modifying the input. */
export declare function normalizeMix(components: readonly MixComponent[], toolCount?: number): MixComponent[];
/** Internal: increments must partition 100% into integer units. */
export declare function mixUnits(percentageStep: number): number;
/** Largest-remainder rounding; the result sums to one and respects the increment. */
export declare function quantizeMix(components: readonly MixComponent[], percentageStep?: number): MixComponent[];
/** Internal: visit every support up to k and every positive integer composition. */
export declare function visitMixGrid(toolCount: number, maxContributors: number, units: number, visit: (components: MixComponent[]) => void): void;
export interface MixOptimizationOptions {
    maxContributors?: number;
    /** Absolute ratio resolution for the approximate continuous search; default 1e-6. */
    tolerance?: number;
    /** Seed increment in percent; default 10. */
    seedPercentageStep?: number;
    /** Number of promising seeds refined per support; default 4. */
    startsPerSupport?: number;
    /** Work budget, default 1,000,000 objective evaluations; throws if exhausted. */
    maxEvaluations?: number;
}
export interface MixOptimizationResult {
    components: MixComponent[];
    error: number;
    evaluations: number;
    /** Arbitrary nonlinear objectives are not guaranteed to have a global optimum here. */
    guarantee: "approximate";
}
/**
 * Model-independent continuous sparse optimization on the simplex. The caller
 * supplies a finite scalar objective, ideally continuous on support boundaries.
 * Enumerates supports and refines multiple seeds by transferring ratio mass.
 * Quantized export should still compare permitted recipes, not round this once.
 */
export declare function optimizeMix(toolCount: number, objective: (components: readonly MixComponent[]) => number, options?: MixOptimizationOptions): MixOptimizationResult;
