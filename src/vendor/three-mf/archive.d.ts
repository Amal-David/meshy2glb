import { type LimitOptions } from "./limits";
/** Resolve a package URI using the same policy for reads and updates. */
export declare function packagePath(value: string, base?: string): string;
/** Index ZIP entries without decompressing them. Inflate only requested parts. */
export declare class Archive {
    private readonly bytes;
    readonly limits: any;
    readonly names: string[];
    private readonly entries;
    private readonly cached;
    private expanded;
    constructor(bytes: Uint8Array, options?: LimitOptions);
    /** Return the exact original ZIP spelling, accepting the reader's URI aliases. */
    pathFor(reference: string, base?: string): string | undefined;
    read(reference: string): Uint8Array | undefined;
    extract(include?: (path: string) => boolean): Record<string, Uint8Array>;
}
