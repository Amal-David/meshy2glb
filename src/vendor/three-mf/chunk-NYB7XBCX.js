import {
  strToU8
} from "./chunk-5WIV2BUJ.js";

// src/settings.js
var pairs = {
  perimeterCount: ["perimeters", "wall_loops"],
  infillPercent: ["fill_density", "sparse_infill_density"],
  topLayers: ["top_solid_layers", "top_shell_layers"],
  bottomLayers: ["bottom_solid_layers", "bottom_shell_layers"],
  topThickness: ["top_solid_min_thickness", "top_shell_thickness"],
  bottomThickness: ["bottom_solid_min_thickness", "bottom_shell_thickness"],
  elephantFootCompensation: [
    "elefant_foot_compensation",
    "elefant_foot_compensation"
  ],
  sourceName: ["source_file", "source_file"]
};
function settingsFor(overrides = {}, format = "prusa") {
  const out = {};
  const native = format === "bambu" || format === "orca";
  const bool = (v) => format === "prusa3" ? v : v ? "1" : "0";
  for (const [key, value] of Object.entries(overrides)) {
    if (pairs[key]) {
      if (key === "sourceName" && format === "prusa3") continue;
      if (key !== "sourceName" && (!Number.isFinite(value) || value < 0))
        throw new Error(`Invalid print override: ${key}.`);
      if (["perimeterCount", "topLayers", "bottomLayers"].includes(key) && !Number.isInteger(value))
        throw new Error(`Invalid print override: ${key}.`);
      if (key === "infillPercent" && value > 100)
        throw new Error("Invalid infill percentage.");
      out[pairs[key][native ? 1 : 0]] = key === "infillPercent" ? format === "prusa3" ? { value, is_percent: true } : `${value}%` : format === "prusa3" ? value : String(value);
    } else if ([
      "gapFill",
      "verticalShells",
      "firstLayerSingleWall",
      "topSingleWall",
      "ironing",
      "wipeIntoInfill"
    ].includes(key)) {
      if (typeof value !== "boolean")
        throw new Error(`Invalid print override: ${key}.`);
      if (key === "gapFill") {
        if (native) {
          if (value)
            throw new Error(
              "Enabling gap fill requires a slicer-specific speed."
            );
          out.gap_infill_speed = "0";
          if (format === "orca") out.gap_fill_target = "nowhere";
        } else out.gap_fill_enabled = bool(value);
      }
      if (key === "verticalShells")
        out.ensure_vertical_shell_thickness = value ? "enabled" : format === "orca" ? "none" : "disabled";
      if (key === "firstLayerSingleWall")
        out[native ? "only_one_wall_first_layer" : "only_one_perimeter_first_layer"] = bool(value);
      if (key === "topSingleWall")
        out[format === "orca" ? "only_one_wall_top" : native ? "top_one_wall_type" : "top_one_perimeter_type"] = format === "orca" ? bool(value) : value ? "all" : "none";
      if (key === "ironing")
        out[native ? "ironing_type" : "ironing"] = native ? value ? "top" : "no ironing" : bool(value);
      if (key === "wipeIntoInfill")
        out[native ? "flush_into_infill" : "wipe_into_infill"] = bool(value);
    } else throw new Error(`Unsupported print override: ${key}.`);
  }
  return out;
}

// src/metadata.ts
function writeApplicationMetadata(files, metadata) {
  if (!metadata) return;
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(metadata.name))
    throw new Error("Invalid application metadata name.");
  files[`Metadata/${metadata.name}.json`] = strToU8(
    JSON.stringify(metadata.data)
  );
}

export {
  settingsFor,
  writeApplicationMetadata
};
