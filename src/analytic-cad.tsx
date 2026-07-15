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
import { createPortal } from "react-dom";
import { compile, parse } from "mathjs";
import {
  Aperture,
  BookOpen,
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
  Keyboard,
  LineChart,
  Maximize,
  MousePointer2,
  MousePointerClick,
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
type InquiryMode = "tangencies" | "intersections" | "point" | "curve" | "center" | "equation" | null;
type InquiryKind = "tangency" | "intersection" | "point" | "curve" | "center" | "equation";
type InquiryPoint = {
  id: string;
  name: string;
  point: Point;
  kind: InquiryKind;
  source: string;
  details: string;
  equation?: string;
};
type LineMethod = "two-points" | "point-angle";
type CircleMethod = "three-points" | "center-two-points" | "center-tangent" | "tangencies-radius" | "tangencies-diameter";
type PointField = "p1" | "p2" | "p3" | "center";
type ConstructionField = "p1x" | "p1y" | "p2x" | "p2y" | "p3x" | "p3y" | "centerx" | "centery" | "angle" | "length" | "radius" | "diameter";
type ConstructionValues = Record<ConstructionField, string>;
type ConstructionGeometry =
  | { type: "line"; a: Point; b: Point }
  | { type: "circle"; c: Point; r: number; tangentPoint?: Point; tangentPoints?: Point[] };
type ConstructionResult = { geometry: ConstructionGeometry | null; candidates?: ConstructionGeometry[]; error?: string };
type TangentPickTarget = "center-tangent" | number | null;
type MenuEntry = { label: string; action: () => void; checked?: boolean; disabled?: boolean; separator?: boolean; shortcut?: string };
type AppMenu = { label: string; entries: MenuEntry[] };
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

const VERSION = "1.4.1";
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

const DEFAULT_CONSTRUCTION_VALUES: ConstructionValues = {
  p1x: "0", p1y: "0",
  p2x: "20", p2y: "0",
  p3x: "10", p3y: "10",
  centerx: "0", centery: "0",
  angle: "0", length: "20",
  radius: "2", diameter: "4",
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

export function projectOnInfiniteLine(point: Point, line: Segment): Point | null {
  const vx = line.b.x - line.a.x;
  const vy = line.b.y - line.a.y;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared < 1e-20) return null;
  const t = ((point.x - line.a.x) * vx + (point.y - line.a.y) * vy) / lengthSquared;
  return { x: line.a.x + vx * t, y: line.a.y + vy * t };
}

export function circleThroughThreePoints(a: Point, b: Point, c: Point): { center: Point; radius: number } | null {
  const determinant = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(determinant) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const center = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / determinant,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / determinant,
  };
  const radius = distance(center, a);
  return finitePoint(center) && Number.isFinite(radius) && radius > 1e-10 ? { center, radius } : null;
}

type NormalLine = { nx: number; ny: number; constant: number; source: Segment };

function normalLine(segment: Segment): NormalLine | null {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const length = Math.hypot(dx, dy);
  if (length <= 1e-12) return null;
  const nx = -dy / length;
  const ny = dx / length;
  return { nx, ny, constant: nx * segment.a.x + ny * segment.a.y, source: segment };
}

export function tangentCircleCandidates(lines: Segment[], radius: number, tolerance: number): ConstructionGeometry[] {
  if (lines.length < 2 || !Number.isFinite(radius) || radius <= 1e-10) return [];
  const normalized = lines.map(normalLine).filter((line): line is NormalLine => Boolean(line));
  if (normalized.length !== lines.length) return [];
  const allowed = Math.max(tolerance, radius * 1e-5, 1e-7);
  const candidates: ConstructionGeometry[] = [];

  for (let first = 0; first < normalized.length; first += 1) {
    for (let second = first + 1; second < normalized.length; second += 1) {
      const lineA = normalized[first];
      const lineB = normalized[second];
      const determinant = lineA.nx * lineB.ny - lineA.ny * lineB.nx;
      if (Math.abs(determinant) <= 1e-10) continue;
      for (const sideA of [-1, 1]) {
        for (const sideB of [-1, 1]) {
          const constantA = lineA.constant + sideA * radius;
          const constantB = lineB.constant + sideB * radius;
          const center = {
            x: (constantA * lineB.ny - lineA.ny * constantB) / determinant,
            y: (lineA.nx * constantB - constantA * lineB.nx) / determinant,
          };
          if (!finitePoint(center)) continue;
          const isTangentToAll = normalized.every((line) => Math.abs(Math.abs(line.nx * center.x + line.ny * center.y - line.constant) - radius) <= allowed);
          if (!isTangentToAll || candidates.some((candidate) => candidate.type === "circle" && distance(candidate.c, center) <= allowed * 2)) continue;
          const tangentPoints = normalized
            .map((line) => projectOnInfiniteLine(center, line.source))
            .filter((point): point is Point => Boolean(point));
          candidates.push({ type: "circle", c: center, r: radius, tangentPoints });
        }
      }
    }
  }

  return candidates.sort((first, second) => {
    if (first.type !== "circle" || second.type !== "circle") return 0;
    return first.c.y - second.c.y || first.c.x - second.c.x;
  });
}

function parseConstructionNumber(value: string) {
  const normalized = value.trim().replace(/−/g, "-").replace(",", ".");
  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") return NaN;
  return Number(normalized);
}

function constructionPoint(values: ConstructionValues, field: PointField): Point | null {
  const x = parseConstructionNumber(values[`${field}x` as ConstructionField]);
  const y = parseConstructionNumber(values[`${field}y` as ConstructionField]);
  return finitePoint({ x, y }) ? { x, y } : null;
}

function coordinatePair(values: ConstructionValues, field: PointField) {
  const point = constructionPoint(values, field);
  return point ? `${fmt(point.x, 5)}, ${fmt(point.y, 5)}` : "—, —";
}

export function resolveConstructionGeometry(
  kind: "line" | "circle",
  lineMethod: LineMethod,
  circleMethod: CircleMethod,
  values: ConstructionValues,
  tangentLine: Segment | null,
  tolerance: number,
  tangentLines: Segment[] = [],
  solutionIndex = 0,
): ConstructionResult {
  if (kind === "line") {
    const p1 = constructionPoint(values, "p1");
    if (!p1) return { geometry: null, error: "Inserire coordinate valide per il punto 1" };
    if (lineMethod === "two-points") {
      const p2 = constructionPoint(values, "p2");
      if (!p2) return { geometry: null, error: "Inserire coordinate valide per il punto 2" };
      if (distance(p1, p2) <= 1e-10) return { geometry: null, error: "I due punti devono essere differenti" };
      return { geometry: { type: "line", a: p1, b: p2 } };
    }
    const angle = parseConstructionNumber(values.angle);
    const length = parseConstructionNumber(values.length);
    if (!Number.isFinite(angle)) return { geometry: null, error: "Inserire un angolo valido" };
    if (!Number.isFinite(length) || length <= 0) return { geometry: null, error: "La lunghezza deve essere maggiore di zero" };
    const radians = angle * Math.PI / 180;
    return { geometry: { type: "line", a: p1, b: { x: p1.x + length * Math.cos(radians), y: p1.y + length * Math.sin(radians) } } };
  }

  if (circleMethod === "three-points") {
    const p1 = constructionPoint(values, "p1");
    const p2 = constructionPoint(values, "p2");
    const p3 = constructionPoint(values, "p3");
    if (!p1 || !p2 || !p3) return { geometry: null, error: "Inserire tre punti validi" };
    const circle = circleThroughThreePoints(p1, p2, p3);
    return circle ? { geometry: { type: "circle", c: circle.center, r: circle.radius } } : { geometry: null, error: "I tre punti sono allineati o troppo vicini" };
  }

  if (circleMethod === "tangencies-radius" || circleMethod === "tangencies-diameter") {
    const size = parseConstructionNumber(circleMethod === "tangencies-radius" ? values.radius : values.diameter);
    const radius = circleMethod === "tangencies-radius" ? size : size / 2;
    if (!Number.isFinite(size) || size <= 0) return { geometry: null, error: `${circleMethod === "tangencies-radius" ? "Il raggio" : "Il diametro"} deve essere maggiore di zero` };
    if (tangentLines.length < 2) return { geometry: null, error: "Selezionare almeno Tangenza 1 e Tangenza 2 sul canvas" };
    const candidates = tangentCircleCandidates(tangentLines, radius, tolerance);
    if (!candidates.length) return { geometry: null, candidates: [], error: "Nessun cerchio soddisfa tutte le tangenze con questa misura" };
    const selectedIndex = ((solutionIndex % candidates.length) + candidates.length) % candidates.length;
    return { geometry: candidates[selectedIndex], candidates };
  }

  const center = constructionPoint(values, "center");
  if (!center) return { geometry: null, error: "Inserire coordinate valide per il centro" };
  if (circleMethod === "center-two-points") {
    const p1 = constructionPoint(values, "p1");
    const p2 = constructionPoint(values, "p2");
    if (!p1 || !p2) return { geometry: null, error: "Inserire i due punti noti" };
    const r1 = distance(center, p1);
    const r2 = distance(center, p2);
    if (Math.min(r1, r2) <= 1e-10) return { geometry: null, error: "I punti devono essere diversi dal centro" };
    const allowed = Math.max(tolerance, Math.max(r1, r2) * 1e-4);
    if (Math.abs(r1 - r2) > allowed) return { geometry: null, error: `P1 e P2 non sono equidistanti dal centro (ΔR ${fmt(Math.abs(r1 - r2), 5)})` };
    return { geometry: { type: "circle", c: center, r: (r1 + r2) / 2 } };
  }

  if (!tangentLine) return { geometry: null, error: "Selezionare una retta di tangenza" };
  const tangentPoint = projectOnInfiniteLine(center, tangentLine);
  if (!tangentPoint) return { geometry: null, error: "La retta selezionata non è valida" };
  const radius = distance(center, tangentPoint);
  if (radius <= 1e-10) return { geometry: null, error: "Il centro si trova sulla retta: raggio nullo" };
  return { geometry: { type: "circle", c: center, r: radius, tangentPoint } };
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

function nearestPointOnDrawEntity(entity: DrawEntity, target: Point): { point: Point; distance: number; segment?: Segment } | null {
  if (entity.type === "point") return { point: entity.p, distance: distance(target, entity.p) };
  if (entity.type === "circle") {
    const angle = Math.atan2(target.y - entity.c.y, target.x - entity.c.x);
    const point = { x: entity.c.x + entity.r * Math.cos(angle), y: entity.c.y + entity.r * Math.sin(angle) };
    return { point, distance: distance(target, point) };
  }
  let nearest: { point: Point; distance: number; segment: Segment } | null = null;
  for (const segment of entitySegments(entity)) {
    const point = nearestOnSegment(target, segment);
    const d = distance(target, point);
    if (!nearest || d < nearest.distance) nearest = { point, distance: d, segment };
  }
  return nearest;
}

function segmentCircleIntersections(segment: Segment, circle: Extract<DrawEntity, { type: "circle" }>): Point[] {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const fx = segment.a.x - circle.c.x;
  const fy = segment.a.y - circle.c.y;
  const a = dx * dx + dy * dy;
  if (a <= 1e-20) return [];
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - circle.r * circle.r;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -1e-10) return [];
  const root = Math.sqrt(Math.max(0, discriminant));
  const values = [(-b - root) / (2 * a), (-b + root) / (2 * a)];
  const points = values
    .filter((t) => t >= -1e-8 && t <= 1 + 1e-8)
    .map((t) => ({ x: segment.a.x + t * dx, y: segment.a.y + t * dy }));
  return points.filter((point, index) => index === 0 || distance(point, points[0]) > 1e-8);
}

function circleCircleIntersections(first: Extract<DrawEntity, { type: "circle" }>, second: Extract<DrawEntity, { type: "circle" }>): Point[] {
  const dx = second.c.x - first.c.x;
  const dy = second.c.y - first.c.y;
  const centerDistance = Math.hypot(dx, dy);
  if (centerDistance <= 1e-12 || centerDistance > first.r + second.r + 1e-10 || centerDistance < Math.abs(first.r - second.r) - 1e-10) return [];
  const along = (first.r * first.r - second.r * second.r + centerDistance * centerDistance) / (2 * centerDistance);
  const heightSquared = first.r * first.r - along * along;
  if (heightSquared < -1e-10) return [];
  const height = Math.sqrt(Math.max(0, heightSquared));
  const base = { x: first.c.x + along * dx / centerDistance, y: first.c.y + along * dy / centerDistance };
  const offset = { x: -dy * height / centerDistance, y: dx * height / centerDistance };
  const points = [
    { x: base.x + offset.x, y: base.y + offset.y },
    { x: base.x - offset.x, y: base.y - offset.y },
  ];
  return points.filter((point, index) => index === 0 || distance(point, points[0]) > 1e-8);
}

