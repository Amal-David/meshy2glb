/**
 * Color space helpers: hex ↔ sRGB ↔ XYZ ↔ LAB.
 *
 * All RGB values use 0–255 range. All linear-light values use 0–1 range.
 * LAB uses standard CIE L*a*b* with D65 reference white.
 */
export interface RGB {
    r: number;
    g: number;
    b: number;
}
export interface LAB {
    L: number;
    a: number;
    b: number;
}
/** Parse a `#rrggbb` (or `rrggbb`) hex string to {r, g, b} in 0–255. */
export declare function hexToRgb(hex: string): RGB;
/** Format an {r, g, b} in 0–255 (any real values; will be clamped+rounded) as `#rrggbb`. */
export declare function rgbToHex(rgb: RGB): string;
/** sRGB gamma decode (0–255 input → 0–1 linear output). */
export declare function srgbToLinear(c: number): number;
/** sRGB gamma encode (0–1 linear input → 0–255 output, clamped). */
export declare function linearToSrgb(c: number): number;
/** sRGB → XYZ (D65). Input 0–255, output linear XYZ. */
export declare function rgbToXyz(rgb: RGB): {
    x: number;
    y: number;
    z: number;
};
/** XYZ (D65) → CIELAB. */
export declare function xyzToLab(x: number, y: number, z: number): LAB;
/** CIELAB → XYZ (D65). */
export declare function labToXyz(lab: LAB): {
    x: number;
    y: number;
    z: number;
};
/** XYZ (D65) → sRGB (0–255 floats; not yet clamped/rounded). */
export declare function xyzToRgb(x: number, y: number, z: number): RGB;
/** Hex → LAB (convenience). */
export declare function hexToLab(hex: string): LAB;
/** LAB → hex (convenience; clamped to gamut). */
export declare function labToHex(lab: LAB): string;
/** LAB chroma (distance from neutral axis). */
export declare function chroma(lab: LAB): number;
/** LAB hue angle in degrees [0, 360). Returns 0 for near-neutral colors. */
export declare function hueDegrees(lab: LAB): number;
