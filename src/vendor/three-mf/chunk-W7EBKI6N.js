import {
  children
} from "./chunk-KJN6FYMH.js";

// src/compat/three-mf-dialect.ts
function detectThreeMfDialect(files, root) {
  if (Object.keys(files).some(
    (path) => /^Metadata\/(?:PrusaSlicer3_project|Slic3r_facets_annotation)\.json$/i.test(
      path
    )
  ))
    return "prusa3";
  const applications = children(root, "metadata").filter(
    (m) => m.getAttribute("name") === "Application"
  );
  if (applications.some((m) => {
    const major = /^PrusaSlicer[-\s]+(\d+)(?:\.|$)/i.exec(
      m.textContent?.trim() || ""
    )?.[1];
    return major !== void 0 && Number(major) >= 3;
  }))
    return "prusa3";
  if (files["Metadata/model_settings.config"] || files["Metadata/project_settings.config"])
    return "bambu-orca";
  if (files["Metadata/Slic3r_PE_model.config"] || files["Metadata/Slic3r_PE.config"])
    return "prusa2";
  return "generic";
}

export {
  detectThreeMfDialect
};
