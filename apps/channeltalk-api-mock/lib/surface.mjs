// lib/surface.mjs — 표면(SSOT) 로더 + 최소 스키마 검증. 순수(경로는 인자), 무의존.
//
// loadSurface(path)   : JSON 파일을 읽어 파싱해 반환. (I/O 는 여기 한 곳)
// parseSurface(text)  : 문자열을 파싱만 (순수, I/O 없음)
// validate(data, schema) : draft-07 부분집합 검증 → { ok, errors[] }
//
// 검증기는 이 저장소의 schemas/*.json 이 실제로 쓰는 키워드만 지원한다:
// type · enum · required · properties · additionalProperties · items · minItems ·
// minimum · maximum · pattern · $ref(#/definitions/...) · minLength · maxItems.
// 새 키워드가 스키마에 필요하면 여기 검증기를 먼저 확장한다(하드코딩 금지 원칙).

import { readFileSync } from "node:fs";

export function parseSurface(text) {
  return JSON.parse(text);
}

export function loadSurface(path) {
  return parseSurface(readFileSync(path, "utf8"));
}

export function loadJson(path) {
  return parseSurface(readFileSync(path, "utf8"));
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v; // "number" | "string" | "boolean" | "object"
}

function typeMatches(v, t) {
  const actual = typeOf(v);
  if (t === "number") return actual === "number" || actual === "integer";
  if (t === "integer") return actual === "integer";
  return actual === t;
}

function resolveRef(ref, root) {
  // 지원: "#/definitions/<name>" 형태만.
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref: ${ref}`);
  const parts = ref.slice(2).split("/");
  let node = root;
  for (const p of parts) {
    node = node?.[p];
    if (node === undefined) throw new Error(`$ref not found: ${ref}`);
  }
  return node;
}

function checkNode(value, schema, root, path, errors) {
  if (!schema || typeof schema !== "object") return;

  if (schema.$ref) {
    checkNode(value, resolveRef(schema.$ref, root), root, path, errors);
    return;
  }

  // type
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(value, t))) {
      errors.push(`${path}: expected type ${types.join("|")}, got ${typeOf(value)}`);
      return; // 타입이 틀리면 하위 검증 무의미
    }
  }

  // enum
  if (schema.enum !== undefined) {
    const ok = schema.enum.some((e) => e === value);
    if (!ok) errors.push(`${path}: value ${JSON.stringify(value)} not in enum`);
  }

  const t = typeOf(value);

  if (t === "number" || t === "integer") {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push(`${path}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push(`${path}: ${value} > maximum ${schema.maximum}`);
  }

  if (t === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value))
      errors.push(`${path}: string does not match pattern ${schema.pattern}`);
  }

  if (t === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push(`${path}: array shorter than minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errors.push(`${path}: array longer than maxItems ${schema.maxItems}`);
    if (schema.items) {
      value.forEach((item, i) => checkNode(item, schema.items, root, `${path}[${i}]`, errors));
    }
  }

  if (t === "object") {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) errors.push(`${path}: missing required property '${key}'`);
      }
    }
    const props = schema.properties || {};
    for (const [key, val] of Object.entries(value)) {
      if (props[key]) {
        checkNode(val, props[key], root, `${path}.${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: additional property '${key}' not allowed`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        checkNode(val, schema.additionalProperties, root, `${path}.${key}`, errors);
      }
    }
  }
}

export function validate(data, schema) {
  const errors = [];
  checkNode(data, schema, schema, "$", errors);
  return { ok: errors.length === 0, errors };
}
