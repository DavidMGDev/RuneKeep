import { mayHaveAlpha, mimeOf } from './image-embed';

it('keeps a see-through picture see-through, and a photo a photo', () => {
  expect(mayHaveAlpha('file:///data/rk-images/banner.PNG')).toBe(true);
  expect(mayHaveAlpha('file:///data/rk-images/art.webp?x=1')).toBe(true);
  expect(mayHaveAlpha('file:///data/rk-images/photo.jpg')).toBe(false);
  expect(mimeOf('file:///a/b.png')).toBe('image/png');
  expect(mimeOf('file:///a/b.jpeg')).toBe('image/jpeg');
  expect(mimeOf('file:///a/b')).toBe('image/jpeg');
});
