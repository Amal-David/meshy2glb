/**
 * Yule-Nielsen color mixing — pure baseline, no empirical corrections.
 *
 * Per channel in linear-light RGB:
 *   (Σ ratio · linear^(1/n))^n
 *
 * `yuleNielsenMix` is the primitive (returns RGB) and is reused as step 1 of
 * the v7 model in `prusa-fdm-mixer.ts`. `mixYuleNielsen` is the public
 * comparison-baseline wrapper that returns `MixResult` like the other mixers.
 */
import { type RGB } from "./color.js";
import type { FilamentPart, MixResult } from "./prusa-fdm-mixer.js";
export declare function yuleNielsenMix(parts: FilamentPart[], n?: number): RGB;
export declare function mixYuleNielsen(parts: FilamentPart[]): MixResult;