export function drawEntityIntersections(first: DrawEntity, second: DrawEntity): Point[] {
  if (first.type === "point" || second.type === "point") return [];
  if (first.type === "line" && second.type === "line") {
    const point = segmentIntersection({ a: first.a, b: first.b }, { a: second.a, b: second.b });
    return point ? [point] : [];
  }
  if (first.type === "circle" && second.type === "circle") return circleCircleIntersections(first, second);
  if (first.type === "line" && second.type === "circle") return segmentCircleIntersections({ a: first.a, b: first.b }, second);
  if (first.type === "circle" && second.type === "line") return segmentCircleIntersections({ a: second.a, b: second.b }, first);
  const points: Point[] = [];
  for (const firstSegment of entitySegments(first)) {
    for (const secondSegment of entitySegments(second)) {
      if (!segmentBoundsOverlap(firstSegment, secondSegment)) continue;
      const point = segmentIntersection(firstSegment, secondSegment);
      if (point && !points.some((candidate) => distance(candidate, point) <= 1e-7)) points.push(point);
    }
  }
  return points;
}

export function circleLineTangencyPoints(
  circle: { c: Point; r: number },
  lines: Segment[],
  tolerance: number,
): Array<{ point: Point; lineIndex: number; error: number }> {
  const allowed = Math.max(1e-8, tolerance);
  return lines.flatMap((line, lineIndex) => {
    const point = projectOnInfiniteLine(circle.c, line);
    if (!point) return [];
    const error = Math.abs(distance(circle.c, point) - circle.r);
    return error <= allowed ? [{ point, lineIndex, error }] : [];
  });
}

function preciseNumber(value: number) {
  if (Math.abs(value) < 1e-12) return "0";
  return Number(value.toPrecision(12)).toString();
}

function signedTerm(value: number, variable = "") {
  const sign = value < 0 ? "-" : "+";
  return `${sign} ${preciseNumber(Math.abs(value))}${variable}`;
}

export function analyticEquationForEntity(entity: DrawEntity): { type: CurveType; expression: string; title: string } | null {
  if (entity.type === "line") {
    const a = entity.a.y - entity.b.y;
    const b = entity.b.x - entity.a.x;
    const c = entity.a.x * entity.b.y - entity.b.x * entity.a.y;
    const norm = Math.hypot(a, b);
    if (norm <= 1e-12) return null;
    const na = a / norm;
    const nb = b / norm;
    const nc = c / norm;
    return {
      type: "implicit",
      expression: `${preciseNumber(na)}*x ${signedTerm(nb, "*y")} ${signedTerm(nc)} = 0`,
      title: "Retta da geometria",
    };
  }
  if (entity.type === "circle") {
    const xShift = entity.c.x < 0 ? `+ ${preciseNumber(Math.abs(entity.c.x))}` : `- ${preciseNumber(entity.c.x)}`;
    const yShift = entity.c.y < 0 ? `+ ${preciseNumber(Math.abs(entity.c.y))}` : `- ${preciseNumber(entity.c.y)}`;
    return {
      type: "implicit",
      expression: `(x ${xShift})^2 + (y ${yShift})^2 = ${preciseNumber(entity.r)}^2`,
      title: "Circonferenza da geometria",
    };
  }
  return null;
}

function drawEntityInquiryDetails(entity: DrawEntity) {
  if (entity.type === "point") return `Punto X=${fmt(entity.p.x, 6)} Y=${fmt(entity.p.y, 6)}`;
  if (entity.type === "line") {
    const length = distance(entity.a, entity.b);
    const angle = Math.atan2(entity.b.y - entity.a.y, entity.b.x - entity.a.x) * 180 / Math.PI;
    const equation = analyticEquationForEntity(entity)?.expression ?? "—";
    return `L=${fmt(length, 6)}; angolo=${fmt(angle, 4)} deg; ${equation}`;
  }
  if (entity.type === "circle") return `C=(${fmt(entity.c.x, 6)}, ${fmt(entity.c.y, 6)}); R=${fmt(entity.r, 6)}; D=${fmt(entity.r * 2, 6)}`;
  return `Polilinea; vertici=${entity.points.length}; lunghezza=${fmt(pathLength(entity.points), 6)}`;
}

const INQUIRY_KIND_LABELS: Record<InquiryKind, string> = {
  tangency: "TANGENZA",
  intersection: "INTERSEZIONE",
  point: "PUNTO",
  curve: "CURVA",
  center: "CENTRO",
  equation: "EQUAZIONE",
};

const INQUIRY_MODE_LABELS: Record<Exclude<InquiryMode, null>, string> = {
  tangencies: "Interroga tangenze",
  intersections: "Interroga intersezioni",
  point: "Interroga punto",
  curve: "Interroga curva",
  center: "Interroga centro",
  equation: "Crea equazione analitica",
};

