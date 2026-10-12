import {
  translatePaint
} from "./chunk-JKOOODL2.js";
import {
  exportPrusaProject,
  importPrusaProject
} from "./chunk-563TAMUL.js";
import {
  exportPrusa3Project,
  importPrusa3Project
} from "./chunk-J7ABM23C.js";
import {
  detectThreeMfDialect
} from "./chunk-W7EBKI6N.js";
import {
  FULL_SPECTRUM_PATH,
  readPrusaPaint,
  readPrusaVirtualPalette
} from "./chunk-WQ5OOP4H.js";
import {
  export3mf
} from "./chunk-2SPQVFJA.js";
import {
  budgetError,
  paintStats,
  parsePaint,
  processingLimits,
  resolvePaint,
  serializePaint
} from "./chunk-A7PZNYIJ.js";
import {
  exportNativeProject,
  importNativeProject
} from "./chunk-YZXTNLYM.js";
import {
  settingsFor
} from "./chunk-NYB7XBCX.js";
import {
  transformMesh
} from "./chunk-MAUJ66QL.js";
import {
  cleanProject
} from "./chunk-U2L6YRN7.js";
import {
  packageFiles
} from "./chunk-NOHPIZKF.js";
import {
  NS,
  child,
  children,
  require_lib,
  serialize,
  xml
} from "./chunk-KJN6FYMH.js";
import {
  strFromU8,
  strToU8,
  unzipSync,
  zipSync
} from "./chunk-5WIV2BUJ.js";
import {
  __toESM
} from "./chunk-JSBRDJBE.js";

// src/document.ts
import { Matrix4 as Matrix44, Vector3 as Vector32 } from "three";

