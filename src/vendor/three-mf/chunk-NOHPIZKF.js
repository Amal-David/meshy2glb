import {
  serialize,
  xml
} from "./chunk-KJN6FYMH.js";
import {
  strToU8
} from "./chunk-5WIV2BUJ.js";

// src/compat/three-mf-package.ts
function packageFiles(modelPath) {
  const rels = xml(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
  );
  const relation = rels.createElementNS(
    rels.documentElement.namespaceURI,
    "Relationship"
  );
  relation.setAttribute("Id", "model");
  relation.setAttribute(
    "Target",
    `/${modelPath.split("/").map(encodeURIComponent).join("/")}`
  );
  relation.setAttribute(
    "Type",
    "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"
  );
  rels.documentElement.appendChild(relation);
  return {
    "_rels/.rels": serialize(rels),
    "[Content_Types].xml": strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/octet-stream"/><Default Extension="json" ContentType="application/json"/></Types>'
    )
  };
}

export {
  packageFiles
};
