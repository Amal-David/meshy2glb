import type { Document, Part, PrintOverrides, Target, ExportResult } from "./document";
export interface Addition {
    objectId: string;
    part: Part;
    space?: "world" | "object";
}
export interface AppendOptions {
    mode: "create" | "update";
    target?: Target;
    objectOverrides?: PrintOverrides;
    applicationMetadata?: {
        name: string;
        data: unknown;
    };
    limits?: import("./limits").LimitOptions;
    virtualExtruders?: import("./virtual-extruders").VirtualExtruderOptions;
}
/** Attach independently generated parts without rewriting original faces.
 * The native append optimization is only used after exact baseline comparison.
 * Replacement/edit operations always go through writeDocument's invalidation.
 */
export declare function appendParts(document: Document, additions: Addition[], options: AppendOptions): ExportResult;
