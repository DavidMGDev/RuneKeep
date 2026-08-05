/**
 * Cards, on paper (v0.34.8, owner).
 *
 * Nine cards to a US Letter sheet, three by three, at TRUE playing-card size (2.5 x 3.5 inches) so a
 * printed page cuts down into cards that fit a sleeve. Anything past nine starts a new page.
 *
 * ## Why HTML and not a hand-written PDF
 *
 * The app already has the artwork it needs at exactly the right resolution: a forged card is a
 * 750 x 1050 bitmap, and 2.5 x 3.5 inches at 300 DPI is 750 x 1050 pixels. So the primary path is
 * "put the bitmap on the page at its native density", and the print engine (a WKWebView on iOS, the
 * Android print framework, or the browser itself) does the rest at print resolution. There is no
 * upscaling anywhere.
 *
 * The FALLBACK matters in a browser, which forges nothing (see `forged-snapshots`): there, a card the
 * player wrote has no bitmap at all, so it is laid out in HTML instead. That version is vector, so it
 * is not a worse print, just a different route to the same page.
 *
 * `cardsPdfHtml` is pure and tested. Everything that touches the filesystem or a print dialog is
 * below it and platform-guarded.
 */
import { Platform } from 'react-native';

export interface PdfCard {
  /** The whole card as one picture (a forged bitmap or a scan): drawn edge to edge, nothing over it. */
  image?: string | null;
  title: string;
  typeLabel: string;
  body: string;
  /** Flat art colour, for the HTML fallback when there is no bitmap. */
  color?: string | null;
  /** Art for the fallback's top band (a player photo), when the card is not itself a picture. */
  art?: string | null;
}

/** Inches. True card size; the gaps and margins are what is left of the sheet. */
const CARD_W = 2.5;
const CARD_H = 3.5;
const GAP = 0.1;
const PER_PAGE = 9;

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Strip the markdown the card body is written in: bold, italic and bullet markers. The print sheet
 *  is a proxy card, not a rich-text renderer, and `**` printed literally would be worse than plain. */
function plainBody(body: string): string {
  return body
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/^[-*]\s+/gm, '• ');
}

function cardHtml(c: PdfCard): string {
  if (c.image) return `<div class="c"><img class="face" src="${esc(c.image)}"></div>`;
  const art = c.art
    ? `<img class="art" src="${esc(c.art)}">`
    : `<div class="art" style="background:${esc(c.color || '#23262C')}"></div>`;
  return `<div class="c">
  ${art}
  <div class="plaque">${esc(c.typeLabel)}</div>
  <div class="txt">
    ${c.title.trim() ? `<h1>${esc(c.title)}</h1>` : ''}
    <p>${esc(plainBody(c.body)).replace(/\n/g, '<br>')}</p>
  </div>
  <div class="foot"><span>RuneKeep</span><span>RuneKeep &#169; Treehouse109 2026</span></div>
</div>`;
}

/** The whole print document. One `.page` per nine cards; the last page is padded with blanks so the
 *  grid never reflows the final row into the middle of the sheet. */
