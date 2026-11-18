import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { Body, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/** One tongue of flame, drawn in a 20 x 32 box, point up. */
const TONGUE = 'M10 0 C12 6 17 11 17 19 C17 26 14 31 10 31 C6 31 3 26 3 19 C3 14 6 11 7 7 C8 10 9 11 10 13 C10 9 9 5 10 0 Z';
/** The tongues along the button's top edge: where (0..1 across), how tall, and their rhythm. */
const TONGUES = [
  { at: 0.04, h: 0.5, ms: 620, delay: 0 },
  { at: 0.15, h: 0.8, ms: 540, delay: 180 },
  { at: 0.26, h: 0.62, ms: 700, delay: 90 },
  { at: 0.38, h: 0.95, ms: 580, delay: 260 },
  { at: 0.5, h: 0.72, ms: 660, delay: 40 },
  { at: 0.62, h: 1, ms: 520, delay: 210 },
  { at: 0.74, h: 0.66, ms: 640, delay: 120 },
  { at: 0.85, h: 0.85, ms: 600, delay: 300 },
  { at: 0.96, h: 0.5, ms: 680, delay: 150 },
];
const EMBERS = [
  { at: 0.28, ms: 1500, delay: 0 },
  { at: 0.55, ms: 1800, delay: 600 },
  { at: 0.74, ms: 1350, delay: 1100 },
  { at: 0.42, ms: 1650, delay: 1500 },
];

/**
 * The Forge button catching fire (v0.45.0, owner): once a hero is complete, flames lick up over the button's top
 * edge, embers drift off it and the heat glows and breathes, so a finished hero is impossible to miss. Heraldic
 * red at the root through ember orange to the app's gold at the tips. Still under reduced motion: a steady glow.
 */
export function ForgeFlames({ active, height, label, onPress, accessibilityLabel, minWidth, children }: { active: boolean; height: number; label: string; onPress: () => void; accessibilityLabel: string; minWidth?: number; children: ReactNode }) {
  // The web draws the whole button burning (a shader); a phone keeps the lighter drawn flames.
  if (Platform.OS === 'web' && active) return <FireButton height={height} label={label} onPress={onPress} accessibilityLabel={accessibilityLabel} minWidth={minWidth} />;
  return <DrawnFlames active={active} height={height}>{children}</DrawnFlames>;
}

function DrawnFlames({ active, height, children }: { active: boolean; height: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const breathe = useSharedValue(0);
  const live = active && !reduced;
  useEffect(() => {
    if (!live) { cancelAnimation(breathe); breathe.value = 0; return; }
    breathe.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breathe);
  }, [live, breathe]);
  const glow = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * breathe.value, transform: [{ scale: 1 + 0.06 * breathe.value }] }));
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.025 * breathe.value }] }));
  if (!active) return <>{children}</>;
  const flameH = Math.round(height * 0.95);
  return (
    <View style={{ position: 'relative' }}>
      {/* the heat behind it all */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -18, right: -18, top: -height * 0.6, bottom: -height * 0.35 }, reduced ? { opacity: 0.7 } : glow]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="forgeHeat" cx="50%" cy="62%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#E8641E" stopOpacity={0.55} />
              <Stop offset="0.55" stopColor={Rune.red} stopOpacity={0.22} />
              <Stop offset="1" stopColor={Rune.red} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Path d="M0 0 H100 V100 H0 Z" fill="url(#forgeHeat)" />
        </Svg>
      </Animated.View>
      {/* the flames: rooted inside the button, rising over its top edge */}
      {reduced ? null : (
        <View pointerEvents="none" style={{ position: 'absolute', left: 6, right: 6, top: -flameH * 0.5, height: flameH }}>
          {TONGUES.map((t, i) => <Tongue key={i} {...t} flameH={flameH} />)}
          {EMBERS.map((e, i) => <Ember key={i} {...e} rise={height} />)}
        </View>
      )}
      <Animated.View style={reduced ? undefined : pulse}>{children}</Animated.View>
    </View>
  );
}

function useLoop(ms: number, delay: number): SharedValue<number> {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: ms / 2, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: ms / 2, easing: Easing.inOut(Easing.quad) })), -1));
    return () => cancelAnimation(v);
  }, [v, ms, delay]);
  return v;
}

