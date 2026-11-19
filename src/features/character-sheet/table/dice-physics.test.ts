import { allAsleep, type Body, type DieFace, launch, makeBody, moveHeld, qRandom, qRotate, restOn, sendHome, step } from './dice-physics';

// A cube's faces in the model frame.
const CUBE: DieFace[] = [
  { n: [0, 0, 1], up: [0, 1, 0] }, { n: [0, 0, -1], up: [0, 1, 0] },
  { n: [1, 0, 0], up: [0, 1, 0] }, { n: [-1, 0, 0], up: [0, 1, 0] },
  { n: [0, 1, 0], up: [0, 0, 1] }, { n: [0, -1, 0], up: [0, 0, 1] },
];
const BOUNDS = { left: 0, top: 0, right: 800, bottom: 500 };

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function run(bodies: Body[], rand: () => number, max = 6000) {
  let n = 0;
  while (!allAsleep(bodies) && n++ < max) step(bodies, BOUNDS, undefined, rand);
  return n;
}

describe('dice physics', () => {
  it('comes to rest flat on a face, inside the rail', () => {
    const rand = seeded(7);
    const b = makeBody('a', 100, 250, 30, CUBE, { q: qRandom(rand) });
    launch(b, 1400, -300, 500, [20, -14, 9]);
    const steps = run([b], rand);
    expect(steps).toBeLessThan(6000);
    expect(b.asleep).toBe(true);
    expect(qRotate(b.q, CUBE[b.top].n)[2]).toBeCloseTo(1, 4);
    expect(b.x).toBeGreaterThanOrEqual(30);
    expect(b.x).toBeLessThanOrEqual(770);
    expect(b.y).toBeGreaterThanOrEqual(30);
    expect(b.y).toBeLessThanOrEqual(470);
  });

  it('lands on every face of a cube over many throws', () => {
    const rand = seeded(42);
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 300; i++) {
      const b = makeBody('a', 400, 250, 30, CUBE, { q: qRandom(rand) });
      launch(b, (rand() - 0.5) * 2400, (rand() - 0.5) * 1600, 300 + rand() * 500, [(rand() - 0.5) * 40, (rand() - 0.5) * 40, (rand() - 0.5) * 20]);
      run([b], rand);
      counts[b.top]++;
    }
    // Fair enough for a table: no face starved or hogging (expected 50 each).
    for (const c of counts) {
      expect(c).toBeGreaterThan(25);
      expect(c).toBeLessThan(85);
    }
  });

  it('settles an icon die upright on screen', () => {
    const q = restOn(qRandom(seeded(3)), CUBE[2], true);
    const up = qRotate(q, CUBE[2].up);
    expect(up[0]).toBeCloseTo(0, 4);
    expect(up[1]).toBeCloseTo(1, 4);
  });

  it('pushes dice apart and flies a die home onto the face asked for', () => {
    const rand = seeded(9);
    const a = makeBody('a', 300, 250, 30, CUBE);
    const b = makeBody('b', 330, 250, 30, CUBE);
    launch(a, 600, 0, 0, [0, 0, 0]);
    run([a, b], rand);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(59);
    sendHome(a, 100, 100, 4);
    run([a, b], rand);
    expect(a.x).toBeCloseTo(100, 0);
    expect(a.y).toBeCloseTo(100, 0);
    expect(a.top).toBe(4);
  });
});

describe('dice physics, no tunnelling (v0.47.1)', () => {
  it('a die thrown very hard still hits the die in its way', () => {
    const rand = seeded(5);
    const a = makeBody('a', 60, 250, 24, CUBE);
    const b = makeBody('b', 400, 250, 24, CUBE);
    launch(a, 9000, 0, 600, [0, 0, 0]);
    step([a, b], BOUNDS, undefined, rand);
    step([a, b], BOUNDS, undefined, rand);
    run([a, b], rand);
    expect(b.x).toBeGreaterThan(430);
    expect(a.z).toBe(0);
  });

  it('a die swung fast in the hand knocks another away instead of skipping it', () => {
    const a = makeBody('a', 100, 250, 24, CUBE);
    const b = makeBody('b', 300, 250, 24, CUBE);
    a.held = true;
    a.asleep = false;
    moveHeld([a, b], a, 600, 250, 6000, 0, BOUNDS);
    expect(b.x).toBeGreaterThan(600);
    expect(b.vx).toBeGreaterThan(1000);
  });
});
