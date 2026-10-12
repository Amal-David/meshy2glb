export function readPrusaPaint(read: any, fallbackColors?: string[]): {
    objects: Map<any, any>;
    instances: Map<any, any>;
    palettes: any[][];
    hasVirtualExtruders: boolean;
    virtualWarnings: string[];
};