export function cardsPdfHtml(cards: PdfCard[]): string {
  const pages: string[] = [];
  for (let i = 0; i < Math.max(cards.length, 1); i += PER_PAGE) {
    const slice = cards.slice(i, i + PER_PAGE);
    const blanks = Array.from({ length: PER_PAGE - slice.length }, () => '<div class="c blank"></div>').join('');
    pages.push(`<div class="page">${slice.map(cardHtml).join('')}${blanks}</div>`);
  }
  // `@page { margin: 0 }` plus explicit padding, so the sheet's margins are ours rather than the
  // print dialog's: a dialog default of half an inch would shrink the cards off true size.
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { size: letter; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page {
    width: 8.5in; height: 11in; padding: 0.15in 0.375in;
    display: grid; grid-template-columns: repeat(3, ${CARD_W}in); grid-template-rows: repeat(3, ${CARD_H}in);
    gap: ${GAP}in; justify-content: center; align-content: center;
    page-break-after: always; break-after: page; overflow: hidden;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .c { width: ${CARD_W}in; height: ${CARD_H}in; overflow: hidden; background: #EFE7D6; position: relative; display: flex; flex-direction: column; }
  .blank { background: transparent; }
  .face { width: 100%; height: 100%; object-fit: contain; display: block; }
  .art { width: 100%; height: 40%; object-fit: cover; display: block; flex: none; }
  .plaque { position: absolute; top: 38.5%; left: 0; right: 0; text-align: center; font-size: 6.5pt; letter-spacing: 1.2pt;
            text-transform: uppercase; font-weight: 700; color: #EFE7D6; background: #23262C; padding: 2.5pt 0; }
  .txt { flex: 1; padding: 0.2in 0.13in 0.16in; overflow: hidden; }
  .txt h1 { margin: 0 0 4pt; font-size: 11pt; line-height: 12pt; text-align: center; text-transform: uppercase; letter-spacing: 0.3pt; color: #191308; }
  .txt p { margin: 0; font-size: 7.6pt; line-height: 10pt; color: #191308; white-space: pre-wrap; }
  .foot { position: absolute; left: 0.07in; right: 0.07in; bottom: 0.05in; display: flex; justify-content: space-between; font-size: 4.4pt; color: #191308; }
</style></head><body>${pages.join('')}</body></html>`;
}

type FS = typeof import('expo-file-system');
// Native-only modules; a top-level import breaks the web bundle.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/**
 * A card's picture in a form the print engine will actually load.
 *
 * A print document is rendered in a web view with no access to the app's sandbox, so a `file://` path
 * silently draws nothing. The bytes go inline instead. A browser has no sandbox to escape and no
 * `file://` to read, so a bundled asset is used by URL exactly as the app already renders it.
 *
 * ponytail: inlines the full bitmap per card, so a hundred-card print builds a document of tens of
 * megabytes. Fine for the deck-sized jobs this is for; if someone prints a library, downscale here.
 */
export async function imageForPrint(source: number | { uri: string } | undefined | null): Promise<string | null> {
  if (source == null) return null;
  if (typeof source === 'object') {
    const uri = source.uri;
    if (!uri) return null;
    if (uri.startsWith('data:') || uri.startsWith('http') || uri.startsWith('blob:')) return uri;
    if (Platform.OS === 'web') return uri;
    try {
      const file = new (fs().File)(uri);
      if (!file.exists) return null;
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'png';
      return `data:${MIME[ext] ?? 'image/png'};base64,${file.base64()}`;
    } catch {
      return null; // an unreadable bitmap prints as the HTML fallback rather than failing the job
    }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Asset } = require('expo-asset') as typeof import('expo-asset');
    const asset = Asset.fromModule(source);
    if (Platform.OS === 'web') return asset.uri;
    await asset.downloadAsync();
    const local = asset.localUri ?? asset.uri;
    if (!local || !local.startsWith('file://')) return local ?? null;
    const file = new (fs().File)(local);
    const ext = (asset.type || local.split('.').pop() || 'png').toLowerCase();
    return `data:${MIME[ext] ?? 'image/png'};base64,${file.base64()}`;
  } catch {
    return null;
  }
}

/**
 * Make the PDF and hand it over.
 *
 * A browser opens its own print dialog, where "Save as PDF" is the destination every browser offers;
 * that IS the platform's PDF export and reimplementing it would be worse. A phone writes a real file
 * and puts it through the share sheet, so it can go straight into a chat or a drive.
 */
export async function shareCardsPdf(cards: PdfCard[], name: string): Promise<void> {
  const html = cardsPdfHtml(cards);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Print = require('expo-print') as typeof import('expo-print');
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  // Points, at 72 to the inch: US Letter is 612 x 792.
  const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Print ${name}`, UTI: 'com.adobe.pdf' });
}
