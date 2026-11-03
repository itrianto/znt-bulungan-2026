/**
 * scripts/optimize-geojson.js
 * Mengoptimalkan file GeoJSON untuk website publik:
 * - Membulatkan koordinat ke 5 desimal (~1.1 meter presisi geospasial)
 * - Menghapus dimensi elevasi (Z) yang tidak digunakan
 * - Menyederhanakan titik berlebih dengan algoritma Ramer-Douglas-Peucker (~1.6m)
 * - Mengurangi ukuran file hingga 75% tanpa merusak bentuk poligon
 */

const fs = require('fs');
const path = require('path');

const srcPath = process.argv[2] || path.join(__dirname, '../data/geojson/zona/Master_Zona.geojson');
const destPath = process.argv[3] || path.join(__dirname, '../docs/public-data/Master_Zona.geojson');

if (!fs.existsSync(srcPath)) {
  console.error('Source GeoJSON file not found:', srcPath);
  process.exit(1);
}

let content = fs.readFileSync(srcPath, 'utf8');
if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
const geojson = JSON.parse(content);

function sqDistToSegment(p, p1, p2) {
  let x = p1[0], y = p1[1], dx = p2[0] - x, dy = p2[1] - y;
  if (dx !== 0 || dy !== 0) {
    let t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = p2[0]; y = p2[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x; dy = p[1] - y;
  return dx * dx + dy * dy;
}

function rdp(points, sqTol) {
  if (points.length <= 3) return points;
  let maxSqDist = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    let d = sqDistToSegment(points[i], points[0], points[points.length - 1]);
    if (d > maxSqDist) { maxSqDist = d; idx = i; }
  }
  if (maxSqDist > sqTol) {
    let rec1 = rdp(points.slice(0, idx + 1), sqTol);
    let rec2 = rdp(points.slice(idx), sqTol);
    return rec1.slice(0, -1).concat(rec2);
  }
  return [points[0], points[points.length - 1]];
}

function simplifyRing(ring, sqTol) {
  if (ring.length <= 4) return ring.map(p => [Math.round(p[0] * 100000) / 100000, Math.round(p[1] * 100000) / 100000]);
  let isClosed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  let pts = ring.map(p => [Math.round(p[0] * 100000) / 100000, Math.round(p[1] * 100000) / 100000]);
  let simplified = rdp(pts, sqTol);
  if (simplified.length < 3) simplified = pts;
  if (isClosed && (simplified[0][0] !== simplified[simplified.length - 1][0] || simplified[0][1] !== simplified[simplified.length - 1][1])) {
    simplified.push([simplified[0][0], simplified[0][1]]);
  }
  return simplified;
}

function simplifyCoords(coords, sqTol) {
  if (typeof coords[0][0] === 'number') {
    return simplifyRing(coords, sqTol);
  }
  return coords.map(c => simplifyCoords(c, sqTol));
}

const tol = 0.000015; // ~1.6m
const sqTol = tol * tol;

geojson.features.forEach(f => {
  f.geometry.coordinates = simplifyCoords(f.geometry.coordinates, sqTol);
  delete f.properties.InPoly_FID;
  delete f.properties.MaxSimpTol;
  delete f.properties.MinSimpTol;
});

const out = JSON.stringify(geojson);
fs.writeFileSync(destPath, out, 'utf8');

const origMB = (content.length / 1024 / 1024).toFixed(2);
const newMB = (out.length / 1024 / 1024).toFixed(2);
console.log(`[OK] GeoJSON dioptimalkan: ${origMB} MB -> ${newMB} MB (-${Math.round((1 - out.length / content.length) * 100)}%)`);
