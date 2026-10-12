import {
  encodePaint
} from "./chunk-A7PZNYIJ.js";
import {
  strToU8,
  zipSync
} from "./chunk-5WIV2BUJ.js";

// src/flat-writer.js
var xmlEscape = (s) => String(s).replace(
  /[<>&"']/g,
  (c) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;"
  })[c]
);
function export3mf(pieces, palette, options = {}) {
  const format = options.format || "universal";
  if (!["universal", "orca", "prusa3"].includes(format))
    throw new Error("Unknown 3MF export format.");
  const prusa3 = format === "prusa3";
  if (!pieces.length) throw new Error("Select at least one piece to export.");
  if (!Array.isArray(palette) || !palette.length || palette.length > 255 || palette.some((c) => !/^#[\da-f]{6}$/i.test(c)))
    throw new Error("Export requires 1\u2013255 valid material colors.");
  if (pieces.some(
    (p) => !p.faces.length || p.faces.some(
      (f) => !Number.isInteger(f.material) || f.material < 1 || f.material > palette.length
    )
  ))
    throw new Error(
      "Every exported face needs a material slot present in the palette."
    );
  const paintVersion = pieces.some(
    (piece) => piece.faces.some((face) => face.material > 16)
  ) ? 2 : 1;
  if (format === "orca" && paintVersion > 1)
    throw new Error(
      "OrcaSlicer 2.4.2 supports painted material slots 1\u201316. Reassign higher slots before exporting, or choose PrusaSlicer / Bambu Studio."
    );
  const meshId = (i) => 2 + i * (prusa3 ? 3 : 1);
  const objectId = (i) => meshId(i) + (prusa3 ? 2 : 0);
  const objects = pieces.map((piece, index) => {
    const vertices = piece.vertices.map((p) => `<vertex x="${p[0]}" y="${p[1]}" z="${p[2]}"/>`).join("");
    const faces = piece.faces.map(
      (f) => `<triangle v1="${f.v[0]}" v2="${f.v[1]}" v3="${f.v[2]}" slic3rpe:mmu_segmentation="${encodePaint(f.material)}" paint_color="${encodePaint(f.material, "bambu")}" pid="1" p1="${f.material - 1}"/>`
    ).join("");
    const id = meshId(index), name = xmlEscape(piece.name);
    return `<object id="${id}" type="model" name="${name}"><mesh><vertices>${vertices}</vertices><triangles>${faces}</triangles></mesh></object>` + (prusa3 ? `<object id="${id + 1}" type="model" name="${name}"><components><component objectid="${id}"/></components></object><object id="${id + 2}" type="model" name="${name}"><components><component objectid="${id + 1}"/></components></object>` : "");
  }).join("");
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"><metadata name="Application">ThreeMFKit-0.1.1</metadata>${format === "orca" ? '<metadata name="ThreeMFKit:TargetSlicer">orca</metadata>' : ""}<metadata name="slic3rpe:Version3mf">1</metadata><metadata name="slic3rpe:MmPaintingVersion">${paintVersion}</metadata><resources><m:colorgroup id="1">${palette.map((c) => `<m:color color="${xmlEscape(c)}FF"/>`).join("")}</m:colorgroup>${objects}</resources><build>${pieces.map((_, i) => `<item objectid="${objectId(i)}"/>`).join("")}</build></model>`;
  const annotations = prusa3 ? {
    "Metadata/PrusaSlicer3_project.json": strToU8(
      JSON.stringify({
        project: { id: "00000000-0000-4000-8000-000000000001", version: 0 },
        objects: pieces.map((_, i) => ({
          id: objectId(i),
          object_settings: {},
          volumes: [
            { id: meshId(i) + 1, type: "ModelPart", volume_settings: {} }
          ]
        })),
        config_containers: []
      })
    ),
    "Metadata/Slic3r_facets_annotation.json": strToU8(
      JSON.stringify(
        pieces.map((p, i) => ({
          id: meshId(i) + 1,
          mmSegmentationFacetsVersion: paintVersion,
          mmSegmentationFacets: p.faces.map((f, triangle) => ({
            triangle,
            dividing: encodePaint(f.material)
          }))
        }))
      )
    )
  } : {};
  return zipSync(
    {
      "[Content_Types].xml": strToU8(
        `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>${prusa3 ? '<Default Extension="json" ContentType="application/json"/>' : ""}</Types>`
      ),
      "_rels/.rels": strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
      ),
      "3D/3dmodel.model": strToU8(model),
      ...annotations
    },
    { level: 6 }
  );
}

export {
  export3mf
};
