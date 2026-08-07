import { Platform } from 'react-native';

/**
 * The stat wheel is a BROWSER control (v0.36.2, owner).
 *
 * Five releases tried to stop it crashing an Android phone. Each removed something genuinely wrong
 * and the app kept dying; by v0.36 every callback in it was guarded and every guard had stayed
 * silent, which says the fault is native and unreachable from here. The owner's instruction is to
 * take it off the platform, and this is the one switch both halves read: `stat-pulse` builds no
 * gesture when it is false, and `stat-radial` mounts no host, so there is nothing left to crash.
 *
 * Its own module so neither of those two has to import the other.
 */
export const WHEEL_ENABLED = Platform.OS === 'web';
