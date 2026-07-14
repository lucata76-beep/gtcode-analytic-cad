import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { compile, parse } from "mathjs";
import {
  Aperture,
  Braces,
  Calculator,
  Check,
  ChevronDown,
  Circle,
  CircleDot,
  Copy,
  Crosshair,
  FileCode2,
  FileDown,
  Focus,
  FolderOpen,
  Fullscreen,
  Grid3X3,
  HelpCircle,
  Info,
  LineChart,
  Maximize,
  MousePointer2,
  Move,
  PanelLeftClose,
  PanelRightClose,
  PencilRuler,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Scissors,
  Settings2,
  Share2,
  Sigma,
  Sparkles,
  Target,
  Trash2,
  Undo2,
  X,
  ZoomIn,
} from "lucide-react";

type Point = { x: number; y: number };
type Segment = { a: Point; b: Point };
type CurveType = "function" | "implicit" | "parametric";
type Curve = {
  id: string;
  name: string;
  type: CurveType;
  expression: string;
  color: string;
  visible: boolean;
  domainMin: number;
  domainMax: number;
  samples: number;
  trimmedPaths?: Point[][];
};
type Parameter = { id: string; name: string; value: number };
type Intersection = Point & { id: string; curves: [string, string] };
type DrawEntity =
  | { id: string; type: "point"; p: Point }
  | { id: string; type: "line"; a: Point; b: Point }
  | { id: string; type: "circle"; c: Point; r: number }
  | { id: string; type: "polyline"; points: Point[]; source?: string };
type View = { cx: number; cy: number; scale: number };
type Tool = "select" | "pan" | "point" | "line" | "circle" | "measure" | "zoom-window" | "trim";
type SnapKind = "Fine" | "Medio" | "Centro" | "Intersezione" | "Vicino" | "Tangente";
type SnapState = Record<SnapKind, boolean>;
type SnapHit = { point: Point; kind: SnapKind } | null;
type Inspection = { curveId: string; point: Point; angle: number; slope: number };
type PostSettings = {
  program: string;
  comment: string;
  safeZ: number;
  workZ: number;
  feedXY: number;
  feedZ: number;
  spindle: number;
  tool: number;
  workOffset: string;
  decimals: number;
  coolant: boolean;
  closePath: boolean;
};
type PlotGeometry = { curve: Curve; segments: Segment[]; points: Point[]; paths?: Point[][]; error?: string };

const VERSION = "1.1.0";
const COLORS = ["#ff8a1d", "#47c8ff", "#c985ff", "#73e0aa", "#f15b74", "#ffd166"];
const DEFAULT_VIEW: View = { cx: 0, cy: 0, scale: 10 };
const DEFAULT_PARAMS: Parameter[] = [
  { id: "p-a", name: "a", value: 1 },
  { id: "p-b", name: "b", value: 0 },
  { id: "p-c", name: "c", value: 0 },
  { id: "p-r", name: "r", value: 30 },
];
const DEFAULT_CURVES: Curve[] = [
  {
    id: "curve-parabola",
    name: "Parabola",
    type: "function",
    expression: "y = 0.1*x^2 - 8",
    color: COLORS[0],
    visible: true,
    domainMin: -50,
    domainMax: 50,
    samples: 900,
  },
  {
    id: "curve-line",
    name: "Retta",
    type: "function",
    expression: "y = 0.65*x + 4",
    color: COLORS[1],
    visible: true,
    domainMin: -50,
    domainMax: 50,
    samples: 900,
  },
  {
    id: "curve-circle",
    name: "Circonferenza",
    type: "implicit",
    expression: "x^2 + y^2 = r^2",
    color: COLORS[2],
    visible: false,
    domainMin: -50,
    domainMax: 50,
    samples: 120,
  },
];
const DEFAULT_POST: PostSettings = {
  program: "0100",
  comment: "GT_CODE_PROFILE",
  safeZ: 15,
  workZ: -1,
  feedXY: 500,
  feedZ: 150,
  spindle: 2500,
  tool: 1,
  workOffset: "G54",
  decimals: 3,
  coolant: true,
  closePath: false,
};
const DEFAULT_SNAPS: SnapState = {
  Fine: true,
  Medio: true,
  Centro: true,
  Intersezione: true,
  Vicino: true,
  Tangente: true,
};

const PRESETS: Array<{ name: string; type: CurveType; expression: string; note: string }> = [
  { name: "Retta", type: "function", expression: "y = 2*x + 5", note: "y = mx + q" },
  { name: "Parabola", type: "function", expression: "y = 0.1*x^2 - 8", note: "y = ax² + bx + c" },
  { name: "Circonferenza", type: "implicit", expression: "x^2 + y^2 = 30^2", note: "x² + y² = r²" },
  { name: "Ellisse", type: "implicit", expression: "x^2/40^2 + y^2/20^2 = 1", note: "x²/a² + y²/b² = 1" },
  { name: "Sinusoide", type: "function", expression: "y = 12*sin(x/8)", note: "y = A sin(ωx + φ)" },
  { name: "Cosinusoide", type: "function", expression: "y = 10*cos(x/6) + 4", note: "y = A cos(ωx + φ) + k" },
  { name: "Iperbole", type: "function", expression: "y = 120/x", note: "y = k/x" },
  { name: "Spirale", type: "parametric", expression: "x=(2+0.35*t)*cos(t); y=(2+0.35*t)*sin(t)", note: "x(t); y(t)" },
];

const FUNCTION_NAMES = new Set([
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
  "sinh",
  "cosh",
  "tanh",
  "sqrt",
  "abs",
  "exp",
  "log",
  "log10",
  "pow",
  "min",
  "max",
  "floor",
  "ceil",
  "round",
  "sign",
]);

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function finitePoint(p: Point) {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e9 && Math.abs(p.y) < 1e9;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeExpression(raw: string) {
  return raw
    .trim()
    .replace(/−/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/gi, "pi")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/\bln\s*\(/gi, "log(")
    .replace(/(\d),(\d)/g, "$1.$2");
}

function validateNode(expression: string, variables: Set<string>) {
  if (!expression.trim()) throw new Error("Formula vuota");
  if (!/^[0-9a-zA-Z_+\-*/^().,\s]+$/.test(expression)) {
    throw new Error("Carattere non ammesso nella formula");
  }
  const node = parse(expression);
  node.traverse((child) => {
    const type = child.type;
    if (["AssignmentNode", "FunctionAssignmentNode", "AccessorNode", "ArrayNode", "ObjectNode", "BlockNode", "ConditionalNode"].includes(type)) {
      throw new Error("Costrutto non ammesso");
    }
    if (type === "FunctionNode") {
      const fnName = (child as unknown as { fn?: { name?: string } }).fn?.name;
      if (!fnName || !FUNCTION_NAMES.has(fnName)) throw new Error(`Funzione non ammessa: ${fnName ?? "?"}`);
    }
    if (type === "SymbolNode") {
      const name = (child as unknown as { name: string }).name;
      if (!variables.has(name) && !FUNCTION_NAMES.has(name) && name !== "pi" && name !== "e") {
        throw new Error(`Variabile sconosciuta: ${name}`);
      }
    }
  });
  return node;
}

function compileCurve(curve: Curve, params: Record<string, number>) {
  const variables = new Set(["x", "y", "t", ...Object.keys(params)]);
  const normalized = normalizeExpression(curve.expression);
  if (curve.type === "function") {
    const body = normalized.replace(/^\s*(?:f\s*\(\s*x\s*\)|y)\s*=\s*/i, "");
    validateNode(body, variables);
    const code = compile(body);
    return { kind: "function" as const, y: (x: number) => Number(code.evaluate({ ...params, x })) };
  }
  if (curve.type === "parametric") {
    const parts = normalized.split(";").map((part) => part.trim()).filter(Boolean);
    const xPart = parts.find((part) => /^x\s*=/.test(part));
    const yPart = parts.find((part) => /^y\s*=/.test(part));
    if (!xPart || !yPart) throw new Error("Usa: x=...; y=...");
    const xBody = xPart.replace(/^x\s*=\s*/, "");
    const yBody = yPart.replace(/^y\s*=\s*/, "");
    validateNode(xBody, variables);
    validateNode(yBody, variables);
    const xCode = compile(xBody);
    const yCode = compile(yBody);
    return {
      kind: "parametric" as const,
      p: (t: number) => ({ x: Number(xCode.evaluate({ ...params, t })), y: Number(yCode.evaluate({ ...params, t })) }),
    };
  }
  const eqParts = normalized.split("=");
  const body = eqParts.length === 2 ? `((${eqParts[0]})-(${eqParts[1]}))` : normalized;
  if (eqParts.length > 2) throw new Error("L'equazione contiene troppi segni =");
  validateNode(body, variables);
  const code = compile(body);
  return {
    kind: "implicit" as const,
    f: (x: number, y: number) => Number(code.evaluate({ ...params, x, y })),
  };
}

function geometryFromPaths(curve: Curve, rawPaths: Point[][]): PlotGeometry {
  const paths = rawPaths
    .map((path) => path.filter(finitePoint).filter((point, index, points) => index === 0 || distance(point, points[index - 1]) > 1e-10))
    .filter((path) => path.length > 1);
  const segments = paths.flatMap((path) => path.slice(1).map((point, index) => ({ a: path[index], b: point })));
  return { curve, paths, segments, points: paths.flat() };
}

function sampledGeometry(curve: Curve, params: Record<string, number>, bounds?: { xMin: number; xMax: number; yMin: number; yMax: number }): PlotGeometry {
  try {
    if (curve.trimmedPaths?.length) return geometryFromPaths(curve, curve.trimmedPaths);
    const compiled = compileCurve(curve, params);
    const segments: Segment[] = [];
    const points: Point[] = [];
    const xMin = bounds ? Math.max(curve.domainMin, bounds.xMin) : curve.domainMin;
    const xMax = bounds ? Math.min(curve.domainMax, bounds.xMax) : curve.domainMax;
    if (!(xMax > xMin)) return { curve, segments, points };
    if (compiled.kind === "function") {
      const n = Math.max(100, Math.min(1600, curve.samples));
      let previous: Point | null = null;
      let currentPath: Point[] = [];
      const paths: Point[][] = [];
      for (let i = 0; i <= n; i += 1) {
        const x = xMin + ((xMax - xMin) * i) / n;
        const p = { x, y: compiled.y(x) };
        const valid = finitePoint(p) && (!bounds || (p.y > bounds.yMin - (bounds.yMax - bounds.yMin) * 2 && p.y < bounds.yMax + (bounds.yMax - bounds.yMin) * 2));
        if (valid) {
          points.push(p);
          const continuous = previous && Math.abs(p.y - previous.y) < Math.max(50, Math.abs(p.y) * 1.2);
          if (continuous && previous) {
            segments.push({ a: previous, b: p });
            currentPath.push(p);
          } else {
            if (currentPath.length > 1) paths.push(currentPath);
            currentPath = [p];
          }
          previous = p;
        } else {
          if (currentPath.length > 1) paths.push(currentPath);
          currentPath = [];
          previous = null;
        }
      }
      if (currentPath.length > 1) paths.push(currentPath);
      return { curve, segments, points, paths };
    }
    if (compiled.kind === "parametric") {
      const n = Math.max(100, Math.min(2400, curve.samples));
      let previous: Point | null = null;
      let currentPath: Point[] = [];
      const paths: Point[][] = [];
      for (let i = 0; i <= n; i += 1) {
        const t = curve.domainMin + ((curve.domainMax - curve.domainMin) * i) / n;
        const p = compiled.p(t);
        if (finitePoint(p)) {
          points.push(p);
          if (previous) {
            segments.push({ a: previous, b: p });
            currentPath.push(p);
          } else currentPath = [p];
          previous = p;
        } else {
          if (currentPath.length > 1) paths.push(currentPath);
          currentPath = [];
          previous = null;
        }
      }
      if (currentPath.length > 1) paths.push(currentPath);
      return { curve, segments, points, paths };
    }
    const bx = bounds ?? { xMin: curve.domainMin, xMax: curve.domainMax, yMin: curve.domainMin, yMax: curve.domainMax };
    const nX = Math.max(40, Math.min(180, curve.samples));
    const aspect = Math.max(0.45, Math.min(2.2, (bx.yMax - bx.yMin) / (bx.xMax - bx.xMin)));
    const nY = Math.max(40, Math.round(nX * aspect));
    const values: number[][] = Array.from({ length: nY + 1 }, () => Array(nX + 1).fill(NaN));
    for (let iy = 0; iy <= nY; iy += 1) {
      const y = bx.yMin + ((bx.yMax - bx.yMin) * iy) / nY;
      for (let ix = 0; ix <= nX; ix += 1) {
        const x = bx.xMin + ((bx.xMax - bx.xMin) * ix) / nX;
        try {
          values[iy][ix] = compiled.f(x, y);
        } catch {
          values[iy][ix] = NaN;
        }
      }
    }
    const interpolate = (p1: Point, p2: Point, v1: number, v2: number) => {
      const denom = v1 - v2;
      const t = Math.abs(denom) < 1e-14 ? 0.5 : Math.max(0, Math.min(1, v1 / denom));
      return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
    };
    for (let iy = 0; iy < nY; iy += 1) {
      const y0 = bx.yMin + ((bx.yMax - bx.yMin) * iy) / nY;
      const y1 = bx.yMin + ((bx.yMax - bx.yMin) * (iy + 1)) / nY;
      for (let ix = 0; ix < nX; ix += 1) {
        const x0 = bx.xMin + ((bx.xMax - bx.xMin) * ix) / nX;
        const x1 = bx.xMin + ((bx.xMax - bx.xMin) * (ix + 1)) / nX;
        const corners = [
          { p: { x: x0, y: y0 }, v: values[iy][ix] },
          { p: { x: x1, y: y0 }, v: values[iy][ix + 1] },
          { p: { x: x1, y: y1 }, v: values[iy + 1][ix + 1] },
          { p: { x: x0, y: y1 }, v: values[iy + 1][ix] },
        ];
        if (corners.some((corner) => !Number.isFinite(corner.v))) continue;
        const crossings: Point[] = [];
        for (let edge = 0; edge < 4; edge += 1) {
          const c1 = corners[edge];
          const c2 = corners[(edge + 1) % 4];
          if ((c1.v <= 0 && c2.v > 0) || (c1.v > 0 && c2.v <= 0)) crossings.push(interpolate(c1.p, c2.p, c1.v, c2.v));
        }
        if (crossings.length === 2) {
          segments.push({ a: crossings[0], b: crossings[1] });
          points.push(crossings[0], crossings[1]);
        } else if (crossings.length === 4) {
          const centerValue = compiled.f((x0 + x1) / 2, (y0 + y1) / 2);
          const pairs = centerValue > 0 ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
          for (const pair of pairs) {
            segments.push({ a: crossings[pair[0]], b: crossings[pair[1]] });
            points.push(crossings[pair[0]], crossings[pair[1]]);
          }
        }
      }
    }
    const epsilon = Math.max((bx.xMax - bx.xMin) / nX, (bx.yMax - bx.yMin) / nY) * 0.001;
    const paths = chainSegments(segments, epsilon).sort((a, b) => pathLength(b) - pathLength(a));
    return { curve, segments, points: paths.flat(), paths };
  } catch (error) {
    return { curve, segments: [], points: [], error: error instanceof Error ? error.message : "Formula non valida" };
  }
}

function segmentIntersection(s1: Segment, s2: Segment): Point | null {
  const x1 = s1.a.x, y1 = s1.a.y, x2 = s1.b.x, y2 = s1.b.y;
  const x3 = s2.a.x, y3 = s2.a.y, x4 = s2.b.x, y4 = s2.b.y;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
  if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) return null;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

function segmentBoundsOverlap(a: Segment, b: Segment) {
  return !(
    Math.max(a.a.x, a.b.x) < Math.min(b.a.x, b.b.x) ||
    Math.max(b.a.x, b.b.x) < Math.min(a.a.x, a.b.x) ||
    Math.max(a.a.y, a.b.y) < Math.min(b.a.y, b.b.y) ||
    Math.max(b.a.y, b.b.y) < Math.min(a.a.y, a.b.y)
  );
}

function calculateIntersections(geometries: PlotGeometry[], tolerance: number): Intersection[] {
  const found: Intersection[] = [];
  for (let a = 0; a < geometries.length; a += 1) {
    for (let b = a + 1; b < geometries.length; b += 1) {
      const g1 = geometries[a];
      const g2 = geometries[b];
      if (g1.error || g2.error) continue;
      for (const s1 of g1.segments) {
        for (const s2 of g2.segments) {
          if (!segmentBoundsOverlap(s1, s2)) continue;
          const p = segmentIntersection(s1, s2);
          if (!p || !finitePoint(p)) continue;
          const mergeTolerance = Math.max(tolerance * 2, 1e-5);
          if (found.some((item) => distance(item, p) < mergeTolerance)) continue;
          found.push({ ...p, id: uid("ix"), curves: [g1.curve.id, g2.curve.id] });
        }
      }
    }
  }
  return found.sort((p1, p2) => p1.x - p2.x || p1.y - p2.y);
}

function nearestOnSegment(p: Point, segment: Segment) {
  const vx = segment.b.x - segment.a.x;
  const vy = segment.b.y - segment.a.y;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared === 0) return segment.a;
  const t = Math.max(0, Math.min(1, ((p.x - segment.a.x) * vx + (p.y - segment.a.y) * vy) / lengthSquared));
  return { x: segment.a.x + vx * t, y: segment.a.y + vy * t };
}

