import { type Doc } from "./three-mf-xml";
import type { BrimResult, Project } from "./types";
export declare function importPrusaProject(name: string, files: Record<string, Uint8Array>, modelPath: string, doc: Doc): Project;
export declare function exportPrusaProject(project: Project, result: BrimResult, modelDocument?: Doc): Uint8Array;
