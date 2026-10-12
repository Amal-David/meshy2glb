import {
  DEFAULT_COLORS,
  DEFAULT_TARGET,
  SLICER_NAMES,
  TARGETS,
  VIRTUAL_EXTRUDER_PALETTE,
  compareDocument,
  createColorMixSolver,
  createDocument,
  editDocument,
  exportProject,
  getTarget,
  identity,
  importProject,
  normalizeMix,
  noticesForMode,
  optimizeMix,
  originalBytes,
  outputTarget,
  paintTargets,
  planPrusaMixSequence,
  planVirtualExtruders,
  preferredPaintTarget,
  prusaColorMixPredictor,
  quantizeMix,
  readDocument,
  replacePart,
  resolvePart,
  solveColorMix,
  sourceContext,
  validateDocument,
  worldParts,
  writeDocument
} from "./chunk-I6I3N24Z.js";
import "./chunk-JKOOODL2.js";
import "./chunk-563TAMUL.js";
import "./chunk-J7ABM23C.js";
import "./chunk-UNJW77SA.js";
import "./chunk-W7EBKI6N.js";
import "./chunk-WQ5OOP4H.js";
import "./chunk-2SPQVFJA.js";
import {
  DEFAULT_LIMITS,
  resolvePaint
} from "./chunk-A7PZNYIJ.js";
import "./chunk-YZXTNLYM.js";
import {
  writeApplicationMetadata
} from "./chunk-NYB7XBCX.js";
import {
  transformMesh
} from "./chunk-MAUJ66QL.js";
import "./chunk-U2L6YRN7.js";
import "./chunk-NOHPIZKF.js";
import "./chunk-KJN6FYMH.js";
import {
  unzipSync,
  zipSync
} from "./chunk-5WIV2BUJ.js";
import "./chunk-F7HEVVAW.js";
import "./chunk-JSBRDJBE.js";

// src/append.ts
import { Matrix4 } from "three";
function appendParts(document, additions, options) {
  const edited = editDocument(document), target = outputTarget(options.target || document.format);
  for (const object of edited.objects)
    if (object.printable) {
      Object.assign(object.overrides, options.objectOverrides);
      if (target === "prusa3" && options.objectOverrides) {
        for (const part of object.parts)
          if (part.kind === "ModelPart")
            Object.assign(part.overrides, options.objectOverrides);
      }
    }
  for (const addition of additions) {
    const object = edited.objects.find((o) => o.id === addition.objectId);
    if (!object) throw new Error("An added part references a missing model.");
    const part = structuredClone(addition.part);
    if (addition.space === "world")
      part.transform = new Matrix4().fromArray(object.transform).invert().multiply(new Matrix4().fromArray(part.transform)).toArray();
    if (target === "prusa3")
      Object.assign(part.overrides, options.objectOverrides);
    object.parts.push(part);
  }
  const source = sourceContext(document);
  if (options.mode === "update" && !source)
    throw new Error("Update export requires an original archive.");
  if (options.mode === "update" && target !== outputTarget(document.format))
    throw new Error(
      "Keep the original slicer for update export. Changing slicer formats requires create (clean) export."
    );
  const limits = options.limits || source?.limits;
  validateDocument(edited, target, limits);
  const plain = additions.every(
    (a) => a.part.kind === "ModelPart" && a.part.defaultRegion === void 0 && a.part.paint.every((t) => "region" in t && t.region === 0)
  ) && new Set(additions.map((a) => a.objectId)).size === additions.length;
  if (plain && options.virtualExtruders === void 0 && !compareDocument(document).length && source && target !== "universal" && target === outputTarget(document.format) && JSON.stringify(document.palette) === JSON.stringify(source.baseline.palette)) {
    let project;
    try {
      project = importProject(document.name, source.bytes.buffer, limits);
    } catch {
    }
    if (project) {
      for (const object of project.objects) {
        const common = document.objects.find((o) => o.id === object.id);
        if (common) {
          object.name = common.name;
          if (object.parts.length === common.parts.length)
            object.parts.forEach((part, i) => {
              part.name = common.parts[i].name;
            });
        }
      }
      const objects = project.objects.map((o) => {
        const addition = additions.find((a) => a.objectId === o.id);
        const transform = addition ? new Matrix4().fromArray(addition.part.transform) : new Matrix4();
        if (addition?.space !== "world")
          transform.premultiply(new Matrix4().fromArray(o.transform));
        return {
          id: o.id,
          mesh: addition ? transformMesh(addition.part.mesh, transform) : { vertices: [], triangles: [] },
          name: addition?.part.name,
          printOverrides: addition ? {
            ...addition.part.overrides,
            ...target === "prusa3" ? options.objectOverrides : {}
          } : void 0
        };
      });
      const result2 = {
        objects,
        settings: {},
        parentOverrides: options.objectOverrides || {},
        applicationMetadata: options.applicationMetadata
      };
      const bytes = exportProject(project, result2, target, {
        clean: options.mode === "create"
      });
      return {
        bytes,
        changes: compareDocument(edited),
        warnings: [],
        droppedPaths: []
      };
    }
  }
  const result = writeDocument(edited, {
    mode: options.mode,
    target,
    limits,
    virtualExtruders: options.virtualExtruders
  });
  if (options.applicationMetadata) {
    const files = unzipSync(result.bytes);
    writeApplicationMetadata(files, options.applicationMetadata);
    result.bytes = zipSync(files, { level: 6 });
  }
  return result;
}

