// Géométrie de la table plein écran (vue de dessus) et position des places

export type Projected = { x: number; y: number; scale: number; depth: number };

export type TableGeom = {
  x: number; // coin haut-gauche du bord extérieur
  y: number;
  w: number;
  h: number;
  r: number; // rayon des deux bouts arrondis (= w / 2)
  cx: number;
  cy: number;
  rail: number; // épaisseur du bourrelet en cuir
  track: number; // largeur de la piste en bois
};

export function tableGeom(W: number, H: number, topInset: number, bottomInset: number): TableGeom {
  const side = 46; // marge pour que les bulles des côtés mordent sur le bord
  const top = topInset + 112; // sous l'en-tête
  const bottom = H - bottomInset - 256; // la place du bas reste au-dessus des commentaires
  const w = W - side * 2;
  const h = bottom - top;
  return { x: side, y: top, w, h, r: w / 2, cx: W / 2, cy: top + h / 2, rail: 20, track: 24 };
}

/** Point juste à l'extérieur du bord, à une hauteur dy du centre (côté gauche ou droit) */
function onEdge(g: TableGeom, side: 1 | -1, dy: number, off: number) {
  const L = g.h / 2 - g.r;
  const R = g.r + off;
  const d = Math.abs(dy) - L;
  const x = d <= 0 ? R : Math.sqrt(Math.max(0, R * R - d * d));
  return { x: g.cx + side * x, y: g.cy + dy };
}

/** Centres des places, dans le sens horaire depuis la tête de table */
export function seatPoints(g: TableGeom, capacity: number) {
  const off = 4;
  const half = g.h / 2;
  const top = { x: g.cx, y: g.y - off };
  const bottom = { x: g.cx, y: g.y + g.h + off };
  const R = (f: number) => onEdge(g, 1, f * half, off);
  const Lf = (f: number) => onEdge(g, -1, f * half, off);
  switch (capacity) {
    case 2:
      return [R(0), Lf(0)];
    case 4:
      return [top, R(0), bottom, Lf(0)];
    case 6:
      return [top, R(-0.4), R(0.4), bottom, Lf(0.4), Lf(-0.4)];
    default:
      return [top, R(-0.62), R(0), R(0.62), bottom, Lf(0.62), Lf(0), Lf(-0.62)];
  }
}
