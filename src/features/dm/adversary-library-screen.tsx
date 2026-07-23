/**
 * Adversary Library (v0.17.0; reworked v0.18.0) — a full-screen browser (not a panel) over the DM's own
 * saved adversaries, the complete Base Game roster, and The Void pack, each in its own COLLAPSIBLE section
 * (item 4/7) — custom first, then Base Game, then The Void; only custom entries can be selected/deleted.
 * Gallery-style filter chips (tier / type / damage / trait) + name search; each row shows Tier · Type · HP ·
 * damage. Tap an entry to read its (scrollable) full stat block and choose how many to spawn (item 5).
 * Android back closes the preview, then the library, before touching navigation (item 3).
 */
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, Text, TextInput, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { Body, Display, DmRune } from '@/constants/theme';
import { ADVERSARY_ROLES, ADVERSARY_TAGS, BASE_ADVERSARIES, type AdversaryRole, type BaseAdversary } from '@/data/adversaries';
import { VOID_ADVERSARIES } from '@/data/void-adversaries';
import { baseToCombatant, type SavedAdversary } from '@/lib/adversary-library';
import { type Combatant } from '@/lib/session';
import { playSfx } from '@/lib/sfx';
import { AdversaryImageViewer, AdversaryPortrait, StatBlockDetail } from './adversary-detail';
import { AdversaryInfoPanel } from './adversary-info';
import { DmModal } from './dm-ui';
import { useAndroidBack } from './use-android-back';
import { useSelection } from './use-selection';

type Mode = 'adversary' | 'ally' | 'browse';
type Source = 'custom' | 'base' | 'void';
type Item = { key: string; name: string; combatant: Combatant; tier?: number; role?: AdversaryRole; hp: number; damage: string; damageType?: 'Physical' | 'Magic'; tags: string[]; source: Source };

interface Filters { tiers: Set<number>; roles: Set<AdversaryRole>; damage: Set<'Physical' | 'Magic'>; tags: Set<string> }
const EMPTY: Filters = { tiers: new Set(), roles: new Set(), damage: new Set(), tags: new Set() };

function baseItem(b: BaseAdversary, source: Source): Item {
  return { key: `${source}-${b.id}`, name: b.name, combatant: baseToCombatant(b), tier: b.tier, role: b.role, hp: b.hp, damage: b.attackDamage, damageType: b.damageType, tags: b.tags, source };
}
function savedItem(s: SavedAdversary): Item {
  return { key: `custom-${s.id}`, name: s.name, combatant: s, tier: s.tier, role: s.role, hp: s.maxHp ?? s.hp ?? 0, damage: s.attack?.damage ?? '', damageType: s.damageType, tags: [], source: 'custom' };
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={() => { playSfx('buttonTap'); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label} hitSlop={4}>
      <ChamferBox chamfer={6} fill={on ? DmRune.accent : 'transparent'} stroke={on ? 'transparent' : DmRune.line} strokeWidth={1.1} style={{ height: 30, justifyContent: 'center', paddingHorizontal: 11 }}>
        <Text style={{ color: on ? DmRune.ink : DmRune.text, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.7, textTransform: 'uppercase' }}>{label}</Text>
      </ChamferBox>
    </Pressable>
  );
}

function Stepper({ n, onChange }: { n: number; onChange: (n: number) => void }) {
  const btn = (delta: number, label: string) => (
    <Pressable onPress={() => onChange(Math.max(1, Math.min(20, n + delta)))} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <ChamferBox chamfer={6} fill="rgba(20,24,30,0.9)" stroke={DmRune.line} strokeWidth={1.2} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: DmRune.accent, fontSize: 22, fontFamily: Display.black }}>{delta > 0 ? '+' : '–'}</Text>
      </ChamferBox>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {btn(-1, 'Fewer')}
      <Text style={{ color: DmRune.ivory, fontSize: 26, fontFamily: Display.black, minWidth: 40, textAlign: 'center' }}>{n}</Text>
      {btn(1, 'More')}
    </View>
  );
}

