export type PaintDialect = "prusa" | "bambu" | "orca";
/** Compatibility adapter to the one shared paint-tree codec. */
export declare function translatePaint(hex: string, source: PaintDialect, target: PaintDialect): {
    hex: string;
    maxState: number;
};
