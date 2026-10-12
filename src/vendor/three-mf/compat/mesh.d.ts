import { Matrix4 } from "three";
import type { Mesh } from "./types";
export declare function transformMesh(mesh: Mesh, matrix: Matrix4): Mesh;
export declare function compactMesh(mesh: Mesh): Mesh;
