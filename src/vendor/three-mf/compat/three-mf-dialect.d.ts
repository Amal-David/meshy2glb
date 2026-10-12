import { type El } from "./three-mf-xml";
export type ThreeMfDialect = "generic" | "prusa2" | "prusa3" | "bambu-orca";
export declare function detectThreeMfDialect(files: Record<string, Uint8Array>, root: El): ThreeMfDialect;
