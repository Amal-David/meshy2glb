import type { Project } from "./types";
/** Reconstruct just geometry/roles/placement/color into a fresh export checkpoint.
 * Material numbers become assignable region labels, including virtual slots.
 * Existing writers add the brim and all our overrides (including compensation).
 * No unrelated source file, setting, relationship or annotation is copied.
 */
export declare function cleanProject(project: Project): Project;
