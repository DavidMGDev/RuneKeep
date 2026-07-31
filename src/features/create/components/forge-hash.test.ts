import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * The guard that lets the forged-card cache stop keying on the app version (v0.27.4).
 *
 * Keying on the release meant every update threw away every card bitmap and a phone re-captured the
 * lot, which is most of why the app felt slower than the browser build. Keying on a signature of the
 * card sources instead is only safe if the signature cannot go stale, and this is what makes it so:
 * change a card component, the palette or any game data without regenerating, and this fails.
 *
 *   node scripts/forge-hash.mjs
 */
it('the committed forge signature matches the card sources', () => {
  const root = resolve(__dirname, '../../../..');
  // Throws (failing the test) with the generator's own message when the signature is out of date.
  execFileSync(process.execPath, [resolve(root, 'scripts/forge-hash.mjs'), '--check'], { cwd: root, stdio: 'pipe' });
});