function tangentPoints(external: Point, center: Point, radius: number): Point[] {
  const dx = external.x - center.x;
  const dy = external.y - center.y;
  const d2 = dx * dx + dy * dy;
  const r2 = radius * radius;
  if (d2 <= r2 + 1e-10) return [];
  const baseX = center.x + (r2 * dx) / d2;
  const baseY = center.y + (r2 * dy) / d2;
  const factor = (radius * Math.sqrt(d2 - r2)) / d2;
  return [
    { x: baseX - dy * factor, y: baseY + dx * factor },
    { x: baseX + dy * factor, y: baseY - dx * factor },
  ];
}

function chainSegments(segments: Segment[], epsilon: number): Point[][] {
  const unused = new Set(segments.map((_, index) => index));
  const paths: Point[][] = [];
  while (unused.size) {
    const firstIndex = unused.values().next().value as number;
    unused.delete(firstIndex);
    const first = segments[firstIndex];
    const path = [first.a, first.b];
    let extended = true;
    while (extended) {
      extended = false;
      for (const index of unused) {
        const segment = segments[index];
        const start = path[0];
        const end = path[path.length - 1];
        if (distance(end, segment.a) <= epsilon) path.push(segment.b);
        else if (distance(end, segment.b) <= epsilon) path.push(segment.a);
        else if (distance(start, segment.b) <= epsilon) path.unshift(segment.a);
        else if (distance(start, segment.a) <= epsilon) path.unshift(segment.b);
        else continue;
        unused.delete(index);
        extended = true;
        break;
      }
    }
    paths.push(path.filter((point, index) => index === 0 || distance(point, path[index - 1]) > epsilon * 0.05));
  }
  return paths;
}

function pathLength(points: Point[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distance(points[index - 1], points[index]);
  return total;
}

function pathSegments(path: Point[]): Segment[] {
  return path.slice(1).map((point, index) => ({ a: path[index], b: point }));
}

function entityPaths(entity: DrawEntity, circleSamples = 240): Point[][] {
  if (entity.type === "point") return [[entity.p]];
  if (entity.type === "line") return [[entity.a, entity.b]];
  if (entity.type === "polyline") return [entity.points];
  return [Array.from({ length: circleSamples + 1 }, (_, index) => {
    const angle = index / circleSamples * Math.PI * 2;
    return { x: entity.c.x + entity.r * Math.cos(angle), y: entity.c.y + entity.r * Math.sin(angle) };
  })];
}

function entitySegments(entity: DrawEntity): Segment[] {
  return entityPaths(entity).flatMap(pathSegments);
}

type PathLocation = {
  pathIndex: number;
  segmentIndex: number;
  point: Point;
  distance: number;
  position: number;
};

export function nearestPathLocation(paths: Point[][], target: Point): PathLocation | null {
  let best: PathLocation | null = null;
  paths.forEach((path, pathIndex) => {
    let traversed = 0;
    for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
      const segment = { a: path[segmentIndex], b: path[segmentIndex + 1] };
      const point = nearestOnSegment(target, segment);
      const d = distance(target, point);
      const position = traversed + distance(segment.a, point);
      if (!best || d < best.distance) best = { pathIndex, segmentIndex, point, distance: d, position };
      traversed += distance(segment.a, segment.b);
    }
  });
  return best;
}

function pointAtPathDistance(path: Point[], position: number): Point {
  const total = pathLength(path);
  const target = Math.max(0, Math.min(total, position));
  let traversed = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    const length = distance(a, b);
    if (target <= traversed + length || index === path.length - 2) {
      const t = length < 1e-14 ? 0 : (target - traversed) / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    traversed += length;
  }
  return path[path.length - 1];
}

function slicePath(path: Point[], start: number, end: number, epsilon: number): Point[] {
  const total = pathLength(path);
  const a = Math.max(0, Math.min(total, start));
  const b = Math.max(0, Math.min(total, end));
  if (b - a <= epsilon) return [];
  const cumulative = [0];
  for (let index = 1; index < path.length; index += 1) cumulative.push(cumulative[index - 1] + distance(path[index - 1], path[index]));
  const result = [pointAtPathDistance(path, a)];
  for (let index = 1; index < path.length - 1; index += 1) {
    if (cumulative[index] > a + epsilon && cumulative[index] < b - epsilon) result.push(path[index]);
  }
  result.push(pointAtPathDistance(path, b));
  return result.filter((point, index, points) => index === 0 || distance(point, points[index - 1]) > epsilon * 0.05);
}

export function trimPathAtLocation(paths: Point[][], hit: PathLocation, cutters: Segment[], epsilon: number) {
  const source = paths[hit.pathIndex];
  if (!source || source.length < 2) return null;
  const averageSegment = pathLength(source) / Math.max(1, source.length - 1);
  const closed = source.length >= 4 && distance(source[0], source[source.length - 1]) <= Math.max(epsilon * 2, averageSegment * 1.7);
  const path = closed && distance(source[0], source[source.length - 1]) > epsilon * 0.05 ? [...source, source[0]] : source;
  const total = pathLength(path);
  if (total <= epsilon) return null;

  const cutPositions: number[] = [];
  let traversed = 0;
  const targetSegments = pathSegments(path);
  targetSegments.forEach((targetSegment) => {
    for (const cutter of cutters) {
      if (!segmentBoundsOverlap(targetSegment, cutter)) continue;
      const point = segmentIntersection(targetSegment, cutter);
      if (!point) continue;
      let position = traversed + distance(targetSegment.a, point);
      if (closed && (position <= epsilon || total - position <= epsilon)) position = 0;
      if (!cutPositions.some((existing) => Math.abs(existing - position) <= epsilon * 2)) cutPositions.push(position);
    }
    traversed += distance(targetSegment.a, targetSegment.b);
  });
  cutPositions.sort((a, b) => a - b);

  const untouched = paths.filter((_, index) => index !== hit.pathIndex);
  const clickPosition = Math.max(0, Math.min(total, hit.position));
  if (closed) {
    const cuts = cutPositions.filter((position) => position >= 0 && position < total - epsilon);
    if (cuts.length < 2) return null;
    let nextIndex = cuts.findIndex((position) => position > clickPosition + epsilon);
    if (nextIndex < 0) nextIndex = 0;
    const previousIndex = (nextIndex - 1 + cuts.length) % cuts.length;
    const previous = cuts[previousIndex];
    const next = cuts[nextIndex];
    let kept: Point[];
    if (previous < next) {
      const tail = slicePath(path, next, total, epsilon);
      const head = slicePath(path, 0, previous, epsilon);
      kept = [...tail, ...head.slice(tail.length && head.length && distance(tail[tail.length - 1], head[0]) <= epsilon * 2 ? 1 : 0)];
    } else {
      kept = slicePath(path, next, previous, epsilon);
    }
    const resultPaths = [...untouched, kept].filter((candidate) => candidate.length > 1 && pathLength(candidate) > epsilon);
    return { paths: resultPaths, cutCount: cuts.length, closed: true };
  }

  const cuts = cutPositions.filter((position) => position > epsilon && position < total - epsilon);
  if (!cuts.length) return null;
  const boundaries = [0, ...cuts, total];
  let lower = 0;
  let upper = total;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    if (clickPosition >= boundaries[index] - epsilon && clickPosition <= boundaries[index + 1] + epsilon) {
      lower = boundaries[index];
      upper = boundaries[index + 1];
      break;
    }
  }
  const kept = [
    slicePath(path, 0, lower, epsilon),
    slicePath(path, upper, total, epsilon),
  ].filter((candidate) => candidate.length > 1 && pathLength(candidate) > epsilon);
  return { paths: [...untouched, ...kept], cutCount: cuts.length, closed: false };
}

