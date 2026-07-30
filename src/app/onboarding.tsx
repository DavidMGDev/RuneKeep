import { type Href, useLocalSearchParams, useRouter } from 'expo-router';

import { OnboardingScreen } from '@/features/onboarding/onboarding-screen';
import { type TourId, TOUR_IDS } from '@/lib/onboarding-store';

/**
 * A guided tour. `?tour=` picks which one; each fires from the screen it explains.
 *
 * `?from=` says where to return to, and it is not optional decoration (v0.26.0). Every tour is pushed
 * from a mount effect on the screen it explains, so the tour's history entry and that screen's own
 * entry are created in the same tick. Firefox collapses those two into one, and `router.back()` then
 * went back PAST the screen: opening the creator and dismissing its tour dropped the player on the
 * empty character list, as though creating a character had failed. Chrome kept both entries, which is
 * why it only ever happened in one browser.
 *
 * Replacing with an explicit destination does not depend on how many entries an engine decided to
 * keep. `router.back()` remains the fallback for a tour opened without one.
 */
export default function Onboarding() {
  const router = useRouter();
  const { tour, from } = useLocalSearchParams<{ tour?: string; from?: string }>();
  const id: TourId = TOUR_IDS.includes(tour as TourId) ? (tour as TourId) : 'welcome';
  const done = () => {
    if (from) router.replace(from as Href);
    else router.back();
  };
  return <OnboardingScreen tour={id} onDone={done} />;
}