function Tongue({ at, h, ms, delay, flameH }: { at: number; h: number; ms: number; delay: number; flameH: number }) {
  const v = useLoop(ms, delay);
  const w = flameH * 0.5 * (0.75 + 0.25 * h);
  const style = useAnimatedStyle(() => ({
    opacity: 0.75 + 0.25 * v.value,
    transform: [{ translateY: (1 - v.value) * flameH * 0.08 }, { scaleY: h * (0.78 + 0.3 * v.value) }, { scaleX: 1 - 0.12 * v.value }, { rotate: `${(v.value - 0.5) * 8}deg` }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', bottom: 0, left: `${at * 100}%`, marginLeft: -w / 2, width: w, height: flameH, transformOrigin: 'bottom' } as object, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 20 32" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="forgeTongue" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={Rune.red} />
            <Stop offset="0.45" stopColor="#E8641E" />
            <Stop offset="1" stopColor={Rune.goldText} stopOpacity={0.9} />
          </LinearGradient>
        </Defs>
        <Path d={TONGUE} fill="url(#forgeTongue)" />
        {/* the hot core */}
        <Path d={TONGUE} fill={Rune.goldText} opacity={0.55} transform="translate(5 12) scale(0.5)" />
      </Svg>
    </Animated.View>
  );
}

function Ember({ at, ms, delay, rise }: { at: number; ms: number; delay: number; rise: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration: ms, easing: Easing.out(Easing.quad) }), -1));
    return () => cancelAnimation(v);
  }, [v, ms, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: v.value < 0.15 ? v.value / 0.15 : 1 - (v.value - 0.15) / 0.85,
    transform: [{ translateY: -v.value * rise }, { translateX: Math.sin(v.value * 6.3) * 5 }],
  }));
  return <Animated.View style={[{ position: 'absolute', bottom: 4, left: `${at * 100}%`, width: 3, height: 3, borderRadius: 2, backgroundColor: Rune.goldBright }, style]} />;
}

// ---------------------------------------------------------------------------------------------
// The web: the whole button on fire
// ---------------------------------------------------------------------------------------------

/** How far the fire climbs above the button, in button heights, and spills past its sides, in px. */
const RISE = 0.62; // the button sits near the top of the window; taller flames would run off it
const SPILL = 16;
const FOOT = 6; // canvas below the button, so the bottom edge can smoulder too

const VERT = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }';
/**
 * Rising fractal noise shaped by the button's chamfered outline: the body burns (red to orange, never so bright
 * the label is lost), flames tear off its top edge, and a thin lick runs up its sides. The heat is cut into a few
 * hard bands on a two-pixel grid, the chunky stylised fire of a card game rather than a photograph of one.
 */