// src/archive.ts
function packagePath(value, base = "") {
  let path;
  try {
    path = decodeURIComponent(value);
  } catch {
    throw new Error("Invalid encoded 3MF resource path.");
  }
  if (!path || /[?#\x00-\x1f]|^[a-z][a-z\d+.-]*:/i.test(path))
    throw new Error("Invalid or external 3MF resource path.");
  path = path.replaceAll("\\", "/");
  const pieces = (path.startsWith("/") ? path : base.slice(0, base.lastIndexOf("/") + 1) + path).split("/"), result = [];
  for (const piece of pieces) {
    if (!piece || piece === ".") continue;
    if (piece === "..") {
      if (!result.length)
        throw new Error("A 3MF resource path escapes the archive.");
      result.pop();
    } else result.push(piece);
  }
  return result.join("/");
}
var Archive = class {
  constructor(bytes, options = {}) {
    this.bytes = bytes;
    this.limits = processingLimits(options);
    unzipSync(bytes, {
      filter: (file) => {
        if (this.names.length >= this.limits.maxArchiveEntries)
          budgetError("Archive entry count", "maxArchiveEntries");
        const key = packagePath(file.name).toLowerCase();
        if (this.entries.has(key))
          throw new Error("Duplicate 3MF archive resource path.");
        if (!Number.isSafeInteger(file.originalSize) || file.originalSize < 0)
          throw new Error("Invalid ZIP entry size.");
        this.entries.set(key, { name: file.name, size: file.originalSize });
        this.names.push(file.name);
        return false;
      }
    });
  }
  limits;
  names = [];
  entries = /* @__PURE__ */ new Map();
  cached = /* @__PURE__ */ new Map();
  expanded = 0;
  /** Return the exact original ZIP spelling, accepting the reader's URI aliases. */
  pathFor(reference, base = "") {
    if (!base && this.entries.has(reference.toLowerCase()))
      return this.entries.get(reference.toLowerCase()).name;
    return this.entries.get(packagePath(reference, base).toLowerCase())?.name;
  }
  read(reference) {
    const path = this.pathFor(reference);
    if (!path) return;
    const key = packagePath(path).toLowerCase();
    if (this.cached.has(key)) return this.cached.get(key);
    const entry = this.entries.get(key);
    if (entry.size > this.limits.maxEntryBytes)
      budgetError("Expanded 3MF entry " + path, "maxEntryBytes");
    if (this.expanded + entry.size > this.limits.maxExpandedBytes)
      budgetError("Expanded 3MF data", "maxExpandedBytes");
    const bytes = unzipSync(this.bytes, {
      filter: (file) => file.name === path
    })[path];
    if (!bytes || bytes.length !== entry.size)
      throw new Error("Invalid ZIP entry size.");
    this.expanded += bytes.length;
    this.cached.set(key, bytes);
    return bytes;
  }
  extract(include = () => true) {
    const files = /* @__PURE__ */ Object.create(null);
    for (const name of this.names)
      if (include(name)) files[name] = this.read(name);
    return files;
  }
};

// src/reader.js
var import_xmldom = __toESM(require_lib(), 1);
import { Matrix4, Vector3 } from "three";
var DEFAULT_COLORS = [
  "#70C6B4",
  "#F2AD60",
  "#E9E4DA",
  "#6557A4",
  "#D46878",
  "#559FDE",
  "#A8BC60",
  "#817C79"
];
var children2 = (el, name) => Array.from(el?.childNodes || []).filter(
  (n) => n.nodeType === 1 && n.localName === name
);
var child2 = (el, name) => children2(el, name)[0];
var descendants = (el, name) => Array.from(el.getElementsByTagName("*")).filter((n) => n.localName === name);
var attr = (el, name) => Array.from(el.attributes || []).find((a) => a.localName === name)?.value;
function xml2(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error(
      "3MF XML with document type or entity declarations is not supported."
    );
  return new import_xmldom.DOMParser({
    onError: (level, message) => {
      if (level !== "warning") throw new Error(`Invalid 3MF XML: ${message}`);
    }
  }).parseFromString(text, "application/xml");
}
function matrix(value) {
  if (!value) return new Matrix4();
  const a = value.trim().split(/\s+/).map(Number);
  if (a.length !== 12 || !a.every(Number.isFinite))
    throw new Error("Invalid 3MF object transform.");
  return new Matrix4().set(
    a[0],
    a[3],
    a[6],
    a[9],
    a[1],
    a[4],
    a[7],
    a[10],
    a[2],
    a[5],
    a[8],
    a[11],
    0,
    0,
    0,
    1
  );
}
function positiveInt(value, fallback = 1) {
  if (value == null || String(value).trim() === "") return fallback;
  const n = Number(value);
  if (n === 0) return fallback;
  if (!Number.isInteger(n) || n < 1 || n > 255)
    throw new Error(
      "The model contains an invalid material index (expected 1\u2013255)."
    );
  return n;
}
function requiredNumber(element, name) {
  const value = element.getAttribute(name);
  if (value == null || value.trim() === "" || !Number.isFinite(Number(value)))
    throw new Error(
      `The mesh contains a missing or invalid numeric ${name} attribute.`
    );
  return Number(value);
}
function readDocumentData(buffer, filename = "Model.3mf", progress = (_message) => {
}, options = {}) {
  const archive = new Archive(buffer, options.limits), limits = archive.limits;
  const paintBudget = { nodes: 0 };
  const read = (path) => {
    const bytes = archive.read(path);
    return bytes ? strFromU8(bytes) : null;
  };
  let root = "3D/3dmodel.model";
  if (read("_rels/.rels")) {
    const rel = descendants(xml2(read("_rels/.rels")), "Relationship").find(
      (r) => (r.getAttribute("Type") || "").endsWith("/3dmodel")
    );
    if (rel) {
      if (rel.getAttribute("TargetMode") === "External")
        throw new Error(
          "External 3MF model relationships are not supported; an internal model is required."
        );
      root = packagePath(rel.getAttribute("Target"));
    }
  }
  if (!read(root))
    throw new Error(
      "No 3D model was found: the archive is missing its model resource."
    );
  const cache = /* @__PURE__ */ new Map(), colorRegions = /* @__PURE__ */ new Map(), warnings = [], palette = [];
  const prusa3 = readPrusaPaint(read, DEFAULT_COLORS);
  const setPalette = (colors2) => {
    if (colors2.length > 255)
      throw new Error("This palette exceeds the 255 material limit.");
    for (const value of colors2) {
      const c = typeof value === "string" ? value.trim() : "";
      palette.push(
        /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(c) ? c.slice(0, 7) : DEFAULT_COLORS[palette.length % DEFAULT_COLORS.length]
      );
    }
  };
  if (prusa3) {
    warnings.push("Experimental PrusaSlicer 3.x paint import.");
    warnings.push(...prusa3.virtualWarnings);
    if (prusa3.hasVirtualExtruders)
      warnings.push(
        "Virtual extruders were retained as separate color regions. Update export preserves their source recipes; create export needs virtualExtruders to regenerate blend recipes."
      );
    if (prusa3.palettes.length) setPalette(prusa3.palettes[0]);
    if (prusa3.palettes.some(
      (p) => JSON.stringify(p) !== JSON.stringify(prusa3.palettes[0])
    ))
      warnings.push(
        "The project has different palettes on different beds. Material slot numbers are preserved; the first palette is shown."
      );
  }
  const config = read("Metadata/Slic3r_PE.config") || "";
  const colors = config.match(/^;?\s*extruder_colour\s*=\s*(.+)$/m)?.[1] || config.match(/^;?\s*filament_colour\s*=\s*(.+)$/m)?.[1];
  if (!palette.length && colors) setPalette(colors.split(";"));
  if (!prusa3)
    warnings.push(...readPrusaVirtualPalette(read, palette, DEFAULT_COLORS));
  const bambuSettings = read("Metadata/project_settings.config");
  if (!palette.length && bambuSettings)
    try {
      const settings = JSON.parse(bambuSettings), colors2 = settings.filament_colour || settings.filament_color || settings.extruder_colour;
      if (colors2 !== void 0 && !Array.isArray(colors2))
        throw new Error("Invalid palette.");
      if (colors2) setPalette(colors2);
    } catch {
      warnings.push(
        "Unreadable project palette settings were ignored. Paint material numbers are preserved; check the display colors."
      );
    }
  const objectSettings = /* @__PURE__ */ new Map();
  const metadataOf = (el) => Object.fromEntries(
    children2(el, "metadata").filter(
      (m) => ["name", "extruder", "modifier", "volume_type"].includes(
        m.getAttribute("key")
      )
    ).map((m) => [m.getAttribute("key"), m.getAttribute("value")])
  );
  const prusaConfig = read("Metadata/Slic3r_PE_model.config");
  if (prusaConfig)
    for (const o of descendants(xml2(prusaConfig), "object")) {
      const metadata = metadataOf(o);
      const volumes = children2(o, "volume").map((v) => ({
        first: requiredNumber(v, "firstid"),
        last: requiredNumber(v, "lastid"),
        meta: metadataOf(v)
      }));
      if (objectSettings.has(o.getAttribute("id")))
        throw new Error("Duplicate 3MF object settings.");
      objectSettings.set(o.getAttribute("id"), { metadata, volumes });
    }
  const bambuConfig = read("Metadata/model_settings.config");
  if (prusa3 && (prusaConfig || bambuConfig))
    throw new Error(
      "Mixed PrusaSlicer 3.x and legacy object metadata is ambiguous. Save the project in its slicer first."
    );
  if (bambuConfig)
    for (const o of descendants(xml2(bambuConfig), "object")) {
      if (objectSettings.has(o.getAttribute("id")))
        throw new Error("Ambiguous or mixed 3MF object settings.");
      objectSettings.set(o.getAttribute("id"), {
        metadata: metadataOf(o),
        volumes: [],
        parts: children2(o, "part").map((p) => ({
          id: p.getAttribute("id"),
          metadata: metadataOf(p),
          subtype: p.getAttribute("subtype")
        }))
      });
    }
  if (prusa3)
    for (const [id, settings] of prusa3.objects)
      objectSettings.set(id, settings);
  function model(path) {
    path = path.toLowerCase();
    if (cache.has(path)) return cache.get(path);
    const content = read(path);
    if (!content)
      throw new Error(`Missing model resource for a 3MF component: ${path}`);
    const doc = xml2(content), el = doc.documentElement, resources = child2(el, "resources");
    if (el.localName !== "model" || el.namespaceURI !== "http://schemas.microsoft.com/3dmanufacturing/core/2015/02" || !resources)
      throw new Error("Invalid 3MF core model resources.");
    const supportedExtensions = /* @__PURE__ */ new Set([
      "http://schemas.microsoft.com/3dmanufacturing/production/2015/06",
      "http://schemas.microsoft.com/3dmanufacturing/material/2015/02"
    ]);
    for (const prefix of (el.getAttribute("requiredextensions") || "").trim().split(/\s+/).filter(Boolean)) {
      if (!supportedExtensions.has(el.lookupNamespaceURI(prefix)))
        throw new Error(
          `Unsupported required 3MF extensions: ${prefix}. Export a mesh-and-paint 3MF without this extension in the source app.`
        );
    }
    const ids = /* @__PURE__ */ new Set();
    for (const resource of Array.from(resources.childNodes).filter(
      (e) => e.nodeType === 1
    )) {
      const id = resource.getAttribute("id");
      if (!/^\d+$/.test(id || "") || Number(id) < 1 || ids.has(id))
        throw new Error("Invalid or duplicate 3MF resource ID.");
      ids.add(id);
    }
    const application = children2(el, "metadata").find(
      (m) => m.getAttribute("name") === "Application"
    )?.textContent || "";
    if (/^PrusaSlicer[-\s]+(?:[3-9]|\d{2,})\./i.test(application) && !prusa3)
      throw new Error(
        "Unsupported PrusaSlicer 3.x project: missing project/paint metadata. Save an editable 3MF in PrusaSlicer first."
      );
    const unit = {
      micron: 1e-3,
      millimeter: 1,
      centimeter: 10,
      inch: 25.4,
      foot: 304.8,
      meter: 1e3
    }[el.getAttribute("unit") || "millimeter"];
    if (typeof unit !== "number") throw new Error("Unsupported 3MF unit.");
    const data = {
      el,
      unit,
      objects: new Map(
        children2(resources, "object").map((o) => [o.getAttribute("id"), o])
      ),
      resources: new Map(
        Array.from(resources?.childNodes || []).filter((e) => e.nodeType === 1).map((e) => [e.getAttribute("id"), e])
      )
    };
    const versions = children2(el, "metadata").filter(
      (m) => /^(?:slic3rpe|BambuStudio|OrcaSlicer):MmPaintingVersion$/.test(
        m.getAttribute("name")
      )
    );
    if (versions.some((v) => ![0, 1, 2].includes(Number(v.textContent))))
      throw new Error(
        "This 3MF uses a newer paint format. Save a PrusaSlicer 2.x compatible 3MF first."
      );
    data.paintVersion = Number(
      versions.find(
        (v) => v.getAttribute("name") === "slic3rpe:MmPaintingVersion"
      )?.textContent || 0
    );
    if (!palette.length) {
      const groups = [...data.resources.values()].filter(
        (r) => r.localName === "colorgroup"
      );
      if (groups.length === 1) {
        for (const color of children2(groups[0], "color")) {
          const value = color.getAttribute("color");
          if (/^#[\da-f]{6}/i.test(value)) palette.push(value.slice(0, 7));
        }
      }
    }
    cache.set(path, data);
    return data;
  }
  const objects = [];
  let currentObject;
  let sourceTriangles = 0, paintedTriangles = 0, resolved = 0, skipped = 0, visits = 0;
  function visit(path, id, transform, stack = [], inherited = 1, context = {}) {
    path = path.toLowerCase();
    if (++visits > 1e5)
      throw new Error("The 3MF contains too many component instances.");
    const key = path + "#" + id;
    if (stack.includes(key) || stack.length > 40)
      throw new Error(
        "Cyclic/circular references or excessive component nesting in 3MF."
      );
    const data = model(path), obj = data.objects.get(id);
    if (!obj) throw new Error(`Missing 3MF object ${id}.`);
    if (obj.getAttribute("type") && obj.getAttribute("type") !== "model" && !context.part?.subtype && !context.part?.role) {
      skipped++;
      return;
    }
    const settings = path === root.toLowerCase() ? objectSettings.get(id) : void 0, part = context.part;
    if (part?.subtype && ![
      "normal_part",
      "negative_part",
      "modifier_part",
      "support_enforcer",
      "support_blocker"
    ].includes(part.subtype))
      throw new Error(`Unsupported Bambu/Orca part type: ${part.subtype}.`);
    const fallback = positiveInt(
      part?.metadata.extruder,
      positiveInt(settings?.metadata.extruder, inherited)
    );
    const mesh = child2(obj, "mesh"), components = child2(obj, "components");
    const baseName = part?.metadata.name || part?.role && obj.getAttribute("name") || settings?.metadata.name || obj.getAttribute("name") || part?.role && context.name || (mesh ? `Part ${id}` : context.name) || `Object ${id}`;
    if (mesh && components)
      throw new Error("A 3MF object cannot contain both mesh and components.");
    if (components) {
      const refs = children2(components, "component");
      if (settings?.parts?.length && (settings.parts.length !== refs.length || settings.parts.some(
        (p, i) => p.id !== refs[i].getAttribute("objectid")
      )))
        throw new Error("Part settings do not match the 3MF components.");
      if (part?.paint && refs.length !== 1)
        throw new Error(
          "PrusaSlicer 3.x paint must refer to a single mesh per volume."
        );
      for (const [index, c] of refs.entries()) {
        const nextPath = attr(c, "path") ? packagePath(attr(c, "path"), path) : path;
        const scale = model(nextPath).unit / data.unit;
        visit(
          nextPath,
          c.getAttribute("objectid"),
          transform.clone().multiply(matrix(c.getAttribute("transform"))).scale(new Vector3(scale, scale, scale)),
          [...stack, key],
          fallback,
          { part: settings?.parts?.[index] || part, name: baseName }
        );
      }
    }
    if (!mesh) return;
    if (settings?.parts?.length)
      throw new Error(
        "Part metadata expects components, but this object contains a combined mesh. Save it again in its slicer first."
      );
    if (!Number.isFinite(transform.determinant()) || transform.determinant() === 0)
      throw new Error("Invalid or collapsed 3MF object transform.");
    const localVertices = [];
    const point = new Vector3();
    for (const v of children2(child2(mesh, "vertices"), "vertex")) {
      const p = ["x", "y", "z"].map((k) => requiredNumber(v, k));
      const result = point.fromArray(p).applyMatrix4(transform).toArray();
      if (!result.every(Number.isFinite))
        throw new Error("The mesh contains an invalid transformed vertex.");
      localVertices.push(...p);
    }
    const triangles = children2(child2(mesh, "triangles"), "triangle");
    sourceTriangles += triangles.length;
    if (sourceTriangles > limits.maxSourceTriangles)
      budgetError("Source triangle count", "maxSourceTriangles");
    if (part?.paint && [...part.paint.keys()].some((i) => i >= triangles.length))
      throw new Error("PrusaSlicer 3.x paint references a missing triangle.");
    const groups = settings?.volumes.length ? settings.volumes : [{ first: 0, last: triangles.length - 1, meta: {} }];
    let nextTriangle = 0;
    for (const group of [...groups].sort((a, b) => a.first - b.first)) {
      if (!Number.isInteger(group.first) || !Number.isInteger(group.last) || group.first !== nextTriangle || group.last < group.first || group.last >= triangles.length)
        throw new Error(
          "Invalid, overlapping or incomplete volume triangle range in 3MF metadata."
        );
      nextTriangle = group.last + 1;
    }
    if (nextTriangle !== triangles.length)
      throw new Error("Incomplete volume triangle ranges in 3MF metadata.");
    for (const group of groups) {
      const partRole = group.meta.volume_type || (group.meta.modifier === "1" ? "ParameterModifier" : part?.role || {
        normal_part: "ModelPart",
        negative_part: "NegativeVolume",
        modifier_part: "ParameterModifier",
        support_enforcer: "SupportEnforcer",
        support_blocker: "SupportBlocker"
      }[part?.subtype] || "ModelPart");
      if (![
        "ModelPart",
        "NegativeVolume",
        "ParameterModifier",
        "SupportEnforcer",
        "SupportBlocker"
      ].includes(partRole))
        throw new Error("Unknown geometry role: " + partRole + ".");
      const meshIndices = [], paint = [];
      let groupPainted = 0;
      const defaultMaterial = positiveInt(group.meta.extruder, fallback);
      for (let i = group.first; i <= group.last; i++) {
        const t = triangles[i];
        if (!t)
          throw new Error("Invalid volume triangle range in 3MF metadata.");
        const indices = ["v1", "v2", "v3"].map((k) => requiredNumber(t, k));
        if (indices.some(
          (i2) => !Number.isInteger(i2) || i2 < 0 || i2 >= localVertices.length / 3
        ))
          throw new Error(
            "Invalid triangle indices reference a missing vertex."
          );
        const prusa = part?.paint?.get(i) ?? attr(t, "mmu_segmentation"), bambu = attr(t, "paint_color");
        if (part?.paint?.has(i) && attr(t, "mmu_segmentation") && prusa !== attr(t, "mmu_segmentation"))
          throw new Error("Conflicting XML and JSON triangle paint.");
        let material = defaultMaterial, explicitRegion = false;
        if (!prusa && !bambu) {
          const pid = t.getAttribute("pid") || obj.getAttribute("pid"), p1 = t.getAttribute("p1") || obj.getAttribute("pindex") || "0", resource = data.resources.get(pid);
          if (pid && !resource)
            throw new Error("A triangle references a missing color resource.");
          if (resource) {
            if (!["basematerials", "colorgroup"].includes(resource.localName))
              throw new Error(
                "Texture and composite 3MF materials are not supported. Convert them to slicer paint first."
              );
            if (["p2", "p3"].some(
              (k) => t.hasAttribute(k) && t.getAttribute(k) !== p1
            ))
              throw new Error(
                "Interpolated vertex colors are not supported. Convert them to slicer paint first."
              );
            const entries = children2(
              resource,
              resource.localName === "basematerials" ? "base" : "color"
            ), property = Number(p1);
            if (!Number.isInteger(property) || property < 0 || property >= entries.length)
              throw new Error("A triangle references a missing color region.");
            const resourceKey = `${path}#${pid}`;
            if (!colorRegions.has(resourceKey)) {
              const colors2 = entries.map((entry, index) => {
                const c = entry.getAttribute("color") || entry.getAttribute("displaycolor") || "";
                return /^#[\da-f]{6}/i.test(c) ? c.slice(0, 7) : DEFAULT_COLORS[index % DEFAULT_COLORS.length];
              });
              const reusePalette = !colorRegions.size && colors2.length === palette.length && colors2.every(
                (c, i2) => c.toUpperCase() === palette[i2].toUpperCase()
              );
              const start = reusePalette ? 0 : palette.length;
              if (start + colors2.length > 255)
                throw new Error(
                  "This model exceeds the 255 color-region limit."
                );
              if (!reusePalette) palette.push(...colors2);
              colorRegions.set(
                resourceKey,
                colors2.map((_, i2) => start + i2 + 1)
              );
            }
            material = colorRegions.get(resourceKey)[property];
            explicitRegion = true;
          }
        }
        if (prusa || bambu) {
          paintedTriangles++;
          groupPainted++;
        }
        const sharedLegacyPaint = prusa && prusa === bambu && data.paintVersion < 2;
        paint.push(
          prusa || bambu ? parsePaint(
            prusa || bambu,
            prusa && !sharedLegacyPaint ? "prusa" : "bambu",
            limits,
            paintBudget
          ) : { region: explicitRegion ? material : 0 }
        );
        meshIndices.push(...indices);
      }
      currentObject.parts.push({
        id: currentObject.id + "/part-" + currentObject.parts.length,
        name: group.meta.name || baseName,
        kind: partRole,
        paintedTriangleCount: groupPainted,
        defaultRegion: defaultMaterial,
        mesh: {
          id: key + ":" + group.first + "-" + group.last,
          vertices: group === groups.at(-1) ? localVertices : localVertices.slice(),
          triangles: meshIndices
        },
        paint,
        transform: new Matrix4().fromArray(currentObject.transform).invert().multiply(transform).toArray(),
        overrides: {},
        sourceRef: {
          path: archive.pathFor(path),
          resourceId: id,
          first: group.first,
          last: group.last
        }
      });
      progress(`Reading ${baseName}\u2026`);
    }
  }
  const rootData = model(root), build = child2(rootData.el, "build");
  const items = children2(build, "item");
  if (!items.length) throw new Error("This 3MF has no build items.");
  if (prusa3)
    for (const [index, instance] of prusa3.instances) {
      if (!items[index] || items[index].getAttribute("objectid") !== instance.id)
        throw new Error(
          "PrusaSlicer 3.x instance metadata does not match the build."
        );
    }
  for (const [index, item] of items.entries()) {
    const printable = !["0", "false"].includes(item.getAttribute("printable")) && prusa3?.instances.get(index)?.printable !== false;
    const itemPath = attr(item, "path") ? packagePath(attr(item, "path"), root) : root;
    if (prusa3 && (itemPath !== root || !objectSettings.has(item.getAttribute("objectid"))))
      throw new Error("Missing PrusaSlicer 3.x object metadata.");
    const scale = model(itemPath).unit / rootData.unit;
    currentObject = {
      id: "object-" + index,
      name: filename.replace(/\.3mf$/i, ""),
      parts: [],
      printable,
      transform: new Matrix4().makeScale(rootData.unit, rootData.unit, rootData.unit).multiply(matrix(item.getAttribute("transform"))).toArray(),
      overrides: {},
      sourceRef: {
        path: archive.pathFor(itemPath),
        resourceId: item.getAttribute("objectid"),
        buildIndex: index
      }
    };
    objects.push(currentObject);
    visit(
      itemPath,
      item.getAttribute("objectid"),
      new Matrix4().makeScale(rootData.unit, rootData.unit, rootData.unit).multiply(matrix(item.getAttribute("transform"))).scale(new Vector3(scale, scale, scale))
    );
  }
  if (!objects.some((o) => o.parts.length))
    throw new Error("No model geometry was found.");
  for (const object of objects) {
    const ref = object.sourceRef, settings = objectSettings.get(ref.resourceId);
    object.name = settings?.metadata.name || model(ref.path).objects.get(ref.resourceId)?.getAttribute("name") || object.parts[0]?.name || object.name;
  }
  let maxMaterial = 1;
  const highest = (tree) => "region" in tree ? tree.region : Math.max(...tree.children.map(highest));
  for (const o of objects)
    for (const p of o.parts) {
      maxMaterial = Math.max(maxMaterial, p.defaultRegion);
      for (const tree of p.paint)
        maxMaterial = Math.max(maxMaterial, highest(tree));
    }
  if (!palette.length)
    warnings.push(
      "No filament palette was stored. Material numbers are preserved; choose display colors below."
    );
  while (palette.length < maxMaterial)
    palette.push(DEFAULT_COLORS[palette.length % DEFAULT_COLORS.length]);
  if (skipped)
    warnings.push(
      `${skipped} non-printing item(s), modifiers, or negative volumes were excluded. Apply any needed modifiers in your slicer after export.`
    );
  if (!paintedTriangles)
    warnings.push(
      "No MMU/AMS paint was found. Existing object material assignments are used."
    );
  return {
    objects,
    source: { modelPath: archive.pathFor(root) },
    limits,
    palette,
    warnings,
    filename,
    sourceTriangles,
    paintedTriangles,
    format: prusa3 ? "prusa3" : children2(rootData.el, "metadata").some(
      (m) => m.getAttribute("name") === "OrcaSlicer" || ["ThreeMFKit:TargetSlicer", "RollingBrim:TargetSlicer"].includes(
        m.getAttribute("name")
      ) && m.textContent === "orca" || m.getAttribute("name") === "Application" && /^OrcaSlicer-/i.test(m.textContent)
    ) ? "orca" : bambuConfig ? "bambu" : prusaConfig ? "prusa" : "generic"
  };
}

// src/writer.ts
import { Matrix4 as Matrix42 } from "three";
var ROLES = {
  normal_part: "ModelPart",
  negative_part: "NegativeVolume",
  modifier_part: "ParameterModifier",
  support_enforcer: "SupportEnforcer",
  support_blocker: "SupportBlocker"
};
var P3 = "Metadata/PrusaSlicer3_project.json";
var PAINT = "Metadata/Slic3r_facets_annotation.json";
var unsupported = (reason) => {
  throw new Error(
    `${reason} Keep the original output slicer to preserve this color data.`
  );
};
var transformText = (m) => m.elements.filter((_, i) => i % 4 !== 3).join(" ");
function createFiles(document, format, limits = {}, options = {}) {
  let paintingVersion = 1;
  const objects = document.objects.map((o) => ({
    ...o,
    extruder: o.defaultRegion === void 0 ? void 0 : String(o.defaultRegion),
    transform: new Matrix42().fromArray(o.transform),
    parts: o.parts.map((p) => ({
      ...p,
      extruder: p.defaultRegion === void 0 ? void 0 : String(p.defaultRegion),
      transform: new Matrix42().fromArray(p.transform),
      paint: p.paint.map((tree) => {
        if ("region" in tree && tree.region === 0) return "";
        if (paintStats(tree, limits).maxRegion > 16) paintingVersion = 2;
        return serializePaint(
          tree,
          format === "bambu" ? "bambu" : format === "orca" ? "orca" : "prusa",
          limits
        );
      })
    }))
  })), modelPath = "3D/3dmodel.model";
  const doc = xml(
    `<model xmlns="${NS}" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06" unit="millimeter"><resources/><build/></model>`
  );
  const resources = child(doc.documentElement, "resources"), build = child(doc.documentElement, "build"), config = xml("<config/>");
  const files = packageFiles(modelPath), objectConfigs = [], painting = [];
  const node = (tag, parent, attrs = {}) => {
    const el = doc.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent?.appendChild(el);
    return el;
  };
  const metadata = (name, value) => {
    const m = node("metadata", void 0, { name });
    m.appendChild(doc.createTextNode(value));
    doc.documentElement.insertBefore(m, resources);
  };
  const setting = (parent, key, value, type = "volume") => {
    if (value === void 0) return;
    const m = config.createElement("metadata");
    if (format === "prusa") m.setAttribute("type", type);
    m.setAttribute("key", key);
    m.setAttribute("value", value);
    parent.appendChild(m);
  };
  const cfgNode = (tag, parent, attrs = {}) => {
    const el = config.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.appendChild(el);
    return el;
  };
  const meshNode = (parent, mesh, paint, base = 0) => {
    const body = children(parent, "mesh")[0] || node("mesh", parent);
    const vertices = children(body, "vertices")[0] || node("vertices", body), triangles = children(body, "triangles")[0] || node("triangles", body);
    for (let i = 0; i < mesh.vertices.length; i += 3)
      node("vertex", vertices, {
        x: String(mesh.vertices[i]),
        y: String(mesh.vertices[i + 1]),
        z: String(mesh.vertices[i + 2])
      });
    for (let i = 0; i < mesh.triangles.length; i += 3) {
      const face = node("triangle", triangles, {
        v1: String(base + mesh.triangles[i]),
        v2: String(base + mesh.triangles[i + 1]),
        v3: String(base + mesh.triangles[i + 2])
      });
      if (paint[i / 3] && format !== "prusa3")
        face.setAttribute(
          format === "prusa" ? "slic3rpe:mmu_segmentation" : "paint_color",
          paint[i / 3]
        );
    }
  };
  if (format === "prusa3") metadata("Application", "PrusaSlicer-3.0.0-alpha12");
  else if (format === "prusa") {
    if (options.application) metadata("Application", options.application);
    metadata("slic3rpe:Version3mf", "1");
    metadata("slic3rpe:MmPaintingVersion", String(paintingVersion));
  } else {
    metadata("Application", "ThreeMFKit-0.1.1");
    metadata("ThreeMFKit:TargetSlicer", format);
    metadata("BambuStudio:3mfVersion", "1");
    metadata("BambuStudio:MmPaintingVersion", "1");
  }
  let id = 1;
  const plate = format === "bambu" || format === "orca" ? cfgNode("plate", config.documentElement) : void 0;
  if (plate) setting(plate, "plater_id", "1");
  for (const [index, object] of objects.entries()) {
    const parent = node("object", void 0, {
      name: object.name,
      type: "model"
    }), components = format === "prusa" ? void 0 : node("components", parent);
    const cfg = format === "prusa3" ? void 0 : cfgNode("object", config.documentElement);
    if (cfg) {
      setting(cfg, "name", object.name, "object");
      setting(cfg, "extruder", object.extruder, "object");
      for (const [k, v] of Object.entries(
        settingsFor(object.overrides, format)
      ))
        setting(cfg, k, String(v), "object");
    }
    const volumes = [];
    let vertexCount = 0, triangleCount = 0;
    for (const part of object.parts) {
      if (format === "prusa") {
        if (part.transform.determinant() < 0 && part.paint.some(Boolean))
          unsupported(
            "Mirrored painted parts cannot yet be converted to PrusaSlicer 2.x without changing their painted corners."
          );
        const mesh = transformMesh(part.mesh, part.transform);
        meshNode(parent, mesh, part.paint, vertexCount);
        const volume = cfgNode("volume", cfg, {
          firstid: String(triangleCount),
          lastid: String(triangleCount + mesh.triangles.length / 3 - 1)
        });
        setting(volume, "name", part.name);
        setting(volume, "volume_type", part.kind);
        setting(volume, "extruder", part.extruder);
        for (const [k, v] of Object.entries(
          settingsFor(part.overrides, format)
        ))
          setting(volume, k, String(v));
        vertexCount += mesh.vertices.length / 3;
        triangleCount += mesh.triangles.length / 3;
      } else {
        const meshId = id++, mesh = node("object", resources, {
          id: String(meshId),
          type: "model",
          ...format === "prusa3" ? {} : { name: part.name }
        });
        meshNode(mesh, part.mesh, part.paint);
        let partId = meshId;
        if (format === "prusa3") {
          partId = id++;
          const volume = node("object", resources, {
            id: String(partId),
            name: part.name
          });
          node("component", node("components", volume), {
            objectid: String(meshId)
          });
          volumes.push({
            id: partId,
            type: part.kind,
            volume_settings: {
              ...part.extruder === void 0 ? {} : { extruder: Number(part.extruder) },
              ...settingsFor(part.overrides, format)
            }
          });
          if (part.paint.some(Boolean))
            painting.push({
              id: partId,
              mmSegmentationFacetsVersion: paintingVersion,
              mmSegmentationFacets: part.paint.flatMap(
                (dividing, triangle) => dividing ? [{ triangle, dividing }] : []
              )
            });
        } else {
          const partCfg = cfgNode("part", cfg, {
            id: String(partId),
            subtype: Object.keys(ROLES).find(
              (key) => ROLES[key] === part.kind
            )
          });
          setting(partCfg, "name", part.name);
          setting(partCfg, "extruder", part.extruder);
          for (const [k, v] of Object.entries(
            settingsFor(part.overrides, format)
          ))
            setting(partCfg, k, String(v));
        }
        node("component", components, {
          objectid: String(partId),
          transform: transformText(part.transform)
        });
      }
    }
    const parentId = id++;
    parent.setAttribute("id", String(parentId));
    resources.appendChild(parent);
    if (cfg) {
      cfg.setAttribute("id", String(parentId));
      if (format === "prusa") cfg.setAttribute("instances_count", "1");
    }
    const item = node("item", build, {
      objectid: String(parentId),
      transform: transformText(object.transform)
    });
    if (!object.printable && format !== "prusa3")
      item.setAttribute("printable", "0");
    if (plate) {
      const instance = cfgNode("model_instance", plate);
      setting(instance, "object_id", String(parentId));
      setting(instance, "instance_id", "0");
    }
    objectConfigs.push({
      id: parentId,
      volumes,
      object_settings: {
        ...object.extruder === void 0 ? {} : { extruder: Number(object.extruder) },
        ...settingsFor(object.overrides, format)
      },
      ...!object.printable ? { instances: [{ ord: index, printable: false }] } : {}
    });
  }
  files[modelPath] = serialize(doc);
  if (format === "prusa3") {
    files[P3] = strToU8(
      JSON.stringify({
        project: { id: "00000000-0000-4000-8000-000000000001", version: 0 },
        objects: objectConfigs,
        config_containers: []
      })
    );
    if (painting.length) files[PAINT] = strToU8(JSON.stringify(painting));
    return files;
  }
  if (format === "prusa") {
    files["Metadata/Slic3r_PE_model.config"] = serialize(config);
    return files;
  }
  files["Metadata/model_settings.config"] = serialize(config);
  return files;
}

// src/targets.js
var TARGETS = Object.freeze([
  Object.freeze({
    id: "universal",
    name: "PrusaSlicer 2 / Bambu Studio",
    maxPaintRegions: 255,
    supportsVirtualExtruders: false,
    flatOnly: true
  }),
  Object.freeze({
    id: "prusa",
    name: "PrusaSlicer 2.x",
    maxPaintRegions: 255,
    supportsVirtualExtruders: true,
    virtualExtruderNote: "Requires PrusaSlicer 2.9.6 or later and Open Project. Use the physical slot count of the destination printer."
  }),
  Object.freeze({
    id: "prusa3",
    name: "PrusaSlicer 3.x",
    maxPaintRegions: 255,
    experimental: true,
    supportsVirtualExtruders: true,
    virtualExtruderNote: "Requires Open Project in PrusaSlicer 3.0.0-alpha12 and a native source project or prusa3Template with matching physical material slots. The selected template's configuration is copied.",
    note: "Experimental support for PrusaSlicer 3.x projects.",
    cleanNote: "Blend and gradient assignments become flat color regions. Their mixing recipes and printer configuration are discarded."
  }),
  Object.freeze({
    id: "bambu",
    name: "Bambu Studio",
    maxPaintRegions: 255,
    supportsVirtualExtruders: false
  }),
  Object.freeze({
    id: "orca",
    name: "OrcaSlicer 2.4.2 (paint slots 1\u201316)",
    maxPaintRegions: 16,
    supportsVirtualExtruders: false
  })
]);
var DEFAULT_TARGET = "prusa";
function getTarget(id) {
  const target = TARGETS.find(
    (t) => t.id === (id === "prusa2-bambu" ? "universal" : id)
  );
  if (!target) throw new Error("Unknown 3MF export target format.");
  return target;
}
var outputTarget = (format) => !format || format === "generic" ? DEFAULT_TARGET : getTarget(format).id;
var preferredPaintTarget = (format) => ["orca", "prusa3"].includes(format) ? format : "universal";
var paintTargets = ({ virtualExtruders = false } = {}) => TARGETS.filter(
  (t) => virtualExtruders ? t.supportsVirtualExtruders : ["universal", "orca", "prusa3"].includes(t.id)
);
var noticesForMode = (warnings, mode) => warnings.map(
  (w) => mode === "create" && w.startsWith("Material slots and virtual extruders are preserved.") ? "Color-region numbers are retained. Virtual-material recipes are discarded by clean export." : w
);
var SLICER_NAMES = Object.fromEntries(
  TARGETS.filter((t) => !t.flatOnly).map((t) => [t.id, t.name])
);

// src/update.ts
import { Matrix4 as Matrix43 } from "three";
var PROJECT_PATH = "Metadata/PrusaSlicer3_project.json";
var PAINT_PATH = "Metadata/Slic3r_facets_annotation.json";
var remove = (node) => node.parentNode?.removeChild(node);
var attr2 = (node, key) => Array.from(node.attributes).find(
  (a) => a.localName === key
);
var parse = (files, path) => JSON.parse(strFromU8(files[path]));
function updateFiles(document, source, changes, target, limits = {}) {
  const archive = new Archive(source.bytes, limits);
  const pathFor = (path, base = "") => archive.pathFor(path, base) || packagePath(path, base);
  const PROJECT = pathFor(PROJECT_PATH), PAINT2 = pathFor(PAINT_PATH);
  const configPath = pathFor(
    target === "prusa" ? "Metadata/Slic3r_PE_model.config" : "Metadata/model_settings.config"
  );
  const known = [
    "_rels/.rels",
    "[Content_Types].xml",
    "Metadata/Slic3r_PE.config",
    "Metadata/project_settings.config",
    "Metadata/Slic3r_PE_model.config",
    "Metadata/model_settings.config",
    PROJECT_PATH,
    PAINT_PATH,
    ...target === "prusa" ? [FULL_SPECTRUM_PATH] : []
  ];
  const keep = new Set(known.map((p) => pathFor(p)));
  const files = archive.extract(
    (path) => keep.has(path) || /\.rels$/i.test(path)
  );
  const droppedPaths = [], warnings = [];
  const defaults = packageFiles(source.modelPath);
  for (const path of ["_rels/.rels", "[Content_Types].xml"])
    if (!files[pathFor(path)]) {
      files[path] = defaults[path];
      warnings.push(
        "Missing package metadata was reconstructed: " + path + "."
      );
    }
  const changed = new Set(changes.map((c) => c.objectId));
  const replacements = document.objects.filter((o) => changed.has(o.id));
  const fresh = replacements.length ? createFiles({ ...document, objects: replacements }, target, limits) : void 0;
  const docs = /* @__PURE__ */ new Map();
  const model = (path) => {
    if (!docs.has(path)) {
      if (!files[path]) files[path] = archive.read(path);
      if (!files[path]) throw new Error(`Missing model resource ${path}.`);
      docs.set(path, xml(strFromU8(files[path])));
    }
    return docs.get(path);
  };
  const doc = model(source.modelPath), root = doc.documentElement, resources = child(root, "resources"), build = child(root, "build");
  const oldItems = children(build, "item");
  const replacementItems = /* @__PURE__ */ new Map(), idMap = /* @__PURE__ */ new Map();
  let freshDoc;
  if (fresh) {
    freshDoc = xml(strFromU8(fresh["3D/3dmodel.model"]));
    let id = 1;
    for (const element of Array.from(resources.childNodes))
      if (element.nodeType === 1 && /^\d+$/.test(element.getAttribute("id") || ""))
        id = Math.max(id, Number(element.getAttribute("id")) + 1);
    const incoming = children(
      child(freshDoc.documentElement, "resources"),
      "object"
    );
    for (const object of incoming)
      idMap.set(object.getAttribute("id"), String(id++));
    for (const object of incoming) {
      object.setAttribute("id", idMap.get(object.getAttribute("id")));
      for (const component of Array.from(
        object.getElementsByTagName("*")
      ))
        if (component.localName === "component")
          component.setAttribute(
            "objectid",
            idMap.get(component.getAttribute("objectid"))
          );
      resources.appendChild(doc.importNode(object, true));
    }
    const unit = {
      micron: 1e-3,
      millimeter: 1,
      centimeter: 10,
      inch: 25.4,
      foot: 304.8,
      meter: 1e3
    }[root.getAttribute("unit") || "millimeter"];
    children(child(freshDoc.documentElement, "build"), "item").forEach(
      (item, i) => {
        const copy = doc.importNode(item, true);
        copy.setAttribute(
          "objectid",
          idMap.get(item.getAttribute("objectid"))
        );
        if (unit !== 1) {
          const m = new Matrix43().makeScale(1 / unit, 1 / unit, 1 / unit).multiply(new Matrix43().fromArray(replacements[i].transform));
          copy.setAttribute(
            "transform",
            m.elements.filter((_, j) => j % 4 !== 3).join(" ")
          );
        }
        replacementItems.set(replacements[i].id, copy);
      }
    );
    root.setAttribute(
      "xmlns:slic3rpe",
      "http://schemas.slic3r.org/3mf/2017/06"
    );
    for (const incoming2 of children(
      freshDoc.documentElement,
      "metadata"
    ).filter(
      (m) => /:MmPaintingVersion$|^slic3rpe:Version3mf$/.test(
        m.getAttribute("name") || ""
      )
    )) {
      const old = children(root, "metadata").find(
        (m) => m.getAttribute("name") === incoming2.getAttribute("name")
      );
      if (old)
        old.textContent = String(
          Math.max(Number(old.textContent), Number(incoming2.textContent))
        );
      else root.insertBefore(doc.importNode(incoming2, true), resources);
    }
  }
  children(build, "item").forEach(remove);
  document.objects.forEach((object) => {
    const ref = source.refs.get(object.id);
    const item = replacementItems.get(object.id) || oldItems[ref?.buildIndex];
    if (!item)
      throw new Error("Cannot map the output model to its source build item.");
    build.appendChild(item);
  });
  const reachable = /* @__PURE__ */ new Map();
  const visit = (path, id, stack = /* @__PURE__ */ new Set()) => {
    const key = path + "#" + id;
    if (stack.has(key)) throw new Error("Cyclic component graph.");
    if (reachable.get(path)?.has(id)) return;
    const resource = children(
      child(model(path).documentElement, "resources"),
      "object"
    ).find((o) => o.getAttribute("id") === id);
    if (!resource)
      throw new Error("An updated model references a missing resource.");
    if (!reachable.has(path)) reachable.set(path, /* @__PURE__ */ new Set());
    reachable.get(path).add(id);
    for (const container of children(resource, "components"))
      for (const component of children(container, "component"))
        visit(
          attr2(component, "path") ? pathFor(attr2(component, "path").value, path) : path,
          component.getAttribute("objectid"),
          new Set(stack).add(key)
        );
  };
  for (const item of children(build, "item"))
    visit(
      attr2(item, "path") ? pathFor(attr2(item, "path").value, source.modelPath) : source.modelPath,
      item.getAttribute("objectid")
    );
  for (const file of Object.keys(files)) {
    if (/\.model$/i.test(file) && file !== source.modelPath && !reachable.has(file)) {
      droppedPaths.push(file);
      delete files[file];
    }
  }
  for (const [path, doc2] of docs) {
    const parent = child(doc2.documentElement, "resources");
    for (const object of children(parent, "object"))
      if (!reachable.get(path)?.has(object.getAttribute("id"))) remove(object);
    files[path] = serialize(doc2);
  }
  const newIds = new Set(idMap.values());
  const liveIds = new Set(
    [...reachable.get(source.modelPath) || []].filter(
      (id) => !newIds.has(id)
    )
  );
  if (target === "prusa3") {
    const data = parse(files, PROJECT), incoming = fresh ? parse(fresh, PROJECT_PATH) : { objects: [] };
    data.objects = data.objects.filter((o) => liveIds.has(String(o.id)));
    for (const object of incoming.objects) {
      object.id = Number(idMap.get(String(object.id)));
      for (const volume of object.volumes)
        volume.id = Number(idMap.get(String(volume.id)));
      data.objects.push(object);
    }
    for (const object of data.objects) {
      delete object.instances;
      const instances = children(build, "item").flatMap(
        (item, i) => item.getAttribute("objectid") === String(object.id) && !document.objects[i].printable ? [{ ord: i, printable: false }] : []
      );
      if (instances.length) object.instances = instances;
    }
    if (document.objects.map((o) => o.id).join("|") !== source.baseline.objects.map((o) => o.id).join("|")) {
      data.config_containers = [];
      warnings.push(
        "Bed configuration and any virtual-extruder recipes were discarded because the instance layout changed."
      );
    }
    files[PROJECT] = strToU8(JSON.stringify(data));
    const paint = files[PAINT2] ? parse(files, PAINT2).filter((p) => liveIds.has(String(p.id))) : [];
    if (fresh?.[PAINT_PATH])
      for (const p of parse(fresh, PAINT_PATH)) {
        p.id = Number(idMap.get(String(p.id)));
        paint.push(p);
      }
    if (paint.length) files[PAINT2] = strToU8(JSON.stringify(paint));
    else delete files[PAINT2];
  } else {
    const freshConfigPath = target === "prusa" ? "Metadata/Slic3r_PE_model.config" : "Metadata/model_settings.config";
    const cfg = files[configPath] ? xml(strFromU8(files[configPath])) : xml("<config/>");
    for (const object of children(cfg.documentElement, "object"))
      if (!liveIds.has(object.getAttribute("id"))) remove(object);
    if (fresh?.[freshConfigPath]) {
      const incoming = xml(strFromU8(fresh[freshConfigPath]));
      for (const object of children(incoming.documentElement, "object")) {
        object.setAttribute("id", idMap.get(object.getAttribute("id")));
        for (const part of children(object, "part"))
          part.setAttribute("id", idMap.get(part.getAttribute("id")));
        cfg.documentElement.appendChild(cfg.importNode(object, true));
      }
    }
    if (target !== "prusa") {
      for (const node of Array.from(cfg.documentElement.childNodes))
        if (node.nodeType === 1 && node.localName !== "object") remove(node);
    }
    files[configPath] = serialize(cfg);
  }
  for (const path of archive.names)
    if (!files[path] && !droppedPaths.includes(path)) droppedPaths.push(path);
  for (const path of Object.keys(files).filter((p) => /\.rels$/i.test(p))) {
    const rels = xml(strFromU8(files[path])), base = path.toLowerCase() === "_rels/.rels" ? "" : path.slice(0, path.toLowerCase().lastIndexOf("_rels/")) + "x";
    for (const relation of children(rels.documentElement, "Relationship"))
      if (relation.getAttribute("TargetMode") === "External" || !files[pathFor(relation.getAttribute("Target") || "", base)])
        remove(relation);
    files[path] = serialize(rels);
  }
  const ct = xml(strFromU8(files[pathFor("[Content_Types].xml")]));
  for (const entry of children(ct.documentElement, "Override"))
    if (!files[pathFor(entry.getAttribute("PartName") || "")]) remove(entry);
  for (const [extension, type] of [
    ["config", "application/octet-stream"],
    ["json", "application/json"]
  ])
    if (!children(ct.documentElement, "Default").some(
      (n) => n.getAttribute("Extension") === extension
    )) {
      const n = ct.createElementNS(ct.documentElement.namespaceURI, "Default");
      n.setAttribute("Extension", extension);
      n.setAttribute("ContentType", type);
      ct.documentElement.appendChild(n);
    }
  files["[Content_Types].xml"] = serialize(ct);
  warnings.push(
    "Edited models were rebuilt without inherited overrides or unknown annotations. Unchanged reachable models retain their metadata."
  );
  if (droppedPaths.length)
    warnings.push(
      "Unscoped sidecars and generated caches were discarded because their dependencies cannot be verified."
    );
  return { files, warnings, droppedPaths };
}

// src/vendor/prusa-fdm-mixer/color.ts
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16)
  };
}
function rgbToHex(rgb) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return "#" + c(rgb.r) + c(rgb.g) + c(rgb.b);
}
function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  const x = Math.max(0, Math.min(1, c));
  const v = x <= 31308e-7 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return v * 255;
}
function rgbToXyz(rgb) {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return {
    x: r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    y: r * 0.2126729 + g * 0.7151522 + b * 0.072175,
    z: r * 0.0193339 + g * 0.119192 + b * 0.9503041
  };
}
function xyzToLab(x, y, z) {
  const xn = 0.95047;
  const yn = 1;
  const zn = 1.08883;
  const f = (t) => t > 8856e-6 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(x / xn);
  const fy = f(y / yn);
  const fz = f(z / zn);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}
