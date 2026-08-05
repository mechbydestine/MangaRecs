// Every language is bundled — the app has to work offline and the whole set
// is a few tens of KB, so there's nothing to gain from lazy-loading and a
// blank UI to lose if a fetch fails mid-switch.
import en from './en';
import ja from './ja';
import ko from './ko';
import zh from './zh';
import es from './es';
import fr from './fr';

export const TRANSLATIONS = { en, ja, ko, zh, es, fr };
