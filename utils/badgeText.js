// Localised badge names and descriptions.
//
// badges.js stays the single source of truth for the English text and for
// every badge's requirements — nothing here duplicates it. The translation
// dictionaries carry only the other five languages, keyed by badge id, and an
// untranslated badge falls back to its English name rather than a raw key.
//
// That fallback is the point: there are 250 badges, they're translated in
// tranches, and a half-translated set has to keep working.

import { translateOr } from './i18n';

export function badgeName(badge, lang) {
  if (!badge) return '';
  return translateOr(`badges.${badge.id}.name`, badge.name || '', undefined, lang);
}

export function badgeDesc(badge, lang) {
  if (!badge) return '';
  return translateOr(`badges.${badge.id}.desc`, badge.desc || '', undefined, lang);
}
