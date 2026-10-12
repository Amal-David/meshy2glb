import {
  packageFiles
} from "./chunk-NOHPIZKF.js";
import {
  NS,
  safePath,
  serialize,
  xml
} from "./chunk-KJN6FYMH.js";
import {
  strFromU8,
  strToU8
} from "./chunk-5WIV2BUJ.js";

// src/compat/clean-3mf.ts
var pick = (value, keys) => {
  const data = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    keys.filter((key) => Object.hasOwn(data, key)).map((key) => [key, data[key]])
  );
};
var parse = (bytes) => JSON.parse(strFromU8(bytes));
var encode = (value) => strToU8(JSON.stringify(value));
var elements = (node) => Array.from(node.childNodes).filter((n) => n.nodeType === 1);
var modelAttributes = {
  model: ["unit", "xml:lang"],
  resources: [],
  build: [],
  object: ["id", "name", "type", "pid", "pindex"],
  components: [],
  component: ["objectid", "transform", "p:path"],
  item: ["objectid", "transform", "printable", "p:path"],
  mesh: [],
  vertices: [],
  vertex: ["x", "y", "z"],
  triangles: [],
  triangle: [
    "v1",
    "v2",
    "v3",
    "pid",
    "p1",
    "p2",
    "p3",
    "slic3rpe:mmu_segmentation",
    "paint_color"
  ],
  basematerials: ["id"],
  base: ["name", "displaycolor"],
  colorgroup: ["id"],
  color: ["color"]
};
var versions = /* @__PURE__ */ new Set([
  "Application",
  "slic3rpe:Version3mf",
  "slic3rpe:MmPaintingVersion",
  "BambuStudio:3mfVersion",
  "BambuStudio:MmPaintingVersion",
  "OrcaSlicer:3mfVersion",
  "OrcaSlicer:MmPaintingVersion"
]);
function copyModel(source, format) {
  const doc = xml(`<model xmlns="${NS}"/>`);
  const copy = (input) => {
    if (input.localName === "metadata") {
      const name = input.getAttribute("name") || "";
      if (!versions.has(name)) return;
      const output2 = doc.createElementNS(NS, "metadata");
      output2.setAttribute("name", name);
      output2.appendChild(
        doc.createTextNode(
          name === "Application" && (format === "bambu" || format === "orca") ? "RollingBrim-0.1.0" : input.textContent || ""
        )
      );
      return output2;
    }
    const allowed = modelAttributes[input.localName];
    if (!allowed) return;
    const output = doc.createElementNS(
      input.namespaceURI || NS,
      input.nodeName
    );
    for (const a of Array.from(input.attributes)) {
      if (allowed.includes(a.name) || a.localName === "path" && ["component", "item"].includes(input.localName))
        output.setAttributeNS(a.namespaceURI, a.name, a.value);
      if (a.namespaceURI === "http://www.w3.org/2000/xmlns/" && [
        NS,
        "http://schemas.slic3r.org/3mf/2017/06",
        "http://schemas.microsoft.com/3dmanufacturing/production/2015/06",
        "http://schemas.microsoft.com/3dmanufacturing/material/2015/02"
      ].includes(a.value))
        output.setAttributeNS(a.namespaceURI, a.name, a.value);
    }
    for (const element of elements(input)) {
      const c = copy(element);
      if (c) output.appendChild(c);
    }
    return output;
  };
  doc.replaceChild(copy(source.documentElement), doc.documentElement);
  if (format === "bambu" || format === "orca") {
    const hint = doc.createElementNS(NS, "metadata");
    hint.setAttribute("name", "RollingBrim:TargetSlicer");
    hint.appendChild(doc.createTextNode(format));
    doc.documentElement.appendChild(hint);
  }
  return doc;
}
function copyConfig(bytes, native) {
  const input = xml(strFromU8(bytes)), doc = xml("<config/>");
  const allowed = native ? {
    config: [],
    object: ["id"],
    part: ["id", "subtype"],
    plate: [],
    model_instance: []
  } : {
    config: [],
    object: ["id", "instances_count"],
    volume: ["firstid", "lastid"]
  };
  const metadata = native ? [
    "name",
    "extruder",
    "plater_id",
    "plater_name",
    "object_id",
    "instance_id"
  ] : ["name", "extruder", "volume_type", "modifier"];
  const copy = (node) => {
    if (node.localName === "metadata") {
      if (!metadata.includes(node.getAttribute("key") || "")) return;
      const out2 = doc.createElement("metadata");
      for (const key of ["type", "key", "value"])
        if (node.hasAttribute(key))
          out2.setAttribute(key, node.getAttribute(key));
      return out2;
    }
    const attrs = allowed[node.localName];
    if (!attrs) return;
    const out = doc.createElement(node.localName);
    for (const key of attrs)
      if (node.hasAttribute(key))
        out.setAttribute(key, node.getAttribute(key));
    for (const element of elements(node)) {
      const c = copy(element);
      if (c) out.appendChild(c);
    }
    return out;
  };
  doc.replaceChild(copy(input.documentElement), doc.documentElement);
  return serialize(doc);
}
function cleanProject(project) {
  if (!project.source) return project;
  const source = project.source, files = packageFiles(source.modelPath);
  const visit = (path) => {
    if (files[path]) return;
    const doc = copyModel(xml(strFromU8(source.files[path])), project.format);
    files[path] = serialize(doc);
    for (const node of Array.from(doc.getElementsByTagName("*")))
      for (const a of Array.from(node.attributes))
        if (a.localName === "path") visit(safePath(a.value));
  };
  visit(source.modelPath);
  if (project.format === "prusa3") {
    const path = "Metadata/PrusaSlicer3_project.json", input = parse(source.files[path]);
    const objects = input.objects.map((o) => ({
      ...pick(o, ["id", "instances"]),
      object_settings: pick(o.object_settings, ["extruder"]),
      volumes: o.volumes.map((v) => ({
        ...pick(v, ["id", "type"]),
        volume_settings: pick(v.volume_settings, ["extruder"])
      }))
    }));
    files[path] = encode({
      project: { id: "00000000-0000-4000-8000-000000000001", version: 0 },
      objects,
      config_containers: []
    });
    const paintPath = "Metadata/Slic3r_facets_annotation.json";
    if (source.files[paintPath])
      files[paintPath] = encode(
        parse(source.files[paintPath]).filter((p) => p.mmSegmentationFacets).map(
          (p) => pick(p, [
            "id",
            "mmSegmentationFacetsVersion",
            "mmSegmentationFacets"
          ])
        )
      );
  } else if (project.format === "bambu" || project.format === "orca") {
    files["Metadata/model_settings.config"] = copyConfig(
      source.files["Metadata/model_settings.config"],
      true
    );
  } else {
    const path = "Metadata/Slic3r_PE_model.config";
    if (source.files[path]) files[path] = copyConfig(source.files[path], false);
  }
  return { ...project, source: { modelPath: source.modelPath, files } };
}

export {
  cleanProject
};
