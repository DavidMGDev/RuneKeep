/**
 * Cards, on paper (v0.34.8; rebuilt v0.35).
 *
 * Nine cards to a US Letter sheet, three by three, with a margin a home printer will not clip and a
 * gap a pair of scissors can find. Anything past nine starts a new page.
 *
 * ## Where the pictures come from
 *
 * Every card on the sheet is a 750 x 1050 bitmap, which is exactly 2.5 x 3.5 inches at 300 DPI. Cards
 * the app has already forged for the carousel are that bitmap; cards it has not are captured on the
 * spot (see `print-stage`), which is what v0.35 fixed. v0.34.8 read the carousel's image field
 * directly, and an un-forged card carries the app icon as a placeholder, so a browser printed nine
 * blank rectangles per page and a phone printed a grid of app icons.
 *
 * The HTML fallback below is the last resort, for a card that will not draw at all. It is a legible
 * proxy rather than the card, so it should be rare; if it stops being rare, the capture is failing.
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

/**
 * Inches. The margins are fixed and the CARD is what fits inside them (v0.35, owner).
 *
 * v0.34.8 pinned the card at its true 2.5 x 3.5 and left whatever remained as margin, which came to a
 * tenth of an inch between cards and 0.15in above the top row. A home printer's unprintable edge is
 * usually a quarter inch, so the outer cards were being clipped, and a tenth of an inch is less than
 * a pair of scissors is accurate to.
 *
 * So: twice the gap, a third more margin, and the card shrinks to keep nine on the sheet. It comes out
 * about 5% under true size, still 5:7, so a printed card is very slightly small for a sleeve rather
 * than the wrong shape. Keeping true size would have meant six cards to a page.
 */
const MARGIN_X = 0.5;
const MARGIN_Y = 0.2;
const GAP = 0.2;
const CARD_W = Math.min((8.5 - 2 * MARGIN_X - 2 * GAP) / 3, ((11 - 2 * MARGIN_Y - 2 * GAP) / 3) * (5 / 7));
const CARD_H = CARD_W * (7 / 5);
const PER_PAGE = 9;

/** Trimmed for CSS, which does not need fifteen decimal places of an inch. Rounded DOWN, so three
 *  cards and two gaps can never come out a thousandth of an inch wider than the page allows. */
const inches = (n: number) => `${Math.floor(n * 1000) / 1000}in`;

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
    width: 8.5in; height: 11in; padding: ${inches(MARGIN_Y)} ${inches(MARGIN_X)};
    display: grid; grid-template-columns: repeat(3, ${inches(CARD_W)}); grid-template-rows: repeat(3, ${inches(CARD_H)});
    gap: ${inches(GAP)}; justify-content: center; align-content: center;
    page-break-after: always; break-after: page; overflow: hidden;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .c { width: ${inches(CARD_W)}; height: ${inches(CARD_H)}; overflow: hidden; background: #EFE7D6; position: relative; display: flex; flex-direction: column; }
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
 * A bundled asset's URL, resolved against the PAGE rather than against the print document (v0.35).
 *
 * The print frame is written into an `about:blank` document, and a root-relative asset path there is
 * resolved against a document with no origin. Every image on the sheet came out broken, which is what
 * the owner photographed. Absolute URLs cannot be resolved against the wrong thing.
 */
function absolute(uri: string): string {
  try {
    return new URL(uri, typeof document !== 'undefined' ? document.baseURI : undefined).href;
  } catch {
    return uri;
  }
}

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
    if (Platform.OS === 'web') return absolute(uri);
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
    if (Platform.OS === 'web') return absolute(asset.uri);
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
 * Print the sheet in a browser, through an offscreen frame.
 *
 * NOT `expo-print`: its web implementation is `window.print()` and nothing else, so it prints
 * whatever page is currently on screen and throws the document away. The frame is its own page, so
 * the print dialog is aimed at the cards, and "Save as PDF" is a destination in every browser's
 * dialog. That is the platform's own PDF export and reimplementing it would be strictly worse.
 *
 * The images have to be DECODED before the dialog opens or the sheet prints blank, so the frame is
 * given until every image reports in, with a ceiling so a broken one cannot hang the print.
 */
async function printInBrowser(html: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;';
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error('no frame document');
    doc.open();
    // A <base> as well as absolute URLs above: a frame written this way has no URL of its own, and
    // anything relative that slips through would silently draw nothing.
    doc.write(typeof document !== 'undefined' ? html.replace('<head>', `<head><base href="${document.baseURI}">`) : html);
    doc.close();
    await Promise.race([
      Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; })))),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  } finally {
    // The dialog is modal in some browsers and not in others, so the frame outlives the call by a
    // generous margin rather than being torn down under a dialog that is still reading from it.
    setTimeout(() => frame.remove(), 60_000);
  }
}

/**
 * Make the PDF and hand it over.
 *
 * A phone writes a real file and puts it through the share sheet, so it can go straight into a chat
 * or a drive. A browser prints, where Save as PDF is the destination.
 */
export async function shareCardsPdf(cards: PdfCard[], name: string): Promise<void> {
  const html = cardsPdfHtml(cards);
  if (Platform.OS === 'web') return printInBrowser(html);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Print = require('expo-print') as typeof import('expo-print');
  // Points, at 72 to the inch: US Letter is 612 x 792.
  const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Print ${name}`, UTI: 'com.adobe.pdf' });
}
