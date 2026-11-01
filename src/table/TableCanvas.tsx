import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  RoundedRect,
  Shader,
  Skia,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
import type { TableGeom } from './layout';

// Table de poker dessinée en natif (Skia, sur la carte graphique) : instantané et fluide.

const NOISE = `
float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float noise(float2 p) {
  float2 i = floor(p); float2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(i); float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0)); float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`;

// Bois verni dont le fil suit la forme de la piste
const WOOD = Skia.RuntimeEffect.Make(`
uniform float2 c;
uniform float L;
${NOISE}
half4 main(float2 p) {
  float2 q = p - c;
  float dy = max(abs(q.y) - L, 0.0);
  float d = length(float2(q.x, dy));
  float along = q.y + atan(q.y, q.x) * 40.0;
  float n = noise(float2(d * 0.09, along * 0.02)) * 2.2 + noise(p * 0.2) * 0.5;
  float g = pow(0.5 + 0.5 * sin(d * 0.85 + n * 2.6), 1.6);
  float3 dark = float3(0.17, 0.085, 0.035);
  float3 light = float3(0.50, 0.28, 0.12);
  float3 col = mix(dark, light, g * 0.75 + noise(p * 0.7) * 0.18);
  float shine = smoothstep(0.0, 1.0, 1.0 - abs(q.x) / (L + 400.0)) * 0.08;
  return half4(half3(col + shine), 1.0);
}`)!;

// Feutre noir avec grain et halo de la lampe au centre
const FELT = Skia.RuntimeEffect.Make(`
uniform float2 c;
uniform float2 size;
${NOISE}
half4 main(float2 p) {
  float2 q = (p - c) / size;
  float v = length(q);
  float lamp = 1.0 - smoothstep(0.0, 1.05, v);
  float grain = noise(p * 1.3) * 0.045 + noise(p * 0.35) * 0.03;
  float3 col = float3(0.045, 0.038, 0.028) + lamp * float3(0.13, 0.095, 0.05) + grain;
  return half4(half3(col), 1.0);
}`)!;

// Cuir rembourré du bord
const LEATHER = Skia.RuntimeEffect.Make(`
uniform float2 c;
${NOISE}
half4 main(float2 p) {
  float n = noise(p * 0.45) * 0.5 + noise(p * 1.6) * 0.25;
  float top = clamp((c.y - p.y) / 900.0 + 0.5, 0.0, 1.0);
  float3 col = float3(0.16, 0.09, 0.05) * (0.75 + n * 0.5) + top * float3(0.06, 0.035, 0.015);
  return half4(half3(col), 1.0);
}`)!;

type Seat = { x: number; y: number; occupied: boolean };

