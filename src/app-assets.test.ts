import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Cloudflare Pages drops every folder named node_modules from an upload, so a bundled font or image that comes out of
// a package is served as the app's HTML on the site while looking fine in dev.
it('loads no font from a package', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [join(dir, f)] : []));
  expect(files(__dirname).filter((f) => /@expo-google-fonts\//.test(readFileSync(f, 'utf8')))).toEqual([]);
});
