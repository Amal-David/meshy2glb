// src/compat/prusa3-config.ts
var fail = (reason) => {
  throw new Error(`Unsupported PrusaSlicer 3.x project: ${reason}`);
};
function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object.`);
  return value;
}
function list(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return value;
}
function keys(value, allowed, label) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) fail(`Unrecognized ${label} field: ${unknown}.`);
}
function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e6)
    fail(`Invalid ${label}.`);
  return value;
}
function integer(value, label, min = 0) {
  const n = finite(value, label);
  if (!Number.isSafeInteger(n) || n < min) fail(`Invalid ${label}.`);
  return n;
}
function configuration(value) {
  const config = record(value, "configuration");
  for (const name of [
    "printer_settings",
    "print_settings",
    "toolprint_settings"
  ])
    record(config[name], name);
  return config;
}

export {
  fail,
  record,
  list,
  keys,
  integer,
  configuration
};
