import type { LimitOptions } from "../limits";
import type { BrimResult, Project, SlicerFormat } from "./types";
export declare function importProject(name: string, bytes: ArrayBuffer, limits?: LimitOptions, preserveAll?: boolean): Project;
export declare function exportProject(project: Project, result: BrimResult, format?: SlicerFormat, options?: {
    clean?: boolean;
}): Uint8Array;
