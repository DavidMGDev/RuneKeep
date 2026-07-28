/**
 * Adversary reference (v0.17.0, item 10) — the "Using Adversaries" explanations from the rulebook, so a DM
 * browsing the library can look up what each stat-block field means and how the adversary types / feature
 * kinds work. A scrolling DmModal opened from the library's info button.
 */
import { Text, View } from 'react-native';
// v0.21.0 item 3: gesture-handler ScrollView scrolls reliably inside the DmModal overlay (the RN one
// gets starved by the modal's start-responder wrapper on Android).
import { ScrollView } from 'react-native-gesture-handler';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { DmType, Body, Display, DmRune } from '@/constants/theme';
import { DmModal } from './dm-ui';

const H = { color: DmRune.accent, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginTop: 4 };
const P = { color: DmRune.text, fontSize: DmType.body, fontFamily: Body.regular, lineHeight: 17.5 };
const B = { fontFamily: Body.bold, color: DmRune.ivory };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={H}>{title}</Text>
      <Text style={P as object}>{children}</Text>
    </View>
  );
}

export function AdversaryInfoPanel({ onClose }: { onClose: () => void }) {
  return (
    <DmModal onClose={onClose}>
      <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: 344, maxHeight: 640, padding: 18 }}>
        <Text style={{ color: DmRune.ivory, fontSize: DmType.panel, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Using Adversaries</Text>
        {/* v0.19.2 item 6: the ScrollView had NO height bound, so it clipped instead of scrolling. Bound it
            + nestedScrollEnabled (the proven AdversaryEditor pattern) so it scrolls inside the modal. */}
        <ScrollView style={{ maxHeight: 520 }} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 4 }}>
          <Text style={P as object}>Each adversary’s stat block gives the mechanics you need to run it in combat. Here’s what each field means.</Text>

          <Section title="Difficulty">Adversaries don’t use Evasion, instead, every roll against them uses their <Text style={B}>Difficulty</Text>. A roll equal to or higher than the Difficulty succeeds against the adversary. If a feature doesn’t specify a Difficulty, it uses the adversary’s.</Section>
          <Section title="Thresholds, HP & Stress">“Thresholds: 8/14” means a Major threshold of 8 and a Severe threshold of 14, they work exactly like a PC’s. HP and Stress are the adversary’s damage/pressure tracks; each adversary tracks its Stress individually.</Section>
          <Section title="Attack Modifier & Standard Attack">When the adversary attacks, apply its <Text style={B}>ATK</Text> modifier to the roll. The standard attack lists its name, range, and the damage it deals on a success (e.g. Daggers · Melee · 1d8+1 phy). You can always use the standard attack as an action.</Section>
          <Section title="Experience">Like PCs, some adversaries have Experiences (e.g. “Thief +2”). Spend a Fear to add a relevant Experience to the adversary’s Difficulty, an attack, or a reaction roll.</Section>
          <Section title="Features: Passives, Actions & Reactions">Features come in three kinds. <Text style={B}>Passives</Text> always apply under their stated circumstances. <Text style={B}>Actions</Text> require the spotlight, use one instead of a standard attack. <Text style={B}>Reactions</Text> trigger on a specific event and usually don’t cost Fear to interrupt with.</Section>
          <Section title="Marking Stress & Spending Fear">Some moves cost the adversary Stress (“mark a Stress”) or cost you Fear (“spend a Fear”). More powerful moves may cost 2 or more. If an adversary has marked all its Stress, it can’t use a move that requires marking Stress.</Section>

          <Section title="Adversary Types">
            <Text style={B}>Bruiser</Text>, tough, powerful blows.  <Text style={B}>Horde</Text>, many creatures acting as one unit.  <Text style={B}>Leader</Text>, commands and summons others.  <Text style={B}>Minion</Text>, easily dispatched but dangerous in numbers.  <Text style={B}>Ranged</Text>, fragile up close, high damage at range.  <Text style={B}>Skulk</Text>, maneuvers and exploits openings.  <Text style={B}>Social</Text>, a challenge to overcome through conversation.  <Text style={B}>Solo</Text>, a formidable challenge alone.  <Text style={B}>Standard</Text>, rank-and-file.  <Text style={B}>Support</Text> — enhances allies and disrupts foes.
          </Section>
          <Section title="Tip">When a stat block mentions an “ally,” it means a fellow adversary, not a PC.</Section>
        </ScrollView>
        <View style={{ marginTop: 14 }}><RuneButton label="Close" kind="secondary" height={44} dm onPress={onClose} /></View>
      </ChamferBox>
    </DmModal>
  );
}