function niceStep(raw: number) {
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const fraction = raw / power;
  const nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  return nice * power;
}

function fmt(value: number, decimals = 4) {
  if (!Number.isFinite(value)) return "—";
  const threshold = Math.pow(10, -decimals);
  const normalized = Math.abs(value) < threshold / 2 ? 0 : value;
  return normalized.toFixed(decimals).replace(/\.?0+$/, "");
}

function sanitizeProgram(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.padStart(4, "0");
}

function generateGCode(points: Point[], settings: PostSettings) {
  if (points.length < 2) return "(AGGIUNGERE ALMENO 2 PUNTI AL PERCORSO)";
  const d = settings.decimals;
  const coord = (axis: string, value: number) => `${axis}${value.toFixed(d)}`;
  const normalized = settings.closePath && distance(points[0], points[points.length - 1]) > Math.pow(10, -d)
    ? [...points, points[0]]
    : points;
  const lines = [
    "%",
    `O${sanitizeProgram(settings.program)} (${settings.comment.toUpperCase().replace(/[^A-Z0-9_. -]/g, "_").slice(0, 28)})`,
    `(GT.CODE ANALYTIC CAD V${VERSION})`,
    `(PUNTI ${normalized.length} - VERIFICARE IL PERCORSO PRIMA DELL'USO)`,
    "G21 G17 G90 G40 G49 G80",
    settings.workOffset,
    `T${Math.max(1, Math.trunc(settings.tool))} M6`,
    `S${Math.max(0, Math.trunc(settings.spindle))} M3`,
    `G0 ${coord("Z", settings.safeZ)}`,
    `G0 ${coord("X", normalized[0].x)} ${coord("Y", normalized[0].y)}`,
  ];
  if (settings.coolant) lines.push("M8");
  lines.push(`G1 ${coord("Z", settings.workZ)} F${Math.max(1, Math.round(settings.feedZ))}`);
  for (let i = 1; i < normalized.length; i += 1) {
    lines.push(`G1 ${coord("X", normalized[i].x)} ${coord("Y", normalized[i].y)}${i === 1 ? ` F${Math.max(1, Math.round(settings.feedXY))}` : ""}`);
  }
  lines.push(`G0 ${coord("Z", settings.safeZ)}`);
  if (settings.coolant) lines.push("M9");
  lines.push("M5", "G0 X0.000 Y0.000", "M30", "%");
  return lines.join("\n");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveFile(blob: Blob, filename: string, description: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (navigator.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await navigator.share({ files: [file], title: filename, text: description });
      return "Condiviso tramite File";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "Operazione annullata";
    }
  }
  const pickerWindow = window as Window & {
    showSaveFilePicker?: (options: unknown) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
  };
  if (pickerWindow.showSaveFilePicker) {
    try {
      const handle = await pickerWindow.showSaveFilePicker({ suggestedName: filename });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "File salvato";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "Operazione annullata";
    }
  }
  downloadBlob(blob, filename);
  return "Download avviato";
}

function IconButton({ label, active, disabled, onClick, children, className = "" }: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button type="button" className={`icon-button ${active ? "is-active" : ""} ${className}`} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function NumberField({ label, value, onChange, step = "any", min, suffix }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string | number;
  min?: number;
  suffix?: string;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <span className="number-input-wrap">
        <DecimalInput label={suffix ? `${label} ${suffix}` : label} value={value} min={min} step={step} onChange={onChange} />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
}

function DecimalInput({ label, value, onChange, min, step = "any", className = "" }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: string | number;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const commit = (text: string) => {
    const normalized = text.replace(",", ".");
    if (["", "+", "-", ".", "+.", "-."].includes(normalized)) return;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) onChange(min === undefined ? parsed : Math.max(min, parsed));
  };
  return <input
    className={className}
    type="text"
    inputMode="decimal"
    enterKeyHint="done"
    aria-label={label}
    data-step={step}
    data-min={min}
    value={focused ? draft : String(value)}
    onFocus={(event) => { const target = event.currentTarget; setDraft(String(value)); setFocused(true); requestAnimationFrame(() => target.select()); }}
    onChange={(event) => {
      const next = event.target.value;
      if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d*)?$/.test(next)) return;
      setDraft(next);
      commit(next);
    }}
    onBlur={() => { commit(draft); setFocused(false); }}
    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
  />;
}

