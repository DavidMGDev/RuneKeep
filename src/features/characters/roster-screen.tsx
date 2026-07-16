import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { LoadingScreen } from '@/components/loading-screen';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { classColor, classInfo } from '@/constants/identity';
import { Body, Display, Rune } from '@/constants/theme';
import { type CharacterFile } from '@/lib/character-file';
import { deleteCharacter, exportCharacter, importCharacter, listCharacters } from '@/lib/character-store';
import { seedOfficialExpansions } from '@/lib/expansions';
import { type Expansion, isEnabledForCreation } from '@/lib/library';
import { listExpansions } from '@/lib/library-store';
import { playSfx } from '@/lib/sfx';
import { BASE_PICK_ID, ExpansionPicker } from '@/features/create/expansion-picker';

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

/** The roster: saved characters as files. Tap = play; hold = export/delete; import brings a friend's file in. */
export function RosterScreen() {
  const router = useRouter();
  const [files, setFiles] = useState<CharacterFile[] | null>(null);
  const [actionsFor, setActionsFor] = useState<CharacterFile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CharacterFile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // v0.13.0 item 6: the expansion picker moved HERE — it resolves BEFORE creation loads, so the
  // creation interface never appears behind it. null = closed; [] would still render (base-only).
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
    listCharacters().then((all) => {
      if (live) setFiles(all);
    });
    return () => {
      live = false;
    };
  }, []);
  useFocusEffect(reload);

  const onImport = useCallback(async () => {
    try {
      const imported = await importCharacter();
      if (imported) reload();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read that file');
    }
  }, [reload]);

  if (!files) return <LoadingScreen label="Summoning the roster" />;

  return (
    <AppScreen title="Characters" onBack={() => router.back()}>
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
          <FlatList
            data={files}
            keyExtractor={(f) => f.id}
            contentContainerStyle={{ gap: 12, paddingTop: 4, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              // #258r3: NO sound on the row tap — it opens the sheet, whose sheet-enter chime is the
              // feedback (selectCharacter belongs to the main-menu "Characters" button).
              <CharacterRow file={item} onOpen={() => router.push({ pathname: '/sheet', params: { id: item.id } })} onLongPress={() => { playSfx('floatMenuOpen'); setActionsFor(item); }} />
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
          body="Share this character as a file, or remove them from the roster."
          confirmLabel="Share file"
          onConfirm={() => {
            const f = actionsFor;
            setActionsFor(null);
            void exportCharacter(f);
          }}
          onCancel={() => setActionsFor(null)}>
          <View style={{ marginTop: 16 }}>
            <RuneButton
              label="Delete"
              kind="primary"
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
            playSfx('loseHpDefault'); // deleting a character hits like taking damage (#255) — no meme roll
            void deleteCharacter(f.id).then(reload);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}

      {importError ? (
        <PopupDialog title="Import failed" body={importError} confirmLabel="OK" onConfirm={() => setImportError(null)} onCancel={() => setImportError(null)} />
      ) : null}

      {/* v0.13.0 item 6: choose expansions FIRST, then load creation with the picks as a route param. */}
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