// src/geometry-view.ts
import { Matrix4 as Matrix42 } from "three";
function processingMesh(mesh) {
  const used = new Set(mesh.triangles);
  if (used.size === mesh.vertices.length / 3) return mesh;
  const remap = /* @__PURE__ */ new Map(), vertices = [];
  for (let i = 0; i < mesh.vertices.length / 3; i++)
    if (used.has(i)) {
      remap.set(i, vertices.length / 3);
      vertices.push(
        mesh.vertices[i * 3],
        mesh.vertices[i * 3 + 1],
        mesh.vertices[i * 3 + 2]
      );
    }
  return { vertices, triangles: mesh.triangles.map((i) => remap.get(i)) };
}
function geometryView(document) {
  const source = sourceContext(document);
  let warnings = [...document.warnings], suggestedHeight;
  if (source)
    try {
      const hints = importProject(
        document.name,
        source.bytes.buffer,
        source.limits,
        false
      );
      suggestedHeight = hints.suggestedHeight;
      warnings = [.../* @__PURE__ */ new Set([...warnings, ...hints.warnings])];
    } catch {
    }
  return {
    name: document.name,
    format: document.format === "universal" ? "generic" : document.format,
    sourceBacked: !!source,
    warnings,
    suggestedHeight,
    objects: document.objects.filter((o) => o.printable && o.parts.some((p) => p.kind === "ModelPart")).map((o) => ({
      id: o.id,
      name: o.name,
      transform: [...o.transform],
      parts: o.parts.map((p) => ({
        name: p.name,
        kind: p.kind,
        mesh: transformMesh(
          processingMesh(p.mesh),
          new Matrix42().fromArray(o.transform).multiply(new Matrix42().fromArray(p.transform))
        )
      }))
    }))
  };
}
function fromGeometryView(project) {
  if (project.sourceBacked || "source" in project)
    throw new Error(
      "Source-backed geometry requires its original document; re-import the archive."
    );
  return createDocument(
    project.objects.map((o) => ({
      id: o.id,
      name: o.name,
      printable: true,
      transform: [...o.transform],
      overrides: {},
      parts: o.parts.map((p, i) => ({
        id: o.id + "/part-" + i,
        name: p.name,
        kind: p.kind,
        mesh: transformMesh(
          p.mesh,
          new Matrix42().fromArray(o.transform).invert()
        ),
        transform: identity(),
        overrides: {},
        paint: Array.from({ length: p.mesh.triangles.length / 3 }, () => ({
          region: 0
        }))
      }))
    })),
    [],
    project.name
  );
}
export {
  DEFAULT_COLORS,
  DEFAULT_LIMITS,
  DEFAULT_TARGET,
  SLICER_NAMES,
  TARGETS,
  VIRTUAL_EXTRUDER_PALETTE,
  appendParts,
  compareDocument,
  createColorMixSolver,
  createDocument,
  editDocument,
  fromGeometryView,
  geometryView,
  getTarget,
  identity,
  normalizeMix,
  noticesForMode,
  optimizeMix,
  originalBytes,
  outputTarget,
  paintTargets,
  planPrusaMixSequence,
  planVirtualExtruders,
  preferredPaintTarget,
  prusaColorMixPredictor,
  quantizeMix,
  readDocument,
  replacePart,
  resolvePaint,
  resolvePart,
  solveColorMix,
  validateDocument,
  worldParts,
  writeDocument
};
