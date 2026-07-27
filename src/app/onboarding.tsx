import { useRouter } from 'expo-router';

import { OnboardingScreen } from '@/features/onboarding/onboarding-screen';

/** The guided tour. Reachable from the menu, and offered once on a first launch. */
export default function Onboarding() {
  const router = useRouter();
  return <OnboardingScreen onDone={() => router.back()} />;
}
