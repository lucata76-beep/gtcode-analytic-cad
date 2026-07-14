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
  const { default: AnalyticCad, nearestPathLocation, trimPathAtLocation } = module;

  const markup = renderToStaticMarkup(React.createElement(AnalyticCad));
  assert(markup.includes("GT.Code") && markup.includes("v1.1.0"), "L'interfaccia deve essere renderizzabile");

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

  console.log("Interfaccia renderizzata · taglio geometrico: 3 scenari superati");
} finally {
  await server.close();
}