export default function AnalyticCad() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<null | { distance: number; view: View; mid: Point }>(null);
  const dragRef = useRef<null | { startScreen: Point; startWorld: Point; view: View }>(null);
  const historyRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const [curves, setCurves] = useState<Curve[]>(DEFAULT_CURVES);
  const [params, setParams] = useState<Parameter[]>(DEFAULT_PARAMS);
  const [intersections, setIntersections] = useState<Intersection[]>([]);
  const [drawEntities, setDrawEntities] = useState<DrawEntity[]>([]);
  const [pathPoints, setPathPoints] = useState<Point[]>([]);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 700 });
  const [tool, setTool] = useState<Tool>("select");
  const [snaps, setSnaps] = useState<SnapState>(DEFAULT_SNAPS);
  const [snapHit, setSnapHit] = useState<SnapHit>(null);
  const [cursorWorld, setCursorWorld] = useState<Point>({ x: 0, y: 0 });
  const [draftStart, setDraftStart] = useState<Point | null>(null);
  const [draftCurrent, setDraftCurrent] = useState<Point | null>(null);
  const [measure, setMeasure] = useState<{ a: Point; b: Point } | null>(null);
  const [selectedCurveId, setSelectedCurveId] = useState<string>(DEFAULT_CURVES[0].id);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedIntersectionId, setSelectedIntersectionId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"formulas" | "draw" | "results" | "gcode" | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGCode, setShowGCode] = useState(false);
  const [post, setPost] = useState<PostSettings>(DEFAULT_POST);
  const [tolerance, setTolerance] = useState(0.01);
  const [calcDomain, setCalcDomain] = useState({ xMin: -50, xMax: 50, yMin: -50, yMax: 50 });
  const [status, setStatus] = useState("Pronto");
  const [gridVisible, setGridVisible] = useState(true);
  const [axesVisible, setAxesVisible] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const paramScope = useMemo(() => Object.fromEntries(params.map((parameter) => [parameter.name, parameter.value])), [params]);
  const bounds = useMemo(() => ({
    xMin: view.cx - canvasSize.width / view.scale / 2,
    xMax: view.cx + canvasSize.width / view.scale / 2,
    yMin: view.cy - canvasSize.height / view.scale / 2,
    yMax: view.cy + canvasSize.height / view.scale / 2,
  }), [view, canvasSize]);
  const plotGeometries = useMemo(
    () => curves.filter((curve) => curve.visible).map((curve) => sampledGeometry(curve, paramScope, bounds)),
    [curves, paramScope, bounds],
  );
  const selectedCurve = curves.find((curve) => curve.id === selectedCurveId) ?? null;
  const selectedDrawEntity = drawEntities.find((entity) => entity.id === selectedEntityId) ?? null;
  const selectedGeometry = plotGeometries.find((geometry) => geometry.curve.id === selectedCurveId) ?? null;
  const gcode = useMemo(() => generateGCode(pathPoints, post), [pathPoints, post]);
  const gcodeChecks = useMemo(() => {
    const invalid = pathPoints.filter((point) => !finitePoint(point)).length;
    let maxMove = 0;
    let minMove = Infinity;
    for (let i = 1; i < pathPoints.length; i += 1) {
      const move = distance(pathPoints[i - 1], pathPoints[i]);
      maxMove = Math.max(maxMove, move);
      if (move > 0) minMove = Math.min(minMove, move);
    }
    return { invalid, maxMove, minMove: Number.isFinite(minMove) ? minMove : 0 };
  }, [pathPoints]);

  const worldToScreen = useCallback((point: Point): Point => ({
    x: canvasSize.width / 2 + (point.x - view.cx) * view.scale,
    y: canvasSize.height / 2 - (point.y - view.cy) * view.scale,
  }), [canvasSize, view]);
  const screenToWorld = useCallback((point: Point): Point => ({
    x: view.cx + (point.x - canvasSize.width / 2) / view.scale,
    y: view.cy - (point.y - canvasSize.height / 2) / view.scale,
  }), [canvasSize, view]);

  useEffect(() => {
    const element = canvasWrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setCanvasSize({ width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("gtcode-analytic-autosave");
    if (!stored) return;
    try {
      const project = JSON.parse(stored);
      if (project?.app === "GT.Code Analytic CAD" && Array.isArray(project.curves)) {
        queueMicrotask(() => {
          setCurves(project.curves);
          setParams(project.params ?? DEFAULT_PARAMS);
          setDrawEntities(project.drawEntities ?? []);
          setPathPoints(project.pathPoints ?? []);
          setPost({ ...DEFAULT_POST, ...(project.post ?? {}) });
          setView(project.view ?? DEFAULT_VIEW);
          setStatus("Backup locale ripristinato");
        });
      }
    } catch {
      localStorage.removeItem("gtcode-analytic-autosave");
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const project = { app: "GT.Code Analytic CAD", version: VERSION, curves, params, drawEntities, pathPoints, post, view };
      localStorage.setItem("gtcode-analytic-autosave", JSON.stringify(project));
    }, 700);
    return () => clearTimeout(timeout);
  }, [curves, params, drawEntities, pathPoints, post, view]);

  const pushHistory = useCallback(() => {
    historyRef.current.push(JSON.stringify({ curves, params, drawEntities, pathPoints }));
    historyRef.current = historyRef.current.slice(-30);
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [curves, params, drawEntities, pathPoints]);

  const restoreSnapshot = (json: string) => {
    const snapshot = JSON.parse(json);
    setCurves(snapshot.curves);
    setParams(snapshot.params);
    setDrawEntities(snapshot.drawEntities);
    setPathPoints(snapshot.pathPoints);
    setIntersections([]);
    setSelectedIntersectionId(null);
    setSelectedCurveId(snapshot.curves[0]?.id ?? "");
    setSelectedEntityId(null);
    setInspection(null);
  };

  const undo = () => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    futureRef.current.push(JSON.stringify({ curves, params, drawEntities, pathPoints }));
    restoreSnapshot(previous);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
  };

  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(JSON.stringify({ curves, params, drawEntities, pathPoints }));
    restoreSnapshot(next);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  };

  const fitView = useCallback((extraPoints: Point[] = []) => {
    const points = [
      ...plotGeometries.flatMap((geometry) => geometry.points),
      ...drawEntities.flatMap((entity) => {
        if (entity.type === "point") return [entity.p];
        if (entity.type === "line") return [entity.a, entity.b];
        if (entity.type === "polyline") return entity.points;
        return [
          { x: entity.c.x - entity.r, y: entity.c.y - entity.r },
          { x: entity.c.x + entity.r, y: entity.c.y + entity.r },
        ];
      }),
      ...extraPoints,
    ].filter(finitePoint);
    if (!points.length) {
      setView(DEFAULT_VIEW);
      return;
    }
    const xMin = Math.min(...points.map((point) => point.x));
    const xMax = Math.max(...points.map((point) => point.x));
    const yMin = Math.min(...points.map((point) => point.y));
    const yMax = Math.max(...points.map((point) => point.y));
    const width = Math.max(1, xMax - xMin);
    const height = Math.max(1, yMax - yMin);
    setView({
      cx: (xMin + xMax) / 2,
      cy: (yMin + yMax) / 2,
      scale: Math.max(0.05, Math.min(2000, 0.82 * Math.min(canvasSize.width / width, canvasSize.height / height))),
    });
  }, [plotGeometries, drawEntities, canvasSize]);

  const findSnap = useCallback((world: Point, radiusPx = 13): SnapHit => {
    const radius = radiusPx / view.scale;
    const candidates: Array<{ point: Point; kind: SnapKind; priority: number }> = [];
    if (snaps.Intersezione) intersections.forEach((item) => candidates.push({ point: item, kind: "Intersezione", priority: 1 }));
    for (const entity of drawEntities) {
      if (entity.type === "point") {
        if (snaps.Fine) candidates.push({ point: entity.p, kind: "Fine", priority: 2 });
      } else if (entity.type === "line") {
        if (snaps.Fine) candidates.push({ point: entity.a, kind: "Fine", priority: 2 }, { point: entity.b, kind: "Fine", priority: 2 });
        if (snaps.Medio) candidates.push({ point: { x: (entity.a.x + entity.b.x) / 2, y: (entity.a.y + entity.b.y) / 2 }, kind: "Medio", priority: 3 });
      } else if (entity.type === "polyline") {
        if (snaps.Fine && entity.points.length) {
          candidates.push({ point: entity.points[0], kind: "Fine", priority: 2 });
          candidates.push({ point: entity.points[entity.points.length - 1], kind: "Fine", priority: 2 });
        }
        if (snaps.Medio && entity.points.length > 2) candidates.push({ point: entity.points[Math.floor(entity.points.length / 2)], kind: "Medio", priority: 3 });
      } else {
        if (snaps.Centro) candidates.push({ point: entity.c, kind: "Centro", priority: 2 });
        if (snaps.Fine) {
          candidates.push(
            { point: { x: entity.c.x + entity.r, y: entity.c.y }, kind: "Fine", priority: 4 },
            { point: { x: entity.c.x - entity.r, y: entity.c.y }, kind: "Fine", priority: 4 },
            { point: { x: entity.c.x, y: entity.c.y + entity.r }, kind: "Fine", priority: 4 },
            { point: { x: entity.c.x, y: entity.c.y - entity.r }, kind: "Fine", priority: 4 },
          );
        }
        if (snaps.Tangente && tool === "line" && draftStart) {
          tangentPoints(draftStart, entity.c, entity.r).forEach((point) => candidates.push({ point, kind: "Tangente", priority: 1 }));
        }
      }
    }
    for (const geometry of plotGeometries) {
      if (snaps.Fine && geometry.points.length) {
        candidates.push({ point: geometry.points[0], kind: "Fine", priority: 5 });
        candidates.push({ point: geometry.points[geometry.points.length - 1], kind: "Fine", priority: 5 });
      }
      if (snaps.Medio && geometry.points.length > 2) {
        candidates.push({ point: geometry.points[Math.floor(geometry.points.length / 2)], kind: "Medio", priority: 6 });
      }
    }
    let best: { point: Point; kind: SnapKind; score: number } | null = null;
    for (const candidate of candidates) {
      const d = distance(world, candidate.point);
      if (d <= radius) {
        const score = d + candidate.priority * radius * 0.015;
        if (!best || score < best.score) best = { point: candidate.point, kind: candidate.kind, score };
      }
    }
    if (!best && snaps.Vicino) {
      for (const geometry of plotGeometries) {
        for (const segment of geometry.segments) {
          const point = nearestOnSegment(world, segment);
          const d = distance(world, point);
          if (d <= radius && (!best || d < best.score)) best = { point, kind: "Vicino", score: d };
        }
      }
      for (const entity of drawEntities) {
        if (entity.type === "line") {
          const point = nearestOnSegment(world, { a: entity.a, b: entity.b });
          const d = distance(world, point);
          if (d <= radius && (!best || d < best.score)) best = { point, kind: "Vicino", score: d };
        } else if (entity.type === "polyline") {
          for (const segment of pathSegments(entity.points)) {
            const point = nearestOnSegment(world, segment);
            const d = distance(world, point);
            if (d <= radius && (!best || d < best.score)) best = { point, kind: "Vicino", score: d };
          }
        } else if (entity.type === "circle") {
          const angle = Math.atan2(world.y - entity.c.y, world.x - entity.c.x);
          const point = { x: entity.c.x + entity.r * Math.cos(angle), y: entity.c.y + entity.r * Math.sin(angle) };
          const d = distance(world, point);
          if (d <= radius && (!best || d < best.score)) best = { point, kind: "Vicino", score: d };
        }
      }
    }
    return best ? { point: best.point, kind: best.kind } : null;
  }, [view.scale, snaps, intersections, drawEntities, plotGeometries, tool, draftStart]);

  const performSmartTrim = (world: Point) => {
    const trimBounds = {
      xMin: Math.min(calcDomain.xMin, bounds.xMin),
      xMax: Math.max(calcDomain.xMax, bounds.xMax),
      yMin: Math.min(calcDomain.yMin, bounds.yMin),
      yMax: Math.max(calcDomain.yMax, bounds.yMax),
    };
    const geometries = curves.filter((curve) => curve.visible).map((curve) => sampledGeometry(curve, paramScope, trimBounds));
    let curveTarget: { geometry: PlotGeometry; hit: PathLocation } | null = null;
    for (const geometry of geometries) {
      const paths = geometry.paths ?? [];
      const hit = nearestPathLocation(paths, world);
      if (hit && (!curveTarget || hit.distance < curveTarget.hit.distance)) curveTarget = { geometry, hit };
    }

    let entityTarget: { entity: DrawEntity; paths: Point[][]; hit: PathLocation } | null = null;
    for (const entity of drawEntities) {
      if (entity.type === "point") continue;
      const paths = entityPaths(entity);
      const hit = nearestPathLocation(paths, world);
      if (hit && (!entityTarget || hit.distance < entityTarget.hit.distance)) entityTarget = { entity, paths, hit };
    }

    const threshold = 15 / view.scale;
    const curveDistance = curveTarget?.hit.distance ?? Infinity;
    const entityDistance = entityTarget?.hit.distance ?? Infinity;
    if (Math.min(curveDistance, entityDistance) > threshold) {
      setStatus("Taglia intelligente: tocca una curva o una linea");
      return;
    }

    const epsilon = Math.max(1e-6, tolerance * 2, 0.25 / view.scale);
    if (entityTarget && entityDistance < curveDistance) {
      const cutters = [
        ...geometries.flatMap((geometry) => geometry.segments),
        ...drawEntities.filter((entity) => entity.id !== entityTarget!.entity.id).flatMap(entitySegments),
      ];
      const trimmed = trimPathAtLocation(entityTarget.paths, entityTarget.hit, cutters, epsilon);
      if (!trimmed) {
        setStatus(entityTarget.entity.type === "circle"
          ? "Taglia intelligente: servono almeno due intersezioni sulla circonferenza"
          : "Taglia intelligente: nessun bordo di taglio trovato");
        return;
      }
      pushHistory();
      const replacements: DrawEntity[] = trimmed.paths.map((path, index) => ({
        id: uid("trim"),
        type: "polyline",
        points: path,
        source: (entityTarget!.entity.type === "circle" ? "Arco " : "Profilo ") + (index + 1),
      }));
      setDrawEntities((current) => current.flatMap((entity) => entity.id === entityTarget!.entity.id ? replacements : [entity]));
      setSelectedEntityId(replacements[0]?.id ?? null);
      setSelectedCurveId("");
      setInspection(null);
      setIntersections([]);
      setStatus("Taglio completato · " + replacements.length + " tratti conservati");
      return;
    }

    if (!curveTarget) return;
    const cutters = [
      ...geometries.filter((geometry) => geometry.curve.id !== curveTarget!.geometry.curve.id).flatMap((geometry) => geometry.segments),
      ...drawEntities.flatMap(entitySegments),
    ];
    const trimmed = trimPathAtLocation(curveTarget.geometry.paths ?? [], curveTarget.hit, cutters, epsilon);
    if (!trimmed) {
      const message = curveTarget.geometry.paths?.some((path) => distance(path[0], path[path.length - 1]) <= epsilon * 2)
        ? "Taglia intelligente: servono almeno due intersezioni sul profilo chiuso"
        : "Taglia intelligente: nessun bordo di taglio trovato";
      setStatus(message);
      return;
    }
    pushHistory();
    setCurves((current) => current.map((curve) => curve.id === curveTarget!.geometry.curve.id ? { ...curve, trimmedPaths: trimmed.paths } : curve));
    setSelectedCurveId(curveTarget.geometry.curve.id);
    setSelectedEntityId(null);
    setInspection(null);
    setIntersections([]);
    setStatus("Taglio intelligente completato su " + curveTarget.geometry.curve.name + " · Annulla per ripristinare");
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(canvasSize.width * ratio);
    canvas.height = Math.round(canvasSize.height * ratio);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const w = canvasSize.width;
    const h = canvasSize.height;
    const background = ctx.createLinearGradient(0, 0, 0, h);
    background.addColorStop(0, "#131923");
    background.addColorStop(1, "#090d13");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = 0.055;
    for (let y = 0; y < h; y += 4) {
      ctx.fillStyle = y % 8 === 0 ? "#ffffff" : "#000000";
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
    const step = niceStep(78 / view.scale);
    const minor = step / 5;
    if (gridVisible) {
      const drawGrid = (gridStep: number, color: string, width: number) => {
        ctx.beginPath();
        const xStart = Math.floor(bounds.xMin / gridStep) * gridStep;
        for (let x = xStart; x <= bounds.xMax; x += gridStep) {
          const sx = worldToScreen({ x, y: 0 }).x;
          ctx.moveTo(sx, 0); ctx.lineTo(sx, h);
        }
        const yStart = Math.floor(bounds.yMin / gridStep) * gridStep;
        for (let y = yStart; y <= bounds.yMax; y += gridStep) {
          const sy = worldToScreen({ x: 0, y }).y;
          ctx.moveTo(0, sy); ctx.lineTo(w, sy);
        }
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
      };
      drawGrid(minor, "rgba(133, 157, 181, .075)", 1);
      drawGrid(step, "rgba(133, 157, 181, .16)", 1);
    }
    if (axesVisible) {
      const origin = worldToScreen({ x: 0, y: 0 });
      ctx.beginPath(); ctx.moveTo(0, origin.y); ctx.lineTo(w, origin.y); ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, h);
      ctx.strokeStyle = "rgba(203, 216, 228, .58)"; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.fillStyle = "rgba(201, 214, 226, .7)"; ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
      const xStart = Math.floor(bounds.xMin / step) * step;
      for (let x = xStart; x <= bounds.xMax; x += step) {
        if (Math.abs(x) < step / 10) continue;
        const sx = worldToScreen({ x, y: 0 }).x;
        ctx.fillText(fmt(x, 3), sx + 4, Math.min(h - 6, Math.max(14, origin.y - 5)));
      }
      const yStart = Math.floor(bounds.yMin / step) * step;
      for (let y = yStart; y <= bounds.yMax; y += step) {
        if (Math.abs(y) < step / 10) continue;
        const sy = worldToScreen({ x: 0, y }).y;
        ctx.fillText(fmt(y, 3), Math.min(w - 35, Math.max(5, origin.x + 5)), sy - 4);
      }
      ctx.fillStyle = "#ff922d"; ctx.font = "bold 13px Inter, sans-serif";
      ctx.fillText("X", w - 18, Math.min(h - 8, Math.max(16, origin.y - 8)));
      ctx.fillText("Y", Math.min(w - 18, Math.max(8, origin.x + 8)), 16);
    }
    for (const geometry of plotGeometries) {
      if (!geometry.segments.length) continue;
      ctx.save();
      ctx.beginPath();
      for (const segment of geometry.segments) {
        const a = worldToScreen(segment.a); const b = worldToScreen(segment.b);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = geometry.curve.color;
      ctx.lineWidth = geometry.curve.id === selectedCurveId ? 2.7 : 1.8;
      ctx.shadowColor = geometry.curve.color;
      ctx.shadowBlur = geometry.curve.id === selectedCurveId ? 9 : 4;
      ctx.stroke();
      ctx.restore();
    }
    for (const entity of drawEntities) {
      const selected = entity.id === selectedEntityId;
      ctx.save();
      ctx.strokeStyle = selected ? "#ffad4d" : "#e9edf2";
      ctx.fillStyle = selected ? "#ffad4d" : "#e9edf2";
      ctx.lineWidth = selected ? 2.8 : 1.6;
      if (selected) {
        ctx.shadowColor = "#ff8617";
        ctx.shadowBlur = 9;
      }
      if (entity.type === "point") {
        const p = worldToScreen(entity.p); ctx.beginPath(); ctx.arc(p.x, p.y, selected ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
      } else if (entity.type === "line") {
        const a = worldToScreen(entity.a); const b = worldToScreen(entity.b); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      } else if (entity.type === "polyline") {
        ctx.beginPath();
        entity.points.forEach((point, index) => {
          const screen = worldToScreen(point);
          if (index === 0) ctx.moveTo(screen.x, screen.y); else ctx.lineTo(screen.x, screen.y);
        });
        ctx.stroke();
      } else {
        const c = worldToScreen(entity.c); ctx.beginPath(); ctx.arc(c.x, c.y, entity.r * view.scale, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(c.x - 5, c.y); ctx.lineTo(c.x + 5, c.y); ctx.moveTo(c.x, c.y - 5); ctx.lineTo(c.x, c.y + 5); ctx.stroke();
      }
      ctx.restore();
    }
    if (pathPoints.length) {
      ctx.save();
      ctx.beginPath();
      pathPoints.forEach((point, index) => {
        const screen = worldToScreen(point);
        if (index === 0) ctx.moveTo(screen.x, screen.y); else ctx.lineTo(screen.x, screen.y);
      });
      if (post.closePath && pathPoints.length > 2) ctx.closePath();
      ctx.strokeStyle = "#ff9d38"; ctx.lineWidth = 4.8; ctx.globalAlpha = 0.34; ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = "#ffc16f"; ctx.lineWidth = 1.5; ctx.stroke();
      pathPoints.forEach((point, index) => {
        const screen = worldToScreen(point);
        ctx.beginPath(); ctx.arc(screen.x, screen.y, index === 0 ? 5.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = index === 0 ? "#68e6a8" : "#ff9d38"; ctx.fill();
      });
      ctx.restore();
    }
    for (const item of intersections) {
      const p = worldToScreen(item);
      ctx.save();
      ctx.beginPath(); ctx.arc(p.x, p.y, item.id === selectedIntersectionId ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = "#0c1118"; ctx.fill(); ctx.strokeStyle = "#ffd36d"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - 9, p.y); ctx.lineTo(p.x + 9, p.y); ctx.moveTo(p.x, p.y - 9); ctx.lineTo(p.x, p.y + 9); ctx.strokeStyle = "rgba(255,211,109,.7)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    if (inspection) {
      const p = worldToScreen(inspection.point);
      const dx = Math.cos(inspection.angle) * 42;
      const dy = -Math.sin(inspection.angle) * 42;
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "#78dcff";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p.x - dx, p.y - dy); ctx.lineTo(p.x + dx, p.y + dy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = "#091018"; ctx.fill(); ctx.strokeStyle = "#78dcff"; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.fillStyle = "#8de2ff";
      ctx.fillText(`TAN ${fmt(inspection.angle * 180 / Math.PI, 2)}°`, p.x + 10, p.y - 10);
      ctx.restore();
    }
    if (draftStart && draftCurrent) {
      const a = worldToScreen(draftStart); const b = worldToScreen(draftCurrent);
      ctx.save(); ctx.setLineDash([7, 5]); ctx.strokeStyle = "#ffab52"; ctx.lineWidth = 1.5; ctx.beginPath();
      if (tool === "circle") ctx.arc(a.x, a.y, distance(draftStart, draftCurrent) * view.scale, 0, Math.PI * 2);
      else { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke(); ctx.restore();
    }
    if (measure) {
      const a = worldToScreen(measure.a); const b = worldToScreen(measure.b);
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = "#64d3ff"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const label = `L ${fmt(distance(measure.a, measure.b), 4)}  ΔX ${fmt(measure.b.x - measure.a.x, 4)}  ΔY ${fmt(measure.b.y - measure.a.y, 4)}`;
      const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
      ctx.font = "13px ui-monospace, monospace"; const width = ctx.measureText(label).width + 12;
      ctx.fillStyle = "rgba(6,12,19,.9)"; ctx.fillRect(mx - width / 2, my - 27, width, 21);
      ctx.fillStyle = "#8cddff"; ctx.fillText(label, mx - width / 2 + 6, my - 12); ctx.restore();
    }
    if (snapHit) {
      const p = worldToScreen(snapHit.point);
      ctx.save(); ctx.strokeStyle = "#ffb34f"; ctx.fillStyle = "#ffb34f"; ctx.lineWidth = 1.5;
      if (snapHit.kind === "Centro" || snapHit.kind === "Intersezione") {
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x - 10, p.y); ctx.lineTo(p.x + 10, p.y); ctx.moveTo(p.x, p.y - 10); ctx.lineTo(p.x, p.y + 10); ctx.stroke();
      } else {
        ctx.strokeRect(p.x - 6, p.y - 6, 12, 12);
      }
      ctx.font = "bold 12px Inter, sans-serif"; ctx.fillText(snapHit.kind.toUpperCase(), p.x + 10, p.y - 10); ctx.restore();
    }
  }, [canvasSize, view, bounds, gridVisible, axesVisible, plotGeometries, selectedCurveId, selectedEntityId, drawEntities, pathPoints, post.closePath, intersections, selectedIntersectionId, inspection, draftStart, draftCurrent, tool, measure, snapHit, worldToScreen]);

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const screen = canvasPoint(event);
    pointersRef.current.set(event.pointerId, screen);
    if (pointersRef.current.size === 2) {
      const values = [...pointersRef.current.values()];
      gestureRef.current = { distance: distance(values[0], values[1]), view, mid: { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 } };
      return;
    }
    const rawWorld = screenToWorld(screen);
    const hit = findSnap(rawWorld);
    const world = hit?.point ?? rawWorld;
    if (tool === "pan" || event.button === 1) {
      dragRef.current = { startScreen: screen, startWorld: rawWorld, view };
      return;
    }
    if (tool === "zoom-window") {
      setDraftStart(rawWorld); setDraftCurrent(rawWorld); return;
    }
    if (tool === "trim") {
      performSmartTrim(rawWorld);
      return;
    }
    if (tool === "select") {
      const ix = intersections.find((item) => distance(item, world) < 12 / view.scale);
      if (ix) {
        setSelectedIntersectionId(ix.id); setInspection(null); setStatus(`Intersezione X${fmt(ix.x)} Y${fmt(ix.y)}`); return;
      }
      let nearest: { id: string; d: number; point: Point; segment: Segment } | null = null;
      for (const geometry of plotGeometries) {
        for (const segment of geometry.segments) {
          const point = nearestOnSegment(world, segment);
          const d = distance(world, point);
          if (d < 10 / view.scale && (!nearest || d < nearest.d)) nearest = { id: geometry.curve.id, d, point, segment };
        }
      }
      let nearestEntity: { entity: DrawEntity; d: number; point: Point; segment?: Segment } | null = null;
      for (const entity of drawEntities) {
        if (entity.type === "point") {
          const d = distance(world, entity.p);
          if (d < 12 / view.scale && (!nearestEntity || d < nearestEntity.d)) nearestEntity = { entity, d, point: entity.p };
          continue;
        }
        for (const segment of entitySegments(entity)) {
          const point = nearestOnSegment(world, segment);
          const d = distance(world, point);
          if (d < 10 / view.scale && (!nearestEntity || d < nearestEntity.d)) nearestEntity = { entity, d, point, segment };
        }
      }
      if (nearestEntity && (!nearest || nearestEntity.d <= nearest.d)) {
        setSelectedEntityId(nearestEntity.entity.id);
        setSelectedCurveId("");
        setSelectedIntersectionId(null);
        setInspection(null);
        const type = nearestEntity.entity.type === "line" ? "Retta" : nearestEntity.entity.type === "circle" ? "Circonferenza" : nearestEntity.entity.type === "polyline" ? "Profilo tagliato" : "Punto";
        setStatus(type + " selezionata · usa il cestino o il tasto Canc");
      } else if (nearest) {
        const dx = nearest.segment.b.x - nearest.segment.a.x;
        const dy = nearest.segment.b.y - nearest.segment.a.y;
        const angle = Math.atan2(dy, dx);
        const slope = Math.abs(dx) < 1e-12 ? (dy >= 0 ? Infinity : -Infinity) : dy / dx;
        setSelectedCurveId(nearest.id);
        setSelectedEntityId(null);
        setInspection({ curveId: nearest.id, point: nearest.point, angle, slope });
        setStatus(`Punto interrogato X${fmt(nearest.point.x, 5)} Y${fmt(nearest.point.y, 5)} · tangente ${fmt(angle * 180 / Math.PI, 3)}°`);
      } else {
        setSelectedCurveId("");
        setSelectedEntityId(null);
        setSelectedIntersectionId(null);
        setInspection(null);
        setStatus(`Punto X${fmt(world.x)} Y${fmt(world.y)}`);
      }
      return;
    }
    if (tool === "point") {
      const id = uid("point");
      pushHistory(); setDrawEntities((current) => [...current, { id, type: "point", p: world }]); setSelectedEntityId(id); setSelectedCurveId(""); setStatus("Punto creato e selezionato"); return;
    }
    if (tool === "line" || tool === "circle" || tool === "measure") {
      if (!draftStart) {
        setDraftStart(world); setDraftCurrent(world); setStatus("Specificare il secondo punto");
      } else {
        if (tool === "line") {
          if (distance(draftStart, world) > 1e-9) {
            const id = uid("line");
            pushHistory(); setDrawEntities((current) => [...current, { id, type: "line", a: draftStart, b: world }]); setSelectedEntityId(id); setSelectedCurveId(""); setStatus(`Linea selezionata · L=${fmt(distance(draftStart, world), 4)}`);
          }
        } else if (tool === "circle") {
          const r = distance(draftStart, world);
          if (r > 1e-9) {
            const id = uid("circle");
            pushHistory(); setDrawEntities((current) => [...current, { id, type: "circle", c: draftStart, r }]); setSelectedEntityId(id); setSelectedCurveId(""); setStatus(`Circonferenza selezionata · R=${fmt(r, 4)}`);
          }
        } else {
          setMeasure({ a: draftStart, b: world }); setStatus(`Distanza ${fmt(distance(draftStart, world), 4)} mm`);
        }
        setDraftStart(null); setDraftCurrent(null);
      }
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screen = canvasPoint(event);
    pointersRef.current.set(event.pointerId, screen);
    if (pointersRef.current.size >= 2 && gestureRef.current) {
      const values = [...pointersRef.current.values()];
      const currentDistance = Math.max(1, distance(values[0], values[1]));
      const ratio = currentDistance / Math.max(1, gestureRef.current.distance);
      const nextScale = Math.max(0.03, Math.min(3000, gestureRef.current.view.scale * ratio));
      const mid = { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 };
      const anchor = {
        x: gestureRef.current.view.cx + (gestureRef.current.mid.x - canvasSize.width / 2) / gestureRef.current.view.scale,
        y: gestureRef.current.view.cy - (gestureRef.current.mid.y - canvasSize.height / 2) / gestureRef.current.view.scale,
      };
      setView({ cx: anchor.x - (mid.x - canvasSize.width / 2) / nextScale, cy: anchor.y + (mid.y - canvasSize.height / 2) / nextScale, scale: nextScale });
      return;
    }
    if (dragRef.current) {
      const dx = (screen.x - dragRef.current.startScreen.x) / dragRef.current.view.scale;
      const dy = (screen.y - dragRef.current.startScreen.y) / dragRef.current.view.scale;
      setView({ ...dragRef.current.view, cx: dragRef.current.view.cx - dx, cy: dragRef.current.view.cy + dy });
      return;
    }
    const rawWorld = screenToWorld(screen);
    const hit = findSnap(rawWorld);
    setSnapHit(hit);
    setCursorWorld(hit?.point ?? rawWorld);
    if (draftStart) setDraftCurrent(hit?.point ?? rawWorld);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screen = canvasPoint(event);
    if (tool === "zoom-window" && draftStart && draftCurrent && distance(draftStart, draftCurrent) > 2 / view.scale) {
      const xMin = Math.min(draftStart.x, draftCurrent.x); const xMax = Math.max(draftStart.x, draftCurrent.x);
      const yMin = Math.min(draftStart.y, draftCurrent.y); const yMax = Math.max(draftStart.y, draftCurrent.y);
      setView({ cx: (xMin + xMax) / 2, cy: (yMin + yMax) / 2, scale: 0.92 * Math.min(canvasSize.width / (xMax - xMin), canvasSize.height / (yMax - yMin)) });
      setDraftStart(null); setDraftCurrent(null); setTool("select"); setStatus("Zoom finestra completato");
    }
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) gestureRef.current = null;
    dragRef.current = null;
    if (tool === "pan") setCursorWorld(screenToWorld(screen));
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const anchor = screenToWorld(screen);
    const factor = Math.exp(-event.deltaY * 0.0014);
    const scale = Math.max(0.03, Math.min(3000, view.scale * factor));
    setView({ cx: anchor.x - (screen.x - canvasSize.width / 2) / scale, cy: anchor.y + (screen.y - canvasSize.height / 2) / scale, scale });
  };

  const addCurve = (preset?: typeof PRESETS[number]) => {
    pushHistory();
    const curve: Curve = {
      id: uid("curve"), name: preset?.name ?? `Curva ${curves.length + 1}`, type: preset?.type ?? "function",
      expression: preset?.expression ?? "y = x", color: COLORS[curves.length % COLORS.length], visible: true,
      domainMin: preset?.type === "parametric" ? 0 : calcDomain.xMin,
      domainMax: preset?.type === "parametric" ? Math.PI * 8 : calcDomain.xMax,
      samples: preset?.type === "implicit" ? 120 : 900,
    };
    setCurves((current) => [...current, curve]); setSelectedCurveId(curve.id); setSelectedEntityId(null); setShowPresets(false); setStatus(`${curve.name} aggiunta`);
  };

  const updateCurve = (id: string, patch: Partial<Curve>) => {
    const resetsTrim = "expression" in patch || "type" in patch || "domainMin" in patch || "domainMax" in patch;
    setCurves((current) => current.map((curve) => curve.id === id ? {
      ...curve,
      ...patch,
      ...(resetsTrim ? { trimmedPaths: undefined } : {}),
    } : curve));
    setIntersections([]);
    setSelectedIntersectionId(null);
    setInspection(null);
  };

  const changeParams = (updater: React.SetStateAction<Parameter[]>) => {
    setParams(updater);
    setIntersections([]);
    setSelectedIntersectionId(null);
    setInspection(null);
  };

  const changeCalcDomain = (patch: Partial<typeof calcDomain>) => {
    setCalcDomain((current) => ({ ...current, ...patch }));
    setIntersections([]);
    setSelectedIntersectionId(null);
  };

  const changeTolerance = (value: number) => {
    setTolerance(value);
    setIntersections([]);
    setSelectedIntersectionId(null);
  };

  const deleteCurve = (id: string) => {
    const remaining = curves.filter((curve) => curve.id !== id);
    pushHistory();
    setCurves(remaining);
    setIntersections((current) => current.filter((item) => !item.curves.includes(id)));
    setInspection((current) => current?.curveId === id ? null : current);
    if (selectedCurveId === id) setSelectedCurveId(remaining[0]?.id ?? "");
    setStatus("Curva eliminata · usa Annulla per ripristinare");
  };

  const deleteDrawEntity = (id: string) => {
    pushHistory();
    setDrawEntities((current) => current.filter((entity) => entity.id !== id));
    setSelectedEntityId((current) => current === id ? null : current);
    setStatus("Entità disegnata eliminata · usa Annulla per ripristinare");
  };

  const restoreTrimmedCurve = (id: string) => {
    const curve = curves.find((item) => item.id === id);
    if (!curve?.trimmedPaths) return;
    pushHistory();
    setCurves((current) => current.map((item) => item.id === id ? { ...item, trimmedPaths: undefined } : item));
    setIntersections([]);
    setStatus(curve.name + " ripristinata dalla formula originale");
  };

  const deleteSelection = () => {
    if (selectedEntityId) {
      deleteDrawEntity(selectedEntityId);
      return;
    }
    if (selectedCurveId && curves.some((curve) => curve.id === selectedCurveId)) deleteCurve(selectedCurveId);
    else setStatus("Seleziona prima una curva, una retta o un punto");
  };

  const clearDrawings = () => {
    if (!drawEntities.length && !measure) {
      setStatus("Non ci sono disegni da cancellare");
      return;
    }
    pushHistory();
    setDrawEntities([]);
    setMeasure(null);
    setSelectedEntityId(null);
    setStatus("Tutti i disegni sono stati cancellati · usa Annulla per ripristinare");
  };

  useEffect(() => {
    const handleDeleteKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === "Escape") {
        setDraftStart(null);
        setDraftCurrent(null);
        setTool("select");
        setStatus("Comando annullato");
      }
    };
    window.addEventListener("keydown", handleDeleteKey);
    return () => window.removeEventListener("keydown", handleDeleteKey);
  });

  const runIntersections = () => {
    setStatus("Calcolo intersezioni…");
    requestAnimationFrame(() => {
      const geometries = curves.filter((curve) => curve.visible).map((curve) => sampledGeometry(curve, paramScope, calcDomain));
      const errors = geometries.filter((geometry) => geometry.error);
      if (errors.length) {
        setStatus(`${errors[0].curve.name}: ${errors[0].error}`); return;
      }
      const found = calculateIntersections(geometries, tolerance);
      setIntersections(found); setStatus(`${found.length} intersezion${found.length === 1 ? "e" : "i"} trovate`);
      if (found.length) fitView(found);
    });
  };

  const focusPoint = (point: Point, id?: string) => {
    setView((current) => ({ ...current, cx: point.x, cy: point.y, scale: Math.max(current.scale, 28) }));
    if (id) setSelectedIntersectionId(id);
    setInspection(null);
    setMobilePanel(null);
  };

  const addPointToPath = (point: Point) => {
    pushHistory(); setPathPoints((current) => [...current, { x: point.x, y: point.y }]); setStatus("Punto aggiunto al percorso");
  };

  const addCurveToPath = () => {
    if (!selectedGeometry?.points.length) return;
    pushHistory();
    const target = Math.max(40, Math.min(800, selectedCurve?.samples ?? 400));
    const sourcePath = selectedGeometry.paths?.reduce((longest, path) => pathLength(path) > pathLength(longest) ? path : longest, [] as Point[]) ?? selectedGeometry.points;
    const stride = Math.max(1, Math.floor(sourcePath.length / target));
    const points = sourcePath.filter((_, index) => index % stride === 0).filter(finitePoint);
    if (sourcePath.length && points.length && distance(points[points.length - 1], sourcePath[sourcePath.length - 1]) > 1e-10) points.push(sourcePath[sourcePath.length - 1]);
    setPathPoints(points);
    const components = selectedGeometry.paths?.length ?? 1;
    setStatus(`${points.length} punti convertiti${components > 1 ? ` dal contorno principale (${components} contorni rilevati)` : ""}`);
    setMobilePanel("gcode");
  };

  const addDrawEntityToPath = () => {
    if (!selectedDrawEntity || selectedDrawEntity.type === "point") return;
    const paths = entityPaths(selectedDrawEntity, 360);
    const sourcePath = paths.reduce((longest, path) => pathLength(path) > pathLength(longest) ? path : longest, [] as Point[]);
    if (sourcePath.length < 2) return;
    pushHistory();
    const target = 500;
    const stride = Math.max(1, Math.floor(sourcePath.length / target));
    const points = sourcePath.filter((_, index) => index % stride === 0);
    if (distance(points[points.length - 1], sourcePath[sourcePath.length - 1]) > 1e-10) points.push(sourcePath[sourcePath.length - 1]);
    setPathPoints(points);
    setStatus(points.length + " punti convertiti dall'entità disegnata");
    setMobilePanel("gcode");
  };

  const saveProject = async () => {
    const project = {
      app: "GT.Code Analytic CAD", version: VERSION, savedAt: new Date().toISOString(),
      curves, params, intersections, drawEntities, pathPoints, view, post, tolerance, calcDomain,
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    setStatus(await saveFile(blob, `GT_CODE_${new Date().toISOString().slice(0, 10)}.gtcad`, "Progetto GT.Code Analytic CAD"));
  };

  const openProject = async () => {
    const pickerWindow = window as Window & { showOpenFilePicker?: (options: unknown) => Promise<Array<{ getFile: () => Promise<File> }>> };
    if (pickerWindow.showOpenFilePicker) {
      try {
        const [handle] = await pickerWindow.showOpenFilePicker({ types: [{ description: "Progetto GT.Code", accept: { "application/json": [".gtcad", ".json"] } }], multiple: false });
        const file = await handle.getFile(); await importProjectFile(file); return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    fileInputRef.current?.click();
  };

  const importProjectFile = async (file: File) => {
    try {
      const project = JSON.parse(await file.text());
      if (project?.app !== "GT.Code Analytic CAD" || !Array.isArray(project.curves)) throw new Error("File non riconosciuto");
      pushHistory(); setCurves(project.curves); setParams(project.params ?? DEFAULT_PARAMS); setIntersections(project.intersections ?? []);
      setDrawEntities(project.drawEntities ?? []); setPathPoints(project.pathPoints ?? []); setView(project.view ?? DEFAULT_VIEW);
      setPost({ ...DEFAULT_POST, ...(project.post ?? {}) }); setTolerance(project.tolerance ?? 0.01); setCalcDomain(project.calcDomain ?? calcDomain);
      setSelectedCurveId(project.curves[0]?.id ?? ""); setSelectedEntityId(null); setStatus(`${file.name} aperto`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Impossibile aprire il file");
    }
  };

  const exportGCode = async () => {
    const blob = new Blob([gcode], { type: "text/plain" });
    setStatus(await saveFile(blob, `O${sanitizeProgram(post.program)}.NC`, "Programma Fanuc generato da GT.Code"));
  };

  const copyGCode = async () => {
    await navigator.clipboard.writeText(gcode); setStatus("G-code copiato");
  };

  const toggleFullscreen = async () => {
    setFocusMode((current) => !current);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // iOS usa comunque la modalità canvas interna a pieno schermo.
    }
  };

  const curveName = (id: string) => curves.find((curve) => curve.id === id)?.name ?? "Curva";
  const drawEntityName = (entity: DrawEntity) => entity.type === "line" ? "Retta disegnata" : entity.type === "circle" ? "Circonferenza disegnata" : entity.type === "polyline" ? (entity.source ?? "Profilo tagliato") : "Punto disegnato";
  const selectedCurveError = selectedCurve ? sampledGeometry(selectedCurve, paramScope, calcDomain).error : undefined;

  return (
    <main className={`cad-app ${focusMode ? "focus-mode" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><img src={`${import.meta.env.BASE_URL}gtcode-logo.png`} alt="Logo GT.Code" width="48" height="48" /></div>
          <div className="brand-copy"><strong>GT<span>.Code</span></strong><small>ANALYTIC CAD <b>v{VERSION}</b></small></div>
        </div>
        <div className="file-actions">
          <button type="button" className="text-button" onClick={openProject}><FolderOpen size={17} /> <span>Apri</span></button>
          <button type="button" className="text-button" onClick={saveProject}><Save size={17} /> <span>Salva</span></button>
          <button type="button" className="text-button accent" onClick={() => setShowGCode(true)}><FileCode2 size={17} /> <span>Postprocessor</span></button>
        </div>
        <div className="header-tools">
          <IconButton label="Annulla" onClick={undo} disabled={!canUndo}><Undo2 size={18} /></IconButton>
          <IconButton label="Ripristina" onClick={redo} disabled={!canRedo}><Redo2 size={18} /></IconButton>
          <span className="toolbar-divider" />
          <IconButton label="Impostazioni" onClick={() => setShowSettings(true)}><Settings2 size={18} /></IconButton>
          <IconButton label="Guida" onClick={() => setShowHelp(true)}><HelpCircle size={18} /></IconButton>
          <IconButton label="Schermo intero" active={focusMode} onClick={toggleFullscreen}><Fullscreen size={18} /></IconButton>
        </div>
      </header>

      <section className={`left-panel side-panel ${leftCollapsed ? "collapsed" : ""} ${mobilePanel === "formulas" || mobilePanel === "draw" ? "mobile-open" : ""}`}>
        <div className="panel-header">
          <div><Sigma size={17} /><span>{mobilePanel === "draw" ? "Disegno e snap" : "Entità matematiche"}</span></div>
          <IconButton label="Chiudi pannello" onClick={() => { setLeftCollapsed(true); setMobilePanel(null); }}><PanelLeftClose size={17} /></IconButton>
        </div>

        {mobilePanel !== "draw" ? <>
          <div className="panel-section compact">
            <button type="button" className="primary-button full" onClick={() => setShowPresets(true)}><Plus size={16} /> Nuova formula <ChevronDown size={15} /></button>
          </div>
          <div className="curve-list">
            {curves.map((curve, index) => {
              const geometry = plotGeometries.find((item) => item.curve.id === curve.id);
              const error = curve.visible ? geometry?.error : undefined;
              const isSelected = selectedCurveId === curve.id;
              return <article key={curve.id} className={`curve-card ${isSelected ? "selected" : ""}`} onClick={() => { setSelectedCurveId(curve.id); setSelectedEntityId(null); }}>
                <div className="curve-card-top">
                  <button type="button" className={`visibility-dot ${curve.visible ? "visible" : ""}`} style={{ "--curve-color": curve.color } as React.CSSProperties} aria-label={curve.visible ? "Nascondi curva" : "Mostra curva"} onClick={(event) => { event.stopPropagation(); updateCurve(curve.id, { visible: !curve.visible }); }} />
                  <input className="curve-name" aria-label={`Nome curva ${index + 1}`} value={curve.name} onChange={(event) => updateCurve(curve.id, { name: event.target.value })} />
                  <select className="type-select" aria-label="Tipo curva" value={curve.type} onChange={(event) => updateCurve(curve.id, { type: event.target.value as CurveType })}>
                    <option value="function">y=f(x)</option><option value="implicit">F(x,y)=0</option><option value="parametric">x(t); y(t)</option>
                  </select>
                  <button type="button" className="mini-icon danger" aria-label="Elimina curva" onClick={(event) => { event.stopPropagation(); deleteCurve(curve.id); }}><Trash2 size={14} /></button>
                </div>
                <div className={`formula-input ${error ? "has-error" : ""}`}>
                  <Braces size={15} />
                  <input spellCheck={false} autoCapitalize="none" value={curve.expression} aria-label={`Formula ${curve.name}`} onChange={(event) => updateCurve(curve.id, { expression: event.target.value })} onFocus={() => setSelectedCurveId(curve.id)} />
                  {error ? <span className="formula-status error" title={error}>!</span> : curve.visible ? <span className="formula-status ok"><Check size={11} /></span> : null}
                </div>
                {isSelected && <div className="curve-details">
                  <NumberField label={curve.type === "parametric" ? "t min" : "X min"} value={curve.domainMin} onChange={(value) => updateCurve(curve.id, { domainMin: value })} />
                  <NumberField label={curve.type === "parametric" ? "t max" : "X max"} value={curve.domainMax} onChange={(value) => updateCurve(curve.id, { domainMax: value })} />
                </div>}
                {curve.trimmedPaths && <div className="trimmed-state"><span><Scissors size={13} /> Profilo tagliato</span><button type="button" onClick={(event) => { event.stopPropagation(); restoreTrimmedCurve(curve.id); }}><RotateCcw size={12} /> Ripristina</button></div>}
                {error && isSelected && <p className="inline-error">{error}</p>}
              </article>;
            })}
          </div>
          <details className="params-block">
            <summary><span><Calculator size={15} /> Parametri globali</span><ChevronDown size={15} /></summary>
            <div className="params-grid">
              {params.map((parameter) => <div className="param-row" key={parameter.id}>
                <input aria-label="Nome parametro" value={parameter.name} onChange={(event) => {
                  const name = event.target.value.replace(/[^a-zA-Z_]/g, "").slice(0, 10);
                  changeParams((current) => current.map((item) => item.id === parameter.id ? { ...item, name } : item));
                }} />
                <span>=</span>
                <DecimalInput label={`Valore ${parameter.name}`} value={parameter.value} onChange={(value) => changeParams((current) => current.map((item) => item.id === parameter.id ? { ...item, value } : item))} />
                <button type="button" aria-label="Elimina parametro" onClick={() => changeParams((current) => current.filter((item) => item.id !== parameter.id))}><X size={13} /></button>
              </div>)}
              <button type="button" className="ghost-button small" onClick={() => changeParams((current) => [...current, { id: uid("param"), name: `p${current.length + 1}`, value: 1 }])}><Plus size={13} /> Parametro</button>
            </div>
          </details>
          <div className="calculation-box">
            <div className="section-title"><Crosshair size={15} /> Ricerca intersezioni</div>
            <div className="domain-grid">
              <NumberField label="X min" value={calcDomain.xMin} onChange={(value) => changeCalcDomain({ xMin: value })} />
              <NumberField label="X max" value={calcDomain.xMax} onChange={(value) => changeCalcDomain({ xMax: value })} />
              <NumberField label="Y min" value={calcDomain.yMin} onChange={(value) => changeCalcDomain({ yMin: value })} />
              <NumberField label="Y max" value={calcDomain.yMax} onChange={(value) => changeCalcDomain({ yMax: value })} />
            </div>
            <NumberField label="Tolleranza" value={tolerance} min={0.000001} step="0.001" suffix="mm" onChange={changeTolerance} />
            <button type="button" className="primary-button full" onClick={runIntersections}><Sparkles size={16} /> Calcola intersezioni</button>
          </div>
        </> : <div className="draw-mobile-content">
          <DrawingControls tool={tool} setTool={setTool} snaps={snaps} setSnaps={setSnaps} gridVisible={gridVisible} setGridVisible={setGridVisible} axesVisible={axesVisible} setAxesVisible={setAxesVisible} fitView={() => fitView()} clearDrawings={clearDrawings} deleteSelection={deleteSelection} canDeleteSelection={Boolean(selectedCurve || selectedDrawEntity)} />
        </div>}
      </section>

      {leftCollapsed && !focusMode && <button type="button" className="panel-reopen left" onClick={() => setLeftCollapsed(false)} aria-label="Apri pannello formule"><Sigma size={18} /></button>}

      <section className="canvas-stage" ref={canvasWrapRef}>
        <div className="canvas-toolbar desktop-drawing-toolbar">
          <DrawingControls compact tool={tool} setTool={setTool} snaps={snaps} setSnaps={setSnaps} gridVisible={gridVisible} setGridVisible={setGridVisible} axesVisible={axesVisible} setAxesVisible={setAxesVisible} fitView={() => fitView()} clearDrawings={clearDrawings} deleteSelection={deleteSelection} canDeleteSelection={Boolean(selectedCurve || selectedDrawEntity)} />
        </div>
        <canvas
          ref={canvasRef}
          className={`cad-canvas tool-${tool}`}
          aria-label="Area grafica cartesiana interattiva"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => setSnapHit(null)}
          onWheel={handleWheel}
          onDoubleClick={() => fitView()}
          onContextMenu={(event) => event.preventDefault()}
        />
        <div className="view-badge"><span>{fmt(1 / view.scale * 100, 3)} u / 100 px</span><b>XY</b></div>
        <div className="orientation-widget"><span className="y-axis">Y</span><span className="x-axis">X</span><i /></div>
        {(selectedCurve || selectedDrawEntity) && <div className="selection-float">
          <span style={{ background: selectedCurve?.color ?? "#ffad4d" }} /><div><small>SELEZIONE</small><b>{selectedCurve ? selectedCurve.name : selectedDrawEntity ? drawEntityName(selectedDrawEntity) : ""}</b></div>
          {selectedCurve && <button type="button" onClick={addCurveToPath}>Crea percorso</button>}
          {selectedDrawEntity && selectedDrawEntity.type !== "point" && <button type="button" onClick={addDrawEntityToPath}>Crea percorso</button>}
          <IconButton className="selection-delete" label="Elimina selezione" onClick={deleteSelection}><Trash2 size={16} /></IconButton>
        </div>}
      </section>

      <section className={`right-panel side-panel ${rightCollapsed ? "collapsed" : ""} ${mobilePanel === "results" || mobilePanel === "gcode" ? "mobile-open" : ""}`}>
        <div className="panel-header">
          <div>{mobilePanel === "gcode" ? <FileCode2 size={17} /> : <Target size={17} />}<span>{mobilePanel === "gcode" ? "Percorso e G-code" : "Risultati"}</span></div>
          <IconButton label="Chiudi pannello" onClick={() => { setRightCollapsed(true); setMobilePanel(null); }}><PanelRightClose size={17} /></IconButton>
        </div>
        {mobilePanel !== "gcode" ? <>
          <div className="result-summary">
            <div><strong>{intersections.length}</strong><span>Intersezioni</span></div>
            <div><strong>{curves.filter((curve) => curve.visible).length}</strong><span>Curve attive</span></div>
          </div>
          <div className="results-list">
            {!intersections.length ? <div className="empty-state"><Crosshair size={30} /><strong>Nessun risultato</strong><p>Imposta il dominio e calcola le intersezioni tra almeno due curve visibili.</p></div> : intersections.map((item, index) => <article key={item.id} className={`result-card ${selectedIntersectionId === item.id ? "selected" : ""}`}>
              <button type="button" className="result-main" onClick={() => focusPoint(item, item.id)}>
                <span className="point-index">P{index + 1}</span>
                <span className="coordinates"><b>X {fmt(item.x, 6)}</b><b>Y {fmt(item.y, 6)}</b><small>{curveName(item.curves[0])} × {curveName(item.curves[1])}</small></span>
                <Focus size={16} />
              </button>
              <button type="button" className="add-path-button" onClick={() => addPointToPath(item)}><Plus size={14} /> Percorso</button>
            </article>)}
          </div>
          <div className="inspector-block">
            <div className="section-title"><Info size={15} /> Proprietà selezione</div>
            {selectedCurve ? <>
              <dl><div><dt>Entità</dt><dd>{selectedCurve.name}</dd></div><div><dt>Tipo</dt><dd>{selectedCurve.type === "function" ? "Funzione esplicita" : selectedCurve.type === "implicit" ? "Equazione implicita" : "Curva parametrica"}</dd></div><div><dt>Campioni</dt><dd>{selectedGeometry?.points.length ?? 0}</dd></div><div><dt>Stato</dt><dd className={selectedCurveError ? "bad" : "good"}>{selectedCurveError ? "Errore" : "Valida"}</dd></div>{inspection?.curveId === selectedCurve.id && <><div><dt>Punto X / Y</dt><dd>{fmt(inspection.point.x, 4)} / {fmt(inspection.point.y, 4)}</dd></div><div><dt>Tangente</dt><dd>{fmt(inspection.angle * 180 / Math.PI, 3)}°</dd></div><div><dt>Pendenza</dt><dd>{Number.isFinite(inspection.slope) ? fmt(inspection.slope, 5) : "Verticale"}</dd></div></>}</dl>
              <div className="inspector-actions"><button type="button" className="secondary-button" disabled={!selectedGeometry?.points.length} onClick={addCurveToPath}><FileCode2 size={15} /> Converti</button><button type="button" className="danger-button" onClick={deleteSelection}><Trash2 size={15} /> Elimina</button></div>
            </> : selectedDrawEntity ? <>
              <dl><div><dt>Entità</dt><dd>{drawEntityName(selectedDrawEntity)}</dd></div><div><dt>Tipo</dt><dd>{selectedDrawEntity.type}</dd></div><div><dt>Stato</dt><dd className="good">Selezionata</dd></div></dl>
              <div className="inspector-actions">{selectedDrawEntity.type !== "point" && <button type="button" className="secondary-button" onClick={addDrawEntityToPath}><FileCode2 size={15} /> Converti</button>}<button type="button" className="danger-button" onClick={deleteSelection}><Trash2 size={15} /> Elimina</button></div>
            </> : <p className="muted-copy">Seleziona una curva, una retta, un cerchio o un punto nell’area grafica.</p>}
          </div>
        </> : <GCodePanel pathPoints={pathPoints} setPathPoints={setPathPoints} post={post} setPost={setPost} gcode={gcode} checks={gcodeChecks} onExport={exportGCode} onCopy={copyGCode} onOpen={() => setShowGCode(true)} />}
      </section>

      {rightCollapsed && !focusMode && <button type="button" className="panel-reopen right" onClick={() => setRightCollapsed(false)} aria-label="Apri pannello risultati"><Target size={18} /></button>}

      <footer className="statusbar">
        <div className="status-message"><span className="online-dot" /> {status}</div>
        <div className="snap-readout"><b>SNAP</b>{snapHit ? snapHit.kind : "—"}</div>
        <div className="coordinate-readout"><span>X <b>{fmt(cursorWorld.x, 4)}</b></span><span>Y <b>{fmt(cursorWorld.y, 4)}</b></span><span>Z <b>0.0000</b></span></div>
        <div className="unit-readout">G21 · mm</div>
      </footer>

      <nav className="mobile-nav" aria-label="Pannelli applicazione">
        <button type="button" className={mobilePanel === "formulas" ? "active" : ""} onClick={() => setMobilePanel((current) => current === "formulas" ? null : "formulas")}><Sigma size={20} /><span>Formule</span></button>
        <button type="button" className={mobilePanel === "draw" ? "active" : ""} onClick={() => setMobilePanel((current) => current === "draw" ? null : "draw")}><PencilRuler size={20} /><span>Disegno</span></button>
        <button type="button" className={mobilePanel === "results" ? "active" : ""} onClick={() => setMobilePanel((current) => current === "results" ? null : "results")}><Target size={20} /><span>Risultati</span>{intersections.length > 0 && <i>{intersections.length}</i>}</button>
        <button type="button" className={mobilePanel === "gcode" ? "active" : ""} onClick={() => setMobilePanel((current) => current === "gcode" ? null : "gcode")}><FileCode2 size={20} /><span>G-code</span>{pathPoints.length > 0 && <i>{pathPoints.length}</i>}</button>
      </nav>

      <input ref={fileInputRef} type="file" className="visually-hidden" accept=".gtcad,.json,application/json" onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]; if (file) importProjectFile(file); event.target.value = "";
      }} />

      {showPresets && <Modal title="Nuova entità matematica" icon={<Sigma size={19} />} onClose={() => setShowPresets(false)}>
        <p className="modal-intro">Scegli una formula nota oppure crea un’entità libera. Tutti i valori sono modificabili dopo l’inserimento.</p>
        <div className="preset-grid">
          {PRESETS.map((preset) => <button type="button" key={preset.name} onClick={() => addCurve(preset)}><span className="preset-icon"><LineChart size={20} /></span><strong>{preset.name}</strong><code>{preset.note}</code></button>)}
        </div>
        <button type="button" className="secondary-button full" onClick={() => addCurve()}><Plus size={16} /> Formula libera y=f(x)</button>
      </Modal>}

      {showHelp && <Modal title="Guida rapida" icon={<HelpCircle size={19} />} onClose={() => setShowHelp(false)} wide>
        <div className="help-grid">
          <section><span className="help-number">01</span><div><h3>Scrivi la geometria</h3><p>Esplicita: <code>y = 2*x + 5</code><br />Implicita: <code>x^2 + y^2 = 900</code><br />Parametrica: <code>x=20*cos(t); y=20*sin(t)</code></p></div></section>
          <section><span className="help-number">02</span><div><h3>Definisci il dominio</h3><p>Le soluzioni numeriche dipendono dall’intervallo X/Y e dalla tolleranza. Restringi il dominio per separare soluzioni molto vicine.</p></div></section>
          <section><span className="help-number">03</span><div><h3>Interroga e disegna</h3><p>Rotella o pinch per lo zoom. Usa SNAP Fine, Medio, Centro, Intersezione, Vicino e Tangente. Il doppio tocco adatta la vista.</p></div></section>
          <section><span className="help-number">04</span><div><h3>Taglia e crea il percorso</h3><p>Attiva le forbici, poi tocca la porzione tra due intersezioni da eliminare. Seleziona il profilo rimasto, controlla ordine e verso, quindi genera il programma Fanuc.</p></div></section>
        </div>
        <div className="safety-note"><Info size={18} /><p><strong>Nota CNC:</strong> il programma è un risultato geometrico, non una validazione tecnologica. Verificare origine, Z, utensile, compensazione, staffaggio e collisioni sul controllo/simulatore prima dell’esecuzione.</p></div>
      </Modal>}

      {showSettings && <Modal title="Impostazioni area grafica" icon={<Settings2 size={19} />} onClose={() => setShowSettings(false)}>
        <div className="settings-list">
          <label className="toggle-row"><span><Grid3X3 size={17} /><b>Griglia tecnica</b></span><input type="checkbox" checked={gridVisible} onChange={(event) => setGridVisible(event.target.checked)} /></label>
          <label className="toggle-row"><span><Crosshair size={17} /><b>Assi cartesiani</b></span><input type="checkbox" checked={axesVisible} onChange={(event) => setAxesVisible(event.target.checked)} /></label>
          <label className="toggle-row"><span><Aperture size={17} /><b>Snap ad oggetto</b></span><input type="checkbox" checked={Object.values(snaps).some(Boolean)} onChange={(event) => setSnaps(Object.fromEntries(Object.keys(snaps).map((key) => [key, event.target.checked])) as SnapState)} /></label>
        </div>
        <button type="button" className="secondary-button full" onClick={() => { setView(DEFAULT_VIEW); setStatus("Vista iniziale ripristinata"); }}><RotateCcw size={16} /> Ripristina vista</button>
      </Modal>}

      {showGCode && <Modal title="Postprocessor Fanuc 31i-MB/B" icon={<FileCode2 size={19} />} onClose={() => setShowGCode(false)} xwide>
        <div className="post-modal-layout">
          <div className="post-form">
            <div className="post-section-title">Programma</div>
            <label className="text-field"><span>Numero O</span><input value={post.program} inputMode="numeric" onChange={(event) => setPost((current) => ({ ...current, program: event.target.value.replace(/\D/g, "").slice(0, 4) }))} /></label>
            <label className="text-field"><span>Commento</span><input value={post.comment} onChange={(event) => setPost((current) => ({ ...current, comment: event.target.value }))} /></label>
            <div className="post-fields-grid">
              <NumberField label="Z sicurezza" value={post.safeZ} suffix="mm" onChange={(value) => setPost((current) => ({ ...current, safeZ: value }))} />
              <NumberField label="Z lavoro" value={post.workZ} suffix="mm" onChange={(value) => setPost((current) => ({ ...current, workZ: value }))} />
              <NumberField label="F XY" value={post.feedXY} suffix="mm/min" onChange={(value) => setPost((current) => ({ ...current, feedXY: value }))} />
              <NumberField label="F Z" value={post.feedZ} suffix="mm/min" onChange={(value) => setPost((current) => ({ ...current, feedZ: value }))} />
              <NumberField label="Mandrino" value={post.spindle} suffix="rpm" onChange={(value) => setPost((current) => ({ ...current, spindle: value }))} />
              <NumberField label="Utensile T" value={post.tool} min={1} step={1} onChange={(value) => setPost((current) => ({ ...current, tool: value }))} />
            </div>
            <label className="text-field"><span>Origine</span><select value={post.workOffset} onChange={(event) => setPost((current) => ({ ...current, workOffset: event.target.value }))}><option>G54</option><option>G55</option><option>G56</option><option>G57</option><option>G58</option><option>G59</option></select></label>
            <label className="toggle-row"><span><RotateCcw size={16} /><b>Chiudi il profilo</b></span><input type="checkbox" checked={post.closePath} onChange={(event) => setPost((current) => ({ ...current, closePath: event.target.checked }))} /></label>
            <label className="toggle-row"><span><Aperture size={16} /><b>Refrigerante M8/M9</b></span><input type="checkbox" checked={post.coolant} onChange={(event) => setPost((current) => ({ ...current, coolant: event.target.checked }))} /></label>
            <div className="verification-card">
              <div className={gcodeChecks.invalid ? "check-bad" : "check-good"}><Check size={16} /><span><b>{gcodeChecks.invalid ? "Coordinate non valide" : "Coordinate finite"}</b><small>{pathPoints.length} punti nel percorso</small></span></div>
              <div className="check-neutral"><PencilRuler size={16} /><span><b>Passo min {fmt(gcodeChecks.minMove, 5)} mm</b><small>Movimento max {fmt(gcodeChecks.maxMove, 3)} mm</small></span></div>
            </div>
          </div>
          <div className="code-preview-wrap">
            <div className="code-preview-head"><div><span className="code-dot red" /><span className="code-dot amber" /><span className="code-dot green" /></div><span>O{sanitizeProgram(post.program)}.NC · FANUC</span><button type="button" onClick={copyGCode}><Copy size={14} /> Copia</button></div>
            <pre className="code-preview">{gcode}</pre>
            <div className="code-actions"><button type="button" className="secondary-button" onClick={copyGCode}><Copy size={16} /> Copia</button><button type="button" className="primary-button" disabled={pathPoints.length < 2} onClick={exportGCode}><Share2 size={16} /> Salva / Condividi .NC</button></div>
          </div>
        </div>
        <div className="safety-strip"><Info size={17} /><span>Output geometrico G0/G1 in G21 · G17 · G90. Nessuna compensazione raggio o verifica collisioni automatica.</span></div>
      </Modal>}
    </main>
  );
}

function DrawingControls({ tool, setTool, snaps, setSnaps, gridVisible, setGridVisible, axesVisible, setAxesVisible, fitView, clearDrawings, deleteSelection, canDeleteSelection, compact = false }: {
  tool: Tool; setTool: (tool: Tool) => void; snaps: SnapState; setSnaps: React.Dispatch<React.SetStateAction<SnapState>>;
  gridVisible: boolean; setGridVisible: (value: boolean) => void; axesVisible: boolean; setAxesVisible: (value: boolean) => void;
  fitView: () => void; clearDrawings: () => void; deleteSelection: () => void; canDeleteSelection: boolean; compact?: boolean;
}) {
  const tools: Array<{ id: Tool; label: string; icon: React.ReactNode }> = [
    { id: "select", label: "Seleziona / interroga", icon: <MousePointer2 size={17} /> },
    { id: "trim", label: "Taglia intelligente", icon: <Scissors size={17} /> },
    { id: "pan", label: "Panoramica", icon: <Move size={17} /> },
    { id: "point", label: "Punto", icon: <CircleDot size={17} /> },
    { id: "line", label: "Linea", icon: <PencilRuler size={17} /> },
    { id: "circle", label: "Circonferenza", icon: <Circle size={17} /> },
    { id: "measure", label: "Misura", icon: <Calculator size={17} /> },
    { id: "zoom-window", label: "Zoom finestra", icon: <ZoomIn size={17} /> },
  ];
  return <div className={`drawing-controls ${compact ? "compact" : "expanded"}`}>
    <div className="drawing-tools">
      {tools.map((item) => <IconButton key={item.id} label={item.label} active={tool === item.id} onClick={() => setTool(item.id)}>{item.icon}</IconButton>)}
      <span className="toolbar-divider" />
      <IconButton label="Adatta alla finestra" onClick={fitView}><Maximize size={17} /></IconButton>
      <IconButton label="Mostra griglia" active={gridVisible} onClick={() => setGridVisible(!gridVisible)}><Grid3X3 size={17} /></IconButton>
      <IconButton label="Mostra assi" active={axesVisible} onClick={() => setAxesVisible(!axesVisible)}><Crosshair size={17} /></IconButton>
      <IconButton className="delete-tool" label="Elimina selezione" disabled={!canDeleteSelection} onClick={deleteSelection}><Trash2 size={17} /></IconButton>
      {!compact && <IconButton label="Cancella tutti i disegni" onClick={clearDrawings}><X size={17} /></IconButton>}
    </div>
    <div className="snap-tools">
      <b>OSNAP</b>
      {(Object.keys(snaps) as SnapKind[]).map((kind) => <button type="button" key={kind} title={kind} className={snaps[kind] ? "active" : ""} onClick={() => setSnaps((current) => ({ ...current, [kind]: !current[kind] }))}>{compact ? kind.slice(0, 3).toUpperCase() : kind}</button>)}
    </div>
    {!compact && <div className="draw-help"><Info size={15} /><p>Seleziona uno strumento e tocca l’area grafica. Con <b>Taglia intelligente</b> tocca il tratto compreso tra le intersezioni da rimuovere. Il cestino elimina l’entità selezionata.</p></div>}
  </div>;
}

function GCodePanel({ pathPoints, setPathPoints, post, setPost, gcode, checks, onExport, onCopy, onOpen }: {
  pathPoints: Point[]; setPathPoints: React.Dispatch<React.SetStateAction<Point[]>>; post: PostSettings; setPost: React.Dispatch<React.SetStateAction<PostSettings>>;
  gcode: string; checks: { invalid: number; maxMove: number; minMove: number }; onExport: () => void; onCopy: () => void; onOpen: () => void;
}) {
  return <div className="gcode-side-content">
    <div className="path-summary"><div><span>PUNTI</span><strong>{pathPoints.length}</strong></div><div><span>L MAX</span><strong>{fmt(checks.maxMove, 2)}</strong></div><div><span>STATO</span><strong className={checks.invalid ? "bad" : "good"}>{pathPoints.length >= 2 && !checks.invalid ? "OK" : "—"}</strong></div></div>
    <div className="path-actions"><button type="button" onClick={() => setPathPoints((current) => [...current].reverse())} disabled={pathPoints.length < 2}><RotateCcw size={14} /> Inverti</button><button type="button" onClick={() => setPathPoints([])} disabled={!pathPoints.length}><Trash2 size={14} /> Svuota</button></div>
    <label className="toggle-row slim"><span><RotateCcw size={15} /><b>Chiudi profilo</b></span><input type="checkbox" checked={post.closePath} onChange={(event) => setPost((current) => ({ ...current, closePath: event.target.checked }))} /></label>
    <pre className="side-code-preview">{gcode}</pre>
    <button type="button" className="primary-button full" onClick={onOpen}><Settings2 size={15} /> Configura postprocessor</button>
    <div className="split-buttons"><button type="button" className="secondary-button" onClick={onCopy}><Copy size={15} /> Copia</button><button type="button" className="secondary-button" disabled={pathPoints.length < 2} onClick={onExport}><FileDown size={15} /> .NC</button></div>
    <p className="micro-warning">Verificare sempre origine, quote Z, utensile e traiettoria sul simulatore CNC.</p>
  </div>;
}

function Modal({ title, icon, onClose, children, wide = false, xwide = false }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean; xwide?: boolean }) {
  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", keyHandler); return () => window.removeEventListener("keydown", keyHandler);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className={`modal ${wide ? "wide" : ""} ${xwide ? "xwide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><div>{icon}<h2>{title}</h2></div><IconButton label="Chiudi" onClick={onClose}><X size={19} /></IconButton></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}
