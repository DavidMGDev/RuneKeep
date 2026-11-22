/**
 * The table's right-click menu (v0.50.0, owner: icons, and "more personalized to each different interaction").
 *
 * Every menu on both tables is this one: what was clicked across the top, the things done most as a row of icon
 * buttons, then the rest, one compact line each with its icon. It is named for what it belongs to and holds only that
 * thing's rows. Red is only ever something destroyed, so a pointed-at row lights in gold.
 */
import { Fragment, type ReactElement, useLayoutEffect, useRef, useState } from 'react';

import { MENU_ICON } from './menu-icons';
import { cue } from './table-sound';
import { Chamfer, Glyph, T } from './table-ui';

export type MenuIcon = string | ReactElement;

export interface TableRow {
  label: string;
  /** Markup in a 24-unit box (`MENU_ICON`, `DIE_ICON`, `DIE_GLYPHS`), or a drawing of its own (a deck's). */
  icon: MenuIcon;
  onPress?: () => void;
  /** An icon button in the row across the top, under this shorter name. The whole label is still its name. */
  quick?: boolean;
  short?: string;
  /** At its right: what it is now. */
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  /** Starts a group. */
  gap?: boolean;
  hidden?: boolean;
  /** Opens these beside it. */
  rows?: TableRow[];
  /** Said where a submenu has nothing to show. */
  say?: string;
  /** Asked, in the menu, before it happens. */
  confirm?: Confirm;
  /** A bin at the end of the row, for what the row stands for. */
  remove?: { label: string; onPress: () => void; confirm: Confirm };
}

interface Confirm { title: string; body: string; verb: string }

export interface MenuSpec {
  /** What was right clicked. Bare felt has no name. */
  title?: string;
  icon?: MenuIcon;
  /** Its state, quietly, beside the name. */
  detail?: string;
  /** A line under the name. */
  say?: string;
  rows: TableRow[];
}

const W = 264;
const EDGE = 8;

const CSS = `
.rk-menu { outline: none; }
:where(.rk-menu button) { all: unset; box-sizing: border-box; cursor: pointer; }
.rk-menu button:disabled { cursor: default; opacity: 0.4; }
.rk-menu-row { display: flex; align-items: center; gap: 10px; width: 100%; height: 30px; padding: 0 9px; color: ${T.ivory}; font-family: ${T.bold}; font-size: 13px; }
.rk-menu-cell { flex: 1; min-width: 0; height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: ${T.ivory}; font-family: ${T.bold}; font-size: 11.5px; }
.rk-menu-ico { flex-shrink: 0; width: 17px; height: 17px; display: flex; align-items: center; justify-content: center; color: ${T.goldText}; }
.rk-menu-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rk-menu-value { color: ${T.muted}; font-family: ${T.medium}; font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.rk-menu button:not(:disabled):hover, .rk-menu button[aria-expanded="true"] { background: rgba(224,181,99,0.16); }
.rk-menu button:not(:disabled):hover .rk-menu-ico, .rk-menu button[aria-expanded="true"] .rk-menu-ico { color: ${T.goldBright}; }
.rk-menu button:not(:disabled):hover .rk-menu-value { color: ${T.ivory}; }
.rk-menu button[data-danger], .rk-menu button[data-danger] .rk-menu-ico { color: #E2705A; }
.rk-menu button[data-danger]:not(:disabled):hover { background: ${T.red}; color: ${T.ivory}; }
.rk-menu button[data-danger]:not(:disabled):hover .rk-menu-ico { color: ${T.ivory}; }
[data-table-root] .rk-menu[role="menu"] button:focus-visible { outline: 1.5px solid ${T.goldBright}; outline-offset: -2px; }
.rk-menu-pop { animation: rk-menu-in 110ms ${T.ease}; }
@keyframes rk-menu-in { from { opacity: 0; } }
@media (pointer: coarse) { .rk-menu-row, .rk-menu-cell { height: 44px; } }
@media (prefers-reduced-motion: reduce) { .rk-menu-pop { animation: none; } }
`;

function Icon({ icon, size = 16 }: { icon: MenuIcon; size?: number }) {
  return <span className="rk-menu-ico" aria-hidden="true">{typeof icon === 'string' ? <Glyph d={icon} size={size} color="currentColor" /> : icon}</span>;
}

