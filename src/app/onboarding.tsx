import { useLocalSearchParams, useRouter } from 'expo-router';

import { OnboardingScreen } from '@/features/onboarding/onboarding-screen';
import { type TourId, TOUR_IDS } from '@/lib/onboarding-store';

/** A guided tour. `?tour=` picks which one; each fires from the screen it explains. */
export default function Onboarding() {
  const router = useRouter();
  const { tour } = useLocalSearchParams<{ tour?: string }>();
  const id: TourId = TOUR_IDS.includes(tour as TourId) ? (tour as TourId) : 'welcome';
  return <OnboardingScreen tour={id} onDone={() => router.back()} />;
}
