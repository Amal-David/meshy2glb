export type JsonObject = Record<string, unknown>;
export declare const fail: (reason: string) => never;
export declare function record(value: unknown, label: string): JsonObject;
export declare function list(value: unknown, label: string): unknown[];
export declare function keys(value: JsonObject, allowed: string[], label: string): void;
export declare function integer(value: unknown, label: string, min?: number): number;
export declare function configuration(value: unknown): JsonObject;
