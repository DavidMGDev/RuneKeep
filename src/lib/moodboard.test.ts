import {
  addItem,
  bringToFront,
  centreItem,
  clampCentre,
  duplicateItem,
  layerDown,
  layerUp,
  type MoodboardItem,
  readMoodboard,
  removeItem,
  sendToBack,
  updateItem,
} from './moodboard';

const CANVAS = { width: 412, height: 892 };
const ids = (l: readonly MoodboardItem[]) => l.map((i) => i.id);

/** Three images, bottom to top: a, b, c. */
function board(): MoodboardItem[] {
  let l = addItem([], { id: 'a', imageUri: 'file://a', aspect: 1 }, CANVAS);
  l = addItem(l, { id: 'b', imageUri: 'file://b', aspect: 1.5 }, CANVAS);
  return addItem(l, { id: 'c', imageUri: 'file://c', aspect: 0.75 }, CANVAS);
}

describe('adding', () => {
  it('puts a new image on top', () => {
    expect(ids(board())).toEqual(['a', 'b', 'c']);
  });

  it('lands near the middle, inside the canvas', () => {
    for (const it of board()) {
      expect(it.x).toBeGreaterThan(CANVAS.width / 2 - 60);
      expect(it.x).toBeLessThan(CANVAS.width / 2 + 60);
      expect(it.y).toBeGreaterThan(CANVAS.height / 2 - 60);
      expect(it.y).toBeLessThan(CANVAS.height / 2 + 60);
    }
  });

  it('offsets each one, so three added in a row are three visible images', () => {
    const [a, b, c] = board();
    expect(a.x).not.toBe(b.x);
    expect(b.x).not.toBe(c.x);
  });

  it('starts unrotated at full size and keeps the image shape', () => {
    const b = board()[1];
    expect(b.scale).toBe(1);
    expect(b.rotation).toBe(0);
    expect(b.aspect).toBe(1.5);
  });

  it('never leaves an aspect of zero, which would divide by nothing when laying out', () => {
    expect(addItem([], { id: 'x', imageUri: 'u', aspect: 0 }, CANVAS)[0].aspect).toBe(1);
  });
});

describe('ordering', () => {
  it('brings an image to the front', () => {
    expect(ids(bringToFront(board(), 'a'))).toEqual(['b', 'c', 'a']);
  });

  it('sends an image to the back', () => {
    expect(ids(sendToBack(board(), 'c'))).toEqual(['c', 'a', 'b']);
  });

  it('moves one layer at a time', () => {
    expect(ids(layerUp(board(), 'a'))).toEqual(['b', 'a', 'c']);
    expect(ids(layerDown(board(), 'c'))).toEqual(['a', 'c', 'b']);
  });

  it('does nothing at the ends rather than failing', () => {
    expect(ids(layerUp(board(), 'c'))).toEqual(['a', 'b', 'c']);
    expect(ids(layerDown(board(), 'a'))).toEqual(['a', 'b', 'c']);
  });

  it('is idempotent at the extremes', () => {
    expect(ids(bringToFront(bringToFront(board(), 'a'), 'a'))).toEqual(['b', 'c', 'a']);
    expect(ids(sendToBack(sendToBack(board(), 'c'), 'c'))).toEqual(['c', 'a', 'b']);
  });

  it('ignores an id that is not on the board', () => {
    expect(ids(bringToFront(board(), 'nope'))).toEqual(['a', 'b', 'c']);
    expect(ids(layerUp(board(), 'nope'))).toEqual(['a', 'b', 'c']);
  });
});

describe('centring', () => {
  it('puts the image in the middle AND on top, since a centred image behind three others is still lost', () => {
    const l = centreItem(board(), 'a', CANVAS);
    expect(ids(l)).toEqual(['b', 'c', 'a']);
    const a = l.find((i) => i.id === 'a')!;
    expect(a.x).toBe(CANVAS.width / 2);
    expect(a.y).toBe(CANVAS.height / 2);
  });

  it('leaves size and angle alone', () => {
    const turned = updateItem(board(), 'a', { scale: 2.4, rotation: 33 });
    const a = centreItem(turned, 'a', CANVAS).find((i) => i.id === 'a')!;
    expect(a.scale).toBe(2.4);
    expect(a.rotation).toBe(33);
  });
});

describe('duplicating', () => {
  it('places the copy on top and offset, so it reads as a second image', () => {
    const l = duplicateItem(board(), 'a', 'a2', CANVAS);
    expect(ids(l)).toEqual(['a', 'b', 'c', 'a2']);
    const [a, copy] = [l[0], l[3]];
    expect(copy.imageUri).toBe(a.imageUri);
    expect(copy.x).not.toBe(a.x);
  });

  it('copies size and angle', () => {
    const turned = updateItem(board(), 'b', { scale: 1.8, rotation: 90 });
    const copy = duplicateItem(turned, 'b', 'b2', CANVAS).find((i) => i.id === 'b2')!;
    expect(copy.scale).toBe(1.8);
    expect(copy.rotation).toBe(90);
  });

  it('ignores an id that is not there', () => {
    expect(ids(duplicateItem(board(), 'nope', 'x', CANVAS))).toEqual(['a', 'b', 'c']);
  });
});

describe('removing', () => {
  it('takes out the right one and leaves the order', () => {
    expect(ids(removeItem(board(), 'b'))).toEqual(['a', 'c']);
  });
});

describe('the canvas edge', () => {
  it('keeps a centre reachable from every direction', () => {
    expect(clampCentre(-500, -500, CANVAS)).toEqual({ x: 28, y: 28 });
    expect(clampCentre(9999, 9999, CANVAS)).toEqual({ x: 412 - 28, y: 892 - 28 });
  });

  it('leaves a centre that is already inside alone', () => {
    expect(clampCentre(200, 400, CANVAS)).toEqual({ x: 200, y: 400 });
  });
});

describe('every operation returns a new list', () => {
  // The save path decides what changed by reference, so a mutation would be invisible to it.
  it('never mutates its input', () => {
    const before = board();
    const snapshot = JSON.stringify(before);
    bringToFront(before, 'a');
    sendToBack(before, 'c');
    layerUp(before, 'a');
    layerDown(before, 'c');
    centreItem(before, 'a', CANVAS);
    duplicateItem(before, 'a', 'a2', CANVAS);
    updateItem(before, 'a', { scale: 3 });
    removeItem(before, 'a');
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('reading a stored board', () => {
  it('accepts what it wrote', () => {
    expect(readMoodboard(board())).toHaveLength(3);
  });

  it('drops anything malformed rather than rendering a broken image', () => {
    expect(readMoodboard([{ id: 'a' }, null, 'nonsense', { id: 'b', imageUri: 'u', x: 1, y: 2, scale: 1, rotation: 0 }])).toHaveLength(1);
  });

  it('is empty for anything that is not a list', () => {
    expect(readMoodboard(undefined)).toEqual([]);
    expect(readMoodboard({})).toEqual([]);
  });

  it('repairs a missing or nonsense aspect', () => {
    expect(readMoodboard([{ id: 'b', imageUri: 'u', x: 1, y: 2, scale: 1, rotation: 0 }])[0].aspect).toBe(1);
    expect(readMoodboard([{ id: 'b', imageUri: 'u', x: 1, y: 2, scale: 1, rotation: 0, aspect: -3 }])[0].aspect).toBe(1);
  });
});
