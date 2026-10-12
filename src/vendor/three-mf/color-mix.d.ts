import { type MixComponent } from "./mix";
export interface ColorMixPart {
    hex: string;
    ratio: number;
    extruder?: number;
}
/** Return a display-gamut #RRGGBB prediction. Inputs are normalized logical parts. */
export type ColorMixPredictor = (parts: readonly ColorMixPart[]) => string;
export interface ColorMixOptions {
    /** At most this many active tools; default min(3, number of tools). */
    maxContributors?: number;
    /** Percentage increments, default 5. Must divide 100 exactly. */
    percentageStep?: number;
    /** Prefer simpler mixes within this ΔE2000 of the best grid recipe; default 2. */
    maxAdditionalDeltaE?: number;
    /** For near-neutral targets, prefer neutral inputs within that allowance; default true. */
    preferNeutral?: boolean;
    /** Override the default Prusa v7 display-color predictor (e.g. with measured calibration). */
    predictor?: ColorMixPredictor;
    /** Maximum enumerated recipes, default 1,000,000. Checked before allocation. */
    maxCandidates?: number;
}
export interface ColorMixResult {
    components: MixComponent[];
    predictedColor: string;
    colorDifference: number;
    /** Strict minimum ΔE before applying the simpler/neutral preference. */
    bestColorDifference: number;
}
export interface ColorMixSolver {
    readonly candidateCount: number;
    solve(desiredColor: string): ColorMixResult;
    predict(components: readonly MixComponent[]): string;
}
/**
 * Source-compatible Prusa 2.9.6 / 3.0 alpha12 v7 hue strength. Keep vendored
 * calibration unchanged. Pure/zero/duplicate TOOL parts are normalized by the
 * solver; raw Lab is never scored because the native preview clips to sRGB.
 * The upstream third-component boundary discontinuity remains; use grid search
 * here and a calibrated continuous objective with optimizeMix when needed.
 */
export declare const prusaColorMixPredictor: ColorMixPredictor;
/** Build a reusable palette-specific catalog. No file, printer or layer-height dependency. */
export declare function createColorMixSolver(physicalColors: readonly string[], options?: ColorMixOptions): ColorMixSolver;
/** One-shot counterpart to createColorMixSolver; batch callers should reuse the factory. */
export declare function solveColorMix(desiredColor: string, physicalColors: readonly string[], options?: ColorMixOptions): ColorMixResult;