const FRAG = `
precision mediump float;
uniform float t; uniform vec4 box; uniform float ch; uniform float px;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
float sdChamfer(vec2 p, vec2 c, vec2 h, float k) { vec2 q = abs(p - c); vec2 d = q - h;
  float b = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); return max(b, (q.x + q.y - (h.x + h.y - k)) * 0.7071); }
vec3 ramp(float x) {
  vec3 c = vec3(0.30, 0.03, 0.03);
  c = mix(c, vec3(0.78, 0.11, 0.09), smoothstep(0.10, 0.30, x));
  c = mix(c, vec3(0.91, 0.39, 0.12), smoothstep(0.38, 0.58, x));
  c = mix(c, vec3(0.95, 0.66, 0.23), smoothstep(0.62, 0.80, x));
  c = mix(c, vec3(0.99, 0.90, 0.66), smoothstep(0.84, 0.97, x));
  return c; }
void main() {
  vec2 p = floor(gl_FragCoord.xy / px) * px + px * 0.5;
  vec2 c = (box.xy + box.zw) * 0.5, h = (box.zw - box.xy) * 0.5;
  float d = sdChamfer(p, c, h, ch);
  vec2 uv = p / (h.y * 0.9);
  // Domain warp: the fire sways and tears instead of scrolling as a sheet.
  float w = fbm(vec2(uv.x * 0.9, uv.y * 0.7 - t * 0.9));
  vec2 q = vec2(uv.x + 0.55 * (w - 0.5), uv.y);
  float n = fbm(vec2(q.x * 1.4, q.y * 0.9 - t * 1.9));
  float m = fbm(vec2(q.x * 2.6 + 4.0, q.y * 1.4 - t * 3.1));
  // Tongues: each column of the top edge reaches its own, slowly changing height.
  float tongue = fbm(vec2(q.x * 1.7, t * 0.7));
  float heat;
  if (d < 0.0) {
    // The body burns: streaks of flame run up through it, darker at the foot, brighter where they leave the top.
    float up = clamp((p.y - box.y) / (2.0 * h.y), 0.0, 1.0);
    heat = 0.26 + 0.42 * n * (0.6 + 0.6 * up) + 0.16 * m;
  } else {
    float above = p.y - box.w;
    if (above > 0.0) {
      float reach = 2.0 * h.y * RISE * (0.2 + 1.6 * tongue * tongue);
      // Past the button's sides the flames thin out fast, so the fire hugs the button instead of filling a box.
      float side = max(0.0, max(box.x - p.x, p.x - box.z));
      heat = 1.05 - above / reach - 0.55 * m * smoothstep(0.0, reach, above) + 0.2 * (n - 0.5) - side / (4.0 + 8.0 * m);
    } else {
      heat = (0.8 + 0.2 * m) * (1.0 - d / (3.0 + 10.0 * m));
    }
  }
  heat = clamp(heat, 0.0, 1.0);
  float band = floor(heat * 7.0) / 7.0;
  float a = smoothstep(0.08, 0.2, band);
  vec3 col = ramp(band);
  float edge = 1.0 - smoothstep(0.0, 1.6 * px, abs(d));
  col = mix(col, vec3(0.88, 0.71, 0.39), edge * 0.85);
  a = max(a, edge);
  gl_FragColor = vec4(col * a, a);
}`.replace('RISE', RISE.toFixed(2));

function FireButton({ height, label, onPress, accessibilityLabel, minWidth = 0 }: { height: number; label: string; onPress: () => void; accessibilityLabel: string; minWidth?: number }) {
  const hostRef = useRef<View>(null);
  const [w, setW] = useState(0);
  const reduced = useReducedMotion();
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host || !w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = w + SPILL * 2;
    const cssH = Math.round(height * (1 + RISE)) + FOOT;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    Object.assign(canvas.style, { position: 'absolute', left: `${-SPILL}px`, top: `${height + FOOT - cssH}px`, width: `${cssW}px`, height: `${cssH}px`, pointerEvents: 'none' });
    host.prepend(canvas);
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
    if (!gl) { canvas.remove(); return; }
    const shader = (type: number, src: string) => { const o = gl.createShader(type)!; gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    // The button's box in canvas pixels (origin bottom left): at the canvas's foot, inset by the spill.
    const bx0 = SPILL * dpr, by0 = FOOT * dpr;
    gl.uniform4f(gl.getUniformLocation(prog, 'box'), bx0, by0, bx0 + w * dpr, by0 + height * dpr);
    gl.uniform1f(gl.getUniformLocation(prog, 'ch'), 10 * dpr);
    gl.uniform1f(gl.getUniformLocation(prog, 'px'), 2 * dpr);
    const tLoc = gl.getUniformLocation(prog, 't');
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    const draw = (ms: number) => { gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform1f(tLoc, ms / 1000); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    // About 30 frames a second: fire reads as fire at that rate, for half the work.
    let raf = 0;
    let last = -1;
    const loop = (ms: number) => { if (ms - last >= 32) { draw(ms); last = ms; } raf = requestAnimationFrame(loop); };
    if (reduced) draw(4000);
    else raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); gl.getExtension('WEBGL_lose_context')?.loseContext(); canvas.remove(); };
  }, [w, height, reduced]);

  return (
    <Pressable
      onPress={() => { playSfx('buttonTap'); onPress(); }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
      style={{ minWidth, height, transform: [{ scale: pressed ? 0.965 : 1 }] }}>
      <View ref={hostRef} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} />
      <View pointerEvents="none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
        <Text style={{ color: Rune.ivory, fontSize: 14, fontFamily: Body.bold, letterSpacing: 1.6, textTransform: 'uppercase', textShadowColor: 'rgba(40,4,2,0.95)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } }}>{label}</Text>
      </View>
    </Pressable>
  );
}
