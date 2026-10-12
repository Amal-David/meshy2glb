import type { Document } from "./document";
import type { LimitOptions } from "./limits";
import { type ColorMixOptions } from "./color-mix";
import { type MixComponent } from "./mix";
import { type PrusaMixSequence } from "./prusa-mix";
/** Reference swatches, not measurements of a particular brand's filaments. */
export declare const VIRTUAL_EXTRUDER_PALETTE: readonly (Readonly<{
    name: "Cyan";
    color: "#00FFFF";
}> | Readonly<{
    name: "Magenta";
    color: "#FF00FF";
}> | Readonly<{
    name: "Yellow";
    color: "#FFFF00";
}> | Readonly<{
    name: "White";
    color: "#FFFFFF";
}> | Readonly<{
    name: "Black";
    color: "#000000";
}> | Readonly<{
    name: "Red";
    color: "#FF0000";
}> | Readonly<{
    name: "Green";
    color: "#00FF00";
}> | Readonly<{
    name: "Blue";
    color: "#0000FF";
}>)[];
export interface BlendComponent extends MixComponent {
}
export interface RegionRecipe {
    /** Source document region; equal RGB values still have distinct region IDs. */
    region: number;
    /** One to three components; positive weights are normalized automatically. */
    components: BlendComponent[];
}
export interface VirtualExtruderOptions extends ColorMixOptions {
    /** Number of physical slots on the destination printer, from 2 through 8. */
    physicalExtruderCount: number;
    /** Optional measured/reference hex colors, one per physical slot in tool order. */
    physicalColors?: string[];
    /** Optional recipe overrides; omitted regions receive automatic starting recipes. */
    recipes?: RegionRecipe[];
    /** Prusa 3 create only: native printer project. Defaults to the source document. */
    prusa3Template?: Document;
    /** Configuration container to copy from the Prusa 3 template; defaults to zero. */
    prusa3ConfigContainer?: number;
}
export interface VirtualRegion {
    region: number;
    /** Exported native material ID, above all physical tools. */
    virtualExtruder: number;
    /** Desired/source color. Exported display swatches use predictedColor. */
    color: string;
    predictedColor: string;
    components: BlendComponent[];
    /** CIEDE2000 distance between desired and predicted color. */
    colorDifference: number;
    /** Best automatic grid error before applying the simplicity preference; overrides compare only their own recipe. */
    bestColorDifference: number;
    /** Prusa's repeating physical-tool cycle and approximated long-run ratios. */
    layerMix: PrusaMixSequence;
    /** Prediction using the scheduled fractions, distinct from the native nominal-ratio swatch. */
    scheduledColor: string;
    scheduledColorDifference: number;
}
export interface VirtualExtruderPlan {
    physicalExtruders: {
        id: number;
        name: string;
        color: string;
    }[];
    regions: VirtualRegion[];
    warnings: string[];
}
/** Preview/preflight only: never changes the document or allocates new geometry. */
export declare function planVirtualExtruders(document: Document, options: VirtualExtruderOptions, limits?: LimitOptions): VirtualExtruderPlan;
/** Internal: map source regions to native slots without cloning meshes. */
export declare function virtualizeDocument(document: Document, plan: VirtualExtruderPlan): Document;
/** Internal: write the recipe table in the destination's native project format. */
export declare function attachVirtualExtruders(files: Record<string, Uint8Array>, plan: VirtualExtruderPlan, prusa3Container?: Record<string, any>): void;
/** Alpha12 requires a valid native preset/config pack before loading recipes. */
export declare function prusa3VirtualContainer(bytes: Uint8Array, plan: VirtualExtruderPlan, index?: number, limits?: LimitOptions): Record<string, any>;