function labToXyz(lab) {
  const xn = 0.95047;
  const yn = 1;
  const zn = 1.08883;
  const fy = (lab.L + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;
  const finv = (t) => Math.pow(t, 3) > 8856e-6 ? Math.pow(t, 3) : (t - 16 / 116) / 7.787;
  return { x: xn * finv(fx), y: yn * finv(fy), z: zn * finv(fz) };
}
function xyzToRgb(x, y, z) {
  return {
    r: linearToSrgb(x * 3.2404542 + y * -1.5371385 + z * -0.4985314),
    g: linearToSrgb(x * -0.969266 + y * 1.8760108 + z * 0.041556),
    b: linearToSrgb(x * 0.0556434 + y * -0.2040259 + z * 1.0572252)
  };
}
function hexToLab(hex) {
  const rgb = hexToRgb(hex);
  const xyz = rgbToXyz(rgb);
  return xyzToLab(xyz.x, xyz.y, xyz.z);
}
function labToHex(lab) {
  const xyz = labToXyz(lab);
  const rgb = xyzToRgb(xyz.x, xyz.y, xyz.z);
  return rgbToHex(rgb);
}
function chroma(lab) {
  return Math.hypot(lab.a, lab.b);
}

// src/vendor/prusa-fdm-mixer/yule-nielsen.ts
function yuleNielsenMix(parts, n = 3) {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of parts) {
    const rgb = hexToRgb(p.hex);
    r += Math.pow(srgbToLinear(rgb.r), 1 / n) * p.ratio;
    g += Math.pow(srgbToLinear(rgb.g), 1 / n) * p.ratio;
    b += Math.pow(srgbToLinear(rgb.b), 1 / n) * p.ratio;
  }
  return {
    r: linearToSrgb(Math.pow(Math.max(0, r), n)),
    g: linearToSrgb(Math.pow(Math.max(0, g), n)),
    b: linearToSrgb(Math.pow(Math.max(0, b), n))
  };
}