/** Rows in their groups: a run of icon buttons is one, and a `gap` starts another. */
function groupsOf(rows: TableRow[]): TableRow[][] {
  const out: TableRow[][] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (!last || r.gap || !!last[0].quick !== !!r.quick) out.push([r]);
    else last.push(r);
  }
  return out;
}

/** A click's place on the table. A key's has none. */
function spotOf(e: React.MouseEvent<HTMLElement>): { x: number; y: number } | undefined {
  const t = e.detail ? e.currentTarget.closest('[data-table-root]')?.getBoundingClientRect() : undefined;
  return t ? { x: e.clientX - t.left, y: e.clientY - t.top } : undefined;
}

const Rule = () => <div role="separator" style={{ height: 1, margin: '2px 6px', background: 'rgba(218,162,73,0.24)' }} />;

function Rows({ rows, open, flip, onUse, onRemove, onOver }: {
  rows: TableRow[];
  open?: string;
  /** Its submenu opens on the left. */
  flip?: boolean;
  /** `click` is where, on the table; none when a key did it. */
  onUse: (r: TableRow, el: HTMLElement, click?: { x: number; y: number }) => void;
  onRemove: (r: TableRow, click?: { x: number; y: number }) => void;
  onOver: (r: TableRow, el: HTMLElement) => void;
}) {
  const over = (r: TableRow) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!r.disabled) cue('ui:hover', 'floatMenuHighlight', { volume: 0.4 });
    onOver(r, e.currentTarget);
  };
  return (
    <>
      {groupsOf(rows).map((group, g) => (
        <Fragment key={g}>
          {g ? <Rule /> : null}
          {group[0].quick ? (
            <div role="group" style={{ display: 'flex', gap: 2 }}>
              {group.map((r) => (
                <button key={r.label} type="button" role="menuitem" tabIndex={-1} className="rk-menu-cell" aria-label={r.value ? `${r.label}, now ${r.value}` : r.label} title={r.label}
                  disabled={r.disabled} data-danger={r.danger ? '' : undefined} onPointerEnter={over(r)} onClick={(e) => onUse(r, e.currentTarget, spotOf(e))}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, height: 18 }}>
                    <Icon icon={r.icon} size={17} />
                    {r.value ? <span style={{ fontFamily: T.display, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{r.value}</span> : null}
                  </span>
                  <span style={{ maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.short ?? r.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div role="group">
              {group.map((r) => (
                <div key={r.label} role="none" style={{ display: 'flex', alignItems: 'center' }}>
                  <button type="button" role={r.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={r.checked} tabIndex={-1} className="rk-menu-row" style={{ flex: 1, minWidth: 0 }}
                    aria-haspopup={r.rows ? 'menu' : undefined} aria-expanded={r.rows ? open === r.label : undefined} title={r.label}
                    disabled={r.disabled} data-danger={r.danger ? '' : undefined} onPointerEnter={over(r)} onClick={(e) => onUse(r, e.currentTarget, spotOf(e))}>
                    <Icon icon={r.icon} />
                    <span className="rk-menu-text">{r.label}</span>
                    {r.value ? <span className="rk-menu-value">{r.value}</span> : null}
                    {r.checked ? <Icon icon={MENU_ICON.check} size={14} /> : null}
                    {r.rows ? <Icon icon={flip ? MENU_ICON.prev : MENU_ICON.next} size={14} /> : null}
                  </button>
                  {r.remove ? (
                    <button type="button" role="menuitem" tabIndex={-1} aria-label={r.remove.label} title={r.remove.label} data-danger="" onClick={(e) => onRemove(r, spotOf(e))}
                      style={{ height: 30, width: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon icon={MENU_ICON.bin} size={14} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Fragment>
      ))}
    </>
  );
}

/** What can be moved to with the arrows in one menu, never what is in its submenu. */
const itemsIn = (menu: HTMLElement | null | undefined): HTMLButtonElement[] =>
  menu ? [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')] : [];

export function ContextMenu({ x, y, tableW, tableH, menu, onClose }: { x: number; y: number; tableW: number; tableH: number; menu: MenuSpec; onClose: () => void }) {
  const [asking, setAsking] = useState<{ confirm: Confirm; run: () => void; /** Where it was clicked, when it was. */ from?: { x: number; y: number } } | null>(null);
  const [sub, setSub] = useState<{ label: string; top: number; focus: boolean } | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const [subTop, setSubTop] = useState(0);
  const main = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLDivElement>(null);
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ask = (confirm: Confirm, run: () => void, from?: { x: number; y: number }) => { setSub(null); setAsking({ confirm, run, from }); };
  const shown: MenuSpec = asking
    ? {
        title: asking.confirm.title,
        say: asking.confirm.body,
        icon: MENU_ICON.bin,
        rows: [{ label: 'Cancel', icon: MENU_ICON.keep }, { label: asking.confirm.verb, icon: MENU_ICON.bin, danger: true, onPress: asking.run }],
      }
    : menu;
  const rows = shown.rows.filter((r) => !r.hidden);
  const subRow = sub ? rows.find((r) => r.label === sub.label) : undefined;

  // A submenu goes right, or left, or where neither fits under its row, over its menu: never under the pointer.
  const rightFits = !at || at.left + W * 2 + 2 <= tableW - EDGE;
  const flip = !rightFits && !!at && at.left - W - 2 >= EDGE;
  const stacked = !rightFits && !flip;

  // Put by the pointer once its size is known: turned to the other side of it, or pulled up, rather than off the table.
  useLayoutEffect(() => {
    const el = main.current;
    if (!el) return;
    // A question opens beside the click that asked it, never under it: a second click in place confirms nothing.
    const from = asking?.from;
    const px = from?.x ?? x, py = from ? from.y - 14 : y, gap = from ? 10 : 4;
    const left = px + gap + W > tableW - EDGE ? Math.max(EDGE, px - gap - W) : px + gap;
    setAt({ left, top: Math.max(EDGE, Math.min(py + 4, tableH - EDGE - el.offsetHeight)) });
  }, [x, y, tableW, tableH, asking, rows.length]);
  useLayoutEffect(() => {
    const el = side.current;
    if (!el || !sub || !at) return;
    const room = tableH - EDGE - el.offsetHeight - at.top;
    // Over its own menu it hangs below its row, or stands above it where there is no room below.
    const top = !stacked ? Math.min(sub.top - 6, room) : sub.top + 32 <= room ? sub.top + 32 : sub.top - el.offsetHeight - 2;
    setSubTop(Math.max(EDGE - at.top, top));
    if (sub.focus) itemsIn(el.querySelector<HTMLElement>('[role="menu"]'))[0]?.focus();
  }, [sub, at, tableH, stacked]);

  // The keyboard is the menu's while it is open, and goes back where it was unless what was picked took it.
  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const root = main.current;
    return () => {
      if (leave.current) clearTimeout(leave.current);
      const now = document.activeElement;
      if ((!now || now === document.body || root?.parentElement?.contains(now)) && before?.isConnected) before.focus?.({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    if (!at) return;
    const list = main.current?.querySelector<HTMLElement>('[role="menu"]');
    if (!list) return;
    // A question opens on its safe answer. A menu opens with nothing lit: the arrows start from the top.
    if (asking) itemsIn(list)[0]?.focus();
    else if (!main.current?.parentElement?.contains(document.activeElement)) list.focus({ preventScroll: true });
  }, [at, asking]);

  const topOf = (el: HTMLElement) => el.getBoundingClientRect().top - (main.current?.getBoundingClientRect().top ?? 0);
  const use = (r: TableRow, el: HTMLElement, click?: { x: number; y: number }) => {
    if (r.rows) { setSub({ label: r.label, top: topOf(el), focus: !click }); return; }
    if (r.confirm && r.onPress) { cue('ui:tap', 'buttonTap', { volume: 0.4 }); ask(r.confirm, r.onPress, click); return; }
    onClose();
    r.onPress?.();
  };
  const remove = (r: TableRow, click?: { x: number; y: number }) => { if (r.remove) { cue('ui:tap', 'buttonTap', { volume: 0.4 }); ask(r.remove.confirm, r.remove.onPress, click); } };
  const over = (r: TableRow, el: HTMLElement) => {
    if (leave.current) clearTimeout(leave.current);
    if (r.rows) { setSub({ label: r.label, top: topOf(el), focus: false }); return; }
    // Time to cross the rows between on the way into a submenu.
    if (sub) leave.current = setTimeout(() => { if (!side.current?.contains(document.activeElement)) setSub(null); }, 220);
  };
  const stay = () => { if (leave.current) clearTimeout(leave.current); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return; // the table's own Escape shuts it
    // Nothing typed at a menu is also a shortcut of the table's.
    e.stopPropagation();
    if (e.key === 'Tab') { e.preventDefault(); onClose(); return; }
    const target = e.target as HTMLElement;
    const inSub = !!side.current?.contains(target);
    const items = itemsIn((inSub ? side : main).current?.querySelector<HTMLElement>('[role="menu"]'));
    const i = items.indexOf(target as HTMLButtonElement);
    const go = (to: number) => { e.preventDefault(); items[(to + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? items.length - 1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'ArrowRight') {
      if (target.getAttribute('aria-haspopup')) { e.preventDefault(); target.click(); } else if (target.classList.contains('rk-menu-cell')) go(i + 1);
    } else if (e.key === 'ArrowLeft') {
      if (inSub) {
        e.preventDefault();
        main.current?.querySelector<HTMLElement>('[aria-expanded="true"]')?.focus();
        setSub(null);
      } else if (target.classList.contains('rk-menu-cell')) go(i - 1);
    }
  };

  const subLeft = rightFits ? W + 2 : flip ? -W - 2 : tableW - EDGE - W - (at?.left ?? 0);
  return (
    <>
      <style>{CSS}</style>
      <div data-ui="" data-menu-backdrop="" onPointerDown={(e) => { e.stopPropagation(); cue('ui:close', 'floatMenuClose'); onClose(); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} style={{ position: 'absolute', inset: 0, zIndex: 1290 }} />
      <div data-ui="" className="rk-menu-pop" onPointerDown={(e) => e.stopPropagation()} onKeyDown={onKey} onWheel={(e) => e.stopPropagation()}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        style={{ position: 'absolute', zIndex: 1291, left: at?.left ?? 0, top: at?.top ?? 0, width: W, visibility: at ? 'visible' : 'hidden' }}>
        <div ref={main}>
          <Chamfer c={9} fill={T.panelLit} line={T.gold} width={1.3} inner={{ padding: 5 }}>
            <div className="rk-scroll" style={{ maxHeight: tableH - EDGE * 2 - 14, overflowY: 'auto' }}>
              {shown.title ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 28, padding: '1px 9px' }}>
                    {shown.icon ? <Icon icon={shown.icon} /> : null}
                    <span className="rk-menu-text" title={shown.title} style={{ color: T.goldText, fontFamily: T.display, fontSize: 12, lineHeight: '14px', letterSpacing: 0.5, textTransform: 'uppercase', whiteSpace: 'normal', overflowWrap: 'anywhere', maxHeight: 28 }}>{shown.title}</span>
                    {shown.detail ? <span className="rk-menu-value">{shown.detail}</span> : null}
                  </div>
                  {shown.say ? <p style={{ margin: 0, padding: '1px 9px 6px', color: T.ivory, opacity: 0.82, fontFamily: T.medium, fontSize: 12, lineHeight: '16px', overflowWrap: 'anywhere' }}>{shown.say}</p> : null}
                  <Rule />
                </>
              ) : null}
              <div role="menu" aria-label={shown.title ?? 'The table'} tabIndex={-1} className="rk-menu">
                <Rows rows={rows} open={sub?.label} flip={flip} onUse={use} onRemove={remove} onOver={over} />
              </div>
            </div>
          </Chamfer>
        </div>
        {sub && subRow?.rows ? (
          <div ref={side} onPointerEnter={stay} style={{ position: 'absolute', top: subTop, width: W, left: subLeft }}>
            <Chamfer c={9} fill={T.panelLit} line={T.gold} width={1.3} inner={{ padding: 5 }}>
              <div className="rk-scroll" style={{ maxHeight: tableH - EDGE * 2 - 14, overflowY: 'auto' }}>
                <div role="menu" aria-label={subRow.label} tabIndex={-1} className="rk-menu">
                  <Rows rows={subRow.rows} onUse={use} onRemove={remove} onOver={stay} />
                </div>
                {subRow.say ? <p style={{ margin: 0, padding: '5px 9px 6px', color: T.muted, fontFamily: T.medium, fontSize: 12, lineHeight: '16px' }}>{subRow.say}</p> : null}
              </div>
            </Chamfer>
          </div>
        ) : null}
      </div>
    </>
  );
}
