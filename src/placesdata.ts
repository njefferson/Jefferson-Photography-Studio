// The places of the three marina photographs the test page's Separation check knows by name: the nine place names, the four targets built from them, the polygons that mark each place on each photograph, which photograph a file name belongs to, and the label of a pixel's place.
//
// The polygons are an agent's reading of three pictures made on 8 November 2026, kept in fractions of the width and the height and drawn inside each place with a margin; they are recorded, figure for figure, in docs/research/separation/places.json and printed in docs/research/separation/places.md. What no polygon covers is the rest. This module holds data and two small functions and no page code: it reads no file and draws nothing.

/** The nine place names in order: the eight places of the polygons, then the rest, which is what no polygon covers. A label byte is an index into this list. */
export const PLACE_NAMES: readonly string[] = ["sky", "conifers", "broadleaf", "snags", "shore", "water", "docks", "boats", "rest"];

/** The label byte of the rest, the index of "rest" in PLACE_NAMES. */
const REST = 8;

/** A target is a title in words and the indices into PLACE_NAMES of the places it joins. */
export interface PlaceTarget { title: string; places: number[] }

/** The four targets in order: the sky; the foliage of conifers and broadleaf; the water; the built things of docks and boats. */
export const PLACE_TARGETS: readonly PlaceTarget[] = [
  { title: "Sky", places: [0] },
  { title: "Foliage, the conifers and the broadleaf trees", places: [1, 2] },
  { title: "Water", places: [5] },
  { title: "Built things, the docks and the boats", places: [6, 7] },
];

type Poly = number[][];

