import { type Doc } from "./three-mf-xml";
import type { BrimResult, Project, SlicerFormat } from "./types";
export declare function importNativeProject(name: string, files: Record<string, Uint8Array>, modelPath: string, modelDocument?: Doc): Project;
export declare function exportNativeProject(project: Project, result: BrimResult, format: SlicerFormat, modelDocument?: Doc): Uint8Array;