// src/vendor/prusa-fdm-mixer/prusa-fdm-mixer.ts
var DEFAULT_V7_PARAMS = {
  YN_N: 3,
  L_BASE_SLOPE: -0.0477,
  L_BASE_INTERCEPT: -2.112,
  L_KNEE: 15,
  L_KNEE_SLOPE: -0.06,
  C_SLOPE: 0.278,
  C_INTERCEPT: -15.58,
  HUE_CENTER: 210,
  HUE_FALLOFF: 30,
  HUE_PEAK: 10.38,
  PEAK_STRENGTH: 1.375
};
function mixFilamentsWithParams(parts, params) {
  if (parts.length === 0) {
    throw new Error("mixFilaments: parts must not be empty");
  }
  const total = parts.reduce((s, p) => s + p.ratio, 0);
  if (total <= 0) {
    throw new Error("mixFilaments: ratios must sum to a positive value");
  }
  const normalized = parts.map((p) => {
    if (p.ratio < 0) {
      throw new Error(`mixFilaments: negative ratio for ${p.hex}`);
    }
    return { hex: p.hex, ratio: p.ratio / total };
  });
  for (const p of normalized) {
    if (p.ratio >= 0.9999) {
      const lab2 = hexToLab(p.hex);
      const rgb2 = hexToRgb(p.hex);
      return { hex: rgbToHex(rgb2), lab: lab2, rgb: rgb2 };
    }
  }
  const baseRgb = yuleNielsenMix(normalized, params.YN_N);
  const baseLab = hexToLab(rgbToHex(baseRgb));
  const Ls = normalized.map((p) => hexToLab(p.hex).L);
  const lGap = Math.max(...Ls) - Math.min(...Ls);
  const N = normalized.length;
  const ratioProduct = normalized.reduce((s, p) => s * p.ratio, 1);
  const wRaw = Math.pow(N, N) * ratioProduct;
  const w = Math.max(0, Math.min(1, wRaw)) * params.PEAK_STRENGTH;
  let dL = params.L_BASE_SLOPE * lGap + params.L_BASE_INTERCEPT;
  if (lGap > params.L_KNEE) {
    dL += params.L_KNEE_SLOPE * (lGap - params.L_KNEE);
  }
  const newL = baseLab.L + dL * w;
  const baseC = chroma(baseLab);
  let aOut = baseLab.a;
  let bOut = baseLab.b;
  if (baseC >= 0.01) {
    const targetDC = (params.C_SLOPE * newL + params.C_INTERCEPT) * w;
    const newC2 = Math.max(0, baseC + targetDC);
    const scale = newC2 / baseC;
    aOut = baseLab.a * scale;
    bOut = baseLab.b * scale;
  }
  const newC = Math.hypot(aOut, bOut);
  if (newC >= 1) {
    const predHue = (Math.atan2(bOut, aOut) * 180 / Math.PI + 360) % 360;
    const distFromCenter = Math.abs(predHue - params.HUE_CENTER);
    const inBand = distFromCenter < params.HUE_FALLOFF;
    if (inBand) {
      const hCorr = params.HUE_PEAK * (1 - distFromCenter / params.HUE_FALLOFF) * w;
      const newHueRad = (predHue + hCorr) % 360 * Math.PI / 180;
      aOut = newC * Math.cos(newHueRad);
      bOut = newC * Math.sin(newHueRad);
    }
  }
  const lab = { L: newL, a: aOut, b: bOut };
  const hex = labToHex(lab);
  const rgb = hexToRgb(hex);
  return { hex, lab, rgb };
}

