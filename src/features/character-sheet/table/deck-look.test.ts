import { BUILTIN_LOOKS, readTableFile, tableFile, cardOffset, cleanLook, decodeLook, DEFAULT_LOOK, encodeLook, lookScale, lookX, LOOK_PAGES, randomTables, TABLE_PRESETS, tableScore } from './deck-look';

describe('deck look', () => {
  it('round-trips a look through a share code', () => {
    const look = { ...DEFAULT_LOOK, size: 300, edge: 'blur' as const, loop: true, spacing: -0.4 };
    const code = encodeLook(look);
    expect(code.startsWith('RK1:')).toBe(true);
    expect(decodeLook(`  ${code}\n`)).toEqual(look);
  });

  it('shares the default as an empty code', () => {
    expect(decodeLook(encodeLook(DEFAULT_LOOK))).toEqual(DEFAULT_LOOK);
  });

  it('rejects what is not a code', () => {
    expect(decodeLook('hello')).toBeNull();
    expect(decodeLook('RK1:%%%')).toBeNull();
    expect(decodeLook('RK1:' + btoa('[1,2]'))).toBeNull();
  });

  it('clamps numbers to the panel limits and drops unknown choices', () => {
    const l = cleanLook({ size: 99999, edge: 'sparkles', centre: 'three', loop: 'yes', bogus: 1 });
    expect(l.size).toBe(520);
    expect(l.edge).toBe(DEFAULT_LOOK.edge);
    expect(l.centre).toBe(DEFAULT_LOOK.centre);
    expect(l.loop).toBe(false);
    expect('bogus' in l).toBe(false);
  });

  it('keeps a table saved by an older version: its layout stays, renamed settings carry over', () => {
    const old = { ...TABLE_PRESETS[1].look, centreClick: 'take', clickPull: false, retired: 3 } as Record<string, unknown>;
    const l = cleanLook(old);
    expect(l.clickPull).toBe(true);
    expect(l.centreClick).toBe('nothing');
    for (const k of ['supX', 'supY', 'supDir', 'ctlX', 'ctlY', 'catX', 'catY', 'size', 'walls'] as const) expect(l[k]).toEqual(TABLE_PRESETS[1].look[k]);
    // A look missing settings added since keeps everything it has and takes the defaults for the rest.
    const partial = cleanLook({ supX: 0.31, supY: 0.42 });
    expect([partial.supX, partial.supY, partial.ctlX]).toEqual([0.31, 0.42, DEFAULT_LOOK.ctlX]);
  });

  it('keeps pieces split off their rows, and only known ones on the table', () => {
    const l = cleanLook({ apart: { cards: [0.4, 0.2], 'src:die': [1.4, -2], bogus: [0.1, 0.1], sort: ['x', 1] } });
    expect(l.apart).toEqual({ cards: [0.4, 0.2], 'src:die': [1, 0] });
    expect(cleanLook({}).apart).toEqual({});
    expect(cleanLook({ hidden: ['sort', 'nope', 'cat', 3] }).hidden).toEqual(['sort', 'cat']);
    expect(cleanLook({}).hidden).toEqual([]);
  });

  it('keeps every built-in look inside the limits', () => {
    for (const b of BUILTIN_LOOKS) expect(cleanLook(b.look)).toEqual(b.look);
  });

  it('describes every setting exactly once', () => {
    const keys = LOOK_PAGES.flatMap((p) => p.groups.flatMap((g) => g.controls.map((c) => c.key)));
    expect(new Set(keys).size).toBe(keys.length);
    // `apart` and `hidden` are set on the table itself; `apart` (pieces split off their rows) is placed on the table itself, never a control in the panel.
    expect(keys.sort()).toEqual(Object.keys(DEFAULT_LOOK).filter((k) => k !== 'apart' && k !== 'hidden').sort());
  });

  it('places cards further out monotonically and interpolates between detents', () => {
    const w = 200;
    const xs = [0, 1, 2, 3, 4].map((k) => lookX(k, DEFAULT_LOOK, w));
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    expect(lookX(1.5, DEFAULT_LOOK, w)).toBeCloseTo((xs[1] + xs[2]) / 2, 5);
  });

  it('never shrinks past the smallest card', () => {
    expect(lookScale(100, { ...DEFAULT_LOOK, shrink: 0.4, minScale: 0.25 })).toBe(0.25);
  });

  it('wraps offsets the short way round a looping deck', () => {
    expect(cardOffset(9, 0, 10, true)).toBe(-1);
    expect(cardOffset(1, 9, 10, true)).toBe(2);
    expect(cardOffset(9, 0, 10, false)).toBe(9);
  });

  it('ships six whole tables, all different, all inside the limits and laid out cleanly', () => {
    expect(TABLE_PRESETS).toHaveLength(6);
    const codes = new Set(TABLE_PRESETS.map((p) => encodeLook(p.look)));
    expect(codes.size).toBe(6);
    for (const p of TABLE_PRESETS) {
      expect(cleanLook(p.look)).toEqual(p.look);
      expect(tableScore(p.look)).toBeGreaterThanOrEqual(0.99);
      expect(decodeLook(encodeLook(p.look))).toEqual(p.look);
    }
  });

  it('draws random tables that score well, differ, and repeat for the same seed', () => {
    const a = randomTables(4, 2026);
    expect(a).toHaveLength(4);
    for (const l of a) expect(tableScore(l)).toBeGreaterThanOrEqual(0.99);
    expect(randomTables(4, 2026)).toEqual(a);
  });

  it('reads a code wherever it sits in what was pasted, in any case, with quotes, breaks and a full stop around it', () => {
    const look = TABLE_PRESETS[1].look;
    const code = encodeLook(look);
    const messy = `Here: "${code.slice(0, 20)}
${code.slice(20).replace(/^RK1/, '')}".`;
    expect(decodeLook(messy)).toEqual(look);
    expect(decodeLook(`  ${code.replace('RK1:', 'rk1:')}  `)).toEqual(look);
  });

  it('saves a table as a file and reads it back whole, name and all, and is never a character file', () => {
    const look = TABLE_PRESETS[4].look;
    const file = tableFile(look, 'Our table');
    expect(readTableFile(file)).toEqual({ name: 'Our table', look });
    expect(readTableFile(JSON.stringify({ schemaVersion: 1, name: 'A character' }))).toBeNull();
    expect(readTableFile(`notes
${encodeLook(look)}`)?.look).toEqual(look);
  });
});
