/**
 * prusa-fdm-mixer — filament color mixing model (calibration v7)
 *
 * Predicts the visible color of a multi-filament FDM print where colors are
 * interleaved at the layer level, calibrated against measured prints.
 *
 * Architecture (in order of application):
 *
 *   1. Yule-Nielsen base prediction (n = 3.0) in linear-light RGB
 *   2. Convert to LAB
 *   3. Lightness correction:  ΔL = -0.0477·L_gap - 2.112,
 *      plus an additional -0.060·(L_gap - 15) when L_gap > 15
 *   4. Chroma correction:     ΔC = 0.2780·predicted_L - 15.580
 *   5. Cyan-band hue rotation: peak +10.38° at hue 210° with linear
 *      fall-off ±30°
 *   6. Bell-curve weight w = N^N · ∏ratios scales the strength of all
 *      corrections so that pure components are returned exactly and 50:50
 *      mixes get the full correction.
 *
 * The corrections were fitted on 107 cleaned 2-color samples printed on
 * Prusa XL filaments. See data/fitting-set.jsonl.
 *
 * All constants live in `V7Params`; `DEFAULT_V7_PARAMS` carries the shipped
 * tuned values. `mixFilamentsWithParams` is exported for the autotuner
 * (apps/tuner) — public consumers should keep using `mixFilaments`.
 *
 * Inference: O(N) per prediction, no runtime dataset access.
 */
import { chroma, hueDegrees, type RGB, type LAB } from "./color.js";
/** A single filament part of a recipe. Ratios across all parts should sum to 1. */
export interface FilamentPart {
    /** sRGB hex of the filament (with or without leading `#`). */
    hex: string;
    /** Ratio in the recipe, in [0, 1]. All ratios should sum to 1. */
    ratio: number;
}
/** Result of a mix prediction. */
export interface MixResult {
    /** Predicted sRGB hex. */
    hex: string;
    /** Predicted CIELAB. */
    lab: LAB;
    /** Predicted sRGB (0–255 floats; not yet rounded). */
    rgb: RGB;
}
/**
 * All tunable constants of the prusa-fdm-mixer model (current v7 calibration).
 * Bundled into a single object so the
 * autotuner can sweep them without having to monkey-patch the module.
 *
 * Public consumers should not touch this — call `mixFilaments(parts)` which
 * uses `DEFAULT_V7_PARAMS`.
 */
export interface V7Params {
    /** Yule-Nielsen exponent for the base prediction. */
    YN_N: number;
    /** Lightness correction: ΔL = L_BASE_SLOPE · L_gap + L_BASE_INTERCEPT */
    L_BASE_SLOPE: number;
    L_BASE_INTERCEPT: number;
    /** Extra lightness pull when L_gap exceeds knee. */
    L_KNEE: number;
    L_KNEE_SLOPE: number;
    /** Chroma correction: ΔC = C_SLOPE · predicted_L + C_INTERCEPT */
    C_SLOPE: number;
    C_INTERCEPT: number;
    /** Cyan-band hue rotation. Peak +HUE_PEAK degrees at HUE_CENTER, linear fall-off ±HUE_FALLOFF. */
    HUE_CENTER: number;
    HUE_FALLOFF: number;
    HUE_PEAK: number;
    /** Bell-curve correction-weight peak multiplier. */
    PEAK_STRENGTH: number;
}
/** Shipped tuned constants (current calibration version: v7). */
export declare const DEFAULT_V7_PARAMS: V7Params;
/**
 * Predict the color of a filament mix using the shipped prusa-fdm-mixer constants.
 *
 * @param parts Array of {hex, ratio}. Ratios should sum to 1.
 * @returns Predicted color as { hex, lab, rgb }.
 *
 * Throws if `parts` is empty or any ratio is negative.
 */
export declare function mixFilaments(parts: FilamentPart[]): MixResult;
/**
 * Same as `mixFilaments`, but with explicit `V7Params`. Used by the autotuner
 * (apps/tuner) to evaluate candidate parameter sets against the fitting set.
 */
export declare function mixFilamentsWithParams(parts: FilamentPart[], params: V7Params): MixResult;
export { chroma, hueDegrees };