// src/vendor/prusa-fdm-mixer/delta-e.ts
function deltaE2000(lab1, lab2) {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;
  const avgL = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const avgCp = (C1p + C2p) / 2;
  const h1p = (Math.atan2(b1, a1p) * 180 / Math.PI + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) * 180 / Math.PI + 360) % 360;
  let avgHp;
  if (Math.abs(h1p - h2p) > 180) avgHp = (h1p + h2p + 360) / 2;
  else avgHp = (h1p + h2p) / 2;
  const T = 1 - 0.17 * Math.cos((avgHp - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * avgHp * Math.PI / 180) + 0.32 * Math.cos((3 * avgHp + 6) * Math.PI / 180) - 0.2 * Math.cos((4 * avgHp - 63) * Math.PI / 180);
  let dhp = h2p - h1p;
  if (Math.abs(dhp) > 180) dhp -= dhp > 0 ? 360 : -360;
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2 * Math.PI / 180);
  const SL = 1 + 0.015 * Math.pow(avgL - 50, 2) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;
  const dTheta = 30 * Math.exp(-Math.pow((avgHp - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const RT = -RC * Math.sin(2 * dTheta * Math.PI / 180);
  return Math.sqrt(
    Math.pow(dLp / SL, 2) + Math.pow(dCp / SC, 2) + Math.pow(dHp / SH, 2) + RT * (dCp / SC) * (dHp / SH)
  );
}

// src/mix.ts
function normalizeMix(components, toolCount = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(toolCount) || toolCount < 1)
    throw new Error("toolCount must be a positive safe integer.");
  if (!Array.isArray(components) || !components.length)
    throw new Error(
      "A mix must contain components with a finite positive sum."
    );
  const weights = /* @__PURE__ */ new Map();
  for (const p of components) {
    if (!p || !Number.isSafeInteger(p.extruder) || p.extruder < 1 || p.extruder > toolCount || !Number.isFinite(p.ratio) || p.ratio < 0)
      throw new Error(
        "Mix components require available tools and finite, nonnegative ratios."
      );
    if (p.ratio > 0)
      weights.set(p.extruder, (weights.get(p.extruder) ?? 0) + p.ratio);
  }
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  if (!(total > 0) || !Number.isFinite(total))
    throw new Error("A mix must have a finite positive sum.");
  return [...weights].sort(([a], [b]) => a - b).map(([extruder, ratio]) => ({ extruder, ratio: ratio / total })).filter((p) => p.ratio > 0);
}
function mixUnits(percentageStep) {
  const units = Math.round(100 / percentageStep);
  if (!Number.isFinite(percentageStep) || percentageStep <= 0 || percentageStep > 100 || !Number.isSafeInteger(units) || Math.abs(units * percentageStep - 100) > 1e-9)
    throw new Error(
      "percentageStep must be positive and divide 100 exactly (for example 5, 1 or 2.5)."
    );
  return units;
}
function quantizeMix(components, percentageStep = 5) {
  const units = mixUnits(percentageStep), parts = normalizeMix(components);
  const exact = parts.map((p) => p.ratio * units), counts = exact.map(Math.floor);
  const order = exact.map((x, i) => ({ i, remainder: x - counts[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  const remaining = units - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining; i++) counts[order[i].i]++;
  return parts.flatMap(
    (p, i) => counts[i] ? [{ extruder: p.extruder, ratio: counts[i] / units }] : []
  );
}
function visitMixGrid(toolCount, maxContributors, units, visit) {
  const tools = [], counts = [];
  function composition(remaining, index) {
    if (index === tools.length - 1) {
      counts[index] = remaining;
      visit(
        tools.map((extruder, i) => ({ extruder, ratio: counts[i] / units }))
      );
      return;
    }
    for (let n = 1; n <= remaining - (tools.length - index - 1); n++) {
      counts[index] = n;
      composition(remaining - n, index + 1);
    }
  }
  function support(next) {
    if (tools.length) composition(units, 0);
    if (tools.length >= Math.min(maxContributors, units)) return;
    for (let id = next; id <= toolCount; id++) {
      tools.push(id);
      support(id + 1);
      tools.pop();
    }
  }
  support(1);
}
function optimizeMix(toolCount, objective, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new Error("Invalid continuous mix options.");
  const {
    maxContributors: k = Math.min(3, toolCount),
    tolerance = 1e-6,
    seedPercentageStep = 10,
    startsPerSupport: starts = 4,
    maxEvaluations: budget = 1e6
  } = options;
  const seedUnits = mixUnits(seedPercentageStep);
  if (!Number.isSafeInteger(toolCount) || toolCount < 1 || !Number.isSafeInteger(k) || k < 1 || k > toolCount)
    throw new Error(
      "maxContributors must be an integer from 1 through toolCount."
    );
  if (typeof objective !== "function" || !Number.isFinite(tolerance) || tolerance <= 0 || tolerance >= 1 || !Number.isSafeInteger(starts) || starts < 1 || !Number.isSafeInteger(budget) || budget < 1)
    throw new Error(
      "Invalid continuous mix objective, tolerance, startsPerSupport or maxEvaluations."
    );
  let evaluations = 0;
  let best;
  const score = (components) => {
    if (++evaluations > budget)
      throw new Error(
        "Continuous mix search exceeds maxEvaluations. Increase the budget or reduce toolCount/maxContributors."
      );
    const canonical = normalizeMix(components, toolCount);
    const error = objective(canonical.map((p) => ({ ...p })));
    if (!Number.isFinite(error))
      throw new Error("The mix objective must return a finite error.");
    if (!best || error < best.error) best = { components: canonical, error };
    return error;
  };
  const seeds = /* @__PURE__ */ new Map();
  visitMixGrid(toolCount, k, Math.max(seedUnits, k), (parts) => {
    const key = parts.map((p) => p.extruder).join(","), error = score(parts);
    const ranked = seeds.get(key) ?? [];
    ranked.push({ parts, error });
    ranked.sort((a, b) => a.error - b.error);
    if (ranked.length > starts) ranked.pop();
    seeds.set(key, ranked);
  });
  for (const ranked of seeds.values())
    for (const seed of ranked) {
      let parts = seed.parts.map((p) => ({ ...p })), error = seed.error;
      for (let step = 1 / Math.max(seedUnits, k) / 2; step >= tolerance; ) {
        let next, nextError = error;
        for (let i = 0; i < parts.length; i++)
          for (let j = 0; j < parts.length; j++) {
            if (i === j || parts[j].ratio < step) continue;
            const candidate = parts.map((p) => ({ ...p }));
            candidate[i].ratio += step;
            candidate[j].ratio -= step;
            if (candidate[j].ratio < 1e-14) candidate[j].ratio = 0;
            const e = score(candidate);
            if (e < nextError - 1e-12) {
              next = candidate;
              nextError = e;
            }
          }
        if (next) {
          parts = next;
          error = nextError;
        } else step /= 2;
      }
    }
  return {
    ...best,
    components: best.components.map((p) => ({ ...p })),
    evaluations,
    guarantee: "approximate"
  };
}

// src/color-mix.ts
var validColor = (color) => typeof color === "string" && /^#[\da-f]{6}$/i.test(color);
var prusaColorMixPredictor = (parts) => {
  if (!Array.isArray(parts) || !parts.length || parts.some(
    (p) => !p || !validColor(p.hex) || !Number.isFinite(p.ratio) || p.ratio < 0
  ))
    throw new Error(
      "Prusa prediction requires #RRGGBB colors and finite, nonnegative ratios."
    );
  const active = parts.filter((p) => p.ratio > 0);
  const total = active.reduce((sum, p) => sum + p.ratio, 0);
  if (!(total > 0) || !Number.isFinite(total))
    throw new Error("Prusa prediction requires a finite positive ratio sum.");
  return mixFilamentsWithParams(
    active.map((p) => ({ ...p })),
    {
      ...DEFAULT_V7_PARAMS,
      HUE_PEAK: DEFAULT_V7_PARAMS.HUE_PEAK / DEFAULT_V7_PARAMS.PEAK_STRENGTH
    }
  ).hex;
};
function candidateCount(n, k, units, budget) {
  let total = 0, supports = 1, compositions = 1;
  for (let s = 1; s <= Math.min(n, k, units); s++) {
    supports = supports * (n - s + 1) / s;
    if (s > 1) compositions = compositions * (units - s + 1) / (s - 1);
    total += supports * compositions;
    if (total > budget + 1e-6 || !Number.isFinite(total))
      throw new Error(
        "Color mix search exceeds maxCandidates. Increase the budget, use larger percentageStep, or reduce tools/maxContributors."
      );
  }
  return Math.round(total);
}
function createColorMixSolver(physicalColors, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new Error("Invalid color mix options.");
  if (!Array.isArray(physicalColors) || !physicalColors.length || physicalColors.some((c) => !validColor(c)))
    throw new Error("physicalColors must contain one #RRGGBB color per tool.");
  const colors = physicalColors.map((c) => c.toUpperCase()), n = colors.length;
  const {
    maxContributors: k = Math.min(3, n),
    percentageStep = 5,
    maxAdditionalDeltaE: allowance = 2,
    preferNeutral: neutral = true,
    predictor = prusaColorMixPredictor,
    maxCandidates: budget = 1e6
  } = options;
  const units = mixUnits(percentageStep);
  if (!Number.isSafeInteger(k) || k < 1 || k > n)
    throw new Error(
      "maxContributors must be an integer from 1 through the number of physicalColors."
    );
  if (!Number.isFinite(allowance) || allowance < 0 || typeof neutral !== "boolean" || typeof predictor !== "function" || !Number.isSafeInteger(budget) || budget < 1)
    throw new Error(
      "Invalid maxAdditionalDeltaE, preferNeutral, predictor or maxCandidates."
    );
  const count = candidateCount(n, k, units, budget);
  const predict = (parts) => {
    const normalized = normalizeMix(parts, n);
    const hex = predictor(
      normalized.map((p) => ({
        hex: colors[p.extruder - 1],
        ratio: p.ratio,
        extruder: p.extruder
      }))
    );
    if (!validColor(hex))
      throw new Error(
        "The color mix predictor must return a #RRGGBB display color."
      );
    return hex.toUpperCase();
  };
  const inputChroma = colors.map((c) => chroma(hexToLab(c)));
  const candidates = [];
  visitMixGrid(n, k, units, (components) => {
    const color = predict(components);
    candidates.push({
      components,
      color,
      lab: hexToLab(color),
      chromaticShare: components.reduce(
        (sum, p) => sum + (inputChroma[p.extruder - 1] > 5 ? p.ratio : 0),
        0
      )
    });
  });
  const solved = /* @__PURE__ */ new Map();
  const clone2 = (result) => ({
    ...result,
    components: result.components.map((p) => ({ ...p }))
  });
  return {
    candidateCount: count,
    predict,
    solve(desiredColor) {
      if (!validColor(desiredColor))
        throw new Error("desiredColor must be a #RRGGBB color.");
      desiredColor = desiredColor.toUpperCase();
      const cached = solved.get(desiredColor);
      if (cached) return clone2(cached);
      const desired = hexToLab(desiredColor), preferNeutral = neutral && chroma(desired) < 5;
      const errors = candidates.map((c) => deltaE2000(desired, c.lab));
      let minimum = Infinity;
      for (const error of errors) if (error < minimum) minimum = error;
      let selected = -1;
      for (let i = 0; i < candidates.length; i++) {
        if (errors[i] > minimum + allowance + 1e-9) continue;
        if (selected < 0) {
          selected = i;
          continue;
        }
        const a = candidates[i], b = candidates[selected];
        const size = a.components.length - b.components.length;
        const chromatic = preferNeutral ? a.chromaticShare - b.chromaticShare : 0;
        if (size < 0 || size === 0 && (chromatic < -1e-9 || Math.abs(chromatic) <= 1e-9 && errors[i] < errors[selected] - 1e-9))
          selected = i;
      }
      const result = {
        components: candidates[selected].components,
        predictedColor: candidates[selected].color,
        colorDifference: errors[selected],
        bestColorDifference: minimum
      };
      if (solved.size >= 256) solved.clear();
      solved.set(desiredColor, result);
      return clone2(result);
    }
  };
}
function solveColorMix(desiredColor, physicalColors, options = {}) {
  return createColorMixSolver(physicalColors, options).solve(desiredColor);
}

// src/prusa-mix.ts
function planPrusaMixSequence(components, layerCount) {
  if (layerCount !== void 0 && (!Number.isSafeInteger(layerCount) || layerCount < 1))
    throw new Error("layerCount must be a positive safe integer.");
  const parts = normalizeMix(components);
  if (parts.length > 3)
    throw new Error("Prusa layer mixes support at most three contributors.");
  let counts = [1];
  if (parts.length > 1) {
    for (let length = 2; length <= 64; length++) {
      counts = parts.map((p) => Math.max(1, Math.round(p.ratio * length)));
      const total2 = counts.reduce((a, b) => a + b, 0);
      if (parts.every((p, i) => Math.abs(counts[i] / total2 - p.ratio) <= 0.03))
        break;
    }
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const divisor = counts.reduce(gcd);
    counts = counts.map((c) => c / divisor);
  }
  const total = counts.reduce((a, b) => a + b, 0), emitted = parts.map(() => 0), cycle = [];
  for (let slot = 0; slot < total; slot++) {
    let best = 0, deficit = -Infinity;
    for (let i = 0; i < parts.length; i++) {
      const d = (slot + 1) * counts[i] / total - emitted[i];
      if (d > deficit) {
        best = i;
        deficit = d;
      }
    }
    emitted[best]++;
    cycle.push(parts[best].extruder);
  }
  let run = 1, longest = 1, maxGap = 1;
  for (let i = 1; i < total * 2; i++) {
    run = cycle[i % total] === cycle[(i - 1) % total] ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  for (const p of parts) {
    const positions = cycle.flatMap((id, i) => id === p.extruder ? [i] : []);
    for (let i = 0; i < positions.length; i++)
      maxGap = Math.max(
        maxGap,
        (i + 1 < positions.length ? positions[i + 1] : positions[0] + total) - positions[i]
      );
  }
  const actual = parts.map((p, i) => ({
    extruder: p.extruder,
    ratio: counts[i] / total
  }));
  const result = {
    cycle,
    components: actual,
    maxRatioError: Math.max(
      ...actual.map((p, i) => Math.abs(p.ratio - parts[i].ratio))
    ),
    maxRunLayers: parts.length === 1 ? null : longest,
    maxContributorGapLayers: maxGap
  };
  if (layerCount !== void 0) {
    const periods = Math.floor(layerCount / total), tail = layerCount % total;
    result.printedComponents = parts.map((p, i) => ({
      extruder: p.extruder,
      ratio: (periods * counts[i] + cycle.slice(0, tail).filter((id) => id === p.extruder).length) / layerCount
    }));
  }
  return result;
}

// src/virtual-extruders.ts
var VIRTUAL_EXTRUDER_PALETTE = Object.freeze([
  Object.freeze({ name: "Cyan", color: "#00FFFF" }),
  Object.freeze({ name: "Magenta", color: "#FF00FF" }),
  Object.freeze({ name: "Yellow", color: "#FFFF00" }),
  Object.freeze({ name: "White", color: "#FFFFFF" }),
  Object.freeze({ name: "Black", color: "#000000" }),
  Object.freeze({ name: "Red", color: "#FF0000" }),
  Object.freeze({ name: "Green", color: "#00FF00" }),
  Object.freeze({ name: "Blue", color: "#0000FF" })
]);
var validColor2 = (color) => typeof color === "string" && /^#[\da-f]{6}$/i.test(color);
var copyComponents = (parts) => parts.map((p) => ({ ...p }));
function recipe(parts, count) {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 3 || parts.some(
    (p) => !p || !Number.isInteger(p.extruder) || p.extruder < 1 || p.extruder > count || !Number.isFinite(p.ratio) || p.ratio < 0
  ))
    throw new Error(
      "Virtual recipes require 1\u20133 components with available physical tools and finite, nonnegative ratios."
    );
  const active = /* @__PURE__ */ new Map();
  for (const p of parts)
    if (p.ratio > 0)
      active.set(p.extruder, (active.get(p.extruder) || 0) + p.ratio);
  const total = [...active.values()].reduce((a, b) => a + b, 0);
  if (!(total > 0) || !Number.isFinite(total))
    throw new Error("Virtual recipe ratios must have a finite positive sum.");
  const normalized = [...active].map(([extruder, ratio]) => ({
    extruder,
    ratio: ratio / total
  }));
  return normalized.length === 1 ? [
    { extruder: normalized[0].extruder, ratio: 0.5 },
    { extruder: normalized[0].extruder, ratio: 0.5 }
  ] : normalized;
}
function planVirtualExtruders(document, options, limits = {}) {
  if (!options || typeof options !== "object" || !Number.isInteger(options.physicalExtruderCount) || options.physicalExtruderCount < 2 || options.physicalExtruderCount > 8)
    throw new Error(
      "Virtual extruder export requires physicalExtruderCount from 2 through 8. A single physical tool cannot mix colors."
    );
  const count = options.physicalExtruderCount;
  const maxContributors = options.maxContributors === void 0 ? Math.min(3, count) : options.maxContributors;
  if (!Number.isInteger(maxContributors) || maxContributors < 1 || maxContributors > Math.min(3, count))
    throw new Error(
      "Virtual maxContributors must be from 1 through 3 and not exceed the physical tool count."
    );
  const colors = options.physicalColors === void 0 ? VIRTUAL_EXTRUDER_PALETTE.slice(0, count).map((p) => p.color) : options.physicalColors;
  if (!Array.isArray(colors) || colors.length !== count || colors.some((c) => !validColor2(c)))
    throw new Error(
      "physicalColors must contain one #RRGGBB color per physical extruder."
    );
  if (!Array.isArray(document.palette) || document.palette.length > 255 || document.palette.some((c) => !validColor2(c)))
    throw new Error("Invalid region display palette.");
  const regions = /* @__PURE__ */ new Set();
  const add = (region) => {
    if (!Number.isInteger(region) || region < 1 || region > 255)
      throw new Error(
        "Invalid source color region for virtual extruder export."
      );
    regions.add(region);
  };
  const collect = (tree) => {
    if ("region" in tree) {
      if (tree.region) add(tree.region);
    } else tree.children.forEach(collect);
  };
  const budgets = processingLimits(limits), budget = { nodes: 0 };
  for (const object of document.objects) {
    add(object.defaultRegion ?? 1);
    for (const part of object.parts) {
      add(part.defaultRegion ?? object.defaultRegion ?? 1);
      for (const tree of part.paint) {
        paintStats(tree, budgets, budget);
        collect(tree);
      }
    }
  }
  if (regions.size > 255 - count)
    throw new Error(
      `Virtual extruder export supports at most ${255 - count} used regions with ${count} physical tools (255 material IDs total).`
    );
  const overrides = /* @__PURE__ */ new Map();
  if (options.recipes !== void 0) {
    if (!Array.isArray(options.recipes))
      throw new Error("recipes must be an array of region recipes.");
    for (const item of options.recipes) {
      if (!item || !regions.has(item.region) || overrides.has(item.region))
        throw new Error(
          "Recipe overrides must reference distinct used source regions."
        );
      overrides.set(item.region, recipe(item.components, count));
      if (normalizeMix(overrides.get(item.region), count).length > maxContributors)
        throw new Error("Recipe overrides must not exceed maxContributors.");
    }
  }
  const physicalExtruders = colors.map((color, i) => ({
    id: i + 1,
    name: options.physicalColors ? `Tool ${i + 1}` : VIRTUAL_EXTRUDER_PALETTE[i].name,
    color: color.toUpperCase()
  }));
  const solver = createColorMixSolver(colors, { ...options, maxContributors });
  const warnings = [
    "Open this ColorMix 3MF with File \u2192 Open Project in the destination PrusaSlicer version. Importing geometry alone discards virtual extruders.",
    `Recipes reference ${count} physical tools. Select a printer with those slots before opening the project and load the intended filaments in the same order; display swatches do not automatically recalculate recipes.`
  ];
  if (!options.physicalColors)
    warnings.push(
      "Starting recipes assume reference CMYWKRGB swatches, truncated to the physical tool count. These are not measured filament colors; edit the recipes in PrusaSlicer or supply physicalColors for better predictions."
    );
  return {
    physicalExtruders,
    regions: [...regions].sort((a, b) => a - b).map((region, i) => {
      const color = (document.palette[region - 1] ?? DEFAULT_COLORS[(region - 1) % DEFAULT_COLORS.length]).toUpperCase();
      const desired = hexToLab(color);
      const explicit = overrides.get(region);
      let selected = explicit ? void 0 : solver.solve(color);
      if (explicit) {
        const components = normalizeMix(explicit, count), predictedColor = solver.predict(components);
        const difference = deltaE2000(desired, hexToLab(predictedColor));
        selected = {
          components,
          predictedColor,
          colorDifference: difference,
          bestColorDifference: difference
        };
      }
      const layerMix = planPrusaMixSequence(selected.components);
      const scheduledColor = solver.predict(layerMix.components);
      return {
        region,
        virtualExtruder: count + i + 1,
        color,
        predictedColor: selected.predictedColor,
        components: copyComponents(recipe(selected.components, count)),
        colorDifference: selected.colorDifference,
        bestColorDifference: selected.bestColorDifference,
        layerMix,
        scheduledColor,
        scheduledColorDifference: deltaE2000(
          desired,
          hexToLab(scheduledColor)
        )
      };
    }),
    warnings
  };
}
function virtualizeDocument(document, plan) {
  const ids = new Map(plan.regions.map((r) => [r.region, r.virtualExtruder]));
  const mapped = (region) => {
    const id = ids.get(region);
    if (id === void 0)
      throw new Error("Missing virtual extruder for a source region.");
    return id;
  };
  const paint = (tree) => "region" in tree ? { region: tree.region ? mapped(tree.region) : 0 } : { ...tree, children: tree.children.map(paint) };
  return {
    ...document,
    palette: [
      ...plan.physicalExtruders.map((p) => p.color),
      ...plan.regions.map((p) => p.predictedColor)
    ],
    objects: document.objects.map((object) => ({
      ...object,
      defaultRegion: mapped(object.defaultRegion ?? 1),
      parts: object.parts.map((part) => ({
        ...part,
        defaultRegion: mapped(part.defaultRegion ?? object.defaultRegion ?? 1),
        paint: part.paint.map(paint)
      }))
    }))
  };
}
function attachVirtualExtruders(files, plan, prusa3Container) {
  const virtual_extruders = plan.regions.map((r) => ({
    id: r.virtualExtruder,
    kind: "fullspectrum",
    color: r.predictedColor,
    components: r.components
  }));
  if (prusa3Container) {
    const path = "Metadata/PrusaSlicer3_project.json";
    const data = JSON.parse(strFromU8(files[path]));
    data.config_containers = [{ ...prusa3Container, virtual_extruders }];
    files[path] = strToU8(JSON.stringify(data));
    return;
  }
  files[FULL_SPECTRUM_PATH] = strToU8(
    JSON.stringify({
      version: 1,
      physical_extruders: plan.physicalExtruders.map(({ id, color }) => ({
        id,
        color
      })),
      virtual_extruders
    })
  );
}
function prusa3VirtualContainer(bytes, plan, index = 0, limits = {}) {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new Error("prusa3ConfigContainer must be a nonnegative integer.");
  const archive = new Archive(bytes, limits);
  const path = archive.pathFor("Metadata/PrusaSlicer3_project.json");
  const data = path ? JSON.parse(strFromU8(archive.read(path))) : {};
  const container = data.config_containers?.[index];
  const hw = container?.preset?.hw_config;
  const config = container?.configuration;
  const record = (v) => v && typeof v === "object" && !Array.isArray(v);
  if (!hw || hw.technology !== "fff" || !hw.config_id || !Number.isSafeInteger(hw.tool_count) || hw.tool_count < 1 || !record(hw.tools) || !Array.isArray(container.preset.materials) || ![
    "printer_settings",
    "print_settings",
    "filament_settings",
    "project_settings",
    "toolprint_settings"
  ].every((key) => record(config?.[key])))
    throw new Error(
      "PrusaSlicer 3.x virtual export requires a native FFF configuration container in prusa3Template (or the source document)."
    );
  let count = hw.tool_count;
  for (const [key, value] of Object.entries(hw.tools)) {
    if (!/^\d+$/.test(key)) continue;
    const slots = value?.feeder?.slot_count;
    if (slots === void 0) continue;
    if (!Number.isSafeInteger(slots) || slots < 1)
      throw new Error("The Prusa 3 template has an invalid feeder slot count.");
    count += slots - 1;
  }
  if (count !== plan.physicalExtruders.length || container.preset.materials.length !== count)
    throw new Error(
      "physicalExtruderCount must match the Prusa 3 template's physical material slots."
    );
  const copied = structuredClone({
    preset: container.preset,
    configuration: config
  });
  copied.configuration.project_settings.extruder_colour = plan.physicalExtruders.map((p) => p.color);
  return { ...copied, beds: [{ position_x: 0, position_y: 0 }] };
}

// src/document.ts
var identity = () => new Matrix44().toArray();
var sources = /* @__PURE__ */ new WeakMap();
var equal = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b))
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => equal(value, b[index]));
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
};
var clone = (v) => structuredClone(v);
function readDocument(input, name = "Model.3mf", progress = (_message) => {
}, options = {}) {
  const bytes = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input.slice(0));
  const data = readDocumentData(bytes, name, progress, options);
  const refs = new Map(data.objects.map((o) => [o.id, clone(o.sourceRef)]));
  for (const object of data.objects) {
    delete object.sourceRef;
    for (const part of object.parts) delete part.sourceRef;
  }
  const document = {
    schemaVersion: 1,
    name,
    objects: data.objects,
    palette: data.palette,
    format: data.format,
    warnings: data.warnings,
    sourceTriangles: data.sourceTriangles,
    paintedTriangles: data.paintedTriangles
  };
  sources.set(document, {
    bytes,
    baseline: clone(document),
    refs,
    modelPath: data.source.modelPath,
    limits: data.limits
  });
  return document;
}
function editDocument(document) {
  const result = clone(document), source = sources.get(document);
  if (source) sources.set(result, source);
  return result;
}
function originalBytes(document) {
  return sources.get(document)?.bytes.slice();
}
function createDocument(objects, palette = [], name = "Model.3mf") {
  return {
    schemaVersion: 1,
    name,
    objects: clone(objects),
    palette: [...palette],
    format: "generic",
    warnings: [],
    sourceTriangles: 0,
    paintedTriangles: 0
  };
}
function replacePart(document, objectId, partId, replacements) {
  const result = editDocument(document), object = result.objects.find((o) => o.id === objectId);
  const index = object?.parts.findIndex((p) => p.id === partId) ?? -1;
  if (!object || index < 0)
    throw new Error("The replaced part does not belong to this object.");
  if (replacements.some((p) => p.id === partId) || new Set(replacements.map((p) => p.id)).size !== replacements.length)
    throw new Error("Replacement parts require new unique IDs.");
  const previous = object.parts[index];
  const next = clone(replacements);
  for (const part of next) {
    part.derivedFrom = [...previous.derivedFrom || [previous.id]];
    part.mesh.id = part.id + "/mesh";
  }
  object.parts.splice(index, 1, ...next);
  return result;
}
function compareDocument(document) {
  const source = sources.get(document);
  if (!source)
    return document.objects.map((o) => ({
      objectId: o.id,
      kind: "added",
      reason: "New model."
    }));
  const before = new Map(
    source.baseline.objects.map((o) => [o.id, o])
  );
  const changes = [];
  for (const [index, object] of document.objects.entries()) {
    const original = before.get(object.id);
    if (!original)
      changes.push({
        objectId: object.id,
        kind: "added",
        reason: "New model."
      });
    else if (!equal(original, object) || source.baseline.objects[index]?.id !== object.id)
      changes.push({
        objectId: object.id,
        kind: "replaced",
        reason: "Geometry, ordered faces, paint, placement, roles, identity, order or authored settings changed."
      });
    before.delete(object.id);
  }
  for (const id of before.keys())
    changes.push({ objectId: id, kind: "removed", reason: "Model removed." });
  return changes;
}
function validateDocument(document, target, options = {}) {
  const limits = processingLimits(options), paintBudget = { nodes: 0 };
  getTarget(target);
  const ids = /* @__PURE__ */ new Set();
  if (document.schemaVersion !== 1 || !document.objects.length)
    throw new Error("A document must contain model objects.");
  if (document.palette.length > 255 || document.palette.some((c) => !/^#[\da-f]{6}$/i.test(c)))
    throw new Error("Invalid region display palette.");
  const id = (value) => {
    if (!value || ids.has(value))
      throw new Error("Duplicate or missing object/part ID.");
    ids.add(value);
  };
  const transform = (values) => {
    if (values?.length !== 16 || !values.every(Number.isFinite) || values[3] !== 0 || values[7] !== 0 || values[11] !== 0 || values[15] !== 1 || Math.abs(new Matrix44().fromArray(values).determinant()) < 1e-12)
      throw new Error("Invalid model transform.");
  };
  let faces = 0;
  for (const object of document.objects) {
    id(object.id);
    transform(object.transform);
    settingsFor(object.overrides, target === "universal" ? "prusa" : target);
    if (!object.parts.length)
      throw new Error(
        "A model must contain parts. Remove empty models explicitly."
      );
    for (const part of object.parts) {
      id(part.id);
      transform(part.transform);
      settingsFor(part.overrides, target === "universal" ? "prusa" : target);
      if (![
        "ModelPart",
        "NegativeVolume",
        "ParameterModifier",
        "SupportEnforcer",
        "SupportBlocker"
      ].includes(part.kind))
        throw new Error("Unknown geometry role.");
      const { vertices, triangles } = part.mesh;
      if (!vertices.length || vertices.length % 3 || !triangles.length || triangles.length % 3 || vertices.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e6) || triangles.some(
        (n) => !Number.isSafeInteger(n) || n < 0 || n >= vertices.length / 3
      ))
        throw new Error("Invalid mesh coordinates or triangle indices.");
      faces += triangles.length / 3;
      if (faces > limits.maxSourceTriangles)
        budgetError("Source triangle count", "maxSourceTriangles");
      if (part.paint.length !== triangles.length / 3)
        throw new Error("Paint must correspond to the ordered triangles.");
      for (const region of [object.defaultRegion, part.defaultRegion])
        if (region !== void 0 && (!Number.isInteger(region) || region < 1 || region > 255))
          throw new Error("Invalid default region.");
      for (const tree of part.paint) {
        const stats = paintStats(tree, limits, paintBudget);
        if (target === "orca" && stats.maxRegion > 16)
          throw new Error(
            "OrcaSlicer 2.4.2 supports painted material slots 1\u201316."
          );
      }
    }
  }
}
function worldParts(document, { printableOnly = true } = {}) {
  return document.objects.filter((o) => !printableOnly || o.printable).flatMap(
    (o) => o.parts.map((p) => ({
      objectId: o.id,
      partId: p.id,
      name: p.name,
      kind: p.kind,
      mesh: p.mesh,
      paint: p.paint,
      defaultRegion: p.defaultRegion ?? o.defaultRegion ?? 1,
      transform: new Matrix44().fromArray(o.transform).multiply(new Matrix44().fromArray(p.transform)).toArray()
    }))
  );
}
function resolvePart(part, options = {}) {
  const limits = processingLimits(options);
  const m = new Matrix44().fromArray(part.transform), vertices = [];
  for (let i = 0; i < part.mesh.vertices.length; i += 3)
    vertices.push(
      new Vector32().fromArray(part.mesh.vertices, i).applyMatrix4(m).toArray()
    );
  const faces = [];
  for (let i = 0; i < part.mesh.triangles.length; i += 3) {
    const points = part.mesh.triangles.slice(i, i + 3).map((j) => vertices[j]);
    if (faces.length >= limits.maxResolvedTriangles)
      budgetError("Resolved paint triangles", "maxResolvedTriangles");
    const leaves = resolvePaint(points, part.paint[i / 3], part.defaultRegion, {
      ...limits,
      maxResolvedTriangles: limits.maxResolvedTriangles - faces.length
    });
    if (m.determinant() < 0)
      for (const leaf of leaves)
        [leaf.v[1], leaf.v[2]] = [leaf.v[2], leaf.v[1]];
    for (const leaf of leaves) faces.push(leaf);
  }
  return faces;
}
function writeDocument(document, options) {
  if (!["create", "update"].includes(options.mode))
    throw new Error("Choose create or update export explicitly.");
  const target = getTarget(options.target ?? outputTarget(document.format)).id;
  const limits = processingLimits(
    options.limits || sources.get(document)?.limits
  );
  if (options.virtualExtruders !== void 0) {
    if (!getTarget(target).supportsVirtualExtruders)
      throw new Error(
        `Virtual extruder export is not supported for ${getTarget(target).name}. Choose prusa (PrusaSlicer 2.9.6 or later) or prusa3 (a native PrusaSlicer 3.x template is required).`
      );
    if (options.mode !== "create")
      throw new Error(
        "Enabling or regenerating virtual extruders requires create export. Omit virtualExtruders in update mode to preserve an existing project."
      );
    validateDocument(document, target, limits);
    const plan = planVirtualExtruders(
      document,
      options.virtualExtruders,
      limits
    );
    const mapped = virtualizeDocument(document, plan);
    let container;
    if (target === "prusa3") {
      const template = options.virtualExtruders.prusa3Template ?? document;
      const source = sources.get(template);
      if (!source || template.format !== "prusa3")
        throw new Error(
          "PrusaSlicer 3.x virtual export requires a source-backed native prusa3Template (or a native source document). Read a printer project with readDocument first."
        );
      container = prusa3VirtualContainer(
        source.bytes,
        plan,
        options.virtualExtruders.prusa3ConfigContainer,
        limits
      );
    }
    const files = createFiles(mapped, target, limits, {
      application: "PrusaSlicer-2.9.6"
    });
    attachVirtualExtruders(files, plan, container);
    return {
      bytes: zipSync(files, { level: 6 }),
      changes: compareDocument(document),
      warnings: [
        ...plan.warnings,
        ...container ? [
          "PrusaSlicer 3.x virtual export copies the selected template's printer, print and filament configuration into a single bed. Model placement is retained; review bed placement and those settings before printing."
        ] : []
      ],
      droppedPaths: [],
      virtualExtruders: plan
    };
  }
  validateDocument(document, target, limits);
  const changes = compareDocument(document);
  if (options.mode === "update") {
    const source = sources.get(document);
    if (!source)
      throw new Error(
        "Update export requires the original archive; use editDocument to retain it."
      );
    if (target !== outputTarget(source.baseline.format))
      throw new Error(
        "Changing slicer formats requires create (clean) export."
      );
    if (!equal(document.palette, source.baseline.palette))
      throw new Error(
        "Changing source display palettes requires create export; region assignments can be updated independently."
      );
    if (!changes.length)
      return {
        bytes: source.bytes.slice(),
        changes,
        warnings: [],
        droppedPaths: []
      };
    const { files, warnings, droppedPaths } = updateFiles(
      document,
      source,
      changes,
      target,
      limits
    );
    return {
      bytes: zipSync(files, { level: 6 }),
      changes,
      warnings,
      droppedPaths
    };
  }
  const flat = ["universal", "orca", "prusa3"].includes(target) && document.objects.every(
    (o) => o.printable && o.parts.length === 1 && !Object.keys(o.overrides).length && o.parts.every(
      (p) => p.kind === "ModelPart" && !Object.keys(p.overrides).length && p.paint.every((t) => "region" in t)
    )
  );
  if (target === "universal" || flat) {
    if (document.objects.some(
      (o) => !o.printable || Object.keys(o.overrides).length || o.parts.some(
        (p) => p.kind !== "ModelPart" || Object.keys(p.overrides).length
      )
    ))
      throw new Error(
        "The combined target supports printable mesh/color models only. Choose a specific slicer for roles and overrides."
      );
    const pieces = worldParts(document).map((p) => {
      const vertices = [], faces = [], m = new Matrix44().fromArray(p.transform);
      if (p.paint.every((t) => "region" in t)) {
        for (let i = 0; i < p.mesh.vertices.length; i += 3)
          vertices.push(
            new Vector32().fromArray(p.mesh.vertices, i).applyMatrix4(m).toArray()
          );
        for (let i = 0; i < p.mesh.triangles.length; i += 3) {
          const v = p.mesh.triangles.slice(i, i + 3);
          if (m.determinant() < 0) [v[1], v[2]] = [v[2], v[1]];
          faces.push({
            v,
            material: p.paint[i / 3].region || p.defaultRegion
          });
        }
      } else
        for (const leaf of resolvePart(p, limits)) {
          const start = vertices.length;
          vertices.push(...leaf.v);
          faces.push({
            v: [start, start + 1, start + 2],
            material: leaf.material
          });
        }
      return { name: p.name, vertices, faces };
    });
    const palette = [...document.palette];
    let max = 1;
    for (const p of pieces)
      for (const f of p.faces) max = Math.max(max, f.material);
    while (palette.length < max)
      palette.push(DEFAULT_COLORS[palette.length % DEFAULT_COLORS.length]);
    return {
      bytes: export3mf(pieces, palette, { format: target }),
      changes,
      warnings: [],
      droppedPaths: []
    };
  }
  return {
    bytes: zipSync(createFiles(document, target, limits), { level: 6 }),
    changes,
    warnings: [],
    droppedPaths: []
  };
}
function sourceContext(document) {
  return sources.get(document);
}

// src/compat/three-mf.ts
var legacyAdapter = {
  read(name, archive) {
    return importPrusaProject(
      name,
      archive.files,
      archive.modelPath,
      archive.document
    );
  },
  write(project, result, format, document) {
    if (format === "prusa3") return exportPrusa3Project(project, result);
    return format === "prusa" ? exportPrusaProject(project, result, document) : exportNativeProject(project, result, format);
  }
};
var adapters = {
  generic: legacyAdapter,
  prusa2: legacyAdapter,
  prusa3: {
    read: (name, archive) => importPrusa3Project(
      name,
      archive.files,
      archive.modelPath,
      archive.document
    ),
    write: (project, result, _format, document) => exportPrusa3Project(project, result, document)
  },
  "bambu-orca": {
    read: (name, archive) => importNativeProject(
      name,
      archive.files,
      archive.modelPath,
      archive.document
    ),
    write: exportNativeProject
  }
};
function readArchive(source) {
  if (!source.files[source.modelPath])
    throw new Error("The 3MF model resource is missing.");
  const document = xml(strFromU8(source.files[source.modelPath]));
  const dialect = detectThreeMfDialect(source.files, document.documentElement);
  return { archive: { ...source, document }, adapter: adapters[dialect] };
}
function importProject(name, bytes, limits = {}, preserveAll = true) {
  if (!/\.3mf$/i.test(name)) throw new Error("Choose a 3MF file.");
  const zipArchive = new Archive(new Uint8Array(bytes), limits);
  const files = zipArchive.extract(
    (path) => preserveAll || /\.model$|\.config$|\.json$|^_rels\/\.rels$/i.test(path)
  );
  const rels = files["_rels/.rels"] && xml(strFromU8(files["_rels/.rels"]));
  const relation = rels && children(rels.documentElement, "Relationship").find(
    (r) => /\/3dmodel$/.test(r.getAttribute("Type") || "")
  );
  if (!relation || relation.getAttribute("TargetMode") === "External")
    throw new Error("The 3MF has no internal model relationship.");
  const modelPath = zipArchive.pathFor(relation.getAttribute("Target") || "");
  const { archive, adapter } = readArchive({ files, modelPath });
  return adapter.read(name, archive);
}
function exportProject(project, result, format = project.format && project.format !== "generic" ? project.format : "prusa", options = {}) {
  if (options.clean)
    project = project.source && format !== (project.format === "generic" ? "prusa" : project.format) ? convertCleanProject(project, format) : cleanProject(project);
  if (format === "orca" && project.source)
    for (const [path, bytes] of Object.entries(project.source.files)) {
      if (!path.endsWith(".model")) continue;
      const doc = xml(strFromU8(bytes));
      for (const node of Array.from(doc.getElementsByTagName("*")))
        if (node.localName === "triangle" && node.hasAttribute("paint_color"))
          translatePaint(node.getAttribute("paint_color"), "orca", "orca");
    }
  const input = project.source ? readArchive(project.source) : void 0;
  const adapter = input?.adapter || legacyAdapter;
  if (project.format && project.format !== "generic" && project.format !== format)
    throw new Error(
      "Native projects must be exported to their original slicer."
    );
  return adapter.write(project, result, format, input?.archive.document);
}

// src/compat/convert-3mf.ts
function convertCleanProject(project, format) {
  if (!project.source)
    throw new Error("Format conversion requires the original document.");
  const document = readDocument(zipSync(project.source.files), project.name);
  const bytes = writeDocument(document, {
    mode: "create",
    target: format
  }).bytes;
  return importProject(project.name, bytes.slice().buffer);
}

export {
  DEFAULT_COLORS,
  TARGETS,
  DEFAULT_TARGET,
  getTarget,
  outputTarget,
  preferredPaintTarget,
  paintTargets,
  noticesForMode,
  SLICER_NAMES,
  normalizeMix,
  quantizeMix,
  optimizeMix,
  prusaColorMixPredictor,
  createColorMixSolver,
  solveColorMix,
  planPrusaMixSequence,
  VIRTUAL_EXTRUDER_PALETTE,
  planVirtualExtruders,
  identity,
  readDocument,
  editDocument,
  originalBytes,
  createDocument,
  replacePart,
  compareDocument,
  validateDocument,
  worldParts,
  resolvePart,
  writeDocument,
  sourceContext,
  convertCleanProject,
  importProject,
  exportProject
};
