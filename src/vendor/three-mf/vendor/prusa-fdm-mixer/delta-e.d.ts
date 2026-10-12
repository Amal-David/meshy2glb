/**
 * CIEDE2000 color difference.
 *
 * The standard perceptual color-distance metric. ~3.5 is a "just noticeable
 * difference" under controlled viewing conditions; 1.0 is well below the
 * threshold of perception for most observers.
 *
 * Reference: Sharma, Wu, Dalal (2005) "The CIEDE2000 Color-Difference
 * Formula: Implementation Notes, Supplementary Test Data, and Mathematical
 * Observations".
 */
import type { LAB } from "./color.js";
export declare function deltaE2000(lab1: LAB, lab2: LAB): number;