export function TableCanvas({ W, H, g, seats }: { W: number; H: number; g: TableGeom; seats: Seat[] }) {
  const L = g.h / 2 - g.r;
  const trackInset = g.rail;
  const feltInset = g.rail + g.track;

  // logo Zembo (cercle + Z), repris de zembolounge, posé dans le tiers haut du feutre
  const logo = useMemo(() => {
    const k = 1.55;
    const lx = g.cx;
    const ly = g.cy - g.h * 0.16;
    const P = (x: number, y: number) => `${lx + (x - 20) * k} ${ly + (y - 20) * k}`;
    return { lx, ly, r: 17.5 * k, z: `M ${P(13, 14)} L ${P(27, 14)} L ${P(13, 26)} L ${P(27, 26)}` };
  }, [g]);

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      {/* salon : fond chaud qui s'assombrit vers les bords */}
      <Rect x={0} y={0} width={W} height={H}>
        <RadialGradient c={vec(g.cx, g.cy)} r={H * 0.72} colors={['#2b1a0b', '#140c06', '#050302']} />
      </Rect>

      {/* ombre douce sous la table */}
      <RoundedRect x={g.x - 6} y={g.y + 14} width={g.w + 12} height={g.h + 6} r={g.r} color="rgba(0,0,0,0.85)">
        <BlurMask blur={26} style="normal" />
      </RoundedRect>

      {/* fauteuils en cuir, vus de dessus */}
      {seats.map((s, i) => (
        <Chair key={i} x={s.x} y={s.y} cx={g.cx} cy={g.cy} />
      ))}

      {/* bourrelet en cuir */}
      <RoundedRect x={g.x} y={g.y} width={g.w} height={g.h} r={g.r}>
        <Shader source={LEATHER} uniforms={{ c: vec(g.cx, g.cy) }} />
      </RoundedRect>
      <RoundedRect x={g.x + 2} y={g.y + 2} width={g.w - 4} height={g.h - 4} r={g.r - 2} style="stroke" strokeWidth={2}>
        <LinearGradient start={vec(0, g.y)} end={vec(0, g.y + g.h)} colors={['rgba(255,214,160,0.35)', 'rgba(255,214,160,0.04)']} />
      </RoundedRect>

      {/* piste en bois verni */}
      <RoundedRect x={g.x + trackInset} y={g.y + trackInset} width={g.w - trackInset * 2} height={g.h - trackInset * 2} r={g.r - trackInset}>
        <Shader source={WOOD} uniforms={{ c: vec(g.cx, g.cy), L }} />
      </RoundedRect>
      {/* filet doré entre cuir et bois */}
      <RoundedRect
        x={g.x + trackInset}
        y={g.y + trackInset}
        width={g.w - trackInset * 2}
        height={g.h - trackInset * 2}
        r={g.r - trackInset}
        style="stroke"
        strokeWidth={1.5}
      >
        <SweepGradient c={vec(g.cx, g.cy)} colors={['#7a5a14', '#f3d27a', '#a67c1b', '#f7e08a', '#7a5a14']} />
      </RoundedRect>

      {/* feutre noir éclairé par la lampe */}
      <RoundedRect x={g.x + feltInset} y={g.y + feltInset} width={g.w - feltInset * 2} height={g.h - feltInset * 2} r={g.r - feltInset}>
        <Shader source={FELT} uniforms={{ c: vec(g.cx, g.cy - g.h * 0.05), size: vec(g.w * 0.62, g.h * 0.5) }} />
      </RoundedRect>
      {/* ombre du bord sur le feutre */}
      <RoundedRect
        x={g.x + feltInset}
        y={g.y + feltInset}
        width={g.w - feltInset * 2}
        height={g.h - feltInset * 2}
        r={g.r - feltInset}
        style="stroke"
        strokeWidth={10}
        color="rgba(0,0,0,0.45)"
      >
        <BlurMask blur={8} style="inner" />
      </RoundedRect>
      {/* filet doré du feutre */}
      <RoundedRect
        x={g.x + feltInset}
        y={g.y + feltInset}
        width={g.w - feltInset * 2}
        height={g.h - feltInset * 2}
        r={g.r - feltInset}
        style="stroke"
        strokeWidth={2.5}
      >
        <SweepGradient c={vec(g.cx, g.cy)} colors={['#a67c1b', '#f7e08a', '#c9a23a', '#fff1b8', '#a67c1b']} />
      </RoundedRect>
      {/* ligne imprimée sur le feutre */}
      <RoundedRect
        x={g.x + feltInset + 22}
        y={g.y + feltInset + 22}
        width={g.w - (feltInset + 22) * 2}
        height={g.h - (feltInset + 22) * 2}
        r={g.r - feltInset - 22}
        style="stroke"
        strokeWidth={1}
        color="rgba(212,175,55,0.38)"
      />

      {/* logo Zembo en or */}
      <Group>
        <Circle cx={logo.lx} cy={logo.ly} r={logo.r + 10} color="rgba(255,200,90,0.10)">
          <BlurMask blur={14} style="normal" />
        </Circle>
        <Circle cx={logo.lx} cy={logo.ly} r={logo.r} style="stroke" strokeWidth={3}>
          <LinearGradient start={vec(logo.lx - logo.r, logo.ly - logo.r)} end={vec(logo.lx + logo.r, logo.ly + logo.r)} colors={['#f7e08a', '#d4af37', '#9c7316']} />
        </Circle>
        <Path path={logo.z} style="stroke" strokeWidth={3.6} strokeCap="round" strokeJoin="round">
          <LinearGradient start={vec(logo.lx - logo.r, logo.ly - logo.r)} end={vec(logo.lx + logo.r, logo.ly + logo.r)} colors={['#f7e08a', '#d4af37', '#9c7316']} />
        </Path>
      </Group>
    </Canvas>
  );
}

// Fauteuil club vu de dessus, tourné vers la table
function Chair({ x, y, cx, cy }: { x: number; y: number; cx: number; cy: number }) {
  const dx = cx - x;
  const dy = cy - y;
  const len = Math.hypot(dx, dy) || 1;
  // on recule le fauteuil un peu derrière la personne
  const px = x - (dx / len) * 12;
  const py = y - (dy / len) * 12;
  const angle = Math.atan2(dx / len, -dy / len);
  return (
    <Group transform={[{ translateX: px }, { translateY: py }, { rotate: angle }]}>
      <RoundedRect x={-34} y={-28} width={68} height={66} r={16} color="rgba(0,0,0,0.6)">
        <BlurMask blur={8} style="normal" />
      </RoundedRect>
      <RoundedRect x={-32} y={-30} width={64} height={60} r={15}>
        <LinearGradient start={vec(0, -30)} end={vec(0, 30)} colors={['#5a3520', '#2c180c']} />
      </RoundedRect>
      {/* dossier */}
      <RoundedRect x={-32} y={14} width={64} height={18} r={9}>
        <LinearGradient start={vec(0, 14)} end={vec(0, 32)} colors={['#6b4128', '#331d0f']} />
      </RoundedRect>
      <RoundedRect x={-30} y={-28} width={60} height={56} r={14} style="stroke" strokeWidth={1} color="rgba(255,210,150,0.12)" />
    </Group>
  );
}