/** Each picture's polygons: eight lists in the order of PLACE_NAMES (sky to boats), each a list of polygons, each a list of [x, y] in fractions of the width and the height. */
const POLYGONS: Poly[][][] = [
  // Picture 1
  [
    [
      [[0.0075, 0.0113], [0.62, 0.0113], [0.62, 0.045], [0.0075, 0.045]],
      [[0.0075, 0.0113], [0.27, 0.0113], [0.27, 0.1013], [0.0075, 0.1013]],
      [[0.31, 0.0113], [0.42, 0.0113], [0.42, 0.075], [0.31, 0.075]],
      [[0.645, 0.0113], [0.845, 0.0113], [0.845, 0.03], [0.645, 0.03]],
      [[0.93, 0.0113], [0.995, 0.0113], [0.995, 0.0713], [0.93, 0.0713]],
    ],
    [
      [[0.015, 0.225], [0.34, 0.225], [0.34, 0.42], [0.015, 0.42]],
      [[0.39, 0.1725], [0.55, 0.1725], [0.55, 0.375], [0.39, 0.375]],
      [[0.565, 0.15], [0.925, 0.15], [0.925, 0.525], [0.565, 0.525]],
      [[0.225, 0.435], [0.34, 0.435], [0.34, 0.5475], [0.225, 0.5475]],
    ],
    [
      [[0.3625, 0.4875], [0.4775, 0.4875], [0.4775, 0.5738], [0.3625, 0.5738]],
      [[0.505, 0.51], [0.5425, 0.51], [0.5425, 0.5775], [0.505, 0.5775]],
    ],
    [
      [[0.075, 0.1313], [0.27, 0.1363], [0.27, 0.1688], [0.075, 0.1613]],
    ],
    [
      [[0.15, 0.6135], [0.54, 0.609], [0.54, 0.6338], [0.15, 0.6338]],
      [[0.875, 0.636], [0.995, 0.6375], [0.995, 0.6488], [0.875, 0.6473]],
    ],
    [
      [[0.0075, 0.6713], [0.445, 0.6713], [0.445, 0.75], [0.0075, 0.75]],
      [[0.0075, 0.8063], [0.15, 0.8063], [0.25, 0.8888], [0.7, 0.9563], [0.7, 0.99], [0.0075, 0.99]],
      [[0.55, 0.6675], [0.7, 0.6675], [0.7, 0.69], [0.55, 0.69]],
    ],
    [
      [[0.19, 0.774], [0.44, 0.8085], [0.44, 0.8265], [0.19, 0.792]],
      [[0.625, 0.8438], [0.72, 0.8603], [0.72, 0.8813], [0.625, 0.8648]],
    ],
    [
      [[0.465, 0.7388], [0.515, 0.7388], [0.515, 0.7763], [0.465, 0.7763]],
      [[0.9, 0.7125], [0.96, 0.7125], [0.96, 0.7575], [0.9, 0.7575]],
      [[0.77, 0.7088], [0.82, 0.7088], [0.82, 0.7575], [0.77, 0.7575]],
      [[0.72, 0.75], [0.775, 0.75], [0.775, 0.8063], [0.72, 0.8063]],
      [[0.86, 0.8363], [0.975, 0.8363], [0.975, 0.87], [0.86, 0.87]],
      [[0.78, 0.8963], [0.89, 0.9113], [0.89, 0.93], [0.78, 0.921]],
    ],
  ],
  // Picture 2
  [
    [
      [[0.0075, 0.0113], [0.385, 0.0113], [0.385, 0.2138], [0.0075, 0.2138]],
      [[0.0075, 0.2138], [0.15, 0.2138], [0.15, 0.27], [0.0075, 0.27]],
      [[0.415, 0.0113], [0.5, 0.0113], [0.5, 0.1725], [0.415, 0.1725]],
      [[0.55, 0.0113], [0.69, 0.0113], [0.69, 0.1388], [0.55, 0.1388]],
      [[0.72, 0.0113], [0.82, 0.0113], [0.82, 0.1388], [0.72, 0.1388]],
      [[0.845, 0.0113], [0.925, 0.0113], [0.925, 0.1238], [0.845, 0.1238]],
      [[0.965, 0.0113], [0.995, 0.0113], [0.995, 0.1125], [0.965, 0.1125]],
    ],
    [
      [[0.01, 0.3525], [0.19, 0.3525], [0.19, 0.6], [0.01, 0.6]],
      [[0.2, 0.36], [0.44, 0.36], [0.44, 0.54], [0.2, 0.54]],
      [[0.51, 0.375], [0.58, 0.375], [0.58, 0.48], [0.51, 0.48]],
      [[0.6, 0.24], [0.88, 0.24], [0.88, 0.6], [0.6, 0.6]],
      [[0.895, 0.225], [0.99, 0.225], [0.99, 0.6], [0.895, 0.6]],
    ],
    [
      [[0.4625, 0.54], [0.505, 0.54], [0.505, 0.6525], [0.4625, 0.6525]],
      [[0.515, 0.6], [0.575, 0.6], [0.575, 0.6525], [0.515, 0.6525]],
      [[0.595, 0.585], [0.63, 0.585], [0.63, 0.6675], [0.595, 0.6675]],
    ],
    [
      [[0.16, 0.2738], [0.36, 0.2738], [0.36, 0.3075], [0.16, 0.3075]],
    ],
    [
      [[0.24, 0.6825], [0.625, 0.6788], [0.625, 0.7035], [0.24, 0.7065]],
      [[0.015, 0.6675], [0.19, 0.6675], [0.19, 0.7013], [0.015, 0.7013]],
      [[0.925, 0.6713], [0.995, 0.6713], [0.995, 0.6938], [0.925, 0.6938]],
    ],
    [
      [[0.0075, 0.735], [0.665, 0.735], [0.665, 0.7688], [0.0075, 0.7688]],
      [[0.0075, 0.8063], [0.35, 0.8063], [0.35, 0.825], [0.0075, 0.825]],
      [[0.0075, 0.8325], [0.35, 0.8325], [0.395, 0.9375], [0.75, 0.9675], [0.75, 0.99], [0.0075, 0.99]],
      [[0.71, 0.7313], [0.875, 0.7313], [0.875, 0.7538], [0.71, 0.7538]],
    ],
    [
      [[0.38, 0.8363], [0.59, 0.8663], [0.59, 0.885], [0.38, 0.855]],
      [[0.665, 0.8723], [0.85, 0.8985], [0.85, 0.912], [0.665, 0.8873]],
    ],
    [
      [[0.625, 0.8063], [0.675, 0.8063], [0.675, 0.8438], [0.625, 0.8438]],
      [[0.855, 0.7875], [0.93, 0.7875], [0.93, 0.84], [0.855, 0.84]],
      [[0.9, 0.7613], [0.965, 0.7613], [0.965, 0.81], [0.9, 0.81]],
      [[0.925, 0.9338], [0.995, 0.9338], [0.995, 0.954], [0.925, 0.9465]],
      [[0.695, 0.855], [0.73, 0.855], [0.73, 0.8738], [0.695, 0.8738]],
    ],
  ],
  // Picture 3
  [
    [
      [[0.0075, 0.0113], [0.32, 0.0113], [0.32, 0.2063], [0.0075, 0.2063]],
      [[0.36, 0.0113], [0.445, 0.0113], [0.445, 0.1538], [0.36, 0.1538]],
      [[0.475, 0.0113], [0.575, 0.0113], [0.575, 0.1388], [0.475, 0.1388]],
      [[0.64, 0.0113], [0.78, 0.0113], [0.78, 0.1275], [0.64, 0.1275]],
      [[0.81, 0.0113], [0.975, 0.0113], [0.975, 0.1125], [0.81, 0.1125]],
    ],
    [
      [[0.01, 0.3], [0.15, 0.3], [0.15, 0.555], [0.01, 0.555]],
      [[0.19, 0.315], [0.39, 0.315], [0.39, 0.525], [0.19, 0.525]],
      [[0.44, 0.345], [0.495, 0.345], [0.495, 0.45], [0.44, 0.45]],
      [[0.505, 0.2475], [0.545, 0.2475], [0.545, 0.42], [0.505, 0.42]],
      [[0.55, 0.225], [0.78, 0.225], [0.78, 0.525], [0.55, 0.525]],
      [[0.79, 0.225], [0.99, 0.225], [0.99, 0.555], [0.79, 0.555]],
    ],
    [
      [[0.4, 0.495], [0.435, 0.495], [0.435, 0.5813], [0.4, 0.5813]],
      [[0.44, 0.5475], [0.505, 0.5475], [0.505, 0.5925], [0.44, 0.5925]],
      [[0.515, 0.525], [0.545, 0.525], [0.545, 0.5813], [0.515, 0.5813]],
    ],
    [
      [[0.15, 0.231], [0.3, 0.234], [0.3, 0.2588], [0.15, 0.2565]],
    ],
    [
      [[0.21, 0.609], [0.59, 0.606], [0.59, 0.6338], [0.21, 0.6338]],
      [[0.015, 0.5925], [0.15, 0.5925], [0.15, 0.6225], [0.015, 0.6225]],
      [[0.85, 0.63], [0.995, 0.63], [0.995, 0.6465], [0.85, 0.6465]],
    ],
    [
      [[0.0075, 0.6638], [0.595, 0.6638], [0.595, 0.6938], [0.0075, 0.6938]],
      [[0.0075, 0.72], [0.305, 0.72], [0.305, 0.7388], [0.0075, 0.7388]],
      [[0.0075, 0.7838], [0.3, 0.7838], [0.36, 0.8475], [0.7, 0.8888], [0.7, 0.99], [0.0075, 0.99]],
      [[0.63, 0.6638], [0.785, 0.6638], [0.785, 0.6825], [0.63, 0.6825]],
    ],
    [
      [[0.33, 0.753], [0.525, 0.7868], [0.525, 0.8055], [0.33, 0.7725]],
      [[0.665, 0.81], [0.75, 0.8243], [0.75, 0.8468], [0.665, 0.8325]],
    ],
    [
      [[0.55, 0.7313], [0.6, 0.7313], [0.6, 0.7688], [0.55, 0.7688]],
      [[0.915, 0.7013], [0.965, 0.7013], [0.965, 0.7388], [0.915, 0.7388]],
      [[0.805, 0.7125], [0.855, 0.7125], [0.855, 0.7425], [0.805, 0.7425]],
      [[0.76, 0.7425], [0.825, 0.7425], [0.825, 0.7725], [0.76, 0.7725]],
      [[0.885, 0.8138], [0.965, 0.8138], [0.965, 0.8325], [0.885, 0.8325]],
      [[0.81, 0.846], [0.895, 0.8588], [0.895, 0.8715], [0.81, 0.8588]],
    ],
  ],
];

