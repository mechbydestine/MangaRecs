// Graceful haptics wrapper — silently no-ops if expo-haptics is not installed.
// Install with: npx expo install expo-haptics
let H = null;
try { H = require('expo-haptics'); } catch (_) {}

const I = H?.ImpactFeedbackStyle;
const N = H?.NotificationFeedbackType;

// Light tap — tab switches, chip selections
export const light     = () => { try { H?.impactAsync?.(I?.Light);          } catch (_) {} };

// Medium tap — opening context menus, toggling items
export const medium    = () => { try { H?.impactAsync?.(I?.Medium);         } catch (_) {} };

// Heavy — delete confirmations, destructive actions
export const heavy     = () => { try { H?.impactAsync?.(I?.Heavy);          } catch (_) {} };

// Success — completing a series, bookmarking, accepting a friend request
export const success   = () => { try { H?.notificationAsync?.(N?.Success);  } catch (_) {} };

// Warning — removing from library, unfriending
export const warning   = () => { try { H?.notificationAsync?.(N?.Warning);  } catch (_) {} };

// Error — failed actions
export const error     = () => { try { H?.notificationAsync?.(N?.Error);    } catch (_) {} };

// Selection tick — scrolling through items, slider movement
export const selection = () => { try { H?.selectionAsync?.();                } catch (_) {} };
