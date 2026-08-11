import { CampaignsScreen } from '@/features/dm/campaigns-screen';

/**
 * v0.41.4: the route keeps its name and the screen does not.
 *
 * Renaming the path would break any back stack or deep link an installed build is holding, for a
 * string nobody sees. The user-facing word is Campaigns everywhere it is read.
 */
export default function Campaigns() {
  return <CampaignsScreen />;
}
