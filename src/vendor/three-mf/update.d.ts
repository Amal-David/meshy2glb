import type { LimitOptions } from "./limits";
import type { Document, Change, Target } from "./document";
/** Clean replacements get new resource IDs. Unchanged instances keep their
 * original graph and metadata; shared resources survive while still reachable.
 * Unclassified sidecars have no provable scope and are discarded on edits.
 */
export declare function updateFiles(document: Document, source: any, changes: Change[], target: Target, limits?: LimitOptions): {
    files: Record<string, Uint8Array<ArrayBufferLike>>;
    warnings: string[];
    droppedPaths: string[];
};
