export function readDocumentData(buffer: any, filename?: string, progress?: (_message: any) => void, options?: {}): {
    objects: {
        id: string;
        name: string;
        parts: any[];
        printable: boolean;
        transform: import("three").Matrix4Tuple;
        overrides: {};
        sourceRef: {
            path: string;
            resourceId: any;
            buildIndex: number;
        };
    }[];
    source: {
        modelPath: string;
    };
    limits: any;
    palette: string[];
    warnings: string[];
    filename: string;
    sourceTriangles: number;
    paintedTriangles: number;
    format: string;
};
export const DEFAULT_COLORS: string[];
