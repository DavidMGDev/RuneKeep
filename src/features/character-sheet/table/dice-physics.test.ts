import { allAsleep, type Body, boxCorners, type DieFace, type Field, launch, makeBody, moveHeld, qRandom, qRotate, restOn, sendHome, step, throwLift } from './dice-physics';

it('lets a soft hand drop hop four times as high and spin twice as fast, a hard throw only a little more', () => {
  expect(throwLift(200)).toEqual({ hop: 4, spin: 2 });
  expect(throwLift(3000)).toEqual({ hop: 1.5, spin: 1 });
  expect(throwLift(1000).hop).toBeGreaterThan(throwLift(1800).hop);
  expect(throwLift(1800).hop).toBeGreaterThan(1.5);
});

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

  it('flies a fixed piece home too (v0.47.23: the dice chest never went back)', () => {
    const c = makeBody('c', 400, 300, 30, CUBE);
    c.fixed = true;
    sendHome(c, 150, 120);
    expect(allAsleep([c])).toBe(false);
    run([c], seeded(3));
    expect(c.x).toBeCloseTo(150, 0);
    expect(c.y).toBeCloseTo(120, 0);
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

describe('physical cards (v0.47.3)', () => {
  const card = (x: number, y: number) => {
    const b = makeBody('card', x, y, Math.hypot(85, 118), CUBE);
    b.box = { w: 170, h: 236 };
    b.a = 0;
    b.va = 0;
    b.mass = 3;
    return b;
  };

  it('a die thrown into a card knocks it and turns it, and both stop inside the rail', () => {
    const c = card(500, 250);
    const d = makeBody('d', 200, 200, 26, CUBE);
    launch(d, 2600, 0, 0, [0, 30, 0]);
    run([c, d], seeded(3));
    expect(c.x).toBeGreaterThan(500);
    expect(Math.abs(c.a ?? 0)).toBeGreaterThan(0.01);
    for (const [x, y] of [[c.x, c.y]]) { expect(x).toBeLessThanOrEqual(800); expect(y).toBeLessThanOrEqual(500); }
    expect(d.x + d.r).toBeLessThanOrEqual(800.5);
  });

  it('a hard-thrown card bounces off the rail by its corners and never leaves the table', () => {
    const c = card(300, 250);
    launch(c, 5000, 1200, 0, [0, 0, 0]);
    c.va = 6;
    run([c], seeded(4));
    expect(c.asleep).toBe(true);
    for (const [x, y] of boxCorners(c)) {
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(801);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(501);
    }
  });

  it('a die never passes through a card, however hard it is thrown', () => {
    const c = card(500, 250);
    c.fixed = true;
    const d = makeBody('d', 150, 250, 22, CUBE);
    launch(d, 9000, 0, 0, [0, 0, 0]);
    run([c, d], seeded(5));
    expect(d.x).toBeLessThan(500 - 85);
  });

  it('a ghost (a piece riding a physical card) is never pushed', () => {
    const g = makeBody('g', 300, 250, 20, CUBE);
    g.ghost = true;
    g.fixed = true;
    const d = makeBody('d', 100, 250, 20, CUBE);
    launch(d, 1500, 0, 0, [0, 0, 0]);
    run([g, d], seeded(6));
    expect(g.x).toBe(300);
  });

  it('a whirl field keeps pieces moving round its centre while it lasts', () => {
    const d = makeBody('d', 400, 150, 20, CUBE);
    const fields: Field[] = [{ kind: 'vortex', x: 400, y: 250, r: 300, k: 2400 }];
    for (let i = 0; i < 120; i++) step([d], BOUNDS, undefined, Math.random, [], { fields });
    expect(d.asleep).toBe(false);
    expect(Math.hypot(d.x - 400, d.y - 150)).toBeGreaterThan(10);
  });
});

describe('the supply and putting away (v0.47.4)', () => {
  it('a fresh copy passes through the spawners until it is clear, then collides like anything else', () => {
    const src = makeBody('src', 100, 100, 20, CUBE);
    src.spawner = true;
    const copy = makeBody('copy', 100, 100, 20, CUBE);
    copy.fresh = true;
    launch(copy, 900, 0, 0, [0, 0, 0]);
    run([src, copy], seeded(8));
    expect(src.x).toBe(100);
    expect(src.y).toBe(100);
    expect(copy.fresh).toBe(false);
  });

  it('a ghost flying home touches nothing and lands where it was sent', () => {
    const g = makeBody('g', 600, 300, 20, CUBE);
    g.ghost = true;
    const d = makeBody('d', 200, 300, 20, CUBE);
    sendHome(g, 200, 300, undefined, 0.4, [10, 4, 2]);
    run([g, d], seeded(9));
    expect(d.x).toBe(200);
    expect(g.x).toBeCloseTo(200, 3);
  });
});

describe('launched pieces push harder, for five generations (v0.47.5)', () => {
  const line = (boost?: { gen: number; power: number }) => {
    const bodies = [0, 1, 2, 3].map((i) => makeBody(`b${i}`, 100 + i * 44, 250, 20, CUBE));
    launch(bodies[0], 1800, 0, 0, [0, 0, 0]);
    bodies[0].boost = boost;
    // Long enough for the chain of hits down the line.
    for (let i = 0; i < 40; i++) step(bodies, { left: 0, top: 0, right: 5000, bottom: 500 });
    return bodies;
  };

  it('a boosted piece knocks the next one faster than a plain one would, and passes the push on weaker', () => {
    const plain = line();
    const boosted = line({ gen: 5, power: 2 });
    expect(boosted[1].vx + boosted[2].vx + boosted[3].vx).toBeGreaterThan(plain[1].vx + plain[2].vx + plain[3].vx);
    expect(boosted[1].boost?.gen ?? 0).toBeLessThanOrEqual(4);
  });

  it('the push is gone once a piece settles', () => {
    const b = makeBody('b', 100, 100, 20, CUBE);
    b.boost = { gen: 5, power: 2 };
    launch(b, 300, 0, 0, [0, 0, 0]);
    run([b], seeded(11));
    expect(b.boost).toBeUndefined();
  });
});

describe('the supply stays put under a stream of copies (v0.47.6)', () => {
  it('a piece carrying the soft spawning push never moves a spawner, a launched one still does', () => {
    const src = makeBody('src', 300, 250, 20, CUBE);
    src.spawner = true;
    const soft = makeBody('a', 200, 250, 20, CUBE);
    launch(soft, 1500, 0, 0, [0, 0, 0]);
    soft.boost = { gen: 2, power: 1.6, soft: true };
    run([src, soft], seeded(12));
    expect(src.x).toBe(300);
    const src2 = makeBody('src2', 300, 250, 20, CUBE);
    src2.spawner = true;
    const hard = makeBody('b', 200, 250, 20, CUBE);
    launch(hard, 1500, 0, 0, [0, 0, 0]);
    hard.boost = { gen: 5, power: 3 };
    run([src2, hard], seeded(13));
    expect(src2.x).toBeGreaterThan(300);
  });
});

describe('hopping control dice (v0.47.7)', () => {
  it('a thrown hopper hops upright to where it would have slid and lands on the same face', () => {
    const b = makeBody('h', 200, 250, 28, CUBE, { upright: true });
    b.hopper = true;
    const face = b.top;
    launch(b, 1600, 0, 0, [30, -20, 10]);
    let peak = 0;
    let n = 0;
    while (!allAsleep([b]) && n++ < 6000) { step([b], BOUNDS); peak = Math.max(peak, b.z); }
    expect(b.top).toBe(face);
    expect(peak).toBeGreaterThan(20);
    expect(b.x).toBeGreaterThan(500);
    expect(b.x).toBeLessThanOrEqual(800 - 28);
  });

  it('a hop sent somewhere else in mid-air carries on from its height instead of dropping', () => {
    const b = makeBody('h', 200, 250, 28, CUBE);
    sendHome(b, 600, 250, undefined, 0.6);
    for (let i = 0; i < 30; i++) step([b], BOUNDS);
    const z = b.z;
    expect(z).toBeGreaterThan(10);
    sendHome(b, 300, 100, undefined, 0.6);
    step([b], BOUNDS);
    expect(b.z).toBeGreaterThan(z * 0.8);
  });
});

describe('a hop into the hand area (v0.47.7)', () => {
  it('lands at the edge of an area that spans the table, never off it', () => {
    const b = makeBody('h', 60, 200, 25, CUBE, { upright: true });
    b.hopper = true;
    launch(b, -300, 2400, 0, [0, 0, 0]);
    const hand = { left: 4, top: 300, right: 796, bottom: 496 };
    let n = 0;
    while (!allAsleep([b]) && n++ < 6000) step([b], BOUNDS, undefined, Math.random, [hand]);
    expect(b.x).toBeGreaterThanOrEqual(25);
    expect(b.y).toBeLessThanOrEqual(300 - 25 + 0.5);
  });
});

describe('charged throws break loose pieces (v0.47.11)', () => {
  const row = (n: number) => Array.from({ length: n }, (_, i) => { const b = makeBody(`t${i}`, 260 + i * 60, 250, 20, CUBE); b.breakable = true; return b; });
  const broken = (bodies: Body[], hits: string[]) => { let n = 0; while (n++ < 3000 && !allAsleep(bodies)) for (const h of step(bodies, { left: 0, top: 0, right: 3000, bottom: 500 })) if (h.kind === 'break') hits.push(h.key); return hits; };

  it('a plain charged throw breaks two at most, then bounces off the rest', () => {
    const pieces = row(5);
    const shot = makeBody('shot', 100, 250, 20, CUBE);
    launch(shot, 6000, 0, 0, [0, 0, 0]);
    shot.breaker = { left: 2, fire: false };
    const hits = broken([shot, ...pieces], []);
    expect(hits.length).toBe(2);
  });

  it('a slow throw breaks nothing', () => {
    const pieces = row(2);
    const shot = makeBody('shot', 100, 250, 20, CUBE);
    launch(shot, 900, 0, 0, [0, 0, 0]);
    shot.breaker = { left: 2, fire: false };
    expect(broken([shot, ...pieces], []).length).toBe(0);
  });

  it('a burning throw passes through and breaks a whole line', () => {
    const pieces = row(6);
    const shot = makeBody('shot', 100, 250, 20, CUBE);
    launch(shot, 7000, 0, 0, [0, 0, 0]);
    shot.breaker = { left: 99, fire: true };
    expect(broken([shot, ...pieces], []).length).toBe(6);
  });

  it('a boosted hit never sets a crowd moving forever', () => {
    const crowd = Array.from({ length: 24 }, (_, i) => makeBody(`c${i}`, 200 + (i % 6) * 48, 150 + Math.floor(i / 6) * 48, 20, CUBE));
    const shot = makeBody('shot', 60, 220, 20, CUBE);
    launch(shot, 5000, 300, 0, [0, 0, 0]);
    shot.boost = { gen: 5, power: 3.5 };
    let n = 0;
    while (!allAsleep([shot, ...crowd]) && n++ < 20000) step([shot, ...crowd], BOUNDS);
    expect(allAsleep([shot, ...crowd])).toBe(true);
  });
});

describe('cards break, cages hold, the wind blows (v0.47.12)', () => {
  const card = (key: string, x: number, y: number, a = 0) => { const b = makeBody(key, x, y, Math.hypot(60, 90) / 2, CUBE); b.box = { w: 60, h: 90 }; b.a = a; b.va = 0; b.mass = 3; b.breakable = true; return b; };
  const run = (bodies: Body[], world = {}) => { const hits: string[] = []; let n = 0; while (n++ < 3000 && !allAsleep(bodies)) for (const h of step(bodies, { left: 0, top: 0, right: 3000, bottom: 500 }, undefined, undefined, [], world)) if (h.kind === 'break') hits.push(h.key); return hits; };

  it('a hard charged throw breaks a physical card by its true outline, and reports which way it went', () => {
    const c = card('card:a', 400, 250);
    const shot = makeBody('shot', 100, 250, 20, CUBE);
    launch(shot, 6000, 0, 0, [0, 0, 0]);
    shot.breaker = { left: 2, fire: false };
    const seen: { vx?: number }[] = [];
    let n = 0;
    while (n++ < 3000 && !allAsleep([shot, c])) for (const h of step([shot, c], { left: 0, top: 0, right: 3000, bottom: 500 })) if (h.kind === 'break') seen.push(h);
    expect(seen.length).toBe(1);
    expect(seen[0].vx).toBeGreaterThan(3000);
  });

  it('a throw passing the card corner it misses breaks nothing', () => {
    // Turned 45 degrees, a card's bounding circle reaches far past its edges: only the outline counts.
    const c = card('card:b', 400, 250);
    const shot = makeBody('shot', 100, 250 - 50 - 22, 20, CUBE);
    launch(shot, 6000, 0, 0, [0, 0, 0]);
    shot.breaker = { left: 99, fire: true };
    expect(run([shot, c])).toEqual([]);
  });

  it('a cage keeps what was in it inside, and bounces what was outside off it', () => {
    const inner = makeBody('in', 400, 250, 20, CUBE);
    const outer = makeBody('out', 100, 250, 20, CUBE);
    launch(inner, 3000, 0, 0, [0, 0, 0]);
    launch(outer, 3000, 0, 0, [0, 0, 0]);
    const cage = { x: 400, y: 250, r: 150, inside: new Set(['in']) };
    run([inner, outer], { cages: [cage] });
    expect(Math.hypot(inner.x - 400, inner.y - 250)).toBeLessThanOrEqual(150 - 20 + 0.5);
    expect(Math.hypot(outer.x - 400, outer.y - 250)).toBeGreaterThanOrEqual(150 + 20 - 0.5);
  });

  it('a wind pushes everything the same way', () => {
    const a = makeBody('a', 400, 100, 20, CUBE), b = makeBody('b', 400, 400, 20, CUBE);
    const wind: Field = { kind: 'wind', x: 3000, y: 0, r: 1e9, k: 0 };
    for (let i = 0; i < 60; i++) step([a, b], { left: 0, top: 0, right: 3000, bottom: 500 }, undefined, undefined, [], { fields: [wind] });
    expect(a.x).toBeGreaterThan(450);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1);
  });
});
