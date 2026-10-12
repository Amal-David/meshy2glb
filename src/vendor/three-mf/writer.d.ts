import type { SlicerFormat } from "./compat/types";
import type { LimitOptions } from "./limits";
export declare function createFiles(document: any, format: SlicerFormat, limits?: LimitOptions, options?: {
    application?: string;
}): Record<string, Uint8Array>;
