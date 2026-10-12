import { type Doc } from "./three-mf-xml";
import type { Project, BrimResult } from "./types";
export declare function importPrusa3Project(name: string, files: Record<string, Uint8Array>, modelPath: string, modelDocument?: Doc): Project;
export declare function exportPrusa3Project(project: Project, result: BrimResult, modelDocument?: Doc): Uint8Array;
