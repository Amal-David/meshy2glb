import {
  settingsFor,
  writeApplicationMetadata
} from "./chunk-NYB7XBCX.js";
import {
  compactMesh,
  transformMesh
} from "./chunk-MAUJ66QL.js";
import {
  NS,
  checkIds,
  child,
  children,
  matrix,
  meta,
  num,
  readMesh,
  serialize,
  xml
} from "./chunk-KJN6FYMH.js";
import {
  strFromU8,
  strToU8,
  zipSync
} from "./chunk-5WIV2BUJ.js";
import {
  MAX_LAYER_HEIGHT,
  MIN_LAYER_HEIGHT
} from "./chunk-F7HEVVAW.js";

// src/compat/prusa-3mf.ts
import { Matrix4 } from "three";
var CONFIG = "Metadata/Slic3r_PE_model.config";
var BRIM_SOURCE_FILE = "rolling-brim.generated.stl";
function checkVolumes(volumes, triangleCount) {
  const ranges = volumes.map((v) => ({
    first: num(v.getAttribute("firstid")),
    last: num(v.getAttribute("lastid"))
  })).sort((a, b) => a.first - b.first);
  let next = 0;
  for (const { first, last } of ranges) {
    if (!Number.isInteger(first) || !Number.isInteger(last) || first !== next || last < first || last >= triangleCount)
      throw new Error(
        "The 3MF part triangle ranges overlap, have gaps, or are out of bounds. Save a repaired project in PrusaSlicer."
      );
    next = last + 1;
  }
  if (next !== triangleCount)
    throw new Error(
      "The 3MF part triangle ranges do not cover the model. Save a repaired project in PrusaSlicer."
    );
}
function meshResourceId(id, resources, configs) {
  const resource = resources.find((r) => r.getAttribute("id") === id);
  const components = resource && children(resource, "components")[0];
  const refs = components ? children(components, "component") : [];
  if (resource && children(resource, "mesh").length || refs.length !== 1 || refs[0].attributes.length !== 1 || !refs[0].hasAttribute("objectid") || configs.some((c) => c.getAttribute("id") === id))
    return id;
  const target = refs[0].getAttribute("objectid");
  const cfg = configs.find((c) => c.getAttribute("id") === target);
  const mesh = resources.find((r) => r.getAttribute("id") === target);
  return cfg && Number(cfg.getAttribute("instances_count")) > 1 && mesh && children(mesh, "mesh").length ? target : id;
}
function importPrusaProject(name, files, modelPath, doc) {
  const root = doc.documentElement;
  if (root.localName !== "model" || root.namespaceURI !== NS)
    throw new Error("The 3MF resource is not a supported core model.");
  if ((root.getAttribute("requiredextensions") || "").trim())
    throw new Error(
      "This 3MF requires extensions not supported by this workbench. Save a standard PrusaSlicer 3MF first."
    );
  const units = {
    micron: 1e-3,
    millimeter: 1,
    centimeter: 10,
    inch: 25.4,
    foot: 304.8,
    meter: 1e3
  };
  const unit = root.getAttribute("unit") || "millimeter";
  const scale = Object.hasOwn(units, unit) ? units[unit] : void 0;
  if (!scale) throw new Error("Unsupported 3MF measurement unit.");
  const resources = children(child(root, "resources"), "object");
  const configs = files[CONFIG] ? children(xml(strFromU8(files[CONFIG])).documentElement, "object") : [];
  checkIds(
    Array.from(child(root, "resources").childNodes).filter(
      (n) => n.nodeType === 1
    ),
    "resource"
  );
  checkIds(configs, "object configuration");
  const warnings = [];
  let meshCount = 0;
  const partsFor = (id, transform, seen = /* @__PURE__ */ new Set(), assembly = false) => {
    if (seen.has(id) || seen.size > 64)
      throw new Error("The 3MF has circular or excessive component nesting.");
    seen = new Set(seen).add(id);
    const resource = resources.find((r) => r.getAttribute("id") === id);
    if (!resource)
      throw new Error("A 3MF component references a missing object.");
    const meshElement = children(resource, "mesh")[0];
    const config = configs.find((c) => c.getAttribute("id") === id);
    if (config && (assembly || !meshElement))
      throw new Error(
        "Component assemblies with slicer-specific settings are not supported. Save this as a standard PrusaSlicer 3MF first."
      );
    if (!meshElement)
      return children(child(resource, "components"), "component").flatMap(
        (c) => {
          if (Array.from(c.attributes).some((a) => a.localName === "path"))
            throw new Error(
              "External model components are not supported. Save this as a PrusaSlicer 3MF project first."
            );
          return partsFor(
            c.getAttribute("objectid") || "",
            transform.clone().multiply(matrix(c.getAttribute("transform"))),
            seen,
            true
          );
        }
      );
    if (assembly && children(child(meshElement, "triangles"), "triangle").some(
      (t) => Array.from(t.attributes).some(
        (a) => !["v1", "v2", "v3"].includes(a.name)
      )
    )) {
      throw new Error(
        "Component assemblies with painted or annotated triangles are not supported. Save this as a standard PrusaSlicer 3MF first."
      );
    }
    const mesh = readMesh(meshElement);
    meshCount += mesh.triangles.length / 3;
    if (meshCount > 2e6)
      throw new Error(
        "This scene exceeds the two-million-triangle browser limit."
      );
    const volumes = config ? children(config, "volume") : [];
    if (!volumes.length)
      return [
        {
          name: meta(config, "name") || resource.getAttribute("name") || `Model ${id}`,
          kind: "ModelPart",
          mesh: transformMesh(mesh, transform)
        }
      ];
    checkVolumes(volumes, mesh.triangles.length / 3);
    return volumes.map((volume) => {
      const first = num(volume.getAttribute("firstid")), last = num(volume.getAttribute("lastid"));
      if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first || last >= mesh.triangles.length / 3)
        throw new Error("A 3MF part has invalid triangle ranges.");
      const kind = meta(volume, "volume_type") || (meta(volume, "modifier") === "1" ? "ParameterModifier" : "ModelPart");
      if (![
        "ModelPart",
        "NegativeVolume",
        "ParameterModifier",
        "SupportEnforcer",
        "SupportBlocker"
      ].includes(kind))
        throw new Error(`Unsupported part type: ${kind}`);
      return {
        name: meta(volume, "name") || `Part ${first}`,
        kind,
        mesh: transformMesh(
          compactMesh({
            vertices: mesh.vertices,
            triangles: mesh.triangles.slice(first * 3, (last + 1) * 3)
          }),
          transform
        )
      };
    });
  };
  const objects = [];
  children(child(root, "build"), "item").forEach((item, index) => {
    if (["0", "false"].includes(item.getAttribute("printable") || "")) return;
    const id = meshResourceId(
      item.getAttribute("objectid") || "",
      resources,
      configs
    ), config = configs.find((c) => c.getAttribute("id") === id);
    const transform = matrix(item.getAttribute("transform"), scale), parts = partsFor(id, transform);
    if (parts.some((p) => p.kind === "ModelPart"))
      objects.push({
        id: `object-${index}`,
        name: meta(config, "name") || resources.find((r) => r.getAttribute("id") === id)?.getAttribute("name") || parts[0]?.name || `Object ${index + 1}`,
        resourceId: id,
        buildIndex: index,
        transform: transform.toArray(),
        parts
      });
  });
  if (!objects.length)
    throw new Error("This 3MF contains no printable model objects.");
  if (objects.some((o) => o.parts.some((p) => p.kind === "NegativeVolume")))
    warnings.push(
      "Negative volumes are applied in the footprint view. The 3D view shows the original positive meshes."
    );
  if (resources.some((r) => children(r, "components").length) && Array.from(root.getElementsByTagName("*")).some(
    (e) => e.hasAttribute("pid")
  ))
    throw new Error(
      "Component assemblies with material/color assignments are not supported. Save a standard PrusaSlicer 3MF first."
    );
  const ini = files["Metadata/Slic3r_PE.config"] ? strFromU8(files["Metadata/Slic3r_PE.config"]) : "";
  const setting = (key) => ini.match(new RegExp(`^;?\\s*${key}\\s*=\\s*(.+)$`, "m"))?.[1].trim();
  const height = setting("first_layer_height");
  if (Number(setting("xy_size_compensation")) !== 0 && setting("xy_size_compensation"))
    warnings.push(
      "The project applies XY size compensation. The preview shows uncompensated mesh sections; check the final gap after slicing."
    );
  if (Number(setting("raft_layers")) > 0)
    throw new Error(
      "Raft projects are not supported. Disable the raft and place the model on the bed first."
    );
  if (Number(setting("brim_width")) > 0)
    warnings.push(
      "Native slicer brim is enabled in this project and may add another brim. Turn it off in PrusaSlicer if unwanted."
    );
  const suggestedHeight = height && Number.isFinite(Number(height)) && Number(height) >= MIN_LAYER_HEIGHT && Number(height) <= MAX_LAYER_HEIGHT ? Number(height) : void 0;
  if (height && !height.endsWith("%") && suggestedHeight === void 0)
    warnings.push(
      `The stored first-layer height is outside the supported ${MIN_LAYER_HEIGHT}\u2013${MAX_LAYER_HEIGHT} mm range. Choose the height manually.`
    );
  return {
    name,
    objects,
    warnings,
    source: { files, modelPath },
    format: files[CONFIG] ? "prusa" : "generic",
    suggestedHeight
  };
}
function addMeta(doc, parent, type, key, value) {
  const node = doc.createElement("metadata");
  node.setAttribute("type", type);
  node.setAttribute("key", key);
  node.setAttribute("value", value);
  parent.appendChild(node);
}
function setMeta(doc, parent, type, key, value) {
  for (const node of children(parent, "metadata").filter(
    (m) => m.getAttribute("key") === key
  ))
    parent.removeChild(node);
  addMeta(doc, parent, type, key, value);
}
function addMesh(doc, object, mesh) {
  const node = doc.createElementNS(NS, "mesh"), vertices = doc.createElementNS(NS, "vertices"), triangles = doc.createElementNS(NS, "triangles");
  node.appendChild(vertices);
  node.appendChild(triangles);
  object.appendChild(node);
  appendMesh(doc, node, mesh);
  return node;
}
function appendMesh(doc, element, mesh) {
  const vertices = child(element, "vertices"), triangles = child(element, "triangles"), base = children(vertices, "vertex").length;
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    const v = doc.createElementNS(NS, "vertex");
    ["x", "y", "z"].forEach(
      (key, j) => v.setAttribute(key, String(mesh.vertices[i + j]))
    );
    vertices.appendChild(v);
  }
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const t = doc.createElementNS(NS, "triangle");
    ["v1", "v2", "v3"].forEach(
      (key, j) => t.setAttribute(key, String(base + mesh.triangles[i + j]))
    );
    triangles.appendChild(t);
  }
}
function partConfig(doc, parent, first, count, name, kind = "ModelPart") {
  const v = doc.createElement("volume");
  v.setAttribute("firstid", String(first));
  v.setAttribute("lastid", String(first + count - 1));
  addMeta(doc, v, "volume", "name", name);
  addMeta(doc, v, "volume", "volume_type", kind);
  parent.appendChild(v);
  return v;
}
function exportPrusaProject(project, result, modelDocument) {
  if (!result.objects.some((o) => o.mesh.triangles.length))
    throw new Error("Generate at least one brim before exporting.");
  const files = { ...project.source?.files };
  const modelPath = project.source?.modelPath || "3D/3dmodel.model";
  const doc = modelDocument || (files[modelPath] ? xml(strFromU8(files[modelPath])) : xml(
    `<model unit="millimeter" xml:lang="en-US" xmlns="${NS}" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06"><metadata name="slic3rpe:Version3mf">1</metadata><resources/><build/></model>`
  ));
  const config = files[CONFIG] ? xml(strFromU8(files[CONFIG])) : xml("<config/>");
  const root = doc.documentElement, resources = child(root, "resources"), build = child(root, "build");
  if (!Array.from(root.getElementsByTagName("metadata")).some(
    (m) => m.getAttribute("name") === "slic3rpe:Version3mf"
  )) {
    root.setAttribute(
      "xmlns:slic3rpe",
      "http://schemas.slic3r.org/3mf/2017/06"
    );
    const m = doc.createElementNS(NS, "metadata");
    m.setAttribute("name", "slic3rpe:Version3mf");
    m.appendChild(doc.createTextNode("1"));
    root.insertBefore(m, resources);
  }
  let nextId = Math.max(
    0,
    ...Array.from(resources.childNodes).filter((n) => n.nodeType === 1).map((n) => Number(n.getAttribute("id")) || 0)
  ) + 1;
  const originalResources = children(resources, "object"), originalConfigs = children(config.documentElement, "object");
  const buildItems = children(build, "item");
  const referenceCounts = /* @__PURE__ */ new Map();
  for (const item of buildItems) {
    const id = meshResourceId(
      item.getAttribute("objectid") || "",
      originalResources,
      originalConfigs
    );
    referenceCounts.set(id, (referenceCounts.get(id) || 0) + 1);
  }
  for (const object of project.objects) {
    const brim = result.objects.find((o) => o.id === object.id);
    const original = originalResources.find(
      (r) => r.getAttribute("id") === object.resourceId
    );
    const oldConfig = originalConfigs.find(
      (c) => c.getAttribute("id") === object.resourceId
    );
    const direct = original && children(original, "mesh").length > 0;
    const repeated = (referenceCounts.get(object.resourceId) || 0) > 1;
    if (repeated && Object.keys(files).some(
      (p) => /layer_heights_profile|layer_config_ranges/.test(p)
    ))
      throw new Error(
        "Repeated instances with custom layer-height profiles need to be made independent objects in PrusaSlicer before export."
      );
    const id = original && !repeated ? object.resourceId : String(nextId++);
    const out = direct ? original.cloneNode(true) : doc.createElementNS(NS, "object");
    out.setAttribute("id", id);
    out.setAttribute("type", "model");
    const cfg = oldConfig ? oldConfig.cloneNode(true) : config.createElement("object");
    cfg.setAttribute("id", id);
    cfg.setAttribute("instances_count", "1");
    if (!oldConfig) addMeta(config, cfg, "object", "name", object.name);
    for (const [key, value] of Object.entries(
      settingsFor(
        result.parentOverrides || { elephantFootCompensation: 0 },
        "prusa"
      )
    ))
      setMeta(config, cfg, "object", key, String(value));
    let meshElement;
    if (direct) {
      meshElement = child(out, "mesh");
      const triangles = child(meshElement, "triangles");
      if (!children(cfg, "volume").length)
        partConfig(
          config,
          cfg,
          0,
          children(triangles, "triangle").length,
          object.name
        );
    } else {
      if (oldConfig)
        throw new Error(
          "This project combines component assemblies with slicer-specific settings. Save it as a standard PrusaSlicer 3MF first."
        );
      meshElement = addMesh(doc, out, { vertices: [], triangles: [] });
      for (const part of object.parts) {
        const first = children(
          child(meshElement, "triangles"),
          "triangle"
        ).length;
        appendMesh(
          doc,
          meshElement,
          transformMesh(
            part.mesh,
            new Matrix4().fromArray(object.transform).invert()
          )
        );
        partConfig(
          config,
          cfg,
          first,
          part.mesh.triangles.length / 3,
          part.name,
          part.kind
        );
      }
    }
    if (brim.mesh.triangles.length) {
      const first = children(
        child(meshElement, "triangles"),
        "triangle"
      ).length;
      const local = transformMesh(
        brim.mesh,
        new Matrix4().fromArray(object.transform).invert()
      );
      appendMesh(doc, meshElement, local);
      const volume = partConfig(
        config,
        cfg,
        first,
        local.triangles.length / 3,
        brim.name || "Rolling brim"
      );
      const settings = {
        source_file: BRIM_SOURCE_FILE,
        perimeters: String(result.settings.perimeters),
        top_solid_layers: "0",
        bottom_solid_layers: "0",
        top_solid_min_thickness: "0",
        bottom_solid_min_thickness: "0",
        fill_density: "0%",
        gap_fill_enabled: "0",
        ensure_vertical_shell_thickness: "disabled",
        only_one_perimeter_first_layer: "0",
        top_one_perimeter_type: "none",
        ironing: "0"
      };
      Object.entries(
        brim.printOverrides ? settingsFor(brim.printOverrides, "prusa") : settings
      ).forEach(
        ([key, value]) => addMeta(config, volume, "volume", key, value)
      );
    }
    if (original && !repeated) resources.replaceChild(out, original);
    else resources.appendChild(out);
    if (oldConfig && !repeated)
      config.documentElement.replaceChild(cfg, oldConfig);
    else config.documentElement.appendChild(cfg);
    let item = buildItems[object.buildIndex];
    if (!item) {
      item = doc.createElementNS(NS, "item");
      build.appendChild(item);
    }
    item.setAttribute("objectid", id);
    if (repeated)
      referenceCounts.set(
        object.resourceId,
        referenceCounts.get(object.resourceId) - 1
      );
  }
  files[modelPath] = serialize(doc);
  files[CONFIG] = serialize(config);
  writeApplicationMetadata(
    files,
    result.applicationMetadata || {
      name: "rolling_brim",
      data: {
        version: 1,
        settings: result.settings,
        sampleZ: result.settings.height / 2,
        printOrder: "Determined by the slicer; brim-first is not guaranteed."
      }
    }
  );
  files["[Content_Types].xml"] ||= strToU8(
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
  );
  files["_rels/.rels"] ||= strToU8(
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rel-1" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
  );
  const ct = xml(strFromU8(files["[Content_Types].xml"]));
  for (const [extension, type] of [
    ["config", "application/octet-stream"],
    ["json", "application/json"]
  ])
    if (!children(ct.documentElement, "Default").some(
      (e) => e.getAttribute("Extension") === extension
    )) {
      const e = ct.createElementNS(
        ct.documentElement.namespaceURI || "",
        "Default"
      );
      e.setAttribute("Extension", extension);
      e.setAttribute("ContentType", type);
      ct.documentElement.appendChild(e);
    }
  files["[Content_Types].xml"] = serialize(ct);
  return zipSync(files, { level: 6 });
}

export {
  importPrusaProject,
  exportPrusaProject
};
