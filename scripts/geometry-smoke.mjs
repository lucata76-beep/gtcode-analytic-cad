import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const module = await server.ssrLoadModule("/src/analytic-cad.tsx");
  const {
    default: AnalyticCad,
    nearestPathLocation,
    trimPathAtLocation,
    resolveConstructionGeometry,
    tangentCircleCandidates,
    circleLineTangencyPoints,
    drawEntityIntersections,
    analyticEquationForEntity,
    formatInquiryReport,
    PLANE_DEFINITIONS,
    normalizeWorkPlane,
    remapPlaneExpression,
    planePointToMachineCoordinates,
    generateGCode,
  } = module;

  const markup = renderToStaticMarkup(React.createElement(AnalyticCad));
  assert(markup.includes("GT.Code") && markup.includes("v1.5.0"), "L'interfaccia deve essere renderizzabile");
  assert(markup.includes(">Disegno<") && markup.includes(">Interroga<") && markup.includes(">Piano<") && markup.includes(">Aiuto<") && markup.includes('aria-label="Guida"'), "Menu desktop, piano di lavoro, interrogazione e guida devono essere disponibili");

  const values = {
    p1x: "0", p1y: "0", p2x: "20", p2y: "0", p3x: "0", p3y: "10",
    centerx: "0", centery: "0", angle: "90", length: "10",
  };
  const lineByPoints = resolveConstructionGeometry("line", "two-points", "three-points", values, null, 1e-6);
  assert.equal(lineByPoints.geometry?.type, "line");
  assert.equal(lineByPoints.geometry?.b.x, 20);

  const lineByAngle = resolveConstructionGeometry("line", "point-angle", "three-points", values, null, 1e-6);
  assert.equal(lineByAngle.geometry?.type, "line");
  assert(Math.abs(lineByAngle.geometry.b.x) < 1e-10 && Math.abs(lineByAngle.geometry.b.y - 10) < 1e-10);

  const threePointValues = { ...values, p1x: "10", p1y: "0", p2x: "0", p2y: "10", p3x: "-10", p3y: "0" };
  const circleByPoints = resolveConstructionGeometry("circle", "two-points", "three-points", threePointValues, null, 1e-6);
  assert.equal(circleByPoints.geometry?.type, "circle");
  assert(Math.abs(circleByPoints.geometry.c.x) < 1e-10 && Math.abs(circleByPoints.geometry.r - 10) < 1e-10);

  const circleByCenter = resolveConstructionGeometry("circle", "two-points", "center-two-points", { ...values, p1x: "5", p1y: "0", p2x: "0", p2y: "5" }, null, 1e-6);
  assert.equal(circleByCenter.geometry?.type, "circle");
  assert(Math.abs(circleByCenter.geometry.r - 5) < 1e-10);
  const invalidCenteredCircle = resolveConstructionGeometry("circle", "two-points", "center-two-points", { ...values, p1x: "5", p1y: "0", p2x: "0", p2y: "6" }, null, 1e-6);
  assert.equal(invalidCenteredCircle.geometry, null, "I due punti devono essere equidistanti dal centro");

  const tangentCircle = resolveConstructionGeometry("circle", "two-points", "center-tangent", { ...values, centerx: "0", centery: "5" }, { a: { x: -10, y: 0 }, b: { x: 10, y: 0 } }, 1e-6);
  assert.equal(tangentCircle.geometry?.type, "circle");
  assert(Math.abs(tangentCircle.geometry.r - 5) < 1e-10);
  assert(Math.abs(tangentCircle.geometry.tangentPoint.x) < 1e-10 && Math.abs(tangentCircle.geometry.tangentPoint.y) < 1e-10);

  const horizontal = { a: { x: -10, y: 0 }, b: { x: 10, y: 0 } };
  const vertical = { a: { x: 0, y: -10 }, b: { x: 0, y: 10 } };
  const fixedRadiusCandidates = tangentCircleCandidates([horizontal, vertical], 2, 1e-6);
  assert.equal(fixedRadiusCandidates.length, 4, "Due rette incidenti devono produrre quattro soluzioni T-T-R");
  assert(fixedRadiusCandidates.every((candidate) => candidate.type === "circle" && Math.abs(Math.abs(candidate.c.x) - 2) < 1e-10 && Math.abs(Math.abs(candidate.c.y) - 2) < 1e-10));

  const radiusResult = resolveConstructionGeometry("circle", "two-points", "tangencies-radius", { ...values, radius: "2", diameter: "4" }, null, 1e-6, [horizontal, vertical], 2);
  assert.equal(radiusResult.candidates?.length, 4);
  assert.equal(radiusResult.geometry?.type, "circle");
  assert(Math.abs(radiusResult.geometry.r - 2) < 1e-10);

  const diameterResult = resolveConstructionGeometry("circle", "two-points", "tangencies-diameter", { ...values, radius: "2", diameter: "4" }, null, 1e-6, [horizontal, vertical], 0);
  assert.equal(diameterResult.geometry?.type, "circle");
  assert(Math.abs(diameterResult.geometry.r - 2) < 1e-10);

  const thirdConstant = 4 + 2 * Math.SQRT2;
  const optionalThird = { a: { x: 0, y: thirdConstant }, b: { x: 1, y: thirdConstant - 1 } };
  const fourthConstant = 2 * Math.SQRT2;
  const optionalFourth = { a: { x: fourthConstant, y: 0 }, b: { x: fourthConstant + 1, y: 1 } };
  const filteredCandidates = tangentCircleCandidates([horizontal, vertical, optionalThird, optionalFourth], 2, 1e-6);
  assert.equal(filteredCandidates.length, 1, "T3 e T4 devono filtrare le soluzioni incompatibili");
  assert(filteredCandidates[0].type === "circle" && Math.abs(filteredCandidates[0].c.x - 2) < 1e-9 && Math.abs(filteredCandidates[0].c.y - 2) < 1e-9);

  const diagonalUp = { a: { x: -10, y: -10 }, b: { x: 10, y: 10 } };
  const diagonalDown = { a: { x: -10, y: 10 }, b: { x: 10, y: -10 } };
  const inclinedCandidates = tangentCircleCandidates([diagonalUp, diagonalDown], 2, 1e-6);
  assert.equal(inclinedCandidates.length, 4, "Due rette inclinate incidenti devono produrre quattro cerchi tangenti");
  assert(inclinedCandidates.every((candidate) => candidate.type === "circle" && Math.abs(Math.hypot(candidate.c.x, candidate.c.y) - 2 * Math.SQRT2) < 1e-9));

  const queriedTangencies = circleLineTangencyPoints({ c: { x: 2, y: 2 }, r: 2 }, [horizontal, vertical], 1e-6);
  assert.equal(queriedTangencies.length, 2, "Il cerchio deve restituire i due punti di tangenza con le rette");
  assert(queriedTangencies.some((item) => Math.abs(item.point.x - 2) < 1e-10 && Math.abs(item.point.y) < 1e-10));
  assert(queriedTangencies.some((item) => Math.abs(item.point.x) < 1e-10 && Math.abs(item.point.y - 2) < 1e-10));

  const drawnCircle = { id: "circle", type: "circle", c: { x: 0, y: 0 }, r: 2 };
  const tangentDrawnLine = { id: "line", type: "line", a: { x: -5, y: 2 }, b: { x: 5, y: 2 } };
  const secantDrawnLine = { id: "secant", type: "line", a: { x: -5, y: 0 }, b: { x: 5, y: 0 } };
  assert.equal(drawEntityIntersections(drawnCircle, tangentDrawnLine).length, 1, "Una tangenza deve produrre una sola intersezione geometrica");
  assert.equal(drawEntityIntersections(drawnCircle, secantDrawnLine).length, 2, "Una secante deve produrre due intersezioni geometriche");

  const lineEquation = analyticEquationForEntity({ id: "eq-line", type: "line", ...horizontal });
  const circleEquation = analyticEquationForEntity(drawnCircle);
  const circleEquationXZ = analyticEquationForEntity(drawnCircle, "XZ");
  assert.equal(lineEquation?.type, "implicit");
  assert(lineEquation.expression.includes("*x") && lineEquation.expression.includes("*y"));
  assert(circleEquation?.expression.includes("^2") && circleEquation.expression.includes("= 2^2"));
  assert(circleEquationXZ?.expression.includes("x") && circleEquationXZ.expression.includes("z") && !circleEquationXZ.expression.includes("y"), "L'equazione del cerchio deve usare X/Z nel piano XZ");

  const report = formatInquiryReport([{ id: "q1", name: "TG1", point: { x: 2, y: 0 }, kind: "tangency", source: "Cerchio ↔ Retta", details: "R=2" }], [], undefined, new Date("2026-07-15T12:00:00Z"), "YZ");
  assert(report.includes("V1.5.0") && report.includes("PIANO: YZ (G19)") && report.includes("TG1 | TANGENZA | Y=2 | Z=0") && report.includes("FINE REPORT"), "Il report TXT deve includere versione, piano, nome e coordinate fisiche");

  assert.deepEqual(PLANE_DEFINITIONS.XY, { plane: "XY", gCode: "G17", horizontalAxis: "X", verticalAxis: "Y", normalAxis: "Z" });
  assert.deepEqual(PLANE_DEFINITIONS.XZ, { plane: "XZ", gCode: "G18", horizontalAxis: "X", verticalAxis: "Z", normalAxis: "Y" });
  assert.deepEqual(PLANE_DEFINITIONS.YZ, { plane: "YZ", gCode: "G19", horizontalAxis: "Y", verticalAxis: "Z", normalAxis: "X" });
  assert.equal(normalizeWorkPlane("invalid"), "XY");
  assert.equal(remapPlaneExpression("y=2*x+5; x^2+y^2=r^2", "XY", "XZ"), "z=2*x+5; x^2+z^2=r^2");
  assert.equal(remapPlaneExpression("x=cos(t); y=sin(t)", "XY", "YZ"), "y=cos(t); z=sin(t)");
  assert.deepEqual(planePointToMachineCoordinates({ x: 12, y: -7 }, "XZ", 4), { X: 12, Y: 4, Z: -7 });
  assert.deepEqual(planePointToMachineCoordinates({ x: 12, y: -7 }, "YZ", 4), { X: 4, Y: 12, Z: -7 });

  const post = {
    plane: "XY", program: "123", comment: "PLANE_TEST", safeZ: 15, workZ: -1,
    feedXY: 500, feedZ: 150, spindle: 2500, tool: 1, workOffset: "G54",
    decimals: 3, coolant: true, closePath: false,
  };
  const toolpath = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
  const gcodeXY = generateGCode(toolpath, post);
  const gcodeXZ = generateGCode(toolpath, { ...post, plane: "XZ" });
  const gcodeYZ = generateGCode(toolpath, { ...post, plane: "YZ" });
  assert(gcodeXY.includes("G21 G17 G90") && gcodeXY.includes("G0 Z15.000") && gcodeXY.includes("G0 X1.000 Y2.000") && gcodeXY.includes("G1 Z-1.000 F150"));
  assert(gcodeXZ.includes("G21 G18 G90") && gcodeXZ.includes("G0 Y15.000") && gcodeXZ.includes("G0 X1.000 Z2.000") && gcodeXZ.includes("G1 Y-1.000 F150") && gcodeXZ.includes("G1 X3.000 Z4.000 F500"));
  assert(gcodeYZ.includes("G21 G19 G90") && gcodeYZ.includes("G0 X15.000") && gcodeYZ.includes("G0 Y1.000 Z2.000") && gcodeYZ.includes("G1 X-1.000 F150") && gcodeYZ.includes("G1 Y3.000 Z4.000 F500"));

  const commaLine = resolveConstructionGeometry("line", "two-points", "three-points", { ...values, p1x: "-2,5", p1y: "1,5", p2x: "1,5", p2y: "1,5" }, null, 1e-6);
  assert.equal(commaLine.geometry?.type, "line");
  assert(Math.abs(commaLine.geometry.a.x + 2.5) < 1e-10 && Math.abs(commaLine.geometry.b.x - 1.5) < 1e-10, "Virgola e segno meno devono essere accettati");

  const openPath = [[{ x: -10, y: 0 }, { x: 10, y: 0 }]];
  const openHit = nearestPathLocation(openPath, { x: 0, y: 0 });
  assert(openHit, "Il tratto aperto deve essere individuato");
  const openTrim = trimPathAtLocation(openPath, openHit, [
    { a: { x: -5, y: -10 }, b: { x: -5, y: 10 } },
    { a: { x: 5, y: -10 }, b: { x: 5, y: 10 } },
  ], 1e-6);
  assert(openTrim, "Il tratto aperto deve essere tagliato");
  assert.equal(openTrim.paths.length, 2, "Devono restare i due tratti esterni");
  assert(Math.abs(openTrim.paths[0].at(-1).x + 5) < 1e-6);
  assert(Math.abs(openTrim.paths[1][0].x - 5) < 1e-6);

  const closedPath = [[
    { x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 },
    { x: -10, y: 10 }, { x: -10, y: -10 },
  ]];
  const closedHit = nearestPathLocation(closedPath, { x: 10, y: 0 });
  assert(closedHit, "Il profilo chiuso deve essere individuato");
  const closedTrim = trimPathAtLocation(closedPath, closedHit, [
    { a: { x: -20, y: -5 }, b: { x: 20, y: -5 } },
    { a: { x: -20, y: 5 }, b: { x: 20, y: 5 } },
  ], 1e-6);
  assert(closedTrim, "Il profilo chiuso deve essere tagliato");
  assert.equal(closedTrim.paths.length, 1);
  assert(!closedTrim.paths[0].some((point) => Math.abs(point.x - 10) < 1e-6 && Math.abs(point.y) < 4.9), "La porzione scelta deve essere rimossa");

  const noCut = trimPathAtLocation(openPath, openHit, [], 1e-6);
  assert.equal(noCut, null, "Senza intersezioni non deve avvenire alcun taglio");

  console.log("Interfaccia v1.5.0 · piani XY/XZ/YZ e post Fanuc verificati · tangenze inclinate, costruzioni, interrogazioni e taglio intelligente superati");
} finally {
  await server.close();
}
