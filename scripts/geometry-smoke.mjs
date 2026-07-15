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
  const { default: AnalyticCad, nearestPathLocation, trimPathAtLocation, resolveConstructionGeometry, tangentCircleCandidates } = module;

  const markup = renderToStaticMarkup(React.createElement(AnalyticCad));
  assert(markup.includes("GT.Code") && markup.includes("v1.3.0"), "L'interfaccia deve essere renderizzabile");
  assert(markup.includes(">Disegno<") && markup.includes(">Aiuto<") && markup.includes('aria-label="Guida"'), "Menu desktop e accesso alla guida devono essere disponibili");

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

  console.log("Interfaccia v1.3 · costruzioni geometriche: 11 scenari · taglio intelligente: 3 scenari superati");
} finally {
  await server.close();
}