export function formatInquiryReport(
  inquiryPoints: InquiryPoint[],
  intersections: Intersection[],
  curveLabel: (id: string) => string = (id) => id,
  generatedAt = new Date(),
) {
  const lines = [
    `GT.CODE ANALYTIC CAD V${VERSION}`,
    "REPORT PUNTI INTERROGATI E INTERSEZIONI",
    `DATA: ${generatedAt.toLocaleString("it-IT")}`,
    "UNITA: mm  |  PIANO: XY",
    "",
    `[PUNTI INTERROGATI: ${inquiryPoints.length}]`,
  ];
  if (!inquiryPoints.length) lines.push("Nessun punto interrogato.");
  inquiryPoints.forEach((item) => {
    lines.push(`${item.name} | ${INQUIRY_KIND_LABELS[item.kind]} | X=${fmt(item.point.x, 8)} | Y=${fmt(item.point.y, 8)} | ${item.source}`);
    if (item.details) lines.push(`  DETTAGLI: ${item.details}`);
    if (item.equation) lines.push(`  EQUAZIONE: ${item.equation}`);
  });
  lines.push("", `[INTERSEZIONI CALCOLATE: ${intersections.length}]`);
  if (!intersections.length) lines.push("Nessuna intersezione calcolata.");
  intersections.forEach((item, index) => lines.push(`IX${index + 1} | X=${fmt(item.x, 8)} | Y=${fmt(item.y, 8)} | ${curveLabel(item.curves[0])} x ${curveLabel(item.curves[1])}`));
  lines.push("", "FINE REPORT", "Verificare sempre tolleranze, unita e origine prima dell'uso CNC.");
  return lines.join("\n");
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
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [inquiryMode, setInquiryMode] = useState<InquiryMode>(null);
  const [inquiryPoints, setInquiryPoints] = useState<InquiryPoint[]>([]);
  const [inquiryLabelsVisible, setInquiryLabelsVisible] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<"formulas" | "draw" | "results" | "gcode" | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGCode, setShowGCode] = useState(false);
  const [constructionShell, setConstructionShell] = useState<"line" | "circle" | null>(null);
  const [lineMethod, setLineMethod] = useState<LineMethod>("two-points");
  const [circleMethod, setCircleMethod] = useState<CircleMethod>("three-points");
  const [constructionValues, setConstructionValues] = useState<ConstructionValues>(DEFAULT_CONSTRUCTION_VALUES);
  const [activeConstructionField, setActiveConstructionField] = useState<ConstructionField>("p1x");
  const [constructionPickTarget, setConstructionPickTarget] = useState<PointField | null>(null);
  const [tangentPickTarget, setTangentPickTarget] = useState<TangentPickTarget>(null);
  const [tangentLineId, setTangentLineId] = useState<string | null>(null);
  const [tangentConstraintIds, setTangentConstraintIds] = useState<Array<string | null>>([null, null, null, null]);
  const [tangentSlotCount, setTangentSlotCount] = useState(2);
  const [circleSolutionIndex, setCircleSolutionIndex] = useState(0);
  const [solutionPickMode, setSolutionPickMode] = useState(false);
  const [constructionShellMinimized, setConstructionShellMinimized] = useState(false);
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
  const selectedInquiryPoint = inquiryPoints.find((item) => item.id === selectedInquiryId) ?? null;
  const tangentLine = drawEntities.find((entity): entity is Extract<DrawEntity, { type: "line" }> => entity.id === tangentLineId && entity.type === "line") ?? null;
  const tangentConstraintLines = tangentConstraintIds.slice(0, tangentSlotCount).map((id) => drawEntities.find((entity): entity is Extract<DrawEntity, { type: "line" }> => entity.id === id && entity.type === "line") ?? null);
  const activeTangentConstraintLines = tangentConstraintLines.filter((line): line is Extract<DrawEntity, { type: "line" }> => Boolean(line));
  const selectedGeometry = plotGeometries.find((geometry) => geometry.curve.id === selectedCurveId) ?? null;
  const constructionResult = useMemo(() => constructionShell
    ? resolveConstructionGeometry(
      constructionShell,
      lineMethod,
      circleMethod,
      constructionValues,
      tangentLine ? { a: tangentLine.a, b: tangentLine.b } : null,
      tolerance,
      activeTangentConstraintLines.map((line) => ({ a: line.a, b: line.b })),
      circleSolutionIndex,
    )
    : { geometry: null }, [constructionShell, lineMethod, circleMethod, constructionValues, tangentLine, activeTangentConstraintLines, tolerance, circleSolutionIndex]);
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
          setIntersections(project.intersections ?? []);
          setInquiryPoints(project.inquiryPoints ?? []);
          setInquiryLabelsVisible(project.inquiryLabelsVisible ?? true);
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
      const project = { app: "GT.Code Analytic CAD", version: VERSION, curves, params, intersections, drawEntities, pathPoints, inquiryPoints, inquiryLabelsVisible, post, view };
      localStorage.setItem("gtcode-analytic-autosave", JSON.stringify(project));
    }, 700);
    return () => clearTimeout(timeout);
  }, [curves, params, intersections, drawEntities, pathPoints, inquiryPoints, inquiryLabelsVisible, post, view]);

  const pushHistory = useCallback(() => {
    historyRef.current.push(JSON.stringify({ curves, params, drawEntities, pathPoints, inquiryPoints }));
    historyRef.current = historyRef.current.slice(-30);
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [curves, params, drawEntities, pathPoints, inquiryPoints]);

  const restoreSnapshot = (json: string) => {
    const snapshot = JSON.parse(json);
    setCurves(snapshot.curves);
    setParams(snapshot.params);
    setDrawEntities(snapshot.drawEntities);
    setPathPoints(snapshot.pathPoints);
    setInquiryPoints(snapshot.inquiryPoints ?? []);
    setIntersections([]);
    setSelectedIntersectionId(null);
    setSelectedInquiryId(null);
    setInquiryMode(null);
    setSelectedCurveId(snapshot.curves[0]?.id ?? "");
    setSelectedEntityId(null);
    setTangentLineId(null);
    setTangentConstraintIds([null, null, null, null]);
    setInspection(null);
  };

  const undo = () => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    futureRef.current.push(JSON.stringify({ curves, params, drawEntities, pathPoints, inquiryPoints }));
    restoreSnapshot(previous);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
  };

  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(JSON.stringify({ curves, params, drawEntities, pathPoints, inquiryPoints }));
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
      ...inquiryPoints.map((item) => item.point),
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
  }, [plotGeometries, drawEntities, inquiryPoints, canvasSize]);

  const activateTool = (nextTool: Tool) => {
    setInquiryMode(null);
    setTool(nextTool);
    setDraftStart(null);
    setDraftCurrent(null);
    setConstructionPickTarget(null);
    setTangentPickTarget(null);
    setSolutionPickMode(false);
    setConstructionShellMinimized(false);
    if (nextTool === "line" || nextTool === "circle") {
      setConstructionShell(nextTool);
      if (nextTool === "circle" && selectedDrawEntity?.type === "line") {
        if (circleMethod === "tangencies-radius" || circleMethod === "tangencies-diameter") {
          setTangentConstraintIds((current) => {
            if (current.includes(selectedDrawEntity.id)) return current;
            const emptySlot = current.slice(0, tangentSlotCount).findIndex((id) => !id);
            return emptySlot >= 0 ? current.map((id, index) => index === emptySlot ? selectedDrawEntity.id : id) : current;
          });
          setStatus("Retta selezionata aggiunta alle tangenze disponibili");
        } else {
          setCircleMethod("center-tangent");
          setTangentLineId(selectedDrawEntity.id);
          setStatus("Retta selezionata automaticamente come tangenza");
        }
      } else setStatus(nextTool === "line" ? "Shell retta aperta · inserisci o acquisisci i punti" : "Shell cerchio aperta · scegli il metodo di costruzione");
    } else {
      setConstructionShell(null);
      setStatus(nextTool === "trim" ? "Taglia intelligente · tocca il tratto da rimuovere" : "Strumento " + nextTool + " attivo");
    }
  };

  const updateConstructionValue = (field: ConstructionField, value: string) => {
    if (!/^-?(?:\d*(?:[.,]\d*)?)?$/.test(value.replace(/−/g, "-"))) return;
    setConstructionValues((current) => ({ ...current, [field]: value.replace(/−/g, "-") }));
    setActiveConstructionField(field);
  };

  const requestConstructionPoint = (field: PointField) => {
    setConstructionPickTarget(field);
    setTangentPickTarget(null);
    setSolutionPickMode(false);
    setConstructionShellMinimized(true);
    setStatus(`Acquisizione ${field === "center" ? "centro" : field.toUpperCase()} · tocca il disegno, gli snap sono attivi`);
  };

  const requestTangentLine = (target: Exclude<TangentPickTarget, null>) => {
    setTangentPickTarget(target);
    setConstructionPickTarget(null);
    setSolutionPickMode(false);
    setConstructionShellMinimized(true);
    setStatus(target === "center-tangent" ? "Tangenza automatica · seleziona una retta disegnata" : `Tangenza ${target + 1} · tocca la retta sul canvas`);
  };

  const requestCircleSolution = () => {
    if (!constructionResult.candidates?.length) {
      setStatus(constructionResult.error ?? "Nessuna soluzione disponibile");
      return;
    }
    setSolutionPickMode(true);
    setConstructionPickTarget(null);
    setTangentPickTarget(null);
    setConstructionShellMinimized(true);
    setStatus("Tocca il cerchio o il centro della soluzione desiderata");
  };

  const cancelConstructionAcquisition = () => {
    setConstructionPickTarget(null);
    setTangentPickTarget(null);
    setSolutionPickMode(false);
    setConstructionShellMinimized(false);
    setStatus("Acquisizione annullata · shell ripristinata");
  };

  const changeCircleMethod = (method: CircleMethod) => {
    setCircleMethod(method);
    setCircleSolutionIndex(0);
    setConstructionPickTarget(null);
    setTangentPickTarget(null);
    setSolutionPickMode(false);
    setConstructionShellMinimized(false);
    if ((method === "tangencies-radius" || method === "tangencies-diameter") && selectedDrawEntity?.type === "line" && !tangentConstraintIds[0]) {
      setTangentConstraintIds((current) => [selectedDrawEntity.id, ...current.slice(1)]);
      setStatus("Retta selezionata inserita come Tangenza 1");
    } else setStatus(method === "tangencies-radius" ? "Seleziona T1 e T2 sul canvas, poi inserisci il raggio" : method === "tangencies-diameter" ? "Seleziona T1 e T2 sul canvas, poi inserisci il diametro" : "Metodo cerchio aggiornato");
  };

  const createConstructionEntity = () => {
    if (!constructionShell || !constructionResult.geometry) {
      setStatus(constructionResult.error ?? "Dati geometrici incompleti");
      return;
    }
    const id = uid(constructionResult.geometry.type);
    const entity: DrawEntity = constructionResult.geometry.type === "line"
      ? { id, type: "line", a: constructionResult.geometry.a, b: constructionResult.geometry.b }
      : { id, type: "circle", c: constructionResult.geometry.c, r: constructionResult.geometry.r };
    pushHistory();
    setDrawEntities((current) => [...current, entity]);
    setSelectedEntityId(id);
    setSelectedCurveId("");
    setIntersections([]);
    setInspection(null);
    const detail = entity.type === "line" ? `L ${fmt(distance(entity.a, entity.b), 5)}` : `R ${fmt(entity.r, 5)}`;
    setStatus(`${entity.type === "line" ? "Retta" : "Cerchio"} creato dalla shell · ${detail}`);
  };

  const appendInquiryPoints = (
    drafts: Array<Omit<InquiryPoint, "id" | "name"> & { prefix: string }>,
    recordHistory = true,
  ) => {
    const uniqueDrafts = drafts.filter((draft, index) => {
      const duplicateExisting = inquiryPoints.some((item) => item.kind === draft.kind && item.source === draft.source && distance(item.point, draft.point) <= Math.max(1e-8, tolerance));
      const duplicateDraft = drafts.slice(0, index).some((item) => item.kind === draft.kind && item.source === draft.source && distance(item.point, draft.point) <= Math.max(1e-8, tolerance));
      return !duplicateExisting && !duplicateDraft;
    });
    if (!uniqueDrafts.length) return [] as InquiryPoint[];
    const counters = new Map<string, number>();
    for (const draft of uniqueDrafts) {
      if (counters.has(draft.prefix)) continue;
      const escaped = draft.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matcher = new RegExp(`^${escaped}(\\d+)$`, "i");
      const maximum = inquiryPoints.reduce((value, item) => {
        const match = item.name.match(matcher);
        return match ? Math.max(value, Number(match[1])) : value;
      }, 0);
      counters.set(draft.prefix, maximum);
    }
    const additions = uniqueDrafts.map((draft) => {
      const number = (counters.get(draft.prefix) ?? 0) + 1;
      counters.set(draft.prefix, number);
      const { prefix, ...data } = draft;
      return { ...data, id: uid("query"), name: `${prefix}${number}` } satisfies InquiryPoint;
    });
    if (recordHistory) pushHistory();
    setInquiryPoints((current) => [...current, ...additions]);
    setSelectedInquiryId(additions[additions.length - 1].id);
    return additions;
  };

  const activateInquiry = (mode: Exclude<InquiryMode, null>) => {
    setInquiryMode(mode);
    setTool("select");
    setConstructionShell(null);
    setConstructionPickTarget(null);
    setTangentPickTarget(null);
    setSolutionPickMode(false);
    setConstructionShellMinimized(false);
    setSelectedInquiryId(null);
    const instructions: Record<Exclude<InquiryMode, null>, string> = {
      tangencies: "Tocca una circonferenza: verranno individuate tutte le rette tangenti",
      intersections: "Tocca vicino all'intersezione da interrogare",
      point: "Tocca un punto sul canvas: gli snap sono attivi",
      curve: "Tocca una curva, una retta, un cerchio o un profilo",
      center: "Tocca una circonferenza per acquisirne il centro",
      equation: "Tocca una retta o una circonferenza disegnata per crearne l'equazione",
    };
    setStatus(`${INQUIRY_MODE_LABELS[mode]} · ${instructions[mode]}`);
  };

  const clearInquiryPoints = () => {
    if (!inquiryPoints.length) {
      setStatus("Non ci sono punti interrogati da cancellare");
      return;
    }
    pushHistory();
    setInquiryPoints([]);
    setSelectedInquiryId(null);
    setStatus("Punti interrogati cancellati · usa Annulla per ripristinarli");
  };

  const renameInquiryPoint = (id: string) => {
    const item = inquiryPoints.find((candidate) => candidate.id === id);
    if (!item) return;
    const name = window.prompt("Nuovo nome del punto interrogato", item.name)?.trim().replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 18);
    if (!name || name === item.name) return;
    if (inquiryPoints.some((candidate) => candidate.id !== id && candidate.name.toLowerCase() === name.toLowerCase())) {
      setStatus(`Il nome ${name} è già utilizzato`);
      return;
    }
    pushHistory();
    setInquiryPoints((current) => current.map((candidate) => candidate.id === id ? { ...candidate, name } : candidate));
    setStatus(`${item.name} rinominato in ${name}`);
  };

  const deleteInquiryPoint = (id: string) => {
    const item = inquiryPoints.find((candidate) => candidate.id === id);
    if (!item) return;
    pushHistory();
    setInquiryPoints((current) => current.filter((candidate) => candidate.id !== id));
    setSelectedInquiryId((current) => current === id ? null : current);
    setStatus(`${item.name} eliminato dal report`);
  };

  const findNearestDrawEntity = (world: Point, thresholdPx = 14) => {
    let nearest: { entity: DrawEntity; point: Point; distance: number; segment?: Segment } | null = null;
    for (const entity of drawEntities) {
      const hit = nearestPointOnDrawEntity(entity, world);
      if (hit && hit.distance <= thresholdPx / view.scale && (!nearest || hit.distance < nearest.distance)) nearest = { entity, ...hit };
    }
    return nearest;
  };

  const findNearestCurve = (world: Point, thresholdPx = 14) => {
    let nearest: { geometry: PlotGeometry; point: Point; distance: number; segment: Segment } | null = null;
    for (const geometry of plotGeometries) {
      for (const segment of geometry.segments) {
        const point = nearestOnSegment(world, segment);
        const d = distance(world, point);
        if (d <= thresholdPx / view.scale && (!nearest || d < nearest.distance)) nearest = { geometry, point, distance: d, segment };
      }
    }
    return nearest;
  };

  const interrogateTangencies = (world: Point) => {
    let circleHit: { entity: Extract<DrawEntity, { type: "circle" }>; distance: number } | null = null;
    for (const entity of drawEntities) {
      if (entity.type !== "circle") continue;
      const hit = nearestPointOnDrawEntity(entity, world);
      if (hit && hit.distance <= 18 / view.scale && (!circleHit || hit.distance < circleHit.distance)) circleHit = { entity, distance: hit.distance };
    }
    if (!circleHit) {
      setStatus("Interroga tangenze · tocca più vicino al bordo della circonferenza disegnata");
      return;
    }
    const lines = drawEntities.filter((entity): entity is Extract<DrawEntity, { type: "line" }> => entity.type === "line");
    const allowed = Math.max(tolerance * 2, circleHit.entity.r * 1e-6, 1e-7);
    const contacts = circleLineTangencyPoints(circleHit.entity, lines.map((line) => ({ a: line.a, b: line.b })), allowed);
    setSelectedEntityId(circleHit.entity.id);
    setSelectedCurveId("");
    setSelectedIntersectionId(null);
    if (!contacts.length) {
      setStatus(`Nessuna retta tangente trovata entro la tolleranza ${fmt(allowed, 6)}`);
      return;
    }
    const tangentIds = contacts.map((contact) => lines[contact.lineIndex].id).slice(0, 4);
    setTangentSlotCount(Math.max(2, tangentIds.length));
    setTangentConstraintIds(Array.from({ length: 4 }, (_, index) => tangentIds[index] ?? null));
    const additions = appendInquiryPoints(contacts.map((contact) => ({
      prefix: "TG",
      point: contact.point,
      kind: "tangency" as const,
      source: `Circonferenza ↔ Retta ${contact.lineIndex + 1}`,
      details: `C=(${fmt(circleHit!.entity.c.x, 6)}, ${fmt(circleHit!.entity.c.y, 6)}); R=${fmt(circleHit!.entity.r, 6)}; errore=${fmt(contact.error, 8)}`,
    })));
    setStatus(`${contacts.length} tangenz${contacts.length === 1 ? "a" : "e"} trovate${additions.length ? ` · create ${additions.map((item) => item.name).join(", ")}` : " · punti già presenti nel report"}`);
  };

  const interrogateIntersection = (world: Point, snap: SnapHit) => {
    const candidates: Array<{ point: Point; source: string; details: string; intersectionId?: string }> = intersections.map((item) => ({
      point: item,
      source: `${curves.find((curve) => curve.id === item.curves[0])?.name ?? "Curva"} × ${curves.find((curve) => curve.id === item.curves[1])?.name ?? "Curva"}`,
      details: "Intersezione calcolata tra entità matematiche",
      intersectionId: item.id,
    }));
    for (let first = 0; first < drawEntities.length; first += 1) {
      for (let second = first + 1; second < drawEntities.length; second += 1) {
        drawEntityIntersections(drawEntities[first], drawEntities[second]).forEach((point) => candidates.push({
          point,
          source: `Entità ${first + 1} × Entità ${second + 1}`,
          details: `${drawEntityInquiryDetails(drawEntities[first])} | ${drawEntityInquiryDetails(drawEntities[second])}`,
        }));
      }
    }
    const localRadius = 28 / view.scale;
    const localSources: Array<{ id: string; name: string; kind: "curve" | "draw"; segments: Segment[] }> = [
      ...plotGeometries.map((geometry) => ({
        id: geometry.curve.id,
        name: geometry.curve.name,
        kind: "curve" as const,
        segments: geometry.segments.filter((segment) => distance(world, nearestOnSegment(world, segment)) <= localRadius),
      })),
      ...drawEntities.filter((entity) => entity.type !== "point").map((entity, index) => ({
        id: entity.id,
        name: `${entity.type === "line" ? "Retta" : entity.type === "circle" ? "Circonferenza" : "Profilo"} ${index + 1}`,
        kind: "draw" as const,
        segments: entitySegments(entity).filter((segment) => distance(world, nearestOnSegment(world, segment)) <= localRadius),
      })),
    ].filter((source) => source.segments.length);
    for (let first = 0; first < localSources.length; first += 1) {
      for (let second = first + 1; second < localSources.length; second += 1) {
        const firstSource = localSources[first];
        const secondSource = localSources[second];
        if (firstSource.kind === "draw" && secondSource.kind === "draw") continue;
        for (const firstSegment of firstSource.segments) {
          for (const secondSegment of secondSource.segments) {
            if (!segmentBoundsOverlap(firstSegment, secondSegment)) continue;
            const point = segmentIntersection(firstSegment, secondSegment);
            if (!point || distance(point, world) > 22 / view.scale) continue;
            if (!candidates.some((candidate) => distance(candidate.point, point) <= Math.max(1e-7, tolerance))) candidates.push({
              point,
              source: `${firstSource.name} × ${secondSource.name}`,
              details: "Intersezione geometrica locale rilevata sul canvas",
            });
          }
        }
      }
    }
    if (snap?.kind === "Intersezione" && !candidates.some((candidate) => distance(candidate.point, snap.point) <= Math.max(1e-8, tolerance))) {
      candidates.push({ point: snap.point, source: "Intersezione geometrica locale", details: "Rilevata mediante snap ad oggetto" });
    }
    const nearest = candidates.reduce<{ candidate: typeof candidates[number]; distance: number } | null>((best, candidate) => {
      const d = distance(world, candidate.point);
      return !best || d < best.distance ? { candidate, distance: d } : best;
    }, null);
    if (!nearest || nearest.distance > 20 / view.scale) {
      setStatus("Nessuna intersezione vicina · tocca l'incrocio oppure calcola prima le intersezioni delle formule");
      return;
    }
    const additions = appendInquiryPoints([{ prefix: "I", point: nearest.candidate.point, kind: "intersection", source: nearest.candidate.source, details: nearest.candidate.details }]);
    if (nearest.candidate.intersectionId) setSelectedIntersectionId(nearest.candidate.intersectionId);
    setStatus(additions.length ? `${additions[0].name} interrogata · X${fmt(additions[0].point.x, 6)} Y${fmt(additions[0].point.y, 6)}` : "Intersezione già presente nel report");
  };

  const interrogatePoint = (world: Point, snap: SnapHit) => {
    const additions = appendInquiryPoints([{
      prefix: "P",
      point: world,
      kind: "point",
      source: snap ? `Snap ${snap.kind}` : "Coordinate canvas",
      details: snap ? `Punto acquisito con snap ${snap.kind}` : "Punto libero interrogato sul piano XY",
    }]);
    if (additions.length) setStatus(`${additions[0].name} · X${fmt(world.x, 6)} Y${fmt(world.y, 6)}`);
    else setStatus("Punto già presente nel report");
  };

  const interrogateCurve = (world: Point) => {
    const drawHit = findNearestDrawEntity(world);
    const curveHit = findNearestCurve(world);
    if (!drawHit && !curveHit) {
      setStatus("Interroga curva · tocca più vicino a una geometria visibile");
      return;
    }
    if (drawHit && (!curveHit || drawHit.distance <= curveHit.distance)) {
      setSelectedEntityId(drawHit.entity.id);
      setSelectedCurveId("");
      setInspection(null);
      const source = drawHit.entity.type === "line" ? "Retta disegnata" : drawHit.entity.type === "circle" ? "Circonferenza disegnata" : drawHit.entity.type === "polyline" ? "Profilo disegnato" : "Punto disegnato";
      const additions = appendInquiryPoints([{ prefix: "Q", point: drawHit.point, kind: "curve", source, details: drawEntityInquiryDetails(drawHit.entity) }]);
      setStatus(additions.length ? `${additions[0].name} sulla ${source.toLowerCase()} · ${additions[0].details}` : "Punto della curva già presente nel report");
      return;
    }
    if (!curveHit) return;
    const dx = curveHit.segment.b.x - curveHit.segment.a.x;
    const dy = curveHit.segment.b.y - curveHit.segment.a.y;
    const angle = Math.atan2(dy, dx);
    const slope = Math.abs(dx) < 1e-12 ? (dy >= 0 ? Infinity : -Infinity) : dy / dx;
    setSelectedCurveId(curveHit.geometry.curve.id);
    setSelectedEntityId(null);
    setInspection({ curveId: curveHit.geometry.curve.id, point: curveHit.point, angle, slope });
    const additions = appendInquiryPoints([{
      prefix: "Q",
      point: curveHit.point,
      kind: "curve",
      source: curveHit.geometry.curve.name,
      details: `${curveHit.geometry.curve.expression}; tangente=${fmt(angle * 180 / Math.PI, 4)} deg; pendenza=${Number.isFinite(slope) ? fmt(slope, 7) : "verticale"}`,
    }]);
    setStatus(additions.length ? `${additions[0].name} su ${curveHit.geometry.curve.name} · tangente ${fmt(angle * 180 / Math.PI, 3)}°` : "Punto della curva già presente nel report");
  };

  const interrogateCenter = (world: Point) => {
    let nearest: { entity: Extract<DrawEntity, { type: "circle" }>; distance: number } | null = null;
    for (const entity of drawEntities) {
      if (entity.type !== "circle") continue;
      const edgeDistance = Math.abs(distance(world, entity.c) - entity.r);
      const centerDistance = distance(world, entity.c);
      const d = Math.min(edgeDistance, centerDistance);
      if (d <= 18 / view.scale && (!nearest || d < nearest.distance)) nearest = { entity, distance: d };
    }
    if (!nearest) {
      setStatus("Interroga centro · tocca il bordo o il centro di una circonferenza");
      return;
    }
    setSelectedEntityId(nearest.entity.id);
    setSelectedCurveId("");
    const additions = appendInquiryPoints([{ prefix: "C", point: nearest.entity.c, kind: "center", source: "Centro circonferenza", details: drawEntityInquiryDetails(nearest.entity) }]);
    setStatus(additions.length ? `${additions[0].name} · Centro X${fmt(nearest.entity.c.x, 6)} Y${fmt(nearest.entity.c.y, 6)}` : "Centro già presente nel report");
  };

  const createAnalyticEquation = (world: Point) => {
    const hit = findNearestDrawEntity(world, 16);
    if (!hit) {
      setStatus("Crea equazione · tocca una retta o una circonferenza disegnata");
      return;
    }
    const analytic = analyticEquationForEntity(hit.entity);
    if (!analytic) {
      setStatus("Questa entità non possiede una singola equazione analitica supportata");
      return;
    }
    const curve: Curve = {
      id: uid("curve"),
      name: `${analytic.title} ${curves.filter((item) => item.name.startsWith(analytic.title)).length + 1}`,
      type: analytic.type,
      expression: analytic.expression,
      color: COLORS[curves.length % COLORS.length],
      visible: true,
      domainMin: calcDomain.xMin,
      domainMax: calcDomain.xMax,
      samples: 140,
    };
    pushHistory();
    setCurves((current) => [...current, curve]);
    setSelectedCurveId(curve.id);
    setSelectedEntityId(null);
    setIntersections([]);
    const additions = appendInquiryPoints([{ prefix: "E", point: hit.point, kind: "equation", source: curve.name, details: `Creata da ${hit.entity.type === "line" ? "retta" : "circonferenza"} disegnata`, equation: analytic.expression }], false);
    setStatus(`Equazione creata: ${analytic.expression}${additions.length ? ` · riferimento ${additions[0].name}` : ""}`);
  };

  const findSnap = useCallback((world: Point, radiusPx = 13): SnapHit => {
    const radius = radiusPx / view.scale;
    const candidates: Array<{ point: Point; kind: SnapKind; priority: number }> = [];
    if (snaps.Intersezione) {
      intersections.forEach((item) => candidates.push({ point: item, kind: "Intersezione", priority: 1 }));
      const localSegments: Array<{ segment: Segment; owner: string }> = [];
      for (const geometry of plotGeometries) {
        let ownerCount = 0;
        for (const segment of geometry.segments) {
          if (distance(world, nearestOnSegment(world, segment)) <= radius * 2.2) {
            localSegments.push({ segment, owner: geometry.curve.id });
            ownerCount += 1;
          }
          if (ownerCount >= 8) break;
        }
      }
      for (const entity of drawEntities) {
        let ownerCount = 0;
        for (const segment of entitySegments(entity)) {
          if (distance(world, nearestOnSegment(world, segment)) <= radius * 2.2) {
            localSegments.push({ segment, owner: entity.id });
            ownerCount += 1;
          }
          if (ownerCount >= 8) break;
        }
      }
      for (let first = 0; first < localSegments.length; first += 1) {
        for (let second = first + 1; second < localSegments.length; second += 1) {
          if (localSegments[first].owner === localSegments[second].owner || !segmentBoundsOverlap(localSegments[first].segment, localSegments[second].segment)) continue;
          const point = segmentIntersection(localSegments[first].segment, localSegments[second].segment);
          if (point && distance(world, point) <= radius) candidates.push({ point, kind: "Intersezione", priority: 0 });
        }
      }
    }
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
      ctx.fillStyle = "rgba(201, 214, 226, .7)"; ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
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
      ctx.fillStyle = "#ff922d"; ctx.font = "bold 15px Inter, sans-serif";
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
      const tangentConstraintIndex = tangentConstraintIds.slice(0, tangentSlotCount).indexOf(entity.id);
      ctx.save();
      ctx.strokeStyle = selected ? "#ffad4d" : tangentConstraintIndex >= 0 ? "#63d7ff" : "#e9edf2";
      ctx.fillStyle = selected ? "#ffad4d" : tangentConstraintIndex >= 0 ? "#63d7ff" : "#e9edf2";
      ctx.lineWidth = selected ? 2.8 : tangentConstraintIndex >= 0 ? 2.3 : 1.6;
      if (selected) {
        ctx.shadowColor = "#ff8617";
        ctx.shadowBlur = 9;
      }
      if (entity.type === "point") {
        const p = worldToScreen(entity.p); ctx.beginPath(); ctx.arc(p.x, p.y, selected ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
      } else if (entity.type === "line") {
        const a = worldToScreen(entity.a); const b = worldToScreen(entity.b); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        if (tangentConstraintIndex >= 0) {
          ctx.font = "bold 13px Inter, sans-serif";
          ctx.fillText(`T${tangentConstraintIndex + 1}`, (a.x + b.x) / 2 + 7, (a.y + b.y) / 2 - 7);
        }
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
        if (selected) {
          ctx.font = "bold 13px ui-monospace, monospace";
          ctx.fillText(`C ${fmt(entity.c.x, 4)}, ${fmt(entity.c.y, 4)}  R ${fmt(entity.r, 4)}`, c.x + 9, c.y - 9);
        }
      }
      ctx.restore();
    }
    if (constructionShell) {
      const previewPoints: Array<{ key: PointField; label: string }> = constructionShell === "line"
        ? [{ key: "p1", label: "P1" }, ...(lineMethod === "two-points" ? [{ key: "p2" as PointField, label: "P2" }] : [])]
        : circleMethod === "three-points"
          ? [{ key: "p1", label: "P1" }, { key: "p2", label: "P2" }, { key: "p3", label: "P3" }]
          : [{ key: "center", label: "C" }, ...(circleMethod === "center-two-points" ? [{ key: "p1" as PointField, label: "P1" }, { key: "p2" as PointField, label: "P2" }] : [])];
      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = "#64d3ff";
      ctx.fillStyle = "#64d3ff";
      ctx.lineWidth = 1.8;
      const geometry = constructionResult.geometry;
      const circleCandidates = (constructionResult.candidates ?? []).filter((candidate): candidate is Extract<ConstructionGeometry, { type: "circle" }> => candidate.type === "circle");
      if (circleCandidates.length) {
        circleCandidates.forEach((candidate, index) => {
          const selected = geometry === candidate;
          const center = worldToScreen(candidate.c);
          ctx.save();
          ctx.setLineDash(selected ? [7, 5] : [3, 6]);
          ctx.globalAlpha = selected ? 1 : .43;
          ctx.strokeStyle = selected ? "#64d3ff" : "#ffad4d";
          ctx.fillStyle = selected ? "#64d3ff" : "#ffad4d";
          ctx.lineWidth = selected ? 2.1 : 1.3;
          ctx.beginPath(); ctx.arc(center.x, center.y, candidate.r * view.scale, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(center.x, center.y, selected ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.font = "bold 13px Inter, sans-serif";
          ctx.fillText(`S${index + 1}`, center.x + 8, center.y - 8);
          candidate.tangentPoints?.forEach((point) => {
            const tangent = worldToScreen(point);
            ctx.beginPath(); ctx.arc(tangent.x, tangent.y, 4, 0, Math.PI * 2); ctx.stroke();
          });
          ctx.restore();
        });
      } else if (geometry?.type === "line") {
        const a = worldToScreen(geometry.a); const b = worldToScreen(geometry.b);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      } else if (geometry?.type === "circle") {
        const center = worldToScreen(geometry.c);
        ctx.beginPath(); ctx.arc(center.x, center.y, geometry.r * view.scale, 0, Math.PI * 2); ctx.stroke();
        if (geometry.tangentPoint) {
          const tangent = worldToScreen(geometry.tangentPoint);
          ctx.setLineDash([]); ctx.beginPath(); ctx.arc(tangent.x, tangent.y, 5, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      ctx.font = "bold 12px Inter, sans-serif";
      for (const item of previewPoints) {
        const point = constructionPoint(constructionValues, item.key);
        if (!point) continue;
        const screen = worldToScreen(point);
        ctx.beginPath(); ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(item.label, screen.x + 7, screen.y - 7);
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
    for (const item of inquiryPoints) {
      const p = worldToScreen(item.point);
      const selected = item.id === selectedInquiryId;
      const color = item.kind === "tangency" ? "#64d3ff"
        : item.kind === "intersection" ? "#ffd36d"
          : item.kind === "center" ? "#66dda1"
            : item.kind === "curve" ? "#c985ff"
              : item.kind === "equation" ? "#f06a78" : "#ffad4d";
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = selected ? 2.8 : 2;
      if (selected) { ctx.shadowColor = color; ctx.shadowBlur = 11; }
      ctx.beginPath(); ctx.arc(p.x, p.y, selected ? 7 : 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(p.x - 10, p.y); ctx.lineTo(p.x + 10, p.y); ctx.moveTo(p.x, p.y - 10); ctx.lineTo(p.x, p.y + 10); ctx.stroke();
      if (inquiryLabelsVisible) {
        ctx.shadowBlur = 0;
        ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, monospace";
        const width = ctx.measureText(item.name).width + 12;
        ctx.fillStyle = "rgba(7, 13, 20, .94)";
        ctx.fillRect(p.x + 9, p.y - 24, width, 21);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x + 9, p.y - 24, width, 21);
        ctx.fillStyle = color;
        ctx.fillText(item.name, p.x + 15, p.y - 9);
      }
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
      ctx.font = "bold 13px Inter, sans-serif";
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
      ctx.font = "15px ui-monospace, monospace"; const width = ctx.measureText(label).width + 12;
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
      ctx.font = "bold 14px Inter, sans-serif"; ctx.fillText(snapHit.kind.toUpperCase(), p.x + 10, p.y - 10); ctx.restore();
    }
  }, [canvasSize, view, bounds, gridVisible, axesVisible, plotGeometries, selectedCurveId, selectedEntityId, drawEntities, tangentConstraintIds, tangentSlotCount, constructionShell, constructionResult, constructionValues, lineMethod, circleMethod, pathPoints, post.closePath, intersections, selectedIntersectionId, inquiryPoints, selectedInquiryId, inquiryLabelsVisible, inspection, draftStart, draftCurrent, tool, measure, snapHit, worldToScreen]);

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
    if (constructionPickTarget) {
      const xField = `${constructionPickTarget}x` as ConstructionField;
      const yField = `${constructionPickTarget}y` as ConstructionField;
      setConstructionValues((current) => ({ ...current, [xField]: fmt(world.x, 6), [yField]: fmt(world.y, 6) }));
      setActiveConstructionField(xField);
      setConstructionPickTarget(null);
      setConstructionShellMinimized(false);
      setStatus(`${constructionPickTarget === "center" ? "Centro" : constructionPickTarget.toUpperCase()} acquisito${hit ? ` con snap ${hit.kind}` : ""} · ${fmt(world.x, 5)}, ${fmt(world.y, 5)}`);
      return;
    }
    if (tangentPickTarget !== null) {
      let nearestLine: { entity: Extract<DrawEntity, { type: "line" }>; distance: number } | null = null;
      for (const entity of drawEntities) {
        if (entity.type !== "line") continue;
        const d = distance(rawWorld, nearestOnSegment(rawWorld, { a: entity.a, b: entity.b }));
        if (d <= 15 / view.scale && (!nearestLine || d < nearestLine.distance)) nearestLine = { entity, distance: d };
      }
      if (!nearestLine) {
        setStatus("Nessuna retta trovata · tocca più vicino alla retta disegnata");
        return;
      }
      if (tangentPickTarget === "center-tangent") {
        setTangentLineId(nearestLine.entity.id);
        setCircleMethod("center-tangent");
      } else {
        const duplicateSlot = tangentConstraintIds.findIndex((id, index) => index !== tangentPickTarget && id === nearestLine!.entity.id);
        if (duplicateSlot >= 0) {
          setStatus(`Questa retta è già impostata come Tangenza ${duplicateSlot + 1}`);
          return;
        }
        setTangentConstraintIds((current) => current.map((id, index) => index === tangentPickTarget ? nearestLine!.entity.id : id));
        setCircleSolutionIndex(0);
      }
      setSelectedEntityId(nearestLine.entity.id);
      setSelectedCurveId("");
      const acquiredTarget = tangentPickTarget;
      setTangentPickTarget(null);
      setConstructionShellMinimized(false);
      setStatus(acquiredTarget === "center-tangent" ? "Retta acquisita · il raggio viene calcolato perpendicolarmente dal centro" : `Tangenza ${acquiredTarget + 1} acquisita sul canvas`);
      return;
    }
    if (solutionPickMode) {
      const candidates = (constructionResult.candidates ?? []).filter((candidate): candidate is Extract<ConstructionGeometry, { type: "circle" }> => candidate.type === "circle");
      let nearestSolution: { index: number; score: number } | null = null;
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const centerDistance = distance(rawWorld, candidate.c);
        const score = Math.min(Math.abs(centerDistance - candidate.r), centerDistance * 0.35);
        if (!nearestSolution || score < nearestSolution.score) nearestSolution = { index, score };
      }
      if (!nearestSolution || nearestSolution.score > 20 / view.scale) {
        setStatus("Tocca più vicino al cerchio tratteggiato o al suo centro");
        return;
      }
      setCircleSolutionIndex(nearestSolution.index);
      setSolutionPickMode(false);
      setConstructionShellMinimized(false);
      setStatus(`Soluzione S${nearestSolution.index + 1} selezionata sul canvas`);
      return;
    }
    if (inquiryMode) {
      if (inquiryMode === "tangencies") interrogateTangencies(rawWorld);
      else if (inquiryMode === "intersections") interrogateIntersection(rawWorld, hit);
      else if (inquiryMode === "point") interrogatePoint(world, hit);
      else if (inquiryMode === "curve") interrogateCurve(rawWorld);
      else if (inquiryMode === "center") interrogateCenter(rawWorld);
      else createAnalyticEquation(rawWorld);
      return;
    }
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
      const queried = inquiryPoints.reduce<{ item: InquiryPoint; distance: number } | null>((best, item) => {
        const d = distance(item.point, rawWorld);
        return d < 14 / view.scale && (!best || d < best.distance) ? { item, distance: d } : best;
      }, null);
      if (queried) {
        setSelectedInquiryId(queried.item.id);
        setSelectedCurveId("");
        setSelectedEntityId(null);
        setSelectedIntersectionId(null);
        setStatus(`${queried.item.name} · ${INQUIRY_KIND_LABELS[queried.item.kind]} · X${fmt(queried.item.point.x, 6)} Y${fmt(queried.item.point.y, 6)} · ${queried.item.source}`);
        return;
      }
      setSelectedInquiryId(null);
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
        setStatus(nearestEntity.entity.type === "circle"
          ? `Circonferenza interrogata · Centro X${fmt(nearestEntity.entity.c.x, 5)} Y${fmt(nearestEntity.entity.c.y, 5)} · R${fmt(nearestEntity.entity.r, 5)}`
          : type + " selezionata · usa il cestino o il tasto Canc");
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
    setTangentLineId((current) => current === id ? null : current);
    setTangentConstraintIds((current) => current.map((constraintId) => constraintId === id ? null : constraintId));
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
    if (selectedInquiryId) {
      deleteInquiryPoint(selectedInquiryId);
      return;
    }
    if (selectedEntityId) {
      deleteDrawEntity(selectedEntityId);
      return;
    }
    if (selectedCurveId && curves.some((curve) => curve.id === selectedCurveId)) deleteCurve(selectedCurveId);
    else setStatus("Seleziona prima una curva, una retta o un punto interrogato");
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
    setTangentLineId(null);
    setTangentConstraintIds([null, null, null, null]);
    setStatus("Tutti i disegni sono stati cancellati · usa Annulla per ripristinare");
  };

  useEffect(() => {
    const handleDeleteKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if ((event.metaKey || event.ctrlKey) && key === "y") {
        event.preventDefault();
        redo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === "Escape") {
        setDraftStart(null);
        setDraftCurrent(null);
        setConstructionPickTarget(null);
        setTangentPickTarget(null);
        setSolutionPickMode(false);
        setConstructionShellMinimized(false);
        setConstructionShell(null);
        setInquiryMode(null);
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
      curves, params, intersections, drawEntities, pathPoints, inquiryPoints, inquiryLabelsVisible, view, post, tolerance, calcDomain,
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
      setInquiryPoints(project.inquiryPoints ?? []); setInquiryLabelsVisible(project.inquiryLabelsVisible ?? true); setSelectedInquiryId(null); setInquiryMode(null);
      setPost({ ...DEFAULT_POST, ...(project.post ?? {}) }); setTolerance(project.tolerance ?? 0.01); setCalcDomain(project.calcDomain ?? calcDomain);
      setSelectedCurveId(project.curves[0]?.id ?? ""); setSelectedEntityId(null); setTangentLineId(null);
      setTangentConstraintIds([null, null, null, null]); setTangentPickTarget(null); setSolutionPickMode(false);
      setConstructionShellMinimized(false); setStatus(`${file.name} aperto`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Impossibile aprire il file");
    }
  };

  const saveInquiryReport = async () => {
    const report = formatInquiryReport(inquiryPoints, intersections, (id) => curves.find((curve) => curve.id === id)?.name ?? id);
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const result = await saveFile(blob, `GT_CODE_REPORT_INTERSEZIONI_${new Date().toISOString().slice(0, 10)}.txt`, "Report punti interrogati e intersezioni GT.Code");
    setStatus(`${result} · report TXT con ${inquiryPoints.length} punti interrogati e ${intersections.length} intersezioni`);
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
  const constructionAcquisitionText = constructionPickTarget
    ? `Tocca il punto ${constructionPickTarget === "center" ? "centro" : constructionPickTarget.toUpperCase()} sul disegno`
    : tangentPickTarget !== null
      ? tangentPickTarget === "center-tangent" ? "Tocca la retta di tangenza" : `Tocca la retta per Tangenza ${tangentPickTarget + 1}`
      : solutionPickMode ? "Tocca il cerchio o il centro della soluzione desiderata" : "Tocca il canvas";
  const appMenus: AppMenu[] = [
    { label: "File", entries: [
      { label: "Apri progetto…", action: openProject, shortcut: "⌘O" },
      { label: "Salva progetto…", action: saveProject, shortcut: "⌘S" },
      { label: "Salva report punti intersezione (.txt)…", action: saveInquiryReport, disabled: !inquiryPoints.length && !intersections.length, separator: true },
      { label: "Esporta programma .NC", action: exportGCode, disabled: pathPoints.length < 2, separator: true },
    ] },
    { label: "Modifica", entries: [
      { label: "Annulla", action: undo, disabled: !canUndo, shortcut: "⌘Z" },
      { label: "Ripristina", action: redo, disabled: !canRedo },
      { label: "Elimina selezione", action: deleteSelection, disabled: !selectedCurve && !selectedDrawEntity && !selectedInquiryPoint, separator: true },
      { label: "Cancella tutti i disegni", action: clearDrawings, disabled: !drawEntities.length },
    ] },
    { label: "Disegno", entries: [
      { label: "Seleziona", action: () => activateTool("select"), checked: tool === "select" && !inquiryMode },
      { label: "Punto", action: () => activateTool("point"), checked: tool === "point" },
      { label: "Retta con coordinate…", action: () => activateTool("line"), checked: constructionShell === "line" },
      { label: "Cerchio con coordinate…", action: () => activateTool("circle"), checked: constructionShell === "circle" },
      { label: "Cerchio Tangenza + Tangenza + R…", action: () => { activateTool("circle"); changeCircleMethod("tangencies-radius"); }, checked: constructionShell === "circle" && circleMethod === "tangencies-radius" },
      { label: "Cerchio Tangenza + Tangenza + Ø…", action: () => { activateTool("circle"); changeCircleMethod("tangencies-diameter"); }, checked: constructionShell === "circle" && circleMethod === "tangencies-diameter" },
      { label: "Taglia intelligente", action: () => activateTool("trim"), checked: tool === "trim", separator: true },
      { label: "Misura", action: () => activateTool("measure"), checked: tool === "measure" },
    ] },
    { label: "Interroga", entries: [
      { label: "Interroga tangenze", action: () => activateInquiry("tangencies"), checked: inquiryMode === "tangencies" },
      { label: "Interroga intersezioni", action: () => activateInquiry("intersections"), checked: inquiryMode === "intersections" },
      { label: "Interroga punto", action: () => activateInquiry("point"), checked: inquiryMode === "point" },
      { label: "Interroga curva", action: () => activateInquiry("curve"), checked: inquiryMode === "curve" },
      { label: "Interroga centro circonferenza", action: () => activateInquiry("center"), checked: inquiryMode === "center" },
      { label: "Crea equazione di geometria analitica", action: () => activateInquiry("equation"), checked: inquiryMode === "equation", separator: true },
      { label: inquiryLabelsVisible ? "Nascondi nomi punti" : "Mostra nomi punti", action: () => setInquiryLabelsVisible((current) => !current), checked: inquiryLabelsVisible, separator: true },
      { label: "Cancella punti interrogati", action: clearInquiryPoints, disabled: !inquiryPoints.length },
    ] },
    { label: "Formule", entries: [
      { label: "Nuova formula…", action: () => setShowPresets(true) },
      { label: "Calcola intersezioni", action: runIntersections },
      { label: "Parametri globali", action: () => { setLeftCollapsed(false); setMobilePanel("formulas"); } },
    ] },
    { label: "Vista", entries: [
      { label: "Adatta alla finestra", action: () => fitView() },
      { label: "Zoom a finestra", action: () => activateTool("zoom-window"), checked: tool === "zoom-window" },
      { label: "Panoramica", action: () => activateTool("pan"), checked: tool === "pan" },
      { label: "Griglia", action: () => setGridVisible((current) => !current), checked: gridVisible, separator: true },
      { label: "Assi cartesiani", action: () => setAxesVisible((current) => !current), checked: axesVisible },
      { label: "Schermo intero", action: toggleFullscreen, checked: focusMode },
    ] },
    { label: "Snap", entries: [
      ...(Object.keys(snaps) as SnapKind[]).map((kind) => ({ label: kind, action: () => setSnaps((current) => ({ ...current, [kind]: !current[kind] })), checked: snaps[kind] })),
      { label: "Attiva tutti", action: () => setSnaps(Object.fromEntries(Object.keys(snaps).map((key) => [key, true])) as SnapState), separator: true },
      { label: "Disattiva tutti", action: () => setSnaps(Object.fromEntries(Object.keys(snaps).map((key) => [key, false])) as SnapState) },
    ] },
    { label: "CNC", entries: [
      { label: "Crea percorso dalla selezione", action: selectedCurve ? addCurveToPath : addDrawEntityToPath, disabled: !selectedCurve && (!selectedDrawEntity || selectedDrawEntity.type === "point") },
      { label: "Postprocessor Fanuc…", action: () => setShowGCode(true) },
      { label: "Apri pannello G-code", action: () => { setRightCollapsed(false); setMobilePanel("gcode"); } },
    ] },
    { label: "Aiuto", entries: [
      { label: "Guida completa GT.Code", action: () => setShowHelp(true) },
      { label: `Informazioni · versione ${VERSION}`, action: () => setStatus(`GT.Code Analytic CAD v${VERSION}`), separator: true },
    ] },
  ];

  return (
    <main className={`cad-app ${focusMode ? "focus-mode" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><img src={`${import.meta.env.BASE_URL}gtcode-logo.png`} alt="Logo GT.Code" width="48" height="48" /></div>
          <div className="brand-copy"><strong>GT<span>.Code</span></strong><small>ANALYTIC CAD <b>v{VERSION}</b></small></div>
        </div>
        <div className="file-actions">
          <div className="mobile-history-controls" aria-label="Cronologia operazioni">
            <IconButton label="Annulla · torna indietro" onClick={undo} disabled={!canUndo}><Undo2 size={19} /></IconButton>
            <IconButton label="Ripristina · ritorna avanti" onClick={redo} disabled={!canRedo}><Redo2 size={19} /></IconButton>
          </div>
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
        <TopMenuBar menus={appMenus} />
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
          <DrawingControls tool={tool} setTool={activateTool} snaps={snaps} setSnaps={setSnaps} gridVisible={gridVisible} setGridVisible={setGridVisible} axesVisible={axesVisible} setAxesVisible={setAxesVisible} fitView={() => fitView()} clearDrawings={clearDrawings} deleteSelection={deleteSelection} canDeleteSelection={Boolean(selectedCurve || selectedDrawEntity || selectedInquiryPoint)} />
        </div>}
      </section>

      {leftCollapsed && !focusMode && <button type="button" className="panel-reopen left" onClick={() => setLeftCollapsed(false)} aria-label="Apri pannello formule"><Sigma size={18} /></button>}

      <section className="canvas-stage" ref={canvasWrapRef}>
        <div className="canvas-toolbar desktop-drawing-toolbar">
          <DrawingControls compact tool={tool} setTool={activateTool} snaps={snaps} setSnaps={setSnaps} gridVisible={gridVisible} setGridVisible={setGridVisible} axesVisible={axesVisible} setAxesVisible={setAxesVisible} fitView={() => fitView()} clearDrawings={clearDrawings} deleteSelection={deleteSelection} canDeleteSelection={Boolean(selectedCurve || selectedDrawEntity || selectedInquiryPoint)} />
        </div>
        {constructionShell && <ConstructionShell
          kind={constructionShell}
          lineMethod={lineMethod}
          setLineMethod={setLineMethod}
          circleMethod={circleMethod}
          setCircleMethod={changeCircleMethod}
          values={constructionValues}
          updateValue={updateConstructionValue}
          activeField={activeConstructionField}
          setActiveField={setActiveConstructionField}
          pickTarget={constructionPickTarget}
          onPickPoint={requestConstructionPoint}
          tangentLine={tangentLine}
          tangentLines={tangentConstraintLines}
          tangentSlotCount={tangentSlotCount}
          tangentPickTarget={tangentPickTarget}
          onPickTangentLine={requestTangentLine}
          onClearTangent={(target) => {
            if (target === "center-tangent") setTangentLineId(null);
            else setTangentConstraintIds((current) => current.map((id, index) => index === target ? null : id));
            setCircleSolutionIndex(0);
          }}
          onAddTangent={() => setTangentSlotCount((current) => Math.min(4, current + 1))}
          onRemoveTangent={() => {
            setTangentConstraintIds((current) => current.map((id, index) => index === tangentSlotCount - 1 ? null : id));
            setTangentSlotCount((current) => Math.max(2, current - 1));
            setCircleSolutionIndex(0);
          }}
          solutionIndex={circleSolutionIndex}
          onSelectSolution={setCircleSolutionIndex}
          onPickSolution={requestCircleSolution}
          snaps={snaps}
          setSnaps={setSnaps}
          result={constructionResult}
          minimized={constructionShellMinimized}
          acquisitionText={constructionAcquisitionText}
          onCancelAcquisition={cancelConstructionAcquisition}
          onCreate={createConstructionEntity}
          onClose={() => { setConstructionShell(null); setConstructionPickTarget(null); setTangentPickTarget(null); setSolutionPickMode(false); setConstructionShellMinimized(false); }}
        />}
        <canvas
          ref={canvasRef}
          className={`cad-canvas tool-${tool} ${constructionPickTarget || tangentPickTarget !== null || solutionPickMode || inquiryMode ? "is-picking" : ""}`}
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
        {inquiryMode && <div className="inquiry-mode-banner"><Target size={17} /><span><b>{INQUIRY_MODE_LABELS[inquiryMode]}</b><small>Tocca il disegno · punti salvati: {inquiryPoints.length}</small></span><button type="button" onClick={() => { setInquiryMode(null); setStatus("Modalità interrogazione terminata"); }} aria-label="Termina interrogazione"><X size={16} /></button></div>}
        <div className="view-badge"><span>{fmt(1 / view.scale * 100, 3)} u / 100 px</span><b>XY</b></div>
        <div className="orientation-widget"><span className="y-axis">Y</span><span className="x-axis">X</span><i /></div>
        {(selectedCurve || selectedDrawEntity || selectedInquiryPoint) && <div className="selection-float">
          <span style={{ background: selectedCurve?.color ?? (selectedInquiryPoint ? "#64d3ff" : "#ffad4d") }} /><div><small>{selectedInquiryPoint ? "PUNTO INTERROGATO" : "SELEZIONE"}</small><b>{selectedInquiryPoint ? selectedInquiryPoint.name : selectedCurve ? selectedCurve.name : selectedDrawEntity ? drawEntityName(selectedDrawEntity) : ""}</b>{selectedInquiryPoint && <em>X {fmt(selectedInquiryPoint.point.x, 4)} · Y {fmt(selectedInquiryPoint.point.y, 4)}</em>}{selectedDrawEntity?.type === "circle" && <em>C {fmt(selectedDrawEntity.c.x, 3)}, {fmt(selectedDrawEntity.c.y, 3)} · R {fmt(selectedDrawEntity.r, 3)}</em>}</div>
          {selectedCurve && <button type="button" onClick={addCurveToPath}>Crea percorso</button>}
          {selectedDrawEntity && selectedDrawEntity.type !== "point" && <button type="button" onClick={addDrawEntityToPath}>Crea percorso</button>}
          {selectedInquiryPoint && <button type="button" onClick={() => renameInquiryPoint(selectedInquiryPoint.id)}>Rinomina</button>}
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
            <div><strong>{inquiryPoints.length}</strong><span>Interrogati</span></div>
            <div><strong>{curves.filter((curve) => curve.visible).length}</strong><span>Curve attive</span></div>
          </div>
          <div className="results-list">
            {!intersections.length ? <div className="empty-state"><Crosshair size={30} /><strong>Nessun risultato</strong><p>Imposta il dominio e calcola le intersezioni tra almeno due curve visibili.</p></div> : intersections.map((item, index) => <article key={item.id} className={`result-card ${selectedIntersectionId === item.id ? "selected" : ""}`}>
              <button type="button" className="result-main" onClick={() => focusPoint(item, item.id)}>
                <span className="point-index">IX{index + 1}</span>
                <span className="coordinates"><b>X {fmt(item.x, 6)}</b><b>Y {fmt(item.y, 6)}</b><small>{curveName(item.curves[0])} × {curveName(item.curves[1])}</small></span>
                <Focus size={16} />
              </button>
              <button type="button" className="add-path-button" onClick={() => addPointToPath(item)}><Plus size={14} /> Percorso</button>
            </article>)}
          </div>
          <div className="inquiry-results">
            <header><div><Target size={15} /><span>Punti interrogati</span></div><button type="button" disabled={!inquiryPoints.length && !intersections.length} onClick={saveInquiryReport}><FileDown size={14} /> Report .TXT</button></header>
            {!inquiryPoints.length ? <p>Nessun punto nominato. Usa il menu <b>Interroga</b> e tocca il canvas.</p> : <div className="inquiry-list">{inquiryPoints.map((item) => <article key={item.id} className={selectedInquiryId === item.id ? "selected" : ""}>
              <button type="button" className="inquiry-focus" onClick={() => { focusPoint(item.point); setSelectedInquiryId(item.id); }}>
                <span className="inquiry-name">{item.name}</span><span><b>{INQUIRY_KIND_LABELS[item.kind]}</b><small>X {fmt(item.point.x, 6)} · Y {fmt(item.point.y, 6)}</small><em>{item.source}</em></span><Focus size={15} />
              </button>
              <div className="inquiry-actions"><button type="button" onClick={() => renameInquiryPoint(item.id)}><PencilRuler size={13} /> Rinomina</button><button type="button" onClick={() => deleteInquiryPoint(item.id)}><Trash2 size={13} /> Elimina</button></div>
            </article>)}</div>}
          </div>
          <div className="inspector-block">
            <div className="section-title"><Info size={15} /> Proprietà selezione</div>
            {selectedInquiryPoint ? <>
              <dl><div><dt>Nome</dt><dd>{selectedInquiryPoint.name}</dd></div><div><dt>Tipo</dt><dd>{INQUIRY_KIND_LABELS[selectedInquiryPoint.kind]}</dd></div><div><dt>X</dt><dd>{fmt(selectedInquiryPoint.point.x, 8)}</dd></div><div><dt>Y</dt><dd>{fmt(selectedInquiryPoint.point.y, 8)}</dd></div><div><dt>Origine</dt><dd>{selectedInquiryPoint.source}</dd></div>{selectedInquiryPoint.equation && <div><dt>Equazione</dt><dd>{selectedInquiryPoint.equation}</dd></div>}</dl>
              <div className="inspector-actions"><button type="button" className="secondary-button" onClick={() => renameInquiryPoint(selectedInquiryPoint.id)}><PencilRuler size={15} /> Rinomina</button><button type="button" className="danger-button" onClick={() => deleteInquiryPoint(selectedInquiryPoint.id)}><Trash2 size={15} /> Elimina</button></div>
            </> : selectedCurve ? <>
              <dl><div><dt>Entità</dt><dd>{selectedCurve.name}</dd></div><div><dt>Tipo</dt><dd>{selectedCurve.type === "function" ? "Funzione esplicita" : selectedCurve.type === "implicit" ? "Equazione implicita" : "Curva parametrica"}</dd></div><div><dt>Campioni</dt><dd>{selectedGeometry?.points.length ?? 0}</dd></div><div><dt>Stato</dt><dd className={selectedCurveError ? "bad" : "good"}>{selectedCurveError ? "Errore" : "Valida"}</dd></div>{inspection?.curveId === selectedCurve.id && <><div><dt>Punto X / Y</dt><dd>{fmt(inspection.point.x, 4)} / {fmt(inspection.point.y, 4)}</dd></div><div><dt>Tangente</dt><dd>{fmt(inspection.angle * 180 / Math.PI, 3)}°</dd></div><div><dt>Pendenza</dt><dd>{Number.isFinite(inspection.slope) ? fmt(inspection.slope, 5) : "Verticale"}</dd></div></>}</dl>
              <div className="inspector-actions"><button type="button" className="secondary-button" disabled={!selectedGeometry?.points.length} onClick={addCurveToPath}><FileCode2 size={15} /> Converti</button><button type="button" className="danger-button" onClick={deleteSelection}><Trash2 size={15} /> Elimina</button></div>
            </> : selectedDrawEntity ? <>
              <dl><div><dt>Entità</dt><dd>{drawEntityName(selectedDrawEntity)}</dd></div><div><dt>Tipo</dt><dd>{selectedDrawEntity.type}</dd></div>{selectedDrawEntity.type === "circle" && <><div><dt>Centro X</dt><dd>{fmt(selectedDrawEntity.c.x, 6)}</dd></div><div><dt>Centro Y</dt><dd>{fmt(selectedDrawEntity.c.y, 6)}</dd></div><div><dt>Raggio</dt><dd>{fmt(selectedDrawEntity.r, 6)}</dd></div><div><dt>Diametro</dt><dd>{fmt(selectedDrawEntity.r * 2, 6)}</dd></div></>}<div><dt>Stato</dt><dd className="good">Selezionata</dd></div></dl>
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
        <button type="button" className={mobilePanel === "results" ? "active" : ""} onClick={() => setMobilePanel((current) => current === "results" ? null : "results")}><Target size={20} /><span>Risultati</span>{intersections.length + inquiryPoints.length > 0 && <i>{intersections.length + inquiryPoints.length}</i>}</button>
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

      {showHelp && <Modal title="Guida completa GT.Code" icon={<BookOpen size={19} />} onClose={() => setShowHelp(false)} xwide>
        <div className="guide-intro"><div><BookOpen size={28} /><span><b>GT.Code Analytic CAD v{VERSION}</b><small>Guida operativa integrata</small></span></div><p>Usa i menu superiori per trovare tutte le funzioni oppure la barra verticale destra per i comandi grafici più frequenti.</p></div>
        <div className="guide-grid">
          <section><span className="help-number">01</span><div><h3>Orientarsi nell’interfaccia</h3><p><b>Sinistra:</b> formule e dominio. <b>Centro:</b> canvas CAD. <b>Destra:</b> strumenti verticali e risultati. Su iPhone i pannelli Formule, Disegno, Risultati e G-code si aprono lateralmente.</p></div></section>
          <section><span className="help-number">02</span><div><h3>Inserire formule</h3><p>Dal menu <b>Formule → Nuova formula</b>: esplicita <code>y=2*x+5</code>, implicita <code>x^2+y^2=900</code>, parametrica <code>x=20*cos(t); y=20*sin(t)</code>. Imposta dominio X/Y e tolleranza prima di calcolare le intersezioni.</p></div></section>
          <section><span className="help-number">03</span><div><h3>Retta con shell</h3><p>Scegli <b>Disegno → Retta con coordinate</b>. Metodo <b>Due punti</b>: compila P1 e P2. Metodo <b>Punto + angolo</b>: compila P1, angolo in gradi e lunghezza. Puoi digitare X/Y oppure usare <b>Acquisisci</b>.</p></div></section>
          <section><span className="help-number">04</span><div><h3>Cerchio con shell</h3><p>Metodi disponibili: <b>tre punti noti</b>; <b>centro + due punti equidistanti</b>; <b>centro + tangenza</b>; <b>tangenze + raggio</b>; <b>tangenze + diametro</b>. Il centro, il raggio e i punti di contatto vengono calcolati automaticamente.</p></div></section>
          <section><span className="help-number">05</span><div><h3>Tastiera CAD</h3><p>Tocca un campo X, Y, angolo o lunghezza. Il tastierino modifica quel campo e include numeri, virgola decimale, <b>segno meno −</b>, cancella carattere e pulizia completa. Sono accettati sia punto sia virgola decimale.</p></div></section>
          <section><span className="help-number">06</span><div><h3>Tangenze T1–T4</h3><p>Per un cerchio T-T-R o T-T-Ø seleziona <b>Tangenza 1</b> e <b>Tangenza 2</b> toccando le rette. Puoi aggiungere T3 e T4 come vincoli facoltativi. Le soluzioni S1–S4 sono visibili sul canvas: scegli il cerchio desiderato dai pulsanti oppure direttamente sul disegno.</p></div></section>
          <section><span className="help-number">07</span><div><h3>Selezione e taglio</h3><p>Con la freccia tocca una curva o entità: diventa arancione. Il cestino la elimina. Con le forbici tocca la porzione delimitata dalle intersezioni da rimuovere; usa <b>Annulla</b> o “Ripristina formula” per tornare indietro.</p></div></section>
          <section><span className="help-number">08</span><div><h3>Zoom e interrogazione</h3><p>Rotella o pinch per zoom, Panoramica per spostarsi, Zoom finestra per inquadrare un’area e doppio tocco per adattare tutto. La selezione di una curva mostra coordinate, pendenza e direzione della tangente.</p></div></section>
          <section><span className="help-number">09</span><div><h3>Percorso e G-code</h3><p>Converti una curva o entità selezionata in punti, controlla ordine e verso, poi apri <b>CNC → Postprocessor Fanuc</b>. Configura G54–G59, utensile, mandrino, avanzamenti, Z sicurezza e Z lavoro prima di esportare il file <code>.NC</code>.</p></div></section>
          <section><span className="help-number">10</span><div><h3>Salvare su iPhone</h3><p><b>File → Salva progetto</b> produce un file <code>.gtcad</code>. <b>File → Salva report punti intersezione</b> produce invece un <code>.txt</code> con nomi, coordinate, sorgenti ed equazioni. Nel menu Condividi scegli <b>Salva su File</b>, quindi iCloud Drive.</p></div></section>
          <section><span className="help-number">11</span><div><h3>Acquisizione a schermo libero</h3><p>Quando premi <b>Acquisisci</b>, “Seleziona retta” o “Scegli soluzione”, la shell si riduce automaticamente per liberare il canvas. Appena tocchi il punto, la tangenza o la soluzione corretta, la finestra completa riappare con il dato acquisito.</p></div></section>
          <section><span className="help-number">12</span><div><h3>Interrogare una circonferenza</h3><p>Dal menu <b>Interroga</b> scegli <b>Interroga curva</b>, <b>Interroga centro</b> oppure <b>Interroga tangenze</b>, quindi tocca il bordo del cerchio. Il pannello Proprietà mostra centro X/Y, raggio, diametro e punti nominati.</p></div></section>
          <section><span className="help-number">13</span><div><h3>Snap dinamici</h3><p><b>Fine</b>, <b>Medio</b>, <b>Centro</b>, <b>Intersezione</b>, <b>Vicino</b> e <b>Tangente</b> si attivano dalla shell, dal menu Snap o dal pannello Disegno. Durante “Acquisisci”, il punto agganciato riempie automaticamente X e Y.</p></div></section>
          <section><span className="help-number">14</span><div><h3>Interrogare le tangenze</h3><p>Scegli <b>Interroga → Interroga tangenze</b> e tocca il cerchio. L’app confronta il raggio con la distanza perpendicolare di ogni retta dal centro, evidenzia le rette tangenti e marca i contatti come <b>TG1, TG2…</b>.</p></div></section>
          <section><span className="help-number">15</span><div><h3>Punti nominati</h3><p>Le intersezioni diventano <b>I1…</b>, i punti liberi <b>P1…</b>, i punti sulle curve <b>Q1…</b> e i centri <b>C1…</b>. Apri <b>Risultati → Punti interrogati</b> per centrare, rinominare o eliminare ogni punto.</p></div></section>
          <section><span className="help-number">16</span><div><h3>Creare un’equazione</h3><p>Scegli <b>Interroga → Crea equazione di geometria analitica</b> e tocca una retta o una circonferenza disegnata. Viene creata automaticamente una nuova equazione implicita modificabile nel pannello Formule.</p></div></section>
          <section><span className="help-number">17</span><div><h3>Annulla e ritorna</h3><p>Le frecce curve nell’intestazione eseguono <b>Annulla</b> e <b>Ripristina</b>. Su tastiera puoi usare <code>Ctrl/⌘+Z</code>, <code>Ctrl/⌘+Shift+Z</code> oppure <code>Ctrl+Y</code>. Anche i punti interrogati fanno parte della cronologia.</p></div></section>
        </div>
        <div className="safety-note"><Info size={18} /><p><strong>Nota CNC:</strong> il programma è un risultato geometrico, non una validazione tecnologica. Verificare origine, Z, utensile, compensazione, staffaggio e collisioni sul controllo/simulatore prima dell’esecuzione.</p></div>
      </Modal>}

      {showSettings && <Modal title="Impostazioni area grafica" icon={<Settings2 size={19} />} onClose={() => setShowSettings(false)}>
        <div className="settings-list">
          <label className="toggle-row"><span><Grid3X3 size={17} /><b>Griglia tecnica</b></span><input type="checkbox" checked={gridVisible} onChange={(event) => setGridVisible(event.target.checked)} /></label>
          <label className="toggle-row"><span><Crosshair size={17} /><b>Assi cartesiani</b></span><input type="checkbox" checked={axesVisible} onChange={(event) => setAxesVisible(event.target.checked)} /></label>
          <label className="toggle-row"><span><Aperture size={17} /><b>Snap ad oggetto</b></span><input type="checkbox" checked={Object.values(snaps).some(Boolean)} onChange={(event) => setSnaps(Object.fromEntries(Object.keys(snaps).map((key) => [key, event.target.checked])) as SnapState)} /></label>
          <label className="toggle-row"><span><Target size={17} /><b>Nomi punti interrogati</b></span><input type="checkbox" checked={inquiryLabelsVisible} onChange={(event) => setInquiryLabelsVisible(event.target.checked)} /></label>
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

function TopMenuBar({ menus }: { menus: AppMenu[] }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      const insideBar = menuRef.current?.contains(event.target);
      const insideDropdown = dropdownRef.current?.contains(event.target);
      if (!insideBar && !insideDropdown) setOpenMenu(null);
    };
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenMenu(null); };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeWithEscape);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("keydown", closeWithEscape); };
  }, []);

  const activeMenu = menus.find((menu) => menu.label === openMenu) ?? null;
  const toggleMenu = (label: string, trigger: HTMLButtonElement) => {
    if (openMenu === label) {
      setOpenMenu(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const left = Math.max(6, Math.min(rect.left, window.innerWidth - 270));
    setMenuPosition({ top: rect.bottom, left });
    setOpenMenu(label);
  };

  const dropdown = activeMenu && typeof document !== "undefined" ? createPortal(
    <div ref={dropdownRef} className="app-menu-dropdown app-menu-portal" role="menu" aria-label={`Menu ${activeMenu.label}`} style={{ top: menuPosition.top, left: menuPosition.left }}>
      {activeMenu.entries.map((entry, index) => <button
          type="button"
          role="menuitem"
          key={`${entry.label}-${index}`}
          className={entry.separator ? "has-separator" : ""}
          disabled={entry.disabled}
          onClick={() => { setOpenMenu(null); entry.action(); }}
        >
          <span className="menu-check">{entry.checked ? <Check size={13} /> : null}</span>
          <span>{entry.label}</span>
          {entry.shortcut && <kbd>{entry.shortcut}</kbd>}
        </button>)}
    </div>,
    document.body,
  ) : null;

  return <>
    <nav className="app-menubar" ref={menuRef} aria-label="Menu principale">
      {menus.map((menu) => <div className={`app-menu ${openMenu === menu.label ? "open" : ""}`} key={menu.label}>
        <button
          type="button"
          className="app-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={openMenu === menu.label}
          onClick={(event) => toggleMenu(menu.label, event.currentTarget)}
        >{menu.label}</button>
      </div>)}
    </nav>
    {dropdown}
  </>;
}

function ConstructionShell({
  kind, lineMethod, setLineMethod, circleMethod, setCircleMethod, values, updateValue, activeField, setActiveField,
  pickTarget, onPickPoint, tangentLine, tangentLines, tangentSlotCount, tangentPickTarget, onPickTangentLine,
  onClearTangent, onAddTangent, onRemoveTangent, solutionIndex, onSelectSolution, onPickSolution,
  snaps, setSnaps, result, minimized, acquisitionText, onCancelAcquisition, onCreate, onClose,
}: {
  kind: "line" | "circle";
  lineMethod: LineMethod; setLineMethod: (method: LineMethod) => void;
  circleMethod: CircleMethod; setCircleMethod: (method: CircleMethod) => void;
  values: ConstructionValues; updateValue: (field: ConstructionField, value: string) => void;
  activeField: ConstructionField; setActiveField: (field: ConstructionField) => void;
  pickTarget: PointField | null; onPickPoint: (field: PointField) => void;
  tangentLine: Extract<DrawEntity, { type: "line" }> | null;
  tangentLines: Array<Extract<DrawEntity, { type: "line" }> | null>;
  tangentSlotCount: number; tangentPickTarget: TangentPickTarget;
  onPickTangentLine: (target: Exclude<TangentPickTarget, null>) => void;
  onClearTangent: (target: "center-tangent" | number) => void;
  onAddTangent: () => void; onRemoveTangent: () => void;
  solutionIndex: number; onSelectSolution: (index: number) => void; onPickSolution: () => void;
  snaps: SnapState; setSnaps: React.Dispatch<React.SetStateAction<SnapState>>;
  result: ConstructionResult;
  minimized: boolean; acquisitionText: string; onCancelAcquisition: () => void;
  onCreate: () => void; onClose: () => void;
}) {
  const numericField = (field: ConstructionField, label: string, suffix?: string) => <label className={`shell-number-field ${activeField === field ? "active" : ""}`}>
    <span>{label}</span>
    <span><input
      value={values[field]}
      inputMode="decimal"
      autoCapitalize="none"
      autoCorrect="off"
      onFocus={() => setActiveField(field)}
      onChange={(event) => updateValue(field, event.target.value)}
      aria-label={label}
    />{suffix && <em>{suffix}</em>}</span>
  </label>;

  const pointEditor = (field: PointField, title: string) => <section className={`shell-point-editor ${pickTarget === field ? "picking" : ""}`}>
    <header><div><b>{title}</b><code>{coordinatePair(values, field)}</code></div><button type="button" onClick={() => onPickPoint(field)}><MousePointerClick size={15} /> {pickTarget === field ? "Tocca il canvas…" : "Acquisisci"}</button></header>
    <div className="shell-coordinate-grid">
      {numericField(`${field}x` as ConstructionField, "X")}
      {numericField(`${field}y` as ConstructionField, "Y")}
    </div>
  </section>;

  const applyKey = (key: string) => {
    const current = values[activeField] ?? "";
    if (key === "C") updateValue(activeField, "");
    else if (key === "⌫") updateValue(activeField, current.slice(0, -1));
    else if (key === "−") updateValue(activeField, current.startsWith("-") ? current.slice(1) : `-${current}`);
    else if (key === ",") {
      if (!/[.,]/.test(current)) updateValue(activeField, `${current || "0"},`);
    } else updateValue(activeField, current === "0" ? key : current + key);
  };

  const lineDescription = (line: Extract<DrawEntity, { type: "line" }> | null) => line
    ? `P1 ${fmt(line.a.x, 3)}, ${fmt(line.a.y, 3)} → P2 ${fmt(line.b.x, 3)}, ${fmt(line.b.y, 3)}`
    : "Nessuna retta selezionata";

  const tangencyEditor = (slot: number) => {
    const line = tangentLines[slot] ?? null;
    const picking = tangentPickTarget === slot;
    return <div className={`tangent-selector tangent-constraint ${picking ? "picking" : ""}`} key={slot}>
      <div><b>Tangenza {slot + 1}{slot >= 2 ? " · facoltativa" : ""}</b><small>{lineDescription(line)}</small></div>
      <span className="tangent-actions">
        {line && <IconButton label={`Cancella tangenza ${slot + 1}`} onClick={() => onClearTangent(slot)}><X size={15} /></IconButton>}
        <button type="button" onClick={() => onPickTangentLine(slot)}><MousePointerClick size={15} /> {picking ? "Tocca la retta…" : line ? "Cambia" : "Seleziona"}</button>
      </span>
    </div>;
  };

  const geometry = result.geometry;
  const fixedTangencies = circleMethod === "tangencies-radius" || circleMethod === "tangencies-diameter";
  const selectedSolution = result.candidates?.length ? ((solutionIndex % result.candidates.length) + result.candidates.length) % result.candidates.length : 0;
  const summary = geometry?.type === "line"
    ? `P2 ${fmt(geometry.b.x, 5)}, ${fmt(geometry.b.y, 5)} · L ${fmt(distance(geometry.a, geometry.b), 5)}`
    : geometry?.type === "circle"
      ? `${fixedTangencies ? `S${selectedSolution + 1} · ` : ""}C ${fmt(geometry.c.x, 5)}, ${fmt(geometry.c.y, 5)} · R ${fmt(geometry.r, 5)} · Ø ${fmt(geometry.r * 2, 5)}`
      : result.error ?? "Compila i dati geometrici";

  return <aside className={`construction-shell ${minimized ? "minimized" : ""}`} aria-label={`Shell ${kind === "line" ? "retta" : "cerchio"}`}>
    <header className="construction-shell-head"><div>{kind === "line" ? <PencilRuler size={17} /> : <Circle size={17} />}<span><b>{kind === "line" ? "RETTA" : "CERCHIO"}</b><small>Costruzione geometrica</small></span></div><IconButton label="Chiudi shell" onClick={onClose}><X size={17} /></IconButton></header>
    {minimized ? <div className="construction-acquisition-strip"><MousePointerClick size={20} /><span><b>ACQUISIZIONE DAL CANVAS</b><small>{acquisitionText}</small></span><button type="button" onClick={onCancelAcquisition}>Annulla</button></div> : <div className="construction-shell-body">
      <label className="construction-method"><span>Metodo</span><select value={kind === "line" ? lineMethod : circleMethod} onChange={(event) => kind === "line" ? setLineMethod(event.target.value as LineMethod) : setCircleMethod(event.target.value as CircleMethod)}>
        {kind === "line" ? <><option value="two-points">Due punti</option><option value="point-angle">Punto + angolo + lunghezza</option></> : <><option value="three-points">Tre punti noti</option><option value="center-two-points">Centro + due punti noti</option><option value="center-tangent">Centro + tangenza a retta</option><option value="tangencies-radius">Tangenze + Raggio</option><option value="tangencies-diameter">Tangenze + Diametro</option></>}
      </select></label>

      {kind === "line" ? <>
        {pointEditor("p1", "Punto 1")}
        {lineMethod === "two-points" ? pointEditor("p2", "Punto 2") : <div className="shell-coordinate-grid angle-grid">{numericField("angle", "Angolo", "°")}{numericField("length", "Lunghezza", "mm")}</div>}
      </> : circleMethod === "three-points" ? <>
        {pointEditor("p1", "Punto 1")}{pointEditor("p2", "Punto 2")}{pointEditor("p3", "Punto 3")}
      </> : circleMethod === "center-two-points" ? <>
        {pointEditor("center", "Centro")}
        {pointEditor("p1", "Punto noto 1")}{pointEditor("p2", "Punto noto 2")}
      </> : circleMethod === "center-tangent" ? <>
        {pointEditor("center", "Centro")}
        <div className={`tangent-selector ${tangentPickTarget === "center-tangent" ? "picking" : ""}`}>
          <div><b>Retta di tangenza</b><small>{lineDescription(tangentLine)}</small></div>
          <span className="tangent-actions">{tangentLine && <IconButton label="Cancella retta di tangenza" onClick={() => onClearTangent("center-tangent")}><X size={15} /></IconButton>}<button type="button" onClick={() => onPickTangentLine("center-tangent")}><MousePointerClick size={15} /> {tangentPickTarget === "center-tangent" ? "Tocca la retta…" : tangentLine ? "Cambia" : "Seleziona retta"}</button></span>
        </div>
      </> : <div className="multi-tangency-block">
        <p className="tangency-instruction"><Target size={15} /> Seleziona sul canvas almeno due rette. T3 e T4 sono vincoli facoltativi.</p>
        {Array.from({ length: tangentSlotCount }, (_, slot) => tangencyEditor(slot))}
        <div className="tangency-slot-actions">
          <button type="button" className="ghost-button small" disabled={tangentSlotCount >= 4} onClick={onAddTangent}><Plus size={14} /> Aggiungi tangenza</button>
          {tangentSlotCount > 2 && <button type="button" className="ghost-button small" onClick={onRemoveTangent}><X size={14} /> Rimuovi T{tangentSlotCount}</button>}
        </div>
        <div className="shell-coordinate-grid angle-grid tangency-size-field">{circleMethod === "tangencies-radius" ? numericField("radius", "Raggio", "mm") : numericField("diameter", "Diametro", "mm")}</div>
        <div className="circle-solutions">
          <header><span>Soluzioni geometriche</span><b>{result.candidates?.length ?? 0}</b></header>
          <div className="solution-buttons">{result.candidates?.map((_, index) => <button type="button" key={index} className={selectedSolution === index ? "active" : ""} onClick={() => onSelectSolution(index)}>S{index + 1}</button>)}</div>
          <button type="button" className="secondary-button full small" disabled={!result.candidates?.length} onClick={onPickSolution}><MousePointerClick size={15} /> Scegli soluzione sul canvas</button>
        </div>
      </div>}

      <div className="shell-snaps"><span>SNAP DINAMICI</span><div>{(Object.keys(snaps) as SnapKind[]).map((kind) => <button type="button" key={kind} className={snaps[kind] ? "active" : ""} onClick={() => setSnaps((current) => ({ ...current, [kind]: !current[kind] }))}>{kind}</button>)}</div></div>

      <div className="cad-keypad"><div className="keypad-title"><Keyboard size={14} /><span>Tastiera CAD · campo: <b>{activeField.toUpperCase()}</b></span></div><div className="keypad-grid">{["7", "8", "9", "4", "5", "6", "1", "2", "3", "−", "0", ",", "C", "⌫"].map((key) => <button type="button" key={key} className={key === "−" ? "minus-key" : ""} onClick={() => applyKey(key)}>{key}</button>)}</div></div>

      <div className={`construction-summary ${geometry ? "valid" : "invalid"}`}><span>{geometry ? <Check size={15} /> : <Info size={15} />}</span><p>{summary}</p></div>
      <button type="button" className="primary-button full shell-create" disabled={!geometry} onClick={onCreate}><Plus size={16} /> Crea {kind === "line" ? "retta" : "cerchio"}</button>
    </div>}
  </aside>;
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
