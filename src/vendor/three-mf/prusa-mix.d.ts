import { type MixComponent } from "./mix";
export interface PrusaMixSequence {
    /** One-based tool IDs, repeated for successive object layers. */
    cycle: number[];
    /** Long-run component fractions after Prusa's ratio approximation. */
    components: MixComponent[];
    maxRatioError: number;
    /** Longest consecutive run across cycle boundaries; null for a pure tool. */
    maxRunLayers: number | null;
    maxContributorGapLayers: number;
    /** Fractions over the requested finite layer count, including absent contributors. */
    printedComponents?: MixComponent[];
}
/** Prusa 2.9.6 / 3.0 alpha12 constant-recipe layer adapter; not an optical model. */
export declare function planPrusaMixSequence(components: readonly MixComponent[], layerCount?: number): PrusaMixSequence;
