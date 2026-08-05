import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polygon, Polyline } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { LoadingScreen } from '@/components/loading-screen';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { classColor, classInfo } from '@/constants/identity';
import { Body, Display, Rune } from '@/constants/theme';
import { type CharacterFile } from '@/lib/character-file';
import { deleteCharacter, exportCharacter, listCharacters, pickCharacterFiles, saveCharacter } from '@/lib/character-store';
import { seedOfficialExpansions } from '@/lib/expansions';
import { addFolder, assign, EMPTY_INDEX, type Folder, type FolderIndex, loadFolders, recolorFolder, removeFolder, renameFolder, saveFolders, setCollapsed as setCollapsedIn } from '@/lib/folders';
import { asCopy, asUpdate, planImports } from '@/lib/import-characters';
import { markMemberUpdated } from '@/lib/party';
import { listParties, saveParty } from '@/lib/party-store';
import { type Expansion, isEnabledForCreation } from '@/lib/library';
import { listExpansions } from '@/lib/library-store';
import { playSfx } from '@/lib/sfx';
import { showToast } from '@/components/toast';
import { NameDialog } from '@/features/dm/dm-ui';
import { BASE_PICK_ID, ExpansionPicker } from '@/features/create/expansion-picker';
import { DimScreen } from '@/lib/screen-dim';

function PortraitWell({ uri, tint }: { uri: string | null; tint: string }) {
  return (
    <ChamferBox chamfer={8} fill={Rune.ink} stroke={tint} strokeWidth={1.4} style={{ width: 58, height: 58, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: 58, height: 58 }} resizeMode="cover" />
      ) : (
        <Svg width={26} height={26} viewBox="0 0 26 26">
          <Polygon points="13,2 23,12 23,14 13,24 3,14 3,12" fill="none" stroke={Rune.goldEdge} strokeWidth={1.6} strokeLinejoin="miter" />
        </Svg>
      )}
    </ChamferBox>
  );
}

function CharacterRow({ file, onOpen, onLongPress }: { file: CharacterFile; onOpen: () => void; onLongPress: () => void }) {
  const cls = classInfo(file.className);
  const tint = classColor(file.className);
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onLongPress}
      delayLongPress={380}
      accessibilityRole="button"
      accessibilityLabel={`${file.name}, level ${file.level} ${cls.label}. Hold for actions`}>
      {({ pressed }) => (
        <ChamferBox
          chamfer={12}
          fill={pressed ? 'rgba(20,24,31,0.95)' : 'rgba(14,17,22,0.9)'}
          stroke="rgba(218,162,73,0.5)"
          strokeWidth={1.3}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12 }}>
          <PortraitWell uri={file.portraitUri} tint={tint.bright} />
          <View style={{ flex: 1 }}>
            <FitLine style={{ color: Rune.ivory, fontSize: 18, fontFamily: Display.black, letterSpacing: 0.8, textTransform: 'uppercase' }}>{file.name}</FitLine>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={{ width: 8, height: 8, backgroundColor: tint.bright, transform: [{ rotate: '45deg' }] }} />
              <Text style={{ color: Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                Lvl {file.level} {cls.label}
              </Text>
            </View>
          </View>
          <Svg width={14} height={14} viewBox="0 0 16 16">
            <Line x1={4} y1={2} x2={12} y2={8} stroke={Rune.goldEdge} strokeWidth={2} />
            <Line x1={12} y1={8} x2={4} y2={14} stroke={Rune.goldEdge} strokeWidth={2} />
          </Svg>
        </ChamferBox>
      )}
    </Pressable>
  );
}

/** A folder group header (v0.15.0, PRD #6/#7): colour + name + count, tap to collapse, hold for actions. */
function FolderHeader({ folder, count, collapsed, onToggle, onActions }: { folder: Folder; count: number; collapsed: boolean; onToggle: () => void; onActions: () => void }) {
  return (
    <Pressable onPress={onToggle} onLongPress={onActions} delayLongPress={380} accessibilityRole="button" accessibilityLabel={`Folder ${folder.name}, ${count} characters. Hold for actions`} style={{ marginTop: 6, marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
        {/* v0.23.0: the rotated square needs a container as wide as its DIAGONAL, or its left tip
            bleeds past the row and under the screen border. */}
        <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 12, height: 12, backgroundColor: folder.color, transform: [{ rotate: '45deg' }] }} />
        </View>
        <FitLine style={{ flex: 1, color: Rune.ivory, fontSize: 14, fontFamily: Display.black, letterSpacing: 1.4, textTransform: 'uppercase' }}>{folder.name}</FitLine>
        <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.bold }}>{count}</Text>
        <Svg width={13} height={13} viewBox="0 0 16 16" style={{ transform: [{ rotate: collapsed ? '0deg' : '90deg' }] }}>
          <Polyline points="5,3 11,8 5,13" fill="none" stroke={Rune.goldEdge} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <View style={{ height: 1, backgroundColor: 'rgba(218,162,73,0.28)' }} />
    </Pressable>
  );
}

