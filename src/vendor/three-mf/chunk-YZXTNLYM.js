import {
  settingsFor,
  writeApplicationMetadata
} from "./chunk-NYB7XBCX.js";
import {
  transformMesh
} from "./chunk-MAUJ66QL.js";
import {
  NS,
  checkIds,
  child,
  children,
  matrix,
  meta,
  readMesh,
  safePath,
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

// src/compat/bambu-3mf.ts
var CONFIG = "Metadata/model_settings.config";
var PROFILE = "Metadata/project_settings.config";
var PRODUCTION = "http://schemas.microsoft.com/3dmanufacturing/production/2015/06";
var ROLES = {
  normal_part: "ModelPart",
  negative_part: "NegativeVolume",
  modifier_part: "ParameterModifier",
  support_enforcer: "SupportEnforcer",
  support_blocker: "SupportBlocker"
};
var roleName = (kind) => Object.keys(ROLES).find((key) => ROLES[key] === kind) || "normal_part";
var remove = (node) => node.parentNode?.removeChild(node);
var attr = (node, name) => Array.from(node.attributes).find((a) => a.localName === name)?.value;
var setMeta = (doc, node, key, value) => {
  children(node, "metadata").filter((m2) => m2.getAttribute("key") === key).forEach(remove);
  const m = doc.createElement("metadata");
  m.setAttribute("key", key);
  m.setAttribute("value", value);
  node.appendChild(m);
};
var scalar = (value) => Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
function json(bytes) {
  let value;
  try {
    value = JSON.parse(strFromU8(bytes));
  } catch {
    throw new Error("Invalid JSON in the Bambu/Orca project settings.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Bambu/Orca project settings.");
  return value;
}
function nativeArchive(files, modelPath, modelDocument) {
  if (!files[CONFIG])
    throw new Error(
      "The Bambu/Orca project has no model settings. Save it as an editable 3MF project in its slicer."
    );
  const docs = /* @__PURE__ */ new Map();
  const model = (path) => {
    const cached = docs.get(path);
    if (cached) return cached;
    if (!files[path]) throw new Error(`Missing model resource: ${path}`);
    const doc2 = path === modelPath && modelDocument ? modelDocument : xml(strFromU8(files[path])), root2 = doc2.documentElement;
    if (root2.localName !== "model" || root2.namespaceURI !== NS)
      throw new Error("Unsupported Bambu/Orca model resource.");
    if ((root2.getAttribute("unit") || "millimeter") !== "millimeter")
      throw new Error(
        "Bambu/Orca projects must use millimetres. Save the project in its slicer first."
      );
    for (const prefix of (root2.getAttribute("requiredextensions") || "").split(/\s+/).filter(Boolean)) {
      if (root2.lookupNamespaceURI(prefix) !== PRODUCTION)
        throw new Error(`Unsupported required 3MF extension: ${prefix}`);
    }
    checkIds(
      Array.from(child(root2, "resources").childNodes).filter(
        (n) => n.nodeType === 1
      ),
      "resource"
    );
    docs.set(path, doc2);
    return doc2;
  };
  const resource = (path, id) => {
    const found = children(
      child(model(path).documentElement, "resources"),
      "object"
    ).find((o) => o.getAttribute("id") === id);
    if (!found)
      throw new Error(`Missing Bambu/Orca model object ${id} in ${path}.`);
    return found;
  };
  const reference = (node, path) => ({
    path: attr(node, "path") ? safePath(attr(node, "path")) : path,
    id: node.getAttribute("objectid") || ""
  });
  const doc = model(modelPath), root = doc.documentElement, config = xml(strFromU8(files[CONFIG]));
  const configs = children(config.documentElement, "object");
  checkIds(configs, "object configuration");
  const profile = files[PROFILE] ? json(files[PROFILE]) : {};
  const counts = /* @__PURE__ */ new Map(), parentPaths = /* @__PURE__ */ new Map();
  const instances = children(child(root, "build"), "item").map(
    (item, index) => {
      const { path, id } = reference(item, modelPath), instance = counts.get(id) || 0;
      if (parentPaths.has(id) && parentPaths.get(id) !== path)
        throw new Error(
          "Bambu/Orca plate assignments require unique parent object IDs across model resources."
        );
      parentPaths.set(id, path);
      counts.set(id, instance + 1);
      return { item, path, id, index, instance };
    }
  );
  const nodes = children(config.documentElement, "plate");
  const assigned = /* @__PURE__ */ new Set();
  const plates = nodes.map((node) => {
    const items = children(node, "model_instance").map((ref) => {
      const instance = instances.find(
        (i) => i.id === meta(ref, "object_id") && String(i.instance) === meta(ref, "instance_id")
      );
      if (!instance || assigned.has(instance.index))
        throw new Error(
          "Invalid or duplicate plate object assignment in the Bambu/Orca project."
        );
      assigned.add(instance.index);
      return instance;
    });
    return { node, instances: items };
  });
  const application = children(root, "metadata").find(
    (m) => m.getAttribute("name") === "Application"
  )?.textContent || "";
  const orcaTag = children(root, "metadata").some(
    (m) => m.getAttribute("name") === "OrcaSlicer" || ["RollingBrim:TargetSlicer", "ThreeMFKit:TargetSlicer"].includes(
      m.getAttribute("name") || ""
    ) && m.textContent === "orca"
  );
  const format = orcaTag || /orca/i.test(application) ? "orca" : "bambu";
  return {
    doc,
    root,
    config,
    configs,
    profile,
    plates,
    instances,
    docs,
    model,
    resource,
    reference,
    format
  };
}
function importNativeProject(name, files, modelPath, modelDocument) {
  const a = nativeArchive(files, modelPath, modelDocument);
  const warnings = [];
  let triangleCount = 0;
  const partsFor = (path, id, transform, cfg, seen = /* @__PURE__ */ new Set()) => {
    const key = `${path}#${id}`;
    if (seen.has(key) || seen.size > 64)
      throw new Error("The 3MF has circular or excessive component nesting.");
    const next = new Set(seen).add(key), res = a.resource(path, id), mesh = children(res, "mesh")[0];
    if (mesh) {
      if (cfg && children(cfg, "part").length)
        throw new Error(
          "This Bambu/Orca project uses a legacy combined mesh. Save it again in its slicer before importing."
        );
      const shape = readMesh(mesh);
      triangleCount += shape.triangles.length / 3;
      if (triangleCount > 2e6)
        throw new Error(
          "This project exceeds the two-million-triangle browser limit."
        );
      const subtype = cfg?.getAttribute("subtype") || "normal_part";
      if (!Object.hasOwn(ROLES, subtype))
        throw new Error(`Unsupported Bambu/Orca part type: ${subtype}`);
      const kind = ROLES[subtype];
      return [
        {
          name: meta(cfg, "name") || res.getAttribute("name") || `Part ${id}`,
          kind,
          mesh: transformMesh(shape, transform)
        }
      ];
    }
    const components = children(child(res, "components"), "component"), parts = cfg ? children(cfg, "part") : [];
    if (parts.length && parts.length !== components.length)
      throw new Error(
        "The Bambu/Orca part settings do not match the model components. Save a repaired project in the slicer."
      );
    return components.flatMap((component, index) => {
      const ref = a.reference(component, path);
      const part = parts[index] || (cfg?.hasAttribute("subtype") ? cfg : void 0);
      if (parts[index] && part.getAttribute("id") !== ref.id)
        throw new Error(
          "The Bambu/Orca part settings reference a different mesh. Save the project in its slicer first."
        );
      return partsFor(
        ref.path,
        ref.id,
        transform.clone().multiply(matrix(component.getAttribute("transform"))),
        part,
        next
      );
    });
  };
  const objects = [];
  for (const instance of a.instances) {
    if (["0", "false"].includes(instance.item.getAttribute("printable") || ""))
      continue;
    const cfg = a.configs.find((c) => c.getAttribute("id") === instance.id);
    const transform = matrix(instance.item.getAttribute("transform"));
    const parts = partsFor(instance.path, instance.id, transform, cfg);
    if (parts.some((p) => p.kind === "ModelPart"))
      objects.push({
        id: `object-${instance.index}`,
        resourceId: instance.id,
        buildIndex: instance.index,
        transform: transform.toArray(),
        name: meta(cfg, "name") || `Object ${instance.index + 1}`,
        parts
      });
    if (Number(meta(cfg, "raft_layers") || scalar(a.profile.raft_layers)) > 0)
      throw new Error(
        "Raft projects are not supported. Disable the raft on this plate first."
      );
    if (Number(meta(cfg, "brim_width")) > 0)
      warnings.push(
        "Native slicer brim is enabled on an object. Disable it in the slicer if unwanted."
      );
  }
  if (!objects.length) warnings.push("No printable model objects were found.");
  if (objects.some((o) => o.parts.some((p) => p.kind === "NegativeVolume")))
    warnings.push(
      "Negative volumes are applied in the footprint view. The 3D view shows the original positive meshes."
    );
  if (Number(scalar(a.profile.brim_width)) > 0 && scalar(a.profile.brim_type) !== "no_brim")
    warnings.push(
      "Native slicer brim is enabled in this project and may add another brim. Turn it off in the slicer if unwanted."
    );
  if (["xy_contour_compensation", "xy_hole_compensation"].some(
    (k) => Number(scalar(a.profile[k]))
  ))
    warnings.push(
      "The project applies XY compensation. Check the final separation gap after slicing."
    );
  const height = scalar(a.profile.initial_layer_print_height);
  const suggestedHeight = height && Number.isFinite(Number(height)) && Number(height) >= MIN_LAYER_HEIGHT && Number(height) <= MAX_LAYER_HEIGHT ? Number(height) : void 0;
  if (height && suggestedHeight === void 0)
    warnings.push(
      "The stored first-layer height is outside the supported range. Choose the height manually."
    );
  return {
    name,
    objects: objects.sort((a2, b) => a2.buildIndex - b.buildIndex),
    warnings: [...new Set(warnings)],
    source: { files, modelPath },
    format: a.format,
    suggestedHeight
  };
}
function addMesh(doc, resources, id, mesh) {
  const object = doc.createElementNS(NS, "object");
  object.setAttribute("id", id);
  object.setAttribute("type", "model");
  resources.appendChild(object);
  const body = doc.createElementNS(NS, "mesh"), vertices = doc.createElementNS(NS, "vertices"), triangles = doc.createElementNS(NS, "triangles");
  object.appendChild(body);
  body.appendChild(vertices);
  body.appendChild(triangles);
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    const v = doc.createElementNS(NS, "vertex");
    ["x", "y", "z"].forEach(
      (k, j) => v.setAttribute(k, String(mesh.vertices[i + j]))
    );
    vertices.appendChild(v);
  }
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const t = doc.createElementNS(NS, "triangle");
    ["v1", "v2", "v3"].forEach(
      (k, j) => t.setAttribute(k, String(mesh.triangles[i + j]))
    );
    triangles.appendChild(t);
  }
  return object;
}
function addPart(config, cfg, id, name, kind = "ModelPart") {
  const part = config.createElement("part");
  part.setAttribute("id", id);
  part.setAttribute("subtype", roleName(kind));
  setMeta(config, part, "name", name);
  cfg.appendChild(part);
  return part;
}
function brimSettings(format, perimeters) {
  return {
    source_file: "rolling-brim.generated.stl",
    wall_loops: String(perimeters),
    sparse_infill_density: "0%",
    top_shell_layers: "0",
    bottom_shell_layers: "0",
    top_shell_thickness: "0",
    bottom_shell_thickness: "0",
    ensure_vertical_shell_thickness: format === "orca" ? "none" : "disabled",
    gap_infill_speed: "0",
    ironing_type: "no ironing",
    only_one_wall_first_layer: "0",
    ...format === "orca" ? { only_one_wall_top: "0", gap_fill_target: "nowhere" } : { top_one_wall_type: "none" }
  };
}
function freshArchive(project, format) {
  if (project.source && Object.keys(project.source.files).some((p) => /Slic3r_PE.*config/.test(p)))
    throw new Error(
      "Export PrusaSlicer projects to PrusaSlicer to retain their settings."
    );
  if (project.source)
    for (const [path, bytes] of Object.entries(project.source.files)) {
      if (/\.model$/i.test(path) && /(?:\bpid=|\bp[123]=|\bpaint[_:]|\bslic3rpe:)/.test(strFromU8(bytes)))
        throw new Error(
          "This annotated generic 3MF cannot be converted without losing metadata. Use PrusaSlicer output."
        );
    }
  const modelPath = "3D/3dmodel.model", doc = xml(
    `<model xmlns="${NS}" unit="millimeter"><metadata name="Application">RollingBrim-0.1.0</metadata><metadata name="RollingBrim:TargetSlicer">${format}</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><resources/><build/></model>`
  );
  const config = xml("<config/>"), resources = child(doc.documentElement, "resources"), build = child(doc.documentElement, "build"), plate = config.createElement("plate");
  setMeta(config, plate, "plater_id", "1");
  setMeta(config, plate, "plater_name", project.name.replace(/\.[^.]+$/, ""));
  let id = 1;
  for (const object of project.objects) {
    const parent = doc.createElementNS(NS, "object"), components = doc.createElementNS(NS, "components"), cfg = config.createElement("object");
    parent.setAttribute("type", "model");
    parent.appendChild(components);
    for (const part of object.parts) {
      const meshId = String(id++);
      addMesh(doc, resources, meshId, part.mesh);
      const c = doc.createElementNS(NS, "component");
      c.setAttribute("objectid", meshId);
      components.appendChild(c);
      addPart(config, cfg, meshId, part.name, part.kind);
    }
    const parentId = String(id++);
    parent.setAttribute("id", parentId);
    resources.appendChild(parent);
    cfg.setAttribute("id", parentId);
    setMeta(config, cfg, "name", object.name);
    config.documentElement.appendChild(cfg);
    const item = doc.createElementNS(NS, "item");
    item.setAttribute("objectid", parentId);
    build.appendChild(item);
    const ref = config.createElement("model_instance");
    setMeta(config, ref, "object_id", parentId);
    setMeta(config, ref, "instance_id", "0");
    plate.appendChild(ref);
  }
  config.documentElement.appendChild(plate);
  return {
    modelPath,
    files: { [modelPath]: serialize(doc), [CONFIG]: serialize(config) }
  };
}
function remapObjectMetadata(files, objectIndices) {
  for (const path of [
    "Metadata/layer_heights_profile.txt",
    "Metadata/brim_ear_points.txt"
  ]) {
    if (!files[path]) continue;
    const lines = strFromU8(files[path]).split(/\r?\n/).filter(Boolean), entries = /* @__PURE__ */ new Map();
    for (const line of lines) {
      const m = /^object_id=(\d+)\|(.*)$/.exec(line);
      if (!m)
        throw new Error(
          `Cannot safely remap ${path}. Save the project in its slicer first.`
        );
      entries.set(Number(m[1]), m[2]);
    }
    files[path] = strToU8(
      objectIndices.flatMap(
        (old, i) => entries.has(old) ? [`object_id=${i + 1}|${entries.get(old)}`] : []
      ).join("\n") + "\n"
    );
  }
  for (const path of [
    "Metadata/layer_config_ranges.xml",
    "Metadata/cut_information.xml"
  ]) {
    if (!files[path]) continue;
    const doc = xml(strFromU8(files[path])), original = children(doc.documentElement, "object");
    original.forEach(remove);
    objectIndices.forEach((old, i) => {
      const node = original.find((n) => Number(n.getAttribute("id")) === old);
      if (node) {
        const copy = node.cloneNode(true);
        copy.setAttribute("id", String(i + 1));
        doc.documentElement.appendChild(copy);
      }
    });
    files[path] = serialize(doc);
  }
}
function exportNativeProject(project, result, format, modelDocument) {
  if (!result.objects.some((o) => o.mesh.triangles.length))
    throw new Error("Generate at least one brim before exporting.");
  const native = project.format === "bambu" || project.format === "orca";
  const source = native ? project.source : freshArchive(project, format);
  const files = { ...source.files }, a = nativeArchive(
    files,
    source.modelPath,
    native ? modelDocument : void 0
  );
  const { plates, instances } = a;
  if (Object.keys(files).some(
    (p) => /Metadata\/assembly_(tree|model|step)\.json$/i.test(p)
  ))
    throw new Error(
      "Assembly-tree projects need to be saved as a regular plate project before export."
    );
  const resources = child(a.root, "resources"), build = child(a.root, "build");
  const visited = /* @__PURE__ */ new Set();
  const componentTargets = /* @__PURE__ */ new Set();
  const resolve = (path, id, ancestors = /* @__PURE__ */ new Set()) => {
    const key = `${path}#${id}`;
    if (ancestors.has(key) || ancestors.size > 64)
      throw new Error("The 3MF has circular or excessive component nesting.");
    if (visited.has(key)) return;
    const res = a.resource(path, id);
    visited.add(key);
    for (const container of children(res, "components"))
      for (const c of children(container, "component")) {
        const ref = a.reference(c, path);
        componentTargets.add(`${ref.path}#${ref.id}`);
        resolve(ref.path, ref.id, new Set(ancestors).add(key));
      }
  };
  instances.forEach((i) => resolve(i.path, i.id));
  const originalParents = new Map(
    instances.map((i) => [`${i.path}#${i.id}`, a.resource(i.path, i.id)])
  );
  let nextId = [...a.docs.values()].flatMap((d) => children(child(d.documentElement, "resources"), "object")).concat(a.configs).reduce((max, o) => Math.max(max, Number(o.getAttribute("id"))), 0) + 1;
  const originals = a.configs.slice(), objectOrder = [...new Set(a.instances.map((i) => i.id))];
  const oldIndices = [];
  children(build, "item").forEach(remove);
  originals.forEach(remove);
  children(a.config.documentElement, "plate").forEach(remove);
  const assemblyNodes = children(a.config.documentElement, "assemble");
  assemblyNodes.forEach(remove);
  const cacheKeys = [
    "gcode_file",
    "thumbnail_file",
    "thumbnail_no_light_file",
    "top_file",
    "pick_file",
    "pattern_file",
    "pattern_bbox_file"
  ];
  const referencedCaches = /* @__PURE__ */ new Set();
  const outputPlates = new Map(
    plates.map((p) => {
      const node = p.node.cloneNode(true);
      children(node, "model_instance").forEach(remove);
      for (const m of children(node, "metadata")) {
        const key = m.getAttribute("key") || "";
        if (cacheKeys.includes(key)) {
          let path;
          try {
            path = safePath(m.getAttribute("value") || "");
          } catch {
          }
          if (path && files[path]) {
            if (/\.(?:model|config|rels|xml)$/i.test(path))
              throw new Error(
                "A slicer cache refers to model or project data. Save a repaired project in the slicer before export."
              );
            referencedCaches.add(path);
          }
          remove(m);
        } else if (key === "prediction" || key === "weight") remove(m);
      }
      return [p.node, node];
    })
  );
  const assemblies = assemblyNodes.flatMap((n) => children(n, "assemble_item"));
  const outputAssemblies = new Map(
    assemblyNodes.map((n) => {
      const copy = n.cloneNode(true);
      children(copy, "assemble_item").forEach(remove);
      return [n, copy];
    })
  );
  const reused = /* @__PURE__ */ new Set();
  for (const instance of instances) {
    const original = originalParents.get(`${instance.path}#${instance.id}`);
    const parent = original.cloneNode(true);
    const reuse = instance.path === source.modelPath && !reused.has(instance.id) && !componentTargets.has(`${instance.path}#${instance.id}`);
    reused.add(instance.id);
    const id = reuse ? instance.id : String(nextId++);
    parent.setAttribute("id", id);
    if (!reuse) {
      for (const attribute of Array.from(parent.attributes))
        if (attribute.localName?.toLowerCase() === "uuid")
          parent.removeAttribute(attribute.name);
    }
    const cfg = originals.find((c) => c.getAttribute("id") === instance.id)?.cloneNode(true) || a.config.createElement("object");
    cfg.setAttribute("id", id);
    const object = native ? project.objects.find((o) => o.buildIndex === instance.index) : project.objects[instance.index];
    const transform = matrix(instance.item.getAttribute("transform"));
    const brim = object && result.objects.find((o) => o.id === object.id);
    if (object)
      for (const [key, value] of Object.entries(
        settingsFor(
          result.parentOverrides || { elephantFootCompensation: 0 },
          format
        )
      ))
        setMeta(a.config, cfg, key, String(value));
    let components = children(parent, "components")[0];
    if (!components) {
      const mesh = child(parent, "mesh");
      remove(mesh);
      const originalMesh = a.doc.createElementNS(NS, "object"), meshId = String(nextId++);
      originalMesh.setAttribute("id", meshId);
      originalMesh.setAttribute("type", "model");
      originalMesh.appendChild(mesh);
      resources.appendChild(originalMesh);
      components = a.doc.createElementNS(NS, "components");
      parent.appendChild(components);
      const c = a.doc.createElementNS(NS, "component");
      c.setAttribute("objectid", meshId);
      components.appendChild(c);
      addPart(a.config, cfg, meshId, object?.name || "Model");
    } else if (instance.path !== source.modelPath) {
      for (const c of children(components, "component"))
        if (!attr(c, "path")) {
          a.root.setAttribute("xmlns:p", PRODUCTION);
          c.setAttribute("p:path", `/${instance.path}`);
        }
    }
    if (!children(cfg, "part").length)
      for (const [index, c] of children(components, "component").entries()) {
        addPart(
          a.config,
          cfg,
          c.getAttribute("objectid"),
          object?.parts[index]?.name || `Part ${index + 1}`
        );
      }
    if (!reuse) {
      for (const c of children(components, "component"))
        for (const attribute of Array.from(c.attributes))
          if (attribute.localName?.toLowerCase() === "uuid")
            c.removeAttribute(attribute.name);
    }
    if (brim?.mesh.triangles.length) {
      const brimId = String(nextId++);
      addMesh(
        a.doc,
        resources,
        brimId,
        transformMesh(brim.mesh, transform.clone().invert())
      );
      const c = a.doc.createElementNS(NS, "component");
      c.setAttribute("objectid", brimId);
      components.appendChild(c);
      const part = addPart(a.config, cfg, brimId, brim.name || "Rolling brim");
      Object.entries(
        brim.printOverrides ? settingsFor(brim.printOverrides, format) : brimSettings(format, result.settings.perimeters)
      ).forEach(([k, v]) => setMeta(a.config, part, k, v));
    }
    if (reuse) remove(original);
    resources.appendChild(parent);
    a.config.documentElement.appendChild(cfg);
    const item = instance.item.cloneNode(true);
    for (const attribute of Array.from(item.attributes))
      if (attribute.localName === "path") item.removeAttribute(attribute.name);
    item.setAttribute("objectid", id);
    build.appendChild(item);
    const assigned = plates.find((p) => p.instances.includes(instance));
    if (assigned) {
      const ref = children(assigned.node, "model_instance").find(
        (r) => meta(r, "object_id") === instance.id && meta(r, "instance_id") === String(instance.instance)
      )?.cloneNode(true);
      const outputRef = ref || a.config.createElement("model_instance");
      setMeta(a.config, outputRef, "object_id", id);
      setMeta(a.config, outputRef, "instance_id", "0");
      outputPlates.get(assigned.node).appendChild(outputRef);
    }
    const originalAssemble = assemblies.find(
      (n) => n.getAttribute("object_id") === instance.id && n.getAttribute("instance_id") === String(instance.instance)
    );
    if (originalAssemble) {
      const copy = originalAssemble.cloneNode(true);
      copy.setAttribute("object_id", id);
      copy.setAttribute("instance_id", "0");
      outputAssemblies.get(originalAssemble.parentNode).appendChild(copy);
    }
    oldIndices.push(objectOrder.indexOf(instance.id) + 1);
  }
  for (const node of outputPlates.values())
    a.config.documentElement.appendChild(node);
  originals.filter(
    (c) => !reused.has(c.getAttribute("id")) || componentTargets.has(`${source.modelPath}#${c.getAttribute("id")}`)
  ).forEach((c) => a.config.documentElement.appendChild(c));
  for (const assembly of outputAssemblies.values())
    a.config.documentElement.appendChild(assembly);
  files[CONFIG] = serialize(a.config);
  if (oldIndices.some((index, i) => index !== i + 1))
    remapObjectMetadata(files, oldIndices);
  for (const path of Object.keys(files))
    if (referencedCaches.has(path) || /\.(?:gcode|bgcode)(?:\.md5)?$|^Metadata\/(?:slice_info\.config|(?:plate|plate_no_light|top|pick|pattern)_\d+\.(?:png|jpg)|pattern_\d+(?:_bbox)?\.json|bbl_thumbnail\.png)$|^Auxiliaries\/\.thumbnails\//i.test(
      path
    ))
      delete files[path];
  for (const m of children(a.root, "metadata"))
    if (/^Thumbnail/i.test(m.getAttribute("name") || "")) remove(m);
  files[source.modelPath] = serialize(a.doc);
  for (const path of Object.keys(files).filter((p) => p.endsWith(".rels"))) {
    const doc = xml(strFromU8(files[path]));
    let changed = false;
    const base = path === "_rels/.rels" ? "" : path.slice(0, path.lastIndexOf("_rels/"));
    for (const relation of children(doc.documentElement, "Relationship")) {
      const target = relation.getAttribute("Target") || "";
      if (relation.getAttribute("TargetMode") === "External") continue;
      const resolved = safePath(
        target.startsWith("/") ? target : base + target
      );
      if (!files[resolved]) {
        remove(relation);
        changed = true;
      }
    }
    if (changed) files[path] = serialize(doc);
  }
  const relNS = "http://schemas.openxmlformats.org/package/2006/relationships";
  files["_rels/.rels"] ||= strToU8(
    `<Relationships xmlns="${relNS}"><Relationship Id="rel-1" Target="/${source.modelPath}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`
  );
  const slash = source.modelPath.lastIndexOf("/"), relPath = `${source.modelPath.slice(0, slash + 1)}_rels/${source.modelPath.slice(slash + 1)}.rels`;
  const modelRels = files[relPath] ? xml(strFromU8(files[relPath])) : xml(`<Relationships xmlns="${relNS}"/>`);
  let changedRels = !files[relPath];
  const relations = children(modelRels.documentElement, "Relationship"), relationIds = new Set(relations.map((r) => r.getAttribute("Id")));
  for (const path of [...a.docs.keys()].filter(
    (p) => p !== source.modelPath && files[p]
  )) {
    if (relations.some((r2) => {
      const target = r2.getAttribute("Target") || "";
      return r2.getAttribute("TargetMode") !== "External" && safePath(
        target.startsWith("/") ? target : source.modelPath.slice(0, slash + 1) + target
      ) === path;
    }))
      continue;
    let id = 1;
    while (relationIds.has(`model-${id}`)) id++;
    relationIds.add(`model-${id}`);
    const r = modelRels.createElementNS(relNS, "Relationship");
    r.setAttribute("Id", `model-${id}`);
    r.setAttribute("Target", `/${path}`);
    r.setAttribute(
      "Type",
      "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"
    );
    modelRels.documentElement.appendChild(r);
    changedRels = true;
  }
  if (changedRels) files[relPath] = serialize(modelRels);
  const ctNS = "http://schemas.openxmlformats.org/package/2006/content-types";
  const ct = files["[Content_Types].xml"] ? xml(strFromU8(files["[Content_Types].xml"])) : xml(`<Types xmlns="${ctNS}"/>`);
  children(ct.documentElement, "Override").filter((n) => !files[safePath(n.getAttribute("PartName") || "")]).forEach(remove);
  for (const [ext, type] of [
    ["model", "application/vnd.ms-package.3dmanufacturing-3dmodel+xml"],
    ["rels", "application/vnd.openxmlformats-package.relationships+xml"],
    ["config", "application/octet-stream"],
    ["json", "application/json"]
  ])
    if (!children(ct.documentElement, "Default").some(
      (n) => n.getAttribute("Extension") === ext
    )) {
      const n = ct.createElementNS(ctNS, "Default");
      n.setAttribute("Extension", ext);
      n.setAttribute("ContentType", type);
      ct.documentElement.appendChild(n);
    }
  files["[Content_Types].xml"] = serialize(ct);
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
  return zipSync(files, { level: 6 });
}

export {
  importNativeProject,
  exportNativeProject
};
