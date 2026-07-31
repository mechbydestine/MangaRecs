/* MangaRecs site translations.
 *
 * Same six languages as the app, and the same rule: a missing key falls back
 * to English rather than rendering blank.
 *
 * Markup opts in with data-i18n="key" (textContent), data-i18n-html="key"
 * (innerHTML, for copy containing markup), or data-i18n-attr="attr:key,…"
 * for things like alt/title/aria-label/placeholder.
 *
 * Language resolution order — explicit choice beats a guess, always:
 *   1. ?lang= in the URL      (shareable, and what a translated link uses)
 *   2. localStorage           (what the visitor picked last time)
 *   3. navigator.language     (a guess, only used before they've chosen)
 *   4. English
 */
(function () {
  'use strict';

  var KEY = 'mangarecs_lang';
  var LANGS = [
    { id: 'en', native: 'English' },
    { id: 'ja', native: '日本語' },
    { id: 'ko', native: '한국어' },
    { id: 'zh', native: '中文' },
    { id: 'es', native: 'Español' },
    { id: 'fr', native: 'Français' }
  ];

  var T = {
    en: {
      'nav.catalog': 'Browse Catalog',
      'nav.features': 'Features',
      'nav.library': 'Library',
      'nav.cta': 'Coming Soon',
      'nav.language': 'Language',
      'hero.tag': "Your manga & manhwa library, but social. Track what you're reading, Rec it to friends, and talk chapters as a community instead of scattered across a dozen group chats.",
      'hero.browse': 'Browse the Catalog',
      'hero.fineprint': 'Not on the stores yet — MangaRecs is heading to the App Store and Google Play.',
      'demo.hint': '← swipe away · swipe right to save →',
      'trending.eyebrow': 'Live from the catalog',
      'trending.title': 'Trending Right Now',
      'trending.seeAll': 'See the full catalog',
      'ch1.eyebrow': 'Chapter 1',
      'ch1.title': 'Collect',
      'ch1.desc': "Add it once and it's yours everywhere — reading, completed, bookmarked, downloaded, all on shelves your friends can actually see. Lose your phone tomorrow and none of it's gone; sign in on the new one and it's all still there.",
      'ch1.li1': 'Download chapters and read with the wifi off',
      'ch1.li2': 'Custom sort per shelf, progress tracked series by series',
      'ch1.li3': 'Tied to your account, not your device',
      'ch2.eyebrow': 'Chapter 2',
      'ch2.title': 'Connect',
      'ch3.eyebrow': 'Chapter 3',
      'ch3.title': 'Progress',
      'ch4.eyebrow': 'Chapter 4',
      'ch4.title': 'Discover',
      'ch5.eyebrow': 'Chapter 5',
      'ch5.title': 'Read',
      'shots.eyebrow': 'See it in action',
      'shots.title': 'Straight From the App',
      'shots.sub': "No mockups — this is what's actually on your phone.",
      'shots.library': 'Library',
      'shots.community': 'Community',
      'shots.discussions': 'Discussions',
      'shots.profile': 'Profile',
      'shots.home': 'Home',
      'shots.forYou': 'For You',
      'download.title': 'Coming to the App Store and Google Play',
      'faq.title': 'Questions, Answered',
      'footer.privacy': 'Privacy',
      'footer.terms': 'Terms',
      'footer.catalog': 'Catalog'
    },

    ja: {
      'nav.catalog': 'カタログを見る',
      'nav.features': '機能',
      'nav.library': 'ライブラリ',
      'nav.cta': '近日公開',
      'nav.language': '言語',
      'hero.tag': 'マンガ・マンファのライブラリを、みんなと。読んでいる作品を記録して、友だちにおすすめして、いくつものグループチャットに散らばらずに感想を語り合えます。',
      'hero.browse': 'カタログを見る',
      'hero.fineprint': 'ストアでの配信はまだです。MangaRecsはApp StoreとGoogle Playで公開予定です。',
      'demo.hint': '← スワイプで次へ・右スワイプで保存 →',
      'trending.eyebrow': 'カタログから',
      'trending.title': 'いま人気の作品',
      'trending.seeAll': 'カタログをすべて見る',
      'ch1.eyebrow': '第1章',
      'ch1.title': '集める',
      'ch1.desc': '一度追加すれば、どこでもあなたのもの。読書中・読了・保存済み・ダウンロード済みのすべてが、友だちにも見える本棚に並びます。スマホをなくしても大丈夫。新しい端末でログインすれば、すべてそのままです。',
      'ch1.li1': '話をダウンロードして、オフラインでも読める',
      'ch1.li2': '本棚ごとに並べ替え、作品ごとに進捗を記録',
      'ch1.li3': '端末ではなくアカウントに紐づく',
      'ch2.eyebrow': '第2章',
      'ch2.title': 'つながる',
      'ch3.eyebrow': '第3章',
      'ch3.title': '記録する',
      'ch4.eyebrow': '第4章',
      'ch4.title': '見つける',
      'ch5.eyebrow': '第5章',
      'ch5.title': '読む',
      'shots.eyebrow': '実際の画面',
      'shots.title': 'アプリそのままの画面',
      'shots.sub': 'モックアップではありません。実際にスマホで見える画面です。',
      'shots.library': 'ライブラリ',
      'shots.community': 'コミュニティ',
      'shots.discussions': 'スレッド',
      'shots.profile': 'プロフィール',
      'shots.home': 'ホーム',
      'shots.forYou': 'おすすめ',
      'download.title': 'App StoreとGoogle Playで近日公開',
      'faq.title': 'よくある質問',
      'footer.privacy': 'プライバシー',
      'footer.terms': '利用規約',
      'footer.catalog': 'カタログ'
    },

    ko: {
      'nav.catalog': '카탈로그 보기',
      'nav.features': '기능',
      'nav.library': '서재',
      'nav.cta': '출시 예정',
      'nav.language': '언어',
      'hero.tag': '만화·웹툰 서재를 친구들과 함께. 읽는 작품을 기록하고, 친구에게 추천하고, 여러 단톡방에 흩어지지 않고 한곳에서 이야기하세요.',
      'hero.browse': '카탈로그 보기',
      'hero.fineprint': '아직 스토어에 출시되지 않았습니다. MangaRecs는 App Store와 Google Play 출시를 준비 중입니다.',
      'demo.hint': '← 넘기기 · 오른쪽으로 밀어 저장 →',
      'trending.eyebrow': '카탈로그에서',
      'trending.title': '지금 인기 작품',
      'trending.seeAll': '전체 카탈로그 보기',
      'ch1.eyebrow': '1장',
      'ch1.title': '모으기',
      'ch1.desc': '한 번 추가하면 어디서든 내 것. 읽는 중, 완독, 저장, 다운로드까지 친구도 볼 수 있는 서재에 정리됩니다. 내일 휴대폰을 잃어버려도 사라지지 않습니다. 새 기기에서 로그인하면 그대로 남아 있어요.',
      'ch1.li1': '회차를 내려받아 오프라인에서도 읽기',
      'ch1.li2': '서재별 정렬, 작품별 진행률 기록',
      'ch1.li3': '기기가 아니라 계정에 저장됩니다',
      'ch2.eyebrow': '2장',
      'ch2.title': '연결하기',
      'ch3.eyebrow': '3장',
      'ch3.title': '기록하기',
      'ch4.eyebrow': '4장',
      'ch4.title': '발견하기',
      'ch5.eyebrow': '5장',
      'ch5.title': '읽기',
      'shots.eyebrow': '실제 화면',
      'shots.title': '앱 화면 그대로',
      'shots.sub': '목업이 아닙니다. 실제 휴대폰에서 보이는 화면입니다.',
      'shots.library': '서재',
      'shots.community': '커뮤니티',
      'shots.discussions': '토론',
      'shots.profile': '프로필',
      'shots.home': '홈',
      'shots.forYou': '추천',
      'download.title': 'App Store와 Google Play 출시 예정',
      'faq.title': '자주 묻는 질문',
      'footer.privacy': '개인정보',
      'footer.terms': '이용약관',
      'footer.catalog': '카탈로그'
    },

    zh: {
      'nav.catalog': '浏览书库',
      'nav.features': '功能',
      'nav.library': '书架',
      'nav.cta': '即将上线',
      'nav.language': '语言',
      'hero.tag': '把你的漫画书架变成社交空间。记录在读进度，把好作品推给朋友，在一个地方聊剧情，而不是散落在十几个群里。',
      'hero.browse': '浏览书库',
      'hero.fineprint': '尚未上架应用商店。MangaRecs 即将登陆 App Store 与 Google Play。',
      'demo.hint': '← 左滑跳过 · 右滑收藏 →',
      'trending.eyebrow': '来自书库',
      'trending.title': '当下热门',
      'trending.seeAll': '查看完整书库',
      'ch1.eyebrow': '第一章',
      'ch1.title': '收藏',
      'ch1.desc': '加入一次，处处可见——在读、读完、收藏、已下载，全部整理在朋友也能看到的书架上。哪怕明天手机丢了也不会丢失，换新机登录后一切照旧。',
      'ch1.li1': '下载章节，断网也能读',
      'ch1.li2': '每个书架单独排序，逐部作品记录进度',
      'ch1.li3': '数据绑定账号，而不是设备',
      'ch2.eyebrow': '第二章',
      'ch2.title': '连接',
      'ch3.eyebrow': '第三章',
      'ch3.title': '进度',
      'ch4.eyebrow': '第四章',
      'ch4.title': '发现',
      'ch5.eyebrow': '第五章',
      'ch5.title': '阅读',
      'shots.eyebrow': '实机画面',
      'shots.title': '来自应用本身',
      'shots.sub': '不是效果图——这就是手机上的真实画面。',
      'shots.library': '书架',
      'shots.community': '社区',
      'shots.discussions': '讨论',
      'shots.profile': '我的',
      'shots.home': '首页',
      'shots.forYou': '推荐',
      'download.title': '即将登陆 App Store 与 Google Play',
      'faq.title': '常见问题',
      'footer.privacy': '隐私',
      'footer.terms': '条款',
      'footer.catalog': '书库'
    },

    es: {
      'nav.catalog': 'Ver catálogo',
      'nav.features': 'Funciones',
      'nav.library': 'Biblioteca',
      'nav.cta': 'Muy pronto',
      'nav.language': 'Idioma',
      'hero.tag': 'Tu biblioteca de manga y manhwa, pero social. Sigue lo que estás leyendo, recomiéndalo a tus amigos y comenta los capítulos en comunidad en vez de repartirlo entre diez grupos de chat.',
      'hero.browse': 'Ver el catálogo',
      'hero.fineprint': 'Todavía no está en las tiendas: MangaRecs llegará a App Store y Google Play.',
      'demo.hint': '← desliza para pasar · desliza a la derecha para guardar →',
      'trending.eyebrow': 'En directo desde el catálogo',
      'trending.title': 'Tendencia ahora mismo',
      'trending.seeAll': 'Ver el catálogo completo',
      'ch1.eyebrow': 'Capítulo 1',
      'ch1.title': 'Colecciona',
      'ch1.desc': 'Añádelo una vez y lo tendrás en todas partes: leyendo, completado, guardado, descargado, todo en estanterías que tus amigos pueden ver. Si mañana pierdes el móvil no se pierde nada; inicia sesión en el nuevo y sigue ahí.',
      'ch1.li1': 'Descarga capítulos y lee sin conexión',
      'ch1.li2': 'Orden propio en cada estantería y progreso serie por serie',
      'ch1.li3': 'Ligado a tu cuenta, no a tu dispositivo',
      'ch2.eyebrow': 'Capítulo 2',
      'ch2.title': 'Conecta',
      'ch3.eyebrow': 'Capítulo 3',
      'ch3.title': 'Progresa',
      'ch4.eyebrow': 'Capítulo 4',
      'ch4.title': 'Descubre',
      'ch5.eyebrow': 'Capítulo 5',
      'ch5.title': 'Lee',
      'shots.eyebrow': 'Míralo en acción',
      'shots.title': 'Directo desde la app',
      'shots.sub': 'Sin maquetas: esto es lo que hay de verdad en tu móvil.',
      'shots.library': 'Biblioteca',
      'shots.community': 'Comunidad',
      'shots.discussions': 'Debates',
      'shots.profile': 'Perfil',
      'shots.home': 'Inicio',
      'shots.forYou': 'Para ti',
      'download.title': 'Próximamente en App Store y Google Play',
      'faq.title': 'Preguntas, respondidas',
      'footer.privacy': 'Privacidad',
      'footer.terms': 'Términos',
      'footer.catalog': 'Catálogo'
    },

    fr: {
      'nav.catalog': 'Parcourir le catalogue',
      'nav.features': 'Fonctionnalités',
      'nav.library': 'Bibliothèque',
      'nav.cta': 'Bientôt disponible',
      'nav.language': 'Langue',
      'hero.tag': "Votre bibliothèque de mangas et de manhwas, en version sociale. Suivez vos lectures, recommandez-les à vos amis et discutez des chapitres en communauté plutôt que dans dix conversations de groupe.",
      'hero.browse': 'Parcourir le catalogue',
      'hero.fineprint': "Pas encore sur les stores — MangaRecs arrive sur l'App Store et Google Play.",
      'demo.hint': '← balayez pour passer · balayez à droite pour enregistrer →',
      'trending.eyebrow': 'En direct du catalogue',
      'trending.title': 'Tendances du moment',
      'trending.seeAll': 'Voir tout le catalogue',
      'ch1.eyebrow': 'Chapitre 1',
      'ch1.title': 'Collectionner',
      'ch1.desc': "Ajoutez-le une fois et retrouvez-le partout : en cours, terminé, enregistré, téléchargé, le tout sur des étagères que vos amis peuvent voir. Perdez votre téléphone demain, rien ne disparaît : connectez-vous sur le nouveau et tout est là.",
      'ch1.li1': 'Téléchargez des chapitres et lisez hors ligne',
      'ch1.li2': 'Tri personnalisé par étagère, progression suivie série par série',
      'ch1.li3': 'Lié à votre compte, pas à votre appareil',
      'ch2.eyebrow': 'Chapitre 2',
      'ch2.title': 'Se connecter',
      'ch3.eyebrow': 'Chapitre 3',
      'ch3.title': 'Progresser',
      'ch4.eyebrow': 'Chapitre 4',
      'ch4.title': 'Découvrir',
      'ch5.eyebrow': 'Chapitre 5',
      'ch5.title': 'Lire',
      'shots.eyebrow': 'En conditions réelles',
      'shots.title': "Directement depuis l'app",
      'shots.sub': "Pas de maquettes — voilà ce qui s'affiche vraiment sur votre téléphone.",
      'shots.library': 'Bibliothèque',
      'shots.community': 'Communauté',
      'shots.discussions': 'Discussions',
      'shots.profile': 'Profil',
      'shots.home': 'Accueil',
      'shots.forYou': 'Pour vous',
      'download.title': "Bientôt sur l'App Store et Google Play",
      'faq.title': 'Vos questions, nos réponses',
      'footer.privacy': 'Confidentialité',
      'footer.terms': 'Conditions',
      'footer.catalog': 'Catalogue'
    }
  };

  function supported(id) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].id === id) return true;
    return false;
  }

  function resolve() {
    try {
      var q = new URLSearchParams(location.search).get('lang');
      if (supported(q)) return q;
      var stored = localStorage.getItem(KEY);
      if (supported(stored)) return stored;
      // Only a guess, and only before the visitor has chosen. `zh-Hans`,
      // `pt-BR` etc. reduce to their base tag.
      var nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
      if (supported(nav)) return nav;
    } catch (e) {}
    return 'en';
  }

  var current = resolve();

  function t(key) {
    var d = T[current] || {};
    if (typeof d[key] === 'string') return d[key];
    return typeof T.en[key] === 'string' ? T.en[key] : key;
  }

  function apply() {
    document.documentElement.setAttribute('lang', current);

    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }
    var html = document.querySelectorAll('[data-i18n-html]');
    for (var j = 0; j < html.length; j++) {
      html[j].innerHTML = t(html[j].getAttribute('data-i18n-html'));
    }
    // "alt:key, aria-label:key" — attributes are as visible as text to screen
    // readers and search engines, so they get translated too.
    var attrs = document.querySelectorAll('[data-i18n-attr]');
    for (var k = 0; k < attrs.length; k++) {
      var spec = attrs[k].getAttribute('data-i18n-attr').split(',');
      for (var m = 0; m < spec.length; m++) {
        var pair = spec[m].split(':');
        if (pair.length === 2) attrs[k].setAttribute(pair[0].trim(), t(pair[1].trim()));
      }
    }
    var label = document.getElementById('langCurrent');
    if (label) {
      for (var n = 0; n < LANGS.length; n++) {
        if (LANGS[n].id === current) label.textContent = LANGS[n].native;
      }
    }
    var opts = document.querySelectorAll('#langMenu [data-lang]');
    for (var p = 0; p < opts.length; p++) {
      opts[p].setAttribute('aria-checked', opts[p].getAttribute('data-lang') === current ? 'true' : 'false');
    }
  }

  function setLanguage(id) {
    if (!supported(id) || id === current) return;
    current = id;
    try { localStorage.setItem(KEY, id); } catch (e) {}
    apply();
    // Keep the URL honest so a copied link carries the language with it,
    // without adding a history entry per switch.
    try {
      var u = new URL(location.href);
      u.searchParams.set('lang', id);
      history.replaceState(null, '', u);
    } catch (e) {}
  }

  function buildSwitcher() {
    var host = document.querySelector('.nav-actions');
    if (!host || document.getElementById('langBtn')) return;

    var wrap = document.createElement('div');
    wrap.className = 'lang-wrap';

    var btn = document.createElement('button');
    btn.id = 'langBtn';
    btn.type = 'button';
    btn.className = 'lang-btn';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', t('nav.language'));
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/>' +
      '<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' +
      '<span id="langCurrent"></span>';

    var menu = document.createElement('div');
    menu.id = 'langMenu';
    menu.className = 'lang-menu';
    menu.setAttribute('role', 'menu');
    for (var i = 0; i < LANGS.length; i++) {
      var o = document.createElement('button');
      o.type = 'button';
      o.className = 'lang-opt';
      o.setAttribute('role', 'menuitemradio');
      o.setAttribute('data-lang', LANGS[i].id);
      o.setAttribute('lang', LANGS[i].id);
      o.textContent = LANGS[i].native;
      menu.appendChild(o);
    }

    function close() { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = wrap.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.addEventListener('click', function (e) {
      var el = e.target.closest('[data-lang]');
      if (!el) return;
      setLanguage(el.getAttribute('data-lang'));
      close();
    });
    document.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    // Before the CTA so the switcher doesn't push the primary action around.
    var cta = host.querySelector('.nav-cta');
    if (cta) host.insertBefore(wrap, cta); else host.appendChild(wrap);
  }

  function init() { buildSwitcher(); apply(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.MangaRecsI18n = { t: t, set: setLanguage, get: function () { return current; }, languages: LANGS };
})();