interface Section { key: string; folder: Folder | null; all: CharacterFile[]; data: CharacterFile[] }

/** The roster: saved characters as files, groupable into folders. Tap = play; hold = actions; import brings a friend's file in. */
export function RosterScreen() {
  const router = useRouter();
  const [files, setFiles] = useState<CharacterFile[] | null>(null);
  const [index, setIndex] = useState<FolderIndex>(EMPTY_INDEX);
  /**
   * Which groups are collapsed, DERIVED from the persisted index (v0.27.2).
   *
   * This used to be a second copy of the same fact, held in component state and initialised to an
   * empty Set on every mount. The folder store had been saving the collapsed flag correctly since
   * v0.23.0; nothing ever read it back. So every arrival at this screen, from the menu, from a
   * character sheet, from a fresh launch, drew every group open, and the first toggle after that
   * wrote that wrong state back over the good one. A roster the player had tidied would not stay
   * tidy for the length of one navigation.
   *
   * One source of truth, and the thing on disk is it.
   */
  const collapsed = useMemo(() => new Set(index.collapsed ?? []), [index.collapsed]);
  const [actionsFor, setActionsFor] = useState<CharacterFile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CharacterFile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  /** v0.35: an incoming character whose id is already on the roster, waiting on update-or-copy. */
  const [collision, setCollision] = useState<CharacterFile | null>(null);
  const [movingChar, setMovingChar] = useState<CharacterFile | null>(null);
  const [folderActions, setFolderActions] = useState<Folder | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  // v0.23.0: a character's name was fixed at creation with no way to change it, which is a strange
  // thing to be permanent when everything else about them can be edited.
  const [renamingChar, setRenamingChar] = useState<CharacterFile | null>(null);
  const [newFolder, setNewFolder] = useState(false);
  const [pickerExps, setPickerExps] = useState<Expansion[] | null>(null);

  const onNewCharacter = useCallback(() => {
    playSfx('buttonTap');
    seedOfficialExpansions()
      .catch(() => {})
      .then(() => listExpansions())
      .then(setPickerExps)
      .catch(() => setPickerExps([]));
  }, []);

  const reload = useCallback(() => {
    let live = true;
    void Promise.all([listCharacters(), loadFolders()]).then(([all, idx]) => { if (live) { setFiles(all); setIndex(idx); } });
    return () => { live = false; };
  }, []);
  useFocusEffect(reload);

  const commitIndex = useCallback((next: FolderIndex) => { setIndex(next); void saveFolders(next); }, []);

  /**
   * Record that a character's sheet has been REPLACED, everywhere it matters (v0.35, owner).
   *
   * A DM's per-character modifiers went with the old sheet (`asUpdate` strips them). Party-wide
   * modifiers are the table's, not one character's, so they survive until every member has handed in
   * a new sheet, and then they go with a word about it rather than silently.
   */
  const notePartyUpdate = useCallback(async (charId: string) => {
    let cleared: string | null = null;
    for (const p of await listParties()) {
      const r = markMemberUpdated(p, charId);
      if (r.party === p) continue;
      await saveParty(r.party);
      if (r.cleared) cleared = p.name;
    }
    if (cleared) showToast(`Every sheet in ${cleared} is new, so its party effects were removed`, 'success');
  }, []);

  const applyUpdate = useCallback(async (incoming: CharacterFile) => {
    await saveCharacter(asUpdate(incoming));
    await notePartyUpdate(incoming.id);
  }, [notePartyUpdate]);

  const onImport = useCallback(async () => {
    try {
      const incoming = await pickCharacterFiles();
      if (!incoming?.length) return;
      const roster = (files ?? []).map((f) => ({ id: f.id, name: f.name }));
      const plan = planImports(incoming, roster);
      // ONE file that collides is the case where the answer could go either way, so it asks. A
      // selection is a DM collecting the table's sheets, which is an update by definition.
      if (plan.length === 1 && plan[0].collides) { setCollision(plan[0].file); return; }
      let updated = 0;
      for (const p of plan) {
        if (p.collides) { await applyUpdate(p.file); updated += 1; }
        else await saveCharacter(p.file);
      }
      reload();
      const added = plan.length - updated;
      showToast(
        updated && added ? `${updated} updated, ${added} added`
        : updated ? `${updated} character${updated === 1 ? '' : 's'} updated`
        : `${added} character${added === 1 ? '' : 's'} added`,
        'success',
      );
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read that file');
    }
  }, [reload, files, applyUpdate]);

  if (!files) return <LoadingScreen label="Summoning the roster" />;

  // Group characters by folder assignment; unknown/removed folder ids fall back to Ungrouped.
  const folderIds = new Set(index.folders.map((f) => f.id));
  const sections: Section[] = index.folders.map((folder) => {
    const all = files.filter((f) => index.assignments[f.id] === folder.id);
    return { key: folder.id, folder, all, data: collapsed.has(folder.id) ? [] : all };
  });
  const ungrouped = files.filter((f) => { const fid = index.assignments[f.id]; return !fid || !folderIds.has(fid); });
  // A group whose header is not drawn must not be able to hide anything (v0.27.3). Ungrouped has no
  // header when there are no folders at all -- which is exactly the state you land in after deleting
  // your last folder -- so a leftover collapse flag hid every character with nothing left to tap.
  const ungroupedShut = index.folders.length > 0 && collapsed.has('__ungrouped');
  if (ungrouped.length || sections.length) sections.push({ key: '__ungrouped', folder: null, all: ungrouped, data: ungroupedShut ? [] : ungrouped });

  // v0.23.0: persisted, so a roster you tidied stays tidy when you come back.
  const toggle = (key: string) => {
    const next = !collapsed.has(key);
    setIndex((cur) => { const n = setCollapsedIn(cur, key, next); void saveFolders(n); return n; });
  };

  return (
    <AppScreen
      title="Characters"
      onBack={() => router.back()}
      headerRight={
        <Pressable onPress={() => setNewFolder(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="New folder">
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Polygon points="3,6 9,6 11,9 21,9 21,19 3,19" fill="none" stroke={Rune.goldEdge} strokeWidth={1.7} strokeLinejoin="round" />
            <Line x1={12} y1={12} x2={12} y2={16} stroke={Rune.goldBright} strokeWidth={1.8} strokeLinecap="round" />
            <Line x1={10} y1={14} x2={14} y2={14} stroke={Rune.goldBright} strokeWidth={1.8} strokeLinecap="round" />
          </Svg>
        </Pressable>
      }>
      {files.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingBottom: 60 }}>
          <Pressable onPress={onNewCharacter} accessibilityRole="button" accessibilityLabel="Create your first character">
            {({ pressed }) => (
              <ChamferBox
                chamfer={18}
                fill={pressed ? 'rgba(200,27,24,0.16)' : 'rgba(14,17,22,0.9)'}
                stroke={Rune.red}
                strokeWidth={1.8}
                style={{ width: 170, height: 170, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={64} height={64} viewBox="0 0 64 64">
                  <Line x1={32} y1={12} x2={32} y2={52} stroke={Rune.red} strokeWidth={4} />
                  <Line x1={12} y1={32} x2={52} y2={32} stroke={Rune.red} strokeWidth={4} />
                </Svg>
              </ChamferBox>
            )}
          </Pressable>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ color: Rune.ivory, fontSize: 18, fontFamily: Display.black, letterSpacing: 1.5, textTransform: 'uppercase' }}>No heroes yet</Text>
            <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.medium, textAlign: 'center', lineHeight: 19 }}>
              Forge your first character,{'\n'}or import one from a friend.
            </Text>
          </View>
          <RuneButton label="Import a character" kind="ghost" height={42} onPress={onImport} />
        </View>
      ) : (
        <>
          <SectionList
            sections={sections}
            keyExtractor={(f) => f.id}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => {
              const s = section as unknown as Section;
              // Ungrouped needs no header when there are NO folders at all (flat list, as before).
              if (!s.folder) return index.folders.length === 0 ? null : (
                <Pressable onPress={() => toggle('__ungrouped')} accessibilityRole="button" accessibilityLabel={`Ungrouped, ${s.all.length}`} style={{ marginTop: 8, marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                    <Text style={{ flex: 1, color: Rune.muted, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>Ungrouped</Text>
                    <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.bold }}>{s.all.length}</Text>
                    <Svg width={13} height={13} viewBox="0 0 16 16" style={{ transform: [{ rotate: collapsed.has('__ungrouped') ? '0deg' : '90deg' }] }}><Polyline points="5,3 11,8 5,13" fill="none" stroke={Rune.goldEdge} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
                  </View>
                </Pressable>
              );
              return <FolderHeader folder={s.folder} count={s.all.length} collapsed={collapsed.has(s.folder.id)} onToggle={() => toggle(s.folder!.id)} onActions={() => { playSfx('floatMenuOpen'); setFolderActions(s.folder); }} />;
            }}
            renderItem={({ item }) => (
              <View style={{ marginBottom: 12 }}>
                <CharacterRow file={item} onOpen={() => router.push({ pathname: '/sheet', params: { id: item.id } })} onLongPress={() => { playSfx('floatMenuOpen'); setActionsFor(item); }} />
              </View>
            )}
          />
          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 10, paddingBottom: 6 }}>
            <RuneButton label="Import" kind="ghost" height={46} style={{ flex: 1 }} onPress={onImport} />
            <RuneButton label="New character" kind="primary" height={46} style={{ flex: 2 }} onPress={onNewCharacter} />
          </View>
        </>
      )}

      {actionsFor ? (
        <PopupDialog
          title={actionsFor.name}
          body="Share this character as a file, move it to a folder, or remove them from the roster."
          confirmLabel="Share file"
          onConfirm={() => {
            const f = actionsFor;
            setActionsFor(null);
            void exportCharacter(f);
          }}
          onCancel={() => setActionsFor(null)}>
          {/* v0.22.0: Delete used to wear `kind="primary"` — the loudest, reddest treatment in the
              dialog — while the benign Share sat in the confirm slot. Anyone reaching for the visually
              dominant button was reaching for Delete. Destructive actions get the quiet treatment and
              earn their weight in the confirm step instead. */}
          <View style={{ marginTop: 16, gap: 10 }}>
            <RuneButton label="Rename" kind="secondary" height={40} onPress={() => { const f = actionsFor; setActionsFor(null); setRenamingChar(f); }} />
            <RuneButton label="Move to folder" kind="secondary" height={40} onPress={() => { const f = actionsFor; setActionsFor(null); setMovingChar(f); }} />
            <RuneButton
              label="Delete"
              kind="ghost"
              height={40}
              onPress={() => {
                setConfirmDelete(actionsFor);
                setActionsFor(null);
              }}
            />
          </View>
        </PopupDialog>
      ) : null}

      {confirmDelete ? (
        <PopupDialog
          title="Delete character?"
          body={`${confirmDelete.name} will be removed from this device. Exported files are unaffected.`}
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            const f = confirmDelete;
            setConfirmDelete(null);
            playSfx('loseHpDefault');
            void deleteCharacter(f.id).then(() => commitIndex(assign(index, f.id, null))).then(reload);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}

      {collision ? (
        <PopupDialog
          title={`${collision.name} is already here`}
          body="This is the same character, not a new one. Updating replaces their sheet and removes any modifiers you have put on them. A copy leaves the original alone."
          confirmLabel="Cancel"
          cancelLabel="Cancel"
          onConfirm={() => setCollision(null)}
          onCancel={() => setCollision(null)}>
          <View style={{ marginTop: 14, gap: 10 }}>
            <RuneButton label="Update this character" kind="primary" height={44} onPress={() => { const f = collision; setCollision(null); void applyUpdate(f).then(reload); }} />
            <RuneButton
              label="Make a copy"
              kind="secondary"
              height={44}
              onPress={() => {
                const f = collision;
                setCollision(null);
                const roster = (files ?? []).map((c) => ({ id: c.id, name: c.name }));
                const id = `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
                void saveCharacter(asCopy(f, roster, id)).then(reload);
              }}
            />
          </View>
        </PopupDialog>
      ) : null}
      {importError ? (
        <PopupDialog title="Import failed" body={importError} confirmLabel="OK" onConfirm={() => setImportError(null)} onCancel={() => setImportError(null)} />
      ) : null}

      {/* Move-to-folder chooser */}
      {movingChar ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 250, alignItems: 'center', justifyContent: 'center' }]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.82)' }]} onPress={() => setMovingChar(null)} accessibilityRole="button" accessibilityLabel="Dismiss" />
          <DimScreen opacity={0.82} />
          <Pressable onPress={() => {}} accessibilityElementsHidden>
          <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke="rgba(218,162,73,0.6)" strokeWidth={1.5} style={{ width: 312, padding: 20, gap: 8 }}>
            <Text style={{ color: Rune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Move to folder</Text>
            {index.folders.map((fo) => (
              <Pressable key={fo.id} onPress={() => { const c = movingChar; setMovingChar(null); commitIndex(assign(index, c.id, fo.id)); }} accessibilityRole="button" accessibilityLabel={fo.name} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 8, backgroundColor: pressed ? 'rgba(218,162,73,0.12)' : 'transparent', borderRadius: 6 })}>
                <View style={{ width: 11, height: 11, backgroundColor: fo.color, transform: [{ rotate: '45deg' }] }} />
                <Text style={{ flex: 1, color: index.assignments[movingChar.id] === fo.id ? Rune.goldText : Rune.ivory, fontSize: 14, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{fo.name}</Text>
                {index.assignments[movingChar.id] === fo.id ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: Rune.goldBright }} /> : null}
              </Pressable>
            ))}
            <View style={{ marginTop: 6, gap: 8 }}>
              <RuneButton label="Remove from folder" kind="ghost" height={40} onPress={() => { const c = movingChar; setMovingChar(null); commitIndex(assign(index, c.id, null)); }} />
              <RuneButton label="New folder" kind="secondary" height={40} onPress={() => { setMovingChar(null); setNewFolder(true); }} />
            </View>
          </ChamferBox>
          </Pressable>
        </View>
      ) : null}

      {/* Folder actions */}
      {folderActions ? (
        <PopupDialog
          title={folderActions.name}
          body="Rename this folder, re-roll its colour, or remove it (its characters become ungrouped)."
          confirmLabel="Rename"
          onConfirm={() => { const fo = folderActions; setFolderActions(null); setRenamingFolder(fo); }}
          onCancel={() => setFolderActions(null)}>
          <View style={{ marginTop: 16, gap: 10 }}>
            <RuneButton label="Re-roll colour" kind="secondary" height={40} onPress={() => { commitIndex(recolorFolder(index, folderActions.id)); setFolderActions(null); }} />
            <RuneButton label="Remove folder" kind="ghost" height={40} onPress={() => { commitIndex(removeFolder(index, folderActions.id)); setFolderActions(null); }} />
          </View>
        </PopupDialog>
      ) : null}

      {newFolder ? <NameDialog dm={false} title="New Folder" placeholder="Folder name" confirmLabel="Create" onConfirm={(name) => { setNewFolder(false); commitIndex(addFolder(index, name)); }} onCancel={() => setNewFolder(false)} /> : null}
      {renamingChar ? (
        <NameDialog
          dm={false}
          title="Rename character"
          initial={renamingChar.name}
          confirmLabel="Rename"
          onConfirm={(name) => {
            const trimmed = name.trim();
            const target = renamingChar;
            setRenamingChar(null);
            if (!trimmed || !target) return;
            const next = { ...target, name: trimmed };
            void saveCharacter(next)
              .then(() => setFiles((all) => (all ?? []).map((c) => (c.id === next.id ? next : c))))
              .catch(() => showToast('Could not rename that character.', 'error'));
          }}
          onCancel={() => setRenamingChar(null)}
        />
      ) : null}
      {renamingFolder ? <NameDialog dm={false} title="Rename Folder" initial={renamingFolder.name} confirmLabel="Rename" onConfirm={(name) => { commitIndex(renameFolder(index, renamingFolder.id, name)); setRenamingFolder(null); }} onCancel={() => setRenamingFolder(null)} /> : null}

      {pickerExps ? (
        <ExpansionPicker
          expansions={pickerExps}
          initial={new Set([BASE_PICK_ID, ...pickerExps.filter(isEnabledForCreation).map((e) => e.id)])}
          onCancel={() => setPickerExps(null)}
          onConfirm={(picked) => {
            setPickerExps(null);
            const exp = [...picked].filter((id) => id !== BASE_PICK_ID).join(',');
            router.push({ pathname: '/create', params: { exp } });
          }}
        />
      ) : null}
    </AppScreen>
  );
}