/** The raw each picture was matched to on 8 November, in the order of the pictures; a name is compared whatever its case. */
const PICTURE_FILES = ["NIR_3742.NEF", "NIR_3736.NEF", "NIR_3733.NEF"];

/** The bounding box of every polygon, in the same shape as POLYGONS, so a point is tested against a polygon only when it is inside its box. */
const BOXES: number[][][][] = POLYGONS.map((pic) => pic.map((place) => place.map((pts) => {
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return [x0, x1, y0, y1];
})));

/** Takes a point (x, y) in fractions and a polygon as a list of [x, y]. Returns true when the point is inside it by the even-odd rule. */
function inside(x: number, y: number, pts: Poly): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Takes name, a file's name (a folder before it is ignored). Returns 1, 2 or 3 where the name, whatever its case, is one of the three raws the places file matched to a picture (NIR_3742.NEF to 1, NIR_3736.NEF to 2, NIR_3733.NEF to 3), and 0 for any other name. Consumed by the page to choose between labelling by place and labelling by its own labels. */
export function placesPicture(name: string): number {
  const base = String(name ?? "").split(/[\\/]/).pop()!.trim().toUpperCase();
  const i = PICTURE_FILES.indexOf(base);
  return i < 0 ? 0 : i + 1;
}

/** Takes picture, the picture's number from placesPicture; cols and rows, two arrays holding each counted pixel's column and row in the full frame; and width and height, the frame's size in pixels. Returns one byte for each pixel holding its place's index in PLACE_NAMES, 8 (the rest) for a pixel no polygon holds and for every pixel where picture is not 1, 2 or 3. The thinning step is read from the spacing of the first two columns, else from the page's rule of 1.2 million counted pixels at most, and a pixel's place is read at the centre of its grid cell, so a grid thinned at every third pixel reproduces the counts the places file printed; the first place whose polygon holds the pixel wins, in the order of PLACE_NAMES. The result has the length of cols. */
export function placeLabels(picture: number, cols: ArrayLike<number>, rows: ArrayLike<number>, width: number, height: number): Uint8Array {
  const n = Math.min(cols.length, rows.length);
  const out = new Uint8Array(n).fill(REST);
  const pic = picture === 1 || picture === 2 || picture === 3 ? picture - 1 : -1;
  if (pic < 0 || !(width > 0) || !(height > 0)) return out;
  let k = n > 1 && cols[1] > cols[0] ? cols[1] - cols[0] : Math.max(1, Math.ceil(Math.sqrt((width * height) / 1.2e6)));
  if (!(k >= 1)) k = 1;
  const gw = Math.max(1, Math.floor(width / k)), gh = Math.max(1, Math.floor(height / k));
  const polys = POLYGONS[pic], boxes = BOXES[pic];
  for (let i = 0; i < n; i++) {
    const fx = (cols[i] / k + 0.5) / gw, fy = (rows[i] / k + 0.5) / gh;
    search: for (let p = 0; p < 8; p++) {
      const list = polys[p], bl = boxes[p];
      for (let q = 0; q < list.length; q++) {
        const b = bl[q];
        if (fx < b[0] || fx > b[1] || fy < b[2] || fy > b[3]) continue;
        if (inside(fx, fy, list[q])) { out[i] = p; break search; }
      }
    }
  }
  return out;
}