/** The detail / spawn sheet for one selected adversary. Scrollable stat block (item 5). */
function DetailSheet({ item, mode, onSpawn, onViewImage, onClose }: { item: Item; mode: Mode; onSpawn: (c: Combatant, count: number) => void; onViewImage: () => void; onClose: () => void }) {
  const [count, setCount] = useState(1);
  const c = item.combatant;
  const spawnLabel = mode === 'ally' ? `Spawn Ally ×${count}` : `Spawn ×${count}`;
  return (
    <DmModal onClose={onClose}>
      <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: 344, maxHeight: 640, padding: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <AdversaryPortrait uri={c.portraitUri} size={48} tint={item.source === 'custom' ? DmRune.line : DmRune.accentDim} onPress={onViewImage} />
          <FitLine style={{ flex: 1, color: DmRune.ivory, fontSize: 18, fontFamily: Display.black, letterSpacing: 0.6, textTransform: 'uppercase' }}>{c.name}</FitLine>
        </View>
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator nestedScrollEnabled contentContainerStyle={{ paddingBottom: 4 }}>
          <StatBlockDetail c={c} />
        </ScrollView>
        {mode !== 'browse' ? (
          <View style={{ gap: 12, marginTop: 14, borderTopWidth: 1, borderTopColor: DmRune.line, paddingTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: DmRune.muted, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>How many?</Text>
              <Stepper n={count} onChange={setCount} />
            </View>
            <RuneButton label={spawnLabel} kind="primary" height={46} dm onPress={() => onSpawn(c, count)} />
          </View>
        ) : (
          <View style={{ marginTop: 14 }}><RuneButton label="Close" kind="secondary" height={44} dm onPress={onClose} /></View>
        )}
      </ChamferBox>
    </DmModal>
  );
}

export function AdversaryLibrary({ mode = 'browse', savedList, onSpawn, onDeleteSaved, onClose }: {
  mode?: Mode;
  savedList: SavedAdversary[];
  onSpawn?: (c: Combatant, count: number) => void;
  onDeleteSaved?: (ids: Set<string>) => void;
  onClose: () => void;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [detail, setDetail] = useState<Item | null>(null);
  const [info, setInfo] = useState(false);
  const [viewImage, setViewImage] = useState<Item | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Set<string> | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sel = useSelection();

  // Android back closes the library overlay (or preview via the DmModal handler) instead of popping nav.
  useAndroidBack(() => { onClose(); return true; });

  const toggle = <T,>(set: Set<T>, v: T): Set<T> => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };
  const match = useCallback((it: Item) => {
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filters.tiers.size && !(it.tier && filters.tiers.has(it.tier))) return false;
    if (filters.roles.size && !(it.role && filters.roles.has(it.role))) return false;
    if (filters.damage.size && !(it.damageType && filters.damage.has(it.damageType))) return false;
    if (filters.tags.size && !it.tags.some((t) => filters.tags.has(t))) return false;
    return true;
  }, [search, filters]);

  const baseItems = useMemo(() => BASE_ADVERSARIES.map((b) => baseItem(b, 'base')), []);
  const voidItems = useMemo(() => VOID_ADVERSARIES.map((b) => baseItem(b, 'void')), []);
  const savedItems = useMemo(() => savedList.map(savedItem), [savedList]);

  const sections = useMemo(() => {
    const build = (title: string, key: string, items: Item[]) => {
      const filtered = items.filter(match);
      const isCollapsed = collapsed.has(key);
      return { title, key, count: filtered.length, collapsed: isCollapsed, data: isCollapsed ? [] : filtered };
    };
    const out = [];
    const yours = savedItems.filter(match);
    if (yours.length || savedItems.length) out.push(build('Your Adversaries', 'custom', savedItems));
    out.push(build('Base Game', 'base', baseItems));
    out.push(build('The Void', 'void', voidItems));
    return out;
  }, [savedItems, baseItems, voidItems, match, collapsed]);

  const activeCount = filters.tiers.size + filters.roles.size + filters.damage.size + filters.tags.size;

  const doSpawn = useCallback((c: Combatant, count: number) => {
    onSpawn?.(c, count);
    setDetail(null);
    playSfx('buttonTap');
    showToast(`Spawned ${count > 1 ? count + ' × ' : ''}${c.name}`, 'success');
    onClose();
  }, [onSpawn, onClose]);

  const title = mode === 'adversary' ? 'Spawn Adversary' : mode === 'ally' ? 'Spawn Ally' : 'Adversary Library';

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 350, backgroundColor: DmRune.ink }}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Svg width={22} height={22} viewBox="0 0 22 22"><Polyline points="13,4 6,11 13,18" fill="none" stroke={DmRune.accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </Pressable>
          <Text style={{ flex: 1, color: DmRune.ivory, fontSize: 18, fontFamily: Display.black, letterSpacing: 1.5, textTransform: 'uppercase' }}>{title}</Text>
          <Pressable onPress={() => setInfo(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Adversary reference">
            <Svg width={22} height={22} viewBox="0 0 22 22"><Polyline points="11,2 18,6.5 18,15.5 11,20 4,15.5 4,6.5 11,2" fill="none" stroke={DmRune.accentDim} strokeWidth={1.4} strokeLinejoin="round" /><Line x1={11} y1={6} x2={11} y2={6.4} stroke={DmRune.accent} strokeWidth={2.6} strokeLinecap="round" /><Line x1={11} y1={9.5} x2={11} y2={15.5} stroke={DmRune.accent} strokeWidth={2.2} strokeLinecap="round" /></Svg>
          </Pressable>
          <Pressable onPress={() => { playSfx('buttonTap'); setDrawer((o) => !o); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Filters, ${activeCount} active`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Svg width={16} height={14} viewBox="0 0 18 16"><Line x1={1} y1={3} x2={17} y2={3} stroke={DmRune.accent} strokeWidth={2} /><Line x1={4} y1={8} x2={14} y2={8} stroke={DmRune.accent} strokeWidth={2} /><Line x1={7} y1={13} x2={11} y2={13} stroke={DmRune.accent} strokeWidth={2} /></Svg>
            {activeCount ? <Text style={{ color: DmRune.accent, fontSize: 11, fontFamily: Body.bold }}>{activeCount}</Text> : null}
          </Pressable>
        </View>

        <ChamferBox chamfer={8} fill="rgba(20,24,30,0.9)" stroke={DmRune.line} strokeWidth={1.1} style={{ height: 42, justifyContent: 'center', paddingHorizontal: 12, marginBottom: 10 }}>
          <TextInput value={search} onChangeText={setSearch} placeholder="Search adversaries…" placeholderTextColor={DmRune.muted} style={{ color: DmRune.text, fontSize: 15, fontFamily: Body.semibold }} />
        </ChamferBox>

        {drawer ? (
          <ChamferBox chamfer={10} fill="rgba(14,17,22,0.96)" stroke={DmRune.line} strokeWidth={1.2} style={{ padding: 10, marginBottom: 10, gap: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[1, 2, 3, 4].map((t) => <Chip key={t} label={`Tier ${t}`} on={filters.tiers.has(t)} onPress={() => setFilters((f) => ({ ...f, tiers: toggle(f.tiers, t) }))} />)}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ADVERSARY_ROLES.map((r) => <Chip key={r} label={r} on={filters.roles.has(r)} onPress={() => setFilters((f) => ({ ...f, roles: toggle(f.roles, r) }))} />)}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(['Physical', 'Magic'] as const).map((d) => <Chip key={d} label={d} on={filters.damage.has(d)} onPress={() => setFilters((f) => ({ ...f, damage: toggle(f.damage, d) }))} />)}
              {ADVERSARY_TAGS.map((t) => <Chip key={t} label={t} on={filters.tags.has(t)} onPress={() => setFilters((f) => ({ ...f, tags: toggle(f.tags, t) }))} />)}
            </View>
            {activeCount ? <Pressable onPress={() => setFilters(EMPTY)} hitSlop={6}><Text style={{ color: DmRune.muted, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 }}>Clear filters</Text></Pressable> : null}
          </ChamferBox>
        ) : null}

        <SectionList
          sections={sections}
          keyExtractor={(it) => it.key}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}
          renderSectionHeader={({ section }) => (
            <Pressable onPress={() => { playSfx('buttonTap'); setCollapsed((s) => { const n = new Set(s); if (n.has(section.key)) n.delete(section.key); else n.add(section.key); return n; }); }} accessibilityRole="button" accessibilityState={{ expanded: !section.collapsed }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 2 }}>
              <Svg width={13} height={13} viewBox="0 0 16 16" style={{ transform: [{ rotate: section.collapsed ? '0deg' : '90deg' }] }}><Polyline points="5,3 11,8 5,13" fill="none" stroke={DmRune.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
              <Text style={{ color: DmRune.accentDim, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>{section.title} · {section.count}</Text>
            </Pressable>
          )}
          renderItem={({ item }) => {
            const on = sel.ids.has(item.key);
            const selectable = item.source === 'custom';
            return (
              <Pressable
                onPress={() => (sel.selecting ? (selectable ? sel.toggle(item.key) : undefined) : setDetail(item))}
                onLongPress={() => selectable && (sel.selecting ? sel.toggle(item.key) : sel.start(item.key))}
                delayLongPress={340}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, tier ${item.tier ?? '?'} ${item.role ?? ''}`}>
                <ChamferBox chamfer={10} fill={on ? 'rgba(196,200,208,0.16)' : 'rgba(16,18,24,0.92)'} stroke={on ? DmRune.accent : DmRune.line} strokeWidth={on ? 1.8 : 1.1} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9 }}>
                  <AdversaryPortrait uri={item.combatant.portraitUri} size={38} tint={selectable ? DmRune.line : DmRune.accentDim} />
                  <View style={{ flex: 1 }}>
                    <FitLine style={{ color: DmRune.ivory, fontSize: 14.5, fontFamily: Display.black, letterSpacing: 0.4, textTransform: 'uppercase' }}>{item.name}</FitLine>
                    <Text style={{ color: DmRune.muted, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 2 }}>
                      {item.tier ? `T${item.tier} · ` : ''}{item.role ? `${item.role} · ` : ''}HP {item.hp}{item.damage ? ` · ${item.damage}` : ''}
                    </Text>
                  </View>
                  {sel.selecting && selectable ? (
                    <ChamferBox chamfer={4} fill={on ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <Svg width={12} height={12} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
                    </ChamferBox>
                  ) : (
                    <Svg width={12} height={12} viewBox="0 0 16 16"><Polyline points="5,3 11,8 5,13" fill="none" stroke={DmRune.accentDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
                  )}
                </ChamferBox>
              </Pressable>
            );
          }}
        />
      </View>

      {sel.selecting ? (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 16 }}>
          <ChamferBox chamfer={10} fill="rgba(20,24,30,0.98)" stroke={DmRune.accent} strokeWidth={1.4} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text style={{ flex: 1, color: DmRune.accent, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{sel.ids.size} selected</Text>
            <RuneButton label={`Delete ${sel.ids.size}`} kind="primary" height={34} dense dm onPress={() => setConfirmDelete(new Set([...sel.ids].map((k) => k.replace(/^custom-/, ''))))} />
            <RuneButton label="Cancel" kind="ghost" height={34} dense dm onPress={sel.clear} />
          </ChamferBox>
        </View>
      ) : null}

      {detail ? <DetailSheet item={detail} mode={mode} onSpawn={doSpawn} onViewImage={() => setViewImage(detail)} onClose={() => setDetail(null)} /> : null}
      {viewImage ? <AdversaryImageViewer uri={viewImage.combatant.portraitUri} name={viewImage.name} onClose={() => setViewImage(null)} /> : null}
      {info ? <AdversaryInfoPanel onClose={() => setInfo(false)} /> : null}
      {confirmDelete ? (
        <PopupDialog title="Delete saved adversaries?" body={`${confirmDelete.size} saved adversary(ies) will be removed from your library. Base Game and Void adversaries are never affected.`} confirmLabel="Delete" destructive
          onConfirm={() => { onDeleteSaved?.(confirmDelete); setConfirmDelete(null); sel.clear(); showToast('Deleted', 'success'); }}
          onCancel={() => setConfirmDelete(null)} />
      ) : null}
    </View>
  );
}
