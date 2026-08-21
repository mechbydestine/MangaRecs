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
      'hero.tag': "A social library for manga & manhwa. Track what you're reading, find your next series, Rec it to friends, and talk chapters as a community, not scattered across a dozen tabs.",
      'hero.browse': 'Browse the Catalog',
      'hero.fineprint': 'Heading to the App Store and Google Play. Not there yet.',
      'demo.hint': '← swipe away · swipe right to save →',
      'trending.eyebrow': 'Live from the catalog',
      'trending.title': 'Trending Right Now',
      'trending.seeAll': 'See the full catalog',
      'ch1.eyebrow': 'Chapter 1',
      'ch1.title': 'Collect',
      'ch1.desc': "Add it once and it's yours everywhere: reading, completed, bookmarked, downloaded, all on shelves your friends can actually see. Lose your phone tomorrow and none of it's gone. Sign in on the new one and it's all still there.",
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
      'ch2.desc': 'See what your friends are reading right now, while they’re still in it. Send them the chapter that wrecked you, or "Rec" them a whole series straight into their library. Threads are spoiler-tagged by chapter, so someone three behind can still scroll through without getting burned.',
      'ch2.li1': "Rec a title straight into a friend's library, saved and waiting",
      'ch2.li2': 'Live reading activity that updates while they read',
      'ch2.li3': 'Spoiler-tagged discussion threads, per chapter, per series',
      'ch3.desc': "250 badges worth chasing. Climb Bronze to Mythic, keep a streak alive, and unlock relics: original weapon art we drew ourselves, one piece at a time. It's also the groundwork for the community modes we're building next, starting with server-wide events.",
      'ch3.li1': 'Bronze → Silver → Gold → Mythic, a real ladder with real rungs',
      'ch3.li2': 'Streaks and a live leaderboard against your friends',
      'ch3.li3': "The Relic Vault: hand-drawn rewards, made for this app and nowhere else",
      'relics.eyebrow': 'Drawn, not generated',
      'relics.title': 'The Relic Vault',
      'relics.sub': 'Past Gold, badges stop being icons. Every relic below is a one-off piece we drew for a single achievement, and it exists nowhere else.',
      'relics.foot': 'Fifteen relics exist so far, across the top five tiers. <a href="/badges/">See all 250 badges</a>.',
      'ch4.desc': "Once your library's got a shape, the feed uses it. Swipe right to save, left to skip, and it re-reads you with every card. Tap a mood chip and it reshuffles on the spot.",
      'ch4.li1': 'Like, comment, and share straight from the card',
      'ch4.li2': 'A taste radar that keeps adjusting as your taste does',
      'ch5.desc': "However you found it, whether that's your library, a friend's Rec, or the feed, read it right in the app. Scroll it like a webtoon or flip it like paged manga, your call per series. Ambient sound, a screen dimmer, and auto-scroll for the chapters you're reading at 1am and don't want to keep tapping.",
      'ch5.li1': "Works as a clean, ad-blocked reader on other sites too, well beyond the ones with native support",
      'why.eyebrow': 'Why this exists',
      'why.body': "We kept losing track of what we were reading across a dozen sites and thirty open tabs, and every app we tried was either a spreadsheet with a login or so much slop we'd close it without finding a single thing worth reading. So we started building the one we actually wanted. Founded by manga and manhwa readers, for manga and manhwa readers. A library that remembers exactly where you left off. Friends who hand you real recommendations, and who can see what you're deep in right now. A discussion board for the chapter that just dropped, mini-games, badges worth chasing, and a reading streak you'll be annoyed to break.",
      'fcard1.title': 'Manga Library',
      'fcard1.sub': 'Manga, manhwa and manhua on <em>one shelf</em>',
      'fcard2.title': 'Novel Updates',
      'fcard2.sub': 'Never miss a <em>chapter drop</em>',
      'fcard3.title': 'Badge Ladder',
      'fcard3.sub': '250 badges, <em>Bronze to Mythic</em>',
      'fcard4.title': 'For You',
      'fcard4.sub': 'Recs that <em>learn as you read</em>',
      'updates.title': 'Latest Updates',
      'updates.t1': 'The catalog is live',
      'updates.d1': 'Manga, manhwa, manhua, webcomics and novels, browsable right now with <em>no account needed</em>.',
      'updates.t2': 'Every badge, listed',
      'updates.d2': 'All 250 badges across seven tiers. Sign in and the page fills in <em>your own progress</em>.',
      'updates.t3': 'Web and app, one library',
      'updates.d3': "Save a title here and it's <em>already waiting in the app</em> when you sign in.",
      'updates.t4': 'Heading to the stores',
      'updates.d4': "MangaRecs is in final testing. <em>Leave your email</em> and we'll ping you the day it lands.",
      'shots.eyebrow': 'See it in action',
      'shots.title': 'Straight From the App',
      'shots.sub': "Real screens, pulled straight from the current build.",
      'shots.library': 'Library',
      'shots.community': 'Community',
      'shots.discussions': 'Discussions',
      'shots.profile': 'Profile',
      'shots.home': 'Home',
      'shots.forYou': 'For You',
      'whatsnew.eyebrow': 'Still shipping',
      'whatsnew.title': 'The Latest Build',
      'whatsnew.li1': "Import your whole library from AniList or MyAnimeList in one tap. It only ever moves you forward, so it can't undo progress you already have.",
      'whatsnew.li2': 'The app is now genuinely translated in all six languages, down to the pop-ups and error screens.',
      'whatsnew.li3': 'Reading ambience keeps playing when your screen locks mid-chapter, and a banner tells you the moment you lose connection.',
      'whatsnew.foot': "Every build's full notes live in the app under Settings → About → App Version.",
      'download.eyebrow': 'Launching soon',
      'download.title': 'Coming to the App Store and Google Play',
      'download.body': "MangaRecs is in final testing before submission. Check back here for the store links the moment it's live.",
      'download.platforms': 'iOS and Android, at launch.',
      'download.ios': 'App Store',
      'download.android': 'Google Play',
      'download.soon': 'soon',
      'download.emailLabel': 'Your email address',
      'download.notify': 'Notify me at launch',
      'download.fineprint': 'One email, on launch day, and nothing else ever. See the <a href="/privacy/">Privacy Policy</a>.',
      'download.count': '{n} readers are already on the list.',
      'faq.title': 'Questions, Answered',
      'faq.q1': 'Is MangaRecs an app or a website?',
      'faq.a1': 'MangaRecs is a mobile app for iOS and Android. This website is its companion: browse the catalog, and once you sign in here, your library stays in sync with the app.',
      'faq.q2': 'Is it free?',
      'faq.a2': "Yes. Browsing the catalog here never requires a login, and the app itself is free. There's no paywall to track your library, talk to friends, or read.",
      'faq.q3': 'Does MangaRecs host the actual chapters?',
      'faq.a3': "No. MangaRecs helps you discover titles and keep track of what you're reading. It doesn't host or distribute manga, manhwa, manhua, or webcomic content itself.",
      'faq.q4': 'What formats does it support?',
      'faq.a4': 'Manga, manhwa, manhua, webcomics, and novels. Five formats, all in one catalog and one library.',
      'faq.q5': 'When does it launch, and where?',
      'faq.a5': "MangaRecs is in final testing now, heading to the App Store and Google Play. There's no sideloaded APK; it'll be a normal store install on both platforms.",
      'faq.q6': 'Do I need an account?',
      'faq.a6': 'Not to browse. Sign in only when you want your saved titles and reading progress to sync between this site and the app.',
      'faq.q7': 'Is it legal, then?',
      'faq.a7': "Yes. Catalog data comes from AniList's public API, and where a title lists somewhere to read, that link goes to an official or third-party site we don't run. The one thing hosted by us is original work uploaded by verified creators through the Creator Dashboard, with their permission.",
      'faq.q8': 'Can I delete my account and everything in it?',
      'faq.a8': "Yes, in the app, without emailing anyone: Settings → Account → Delete. It permanently removes your account, reading history, badges, friends, and saved data rather than just hiding them. The full detail is in the <a href=\"/privacy/\">Privacy Policy</a>.",
      'faq.q9': 'What happens to my reading data?',
      'faq.a9': "It stays your library and the activity you share with friends you've added, and that's it. No ads, nothing sold or rented to anyone, and no training data. Delete your account and all of it goes with you.",
      'faq.eyebrow': 'FAQ',
      'footer.privacy': 'Privacy',
      'footer.terms': 'Terms',
      'footer.catalog': 'Catalog',
      'footer.tagline': 'The social home for your manga & manhwa library. Track it, Rec it, talk about it. Built by readers, updated constantly.',
      'footer.browseTitle': 'Browse',
      'footer.connectTitle': 'Connect'
    },

    ja: {
      'nav.catalog': 'カタログを見る',
      'nav.features': '機能',
      'nav.library': 'ライブラリ',
      'nav.cta': '近日公開',
      'nav.language': '言語',
      'hero.tag': 'マンガ・マンファのライブラリを、みんなと。読んでいる作品を記録して、次に読む一作を見つけて、友だちにおすすめして、いくつものタブに散らばらずに感想を語り合えます。',
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
      'ch2.desc': '数か月前に読み終えた作品ではなく、友だちが「いま」読んでいるものが見えます。心を抉られた話をそのまま送ることも、シリーズごと相手のライブラリに「レコメンド」することもできます。スレッドは話数ごとにネタバレ保護されるので、3話遅れている人も安心して読み進められます。',
      'ch2.li1': 'リンクではなく、作品そのものを友だちのライブラリへ直接おすすめ',
      'ch2.li2': '古い「最終ログイン」ではなく、いま読んでいる状況がリアルタイムで',
      'ch2.li3': '作品ごと・話数ごとの、ネタバレ保護つき感想スレッド',
      'ch3.desc': '色が変わるだけのトロフィーではなく、本気で狙える250個のバッジ。ブロンズからミシックまで駆け上がり、連続記録を守り、レリックを解放しましょう。素材集の使い回しではなく、すべて自分たちで描いた武器のアートです。今後追加するコミュニティモードの土台でもあり、個人の記録だけでなくサーバー全体のイベントを見据えています。',
      'ch3.li1': 'ブロンズ → シルバー → ゴールド → ミシック。進捗バーではなく本物の階段',
      'ch3.li2': '連続記録と、友だちとのリアルタイムなランキング',
      'ch3.li3': 'レリック保管庫：手描きの報酬。ほかのアプリでは見かけないものばかり',
      'relics.eyebrow': '生成ではなく、手描き',
      'relics.title': 'レリック・ヴォールト',
      'relics.sub': 'ゴールドを超えると、バッジはアイコンではなくなります。以下のレリックはすべて、ひとつの実績のために描き下ろした一点物で、他のどこにも存在しません。',
      'relics.foot': '現在15個のレリックが上位5ティアに存在します。<a href="/badges/">250個のバッジをすべて見る</a>。',
      'ch4.desc': 'ライブラリの輪郭ができてくると、フィードがそれを使いはじめます。右スワイプで保存、左でスキップ。ジャンル診断を一度きり書かせて終わりではなく、ずっと調整され続けます。ムードのチップを押せば、その場で並べ替わります。',
      'ch4.li1': 'いいね、コメント、シェアはカードから直接。タブを行き来する必要はありません',
      'ch4.li2': '一度設定して終わりのジャンル絞り込みではなく、調整され続ける好みのレーダー',
      'ch5.desc': 'ライブラリからでも、友だちのおすすめからでも、フィードからでも、見つけた作品はそのままアプリで読めます。ウェブトゥーンのように縦スクロールでも、紙のマンガのようにページめくりでも、作品ごとに選べます。環境音、画面の減光、そして深夜1時にタップし続けたくないときのための自動スクロールも。',
      'ch5.li1': 'ネイティブ対応したサイトだけでなく、他のサイトでも広告のないきれいなリーダーとして使えます',
      'why.eyebrow': 'つくった理由',
      'why.body': 'いくつものサイトと30個のタブのあいだで、自分が何を読んでいたのか分からなくなっていました。試したアプリは、ログインの必要な表計算のようなものか、読む価値のある作品が1つも見つからないまま閉じてしまうほど雑なものばかり。だから、自分たちが本当に欲しかったものをつくり始めました。マンガ・マンファの読者が立ち上げた、マンガ・マンファの読者のためのアプリです。どこまで読んだかを正確に覚えているライブラリ。ほんとうのおすすめをくれて、いま夢中になっている作品も見える友だち。公開されたばかりの話を語り合う掲示板、ミニゲーム、狙う価値のあるバッジ、そして途切れさせたくなくなる連続記録。',
      'fcard1.title': 'マンガライブラリ',
      'fcard1.sub': 'マンガもマンファもマンフアも<em>ひとつの本棚に</em>',
      'fcard2.title': '小説の更新',
      'fcard2.sub': '<em>新しい話</em>を見逃さない',
      'fcard3.title': 'バッジの階段',
      'fcard3.sub': '250個のバッジ、<em>ブロンズからミシックまで</em>',
      'fcard4.title': 'あなたに',
      'fcard4.sub': '<em>読むほど学ぶ</em>おすすめ',
      'updates.title': '最新情報',
      'updates.t1': 'カタログを公開中',
      'updates.d1': 'マンガ、マンファ、マンフア、ウェブコミック、小説を<em>アカウントなしで</em>いま閲覧できます。',
      'updates.t2': 'すべてのバッジを掲載',
      'updates.d2': '7つのティアにわたる250個のバッジ。ログインすれば<em>あなた自身の進捗</em>が表示されます。',
      'updates.t3': 'ウェブとアプリで同じライブラリ',
      'updates.d3': 'ここで保存した作品は、ログインすれば<em>すでにアプリで待っています</em>。',
      'updates.t4': 'ストア公開へ',
      'updates.d4': 'MangaRecsは最終テスト中です。<em>メールアドレスを登録</em>いただければ、公開当日にお知らせします。',
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
      'whatsnew.eyebrow': '開発は続いています',
      'whatsnew.title': '最新ビルド',
      'whatsnew.li1': 'AniListやMyAnimeListのライブラリをワンタップでインポート。常に先へ進めるだけで、すでにある進捗が戻ることはありません。',
      'whatsnew.li2': 'ポップアップやエラー画面にいたるまで、6言語すべてに本当の意味で対応しました。',
      'whatsnew.li3': '章の途中で画面がロックされても環境音は流れ続け、接続が切れた瞬間にはバナーでお知らせします。',
      'whatsnew.foot': '各ビルドの詳しい変更点は、アプリの「設定 → アプリについて → バージョン」で読めます。',
      'download.eyebrow': 'まもなく公開',
      'download.body': 'MangaRecsは申請前の最終テスト中です。公開されしだい、ここにストアのリンクを掲載します。',
      'download.platforms': 'リリース時よりiOSとAndroidに対応。',
      'download.ios': 'App Store',
      'download.android': 'Google Play',
      'download.soon': '近日',
      'download.emailLabel': 'メールアドレス',
      'download.notify': '公開時に知らせる',
      'download.fineprint': '公開日にメールを1通だけ。それ以外は一切お送りしません。<a href="/privacy/">プライバシーポリシー</a>をご覧ください。',
      'download.count': 'すでに{n}人が登録しています。',
      'faq.eyebrow': 'よくある質問',
      'footer.tagline': 'マンガ・マンファのライブラリの居場所。記録して、すすめて、語り合う。読者がつくり、更新し続けています。',
      'footer.browseTitle': 'さがす',
      'footer.connectTitle': 'つながる',
      'faq.title': 'よくある質問',
      'faq.q1': 'MangaRecsはアプリですか、ウェブサイトですか？',
      'faq.a1': 'MangaRecsはiOS・Android向けのモバイルアプリです。このサイトはその公式サイトで、ここでログインすればライブラリはアプリと同期されます。',
      'faq.q2': '無料ですか？',
      'faq.a2': 'はい。カタログの閲覧にログインは不要で、アプリ自体も無料です。ライブラリの記録も、友だちとのやり取りも、読むことにも課金はありません。',
      'faq.q3': 'MangaRecsは作品そのものを配信していますか？',
      'faq.a3': 'いいえ。MangaRecsは作品を見つけて読んだ記録を残すためのアプリで、マンガ・マンファ・マンフア・ウェブコミックを自ら配信することはありません。',
      'faq.q4': '対応しているフォーマットは？',
      'faq.a4': 'マンガ、マンファ、マンフア、ウェブコミック、小説の5種類。すべて1つのカタログと1つのライブラリにまとまります。',
      'faq.q5': 'いつ、どこで公開されますか？',
      'faq.a5': '現在は最終テスト中で、App StoreとGoogle Playで公開予定です。APKの手動インストールは不要で、どちらも通常のストア配信です。',
      'faq.q6': 'アカウントは必要ですか？',
      'faq.a6': '閲覧だけなら不要です。保存した作品や読書の進捗をこのサイトとアプリで同期したいときにログインしてください。',
      'faq.q7': 'では、合法なのですか？',
      'faq.a7': 'はい。カタログのデータはAniListの公開APIから取得しており、閲覧リンクは公式サイトや当社が運営していない第三者のサイトへ移動します。当社がホストしているのは、認証済みクリエイターがクリエイターダッシュボードから許可のうえ公開したオリジナル作品だけです。',
      'faq.q8': 'アカウントとその中身をすべて削除できますか？',
      'faq.a8': 'はい。問い合わせは不要で、アプリの「設定 → アカウント → 削除」から行えます。アカウント、読書履歴、バッジ、フレンド、保存データが完全に消え、非表示になるだけではありません。詳しくは<a href="/privacy/">プライバシーポリシー</a>をご覧ください。',
      'faq.q9': '読書データはどう扱われますか？',
      'faq.a9': 'あなたのライブラリと、追加した友だちに共有される記録に留まります。広告はなく、第三者への販売も貸与もなく、学習データにも使いません。アカウントを削除すれば、すべて一緒に消えます。',
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
      'hero.tag': '만화·웹툰 서재를 친구들과 함께. 읽는 작품을 기록하고, 다음에 볼 작품을 찾고, 친구에게 추천하고, 여러 탭에 흩어지지 않고 한곳에서 이야기하세요.',
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
      'ch2.desc': '몇 달 전에 완결까지 본 작품이 아니라, 친구가 지금 읽고 있는 것이 보입니다. 당신을 무너뜨린 그 회차를 그대로 보내거나, 시리즈 전체를 친구의 라이브러리로 바로 "추천"하세요. 스레드는 회차별로 스포일러가 가려지니, 세 화쯤 뒤처진 사람도 마음 놓고 훑어볼 수 있습니다.',
      'ch2.li1': '링크가 아니라 작품 자체를 친구의 라이브러리에 바로 추천',
      'ch2.li2': '오래된 "마지막 접속" 표시가 아닌, 지금 읽는 중이라는 실시간 상태',
      'ch2.li3': '작품별, 회차별로 스포일러가 가려지는 감상 스레드',
      'ch3.desc': '색만 바뀌는 트로피 하나가 아니라, 정말로 노려볼 만한 250개의 배지. 브론즈에서 미식까지 올라가고, 연속 기록을 지키고, 렘릭을 열어보세요. 아이콘 팩에서 가져온 것이 아니라 직접 그린 무기 아트입니다. 다음에 만들 커뮤니티 모드의 토대이기도 해서, 개인 기록을 넘어 서버 전체 이벤트까지 이어집니다.',
      'ch3.li1': '브론즈 → 실버 → 골드 → 미식. 진행 바가 아니라 진짜 사다리',
      'ch3.li2': '연속 기록과 친구들과의 실시간 순위표',
      'ch3.li3': '렘릭 보관함: 손으로 그린 보상들, 다른 앱에서는 본 적 없는 것들',
      'relics.eyebrow': '생성이 아니라, 직접 그렸습니다',
      'relics.title': '유물 보관소',
      'relics.sub': '골드를 넘어서면 배지는 더 이상 아이콘이 아닙니다. 아래의 모든 유물은 하나의 업적을 위해 직접 그린 단 하나뿐인 작품이며, 다른 어디에도 없습니다.',
      'relics.foot': '현재 상위 5개 등급에 15개의 유물이 있습니다. <a href="/badges/">250개 배지 모두 보기</a>.',
      'ch4.desc': '라이브러리에 모양이 잡히면 피드가 그것을 씁니다. 오른쪽으로 밀면 저장, 왼쪽으로 밀면 건너뛰기. 장르 설문을 한 번 채우고 끝나는 게 아니라 계속 조정됩니다. 무드 칩을 누르면 그 자리에서 다시 섞입니다.',
      'ch4.li1': '카드에서 바로 좋아요, 댓글, 공유 — 탭을 오갈 필요 없이',
      'ch4.li2': '한 번 설정하고 잊는 장르 필터가 아니라, 계속 조정되는 취향 레이더',
      'ch5.desc': '라이브러리에서든, 친구의 추천에서든, 피드에서든 — 찾은 작품은 앱에서 바로 읽습니다. 웹툰처럼 내려 읽거나 종이 만화처럼 넘겨 읽거나, 작품마다 고르세요. 배경음, 화면 밝기 낮추기, 그리고 새벽 1시에 계속 두드리고 싶지 않을 때를 위한 자동 스크롤까지.',
      'ch5.li1': '네이티브로 지원하는 곳뿐 아니라 다른 사이트에서도 광고 없는 깔끔한 뷰어로 동작합니다',
      'why.eyebrow': '왜 만들었나',
      'why.body': '열 몇 개의 사이트와 서른 개쯤 열린 탭 사이에서 무엇을 읽고 있었는지 계속 놓쳤습니다. 시도해 본 앱은 로그인이 필요한 스프레드시트이거나, 읽을 만한 것 하나 찾지 못하고 닫아버릴 만큼 조잡했습니다. 그래서 우리가 정말로 원했던 것을 만들기 시작했습니다. 만화와 웹툰을 읽는 사람들이 세웠고, 만화와 웹툰을 읽는 사람들을 위한 앱입니다. 어디까지 읽었는지 정확히 기억하는 라이브러리. 진짜 추천을 건네주고, 지금 무엇에 빠져 있는지도 보이는 친구들. 방금 올라온 회차를 이야기할 게시판, 미니게임, 노려볼 만한 배지, 그리고 끊기면 아쉬울 연속 기록.',
      'fcard1.title': '만화 라이브러리',
      'fcard1.sub': '만화도 웹툰도 만화(만화책)도 <em>한 선반에</em>',
      'fcard2.title': '소설 업데이트',
      'fcard2.sub': '<em>새 회차</em>를 놓치지 않기',
      'fcard3.title': '배지 사다리',
      'fcard3.sub': '250개의 배지, <em>브론즈부터 미식까지</em>',
      'fcard4.title': '추천',
      'fcard4.sub': '<em>읽을수록 배우는</em> 추천',
      'updates.title': '최신 소식',
      'updates.t1': '카탈로그가 열렸습니다',
      'updates.d1': '만화, 웹툰, 만화(만화책), 웹코믹, 소설을 <em>계정 없이</em> 지금 바로 둘러보세요.',
      'updates.t2': '모든 배지를 한자리에',
      'updates.d2': '일곱 단계에 걸친 250개의 배지 — 로그인하면 <em>당신의 진행 상황</em>이 채워집니다.',
      'updates.t3': '웹과 앱, 하나의 라이브러리',
      'updates.d3': '여기서 저장한 작품은 로그인하는 순간 <em>이미 앱에서 기다리고 있습니다</em>.',
      'updates.t4': '스토어로 향하는 중',
      'updates.d4': 'MangaRecs는 최종 테스트 중입니다. <em>이메일을 남겨두시면</em> 출시 당일에 알려드릴게요.',
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
      'whatsnew.eyebrow': '계속 만들고 있습니다',
      'whatsnew.title': '최신 빌드',
      'whatsnew.li1': 'AniList나 MyAnimeList의 라이브러리를 한 번에 가져오세요. 항상 앞으로만 움직이기 때문에 이미 쌓인 진도가 되돌아가는 일은 없습니다.',
      'whatsnew.li2': '팝업과 오류 화면까지, 여섯 개 언어 전부가 실제로 번역되었습니다.',
      'whatsnew.li3': '화면이 잠겨도 감상용 배경음이 끊기지 않고, 연결이 끊기면 즉시 배너로 알려줍니다.',
      'whatsnew.foot': '빌드별 전체 변경 내역은 앱의 설정 → 정보 → 앱 버전에서 볼 수 있습니다.',
      'download.eyebrow': '곧 출시',
      'download.body': 'MangaRecs는 심사 제출 전 최종 테스트 중입니다. 출시되는 즉시 이곳에 스토어 링크를 올리겠습니다.',
      'download.platforms': '출시와 함께 iOS와 Android 모두 지원합니다.',
      'download.ios': 'App Store',
      'download.android': 'Google Play',
      'download.soon': '곧',
      'download.emailLabel': '이메일 주소',
      'download.notify': '출시되면 알려주세요',
      'download.fineprint': '출시일에 딱 한 통. 그 외에는 어떤 메일도 보내지 않습니다. <a href="/privacy/">개인정보 처리방침</a>을 확인하세요.',
      'download.count': '이미 {n}명이 등록했습니다.',
      'faq.eyebrow': '자주 묻는 질문',
      'footer.tagline': '만화와 웹툰 라이브러리가 머무는 곳. 기록하고, 추천하고, 이야기하세요. 읽는 사람들이 만들고 계속 고쳐 나갑니다.',
      'footer.browseTitle': '둘러보기',
      'footer.connectTitle': '연결',
      'faq.title': '자주 묻는 질문',
      'faq.q1': 'MangaRecs는 앱인가요, 웹사이트인가요?',
      'faq.a1': 'MangaRecs는 iOS와 Android용 모바일 앱입니다. 이 웹사이트는 그 짝이 되는 곳으로, 여기서 로그인하면 라이브러리가 앱과 계속 동기화됩니다.',
      'faq.q2': '무료인가요?',
      'faq.a2': '네. 카탈로그를 보는 데 로그인이 필요 없고, 앱 자체도 무료입니다. 라이브러리 기록도, 친구와의 대화도, 읽는 것도 유료 장벽이 없습니다.',
      'faq.q3': 'MangaRecs가 실제 회차를 제공하나요?',
      'faq.a3': '아닙니다. MangaRecs는 작품을 찾고 어디까지 읽었는지 기록하도록 돕는 앱이며, 만화·만화(웹툰)·만화(만화책)·웹코믹을 직접 호스팅하거나 배포하지 않습니다.',
      'faq.q4': '어떤 형식을 지원하나요?',
      'faq.a4': '만화, 만화(웹툰), 만화(만화책), 웹코믹, 소설까지 다섯 가지. 하나의 카탈로그와 하나의 라이브러리에 모두 담깁니다.',
      'faq.q5': '언제, 어디서 출시되나요?',
      'faq.a5': '지금은 최종 테스트 중이며 App Store와 Google Play로 향하고 있습니다. APK를 따로 설치할 필요 없이 두 플랫폼 모두 일반 스토어 설치입니다.',
      'faq.q6': '계정이 꼭 필요한가요?',
      'faq.a6': '둘러보기만 한다면 필요 없습니다. 저장한 작품과 읽은 진도를 이 사이트와 앱 사이에서 동기화하고 싶을 때만 로그인하세요.',
      'faq.q7': '그러면 합법인가요?',
      'faq.a7': '네. 카탈로그 데이터는 AniList의 공개 API에서 가져오고, 작품을 읽을 수 있는 링크는 공식 사이트나 저희가 운영하지 않는 제3자 사이트로 연결됩니다. 저희가 직접 호스팅하는 것은 인증된 창작자가 크리에이터 대시보드를 통해 직접 올린 오리지널 작품뿐이며, 창작자의 허락 아래 게시됩니다.',
      'faq.q8': '계정과 그 안의 모든 것을 삭제할 수 있나요?',
      'faq.a8': '네, 메일을 보낼 필요 없이 앱에서 바로 가능합니다. 설정 → 계정 → 삭제. 계정, 읽은 기록, 배지, 친구, 저장한 데이터가 영구히 삭제되며 숨겨지기만 하는 것이 아닙니다. 자세한 내용은 <a href="/privacy/">개인정보 처리방침</a>에 있습니다.',
      'faq.q9': '제 독서 데이터는 어떻게 되나요?',
      'faq.a9': '당신의 라이브러리, 그리고 추가한 친구와 공유하는 활동으로만 남습니다. 광고도 없고, 누구에게 팔거나 빌려주지도 않으며, 학습 데이터로 쓰지도 않습니다. 계정을 지우면 전부 함께 사라집니다.',
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
      'hero.tag': '把你的漫画书架变成社交空间。记录在读进度，发现下一部想追的作品，把好作品推给朋友，在一个地方聊剧情，而不是散落在十几个标签页里。',
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
      'ch2.desc': '你看到的是朋友此刻正在读的东西，而不是他们几个月前读完的。把击碎你的那一话直接发过去，或者把整部作品「推荐」进他们的书库。讨论串按章节屏蔽剧透，落后三话的人也能安心往下滑。',
      'ch2.li1': '把作品直接推荐进朋友的书库——不是一条链接，而是真的收藏进去',
      'ch2.li2': '实时的阅读动态，而不是过期的「最后上线」时间',
      'ch2.li3': '按作品、按章节屏蔽剧透的讨论串',
      'ch3.desc': '250 枚值得认真追的徽章，而不是一个只会变色的奖杯。从青铜爬到神话，守住连续记录，解锁遗物——全是我们自己画的武器原画，不是素材包里的现成图标。它也是我们接下来要做的社群玩法的地基：想象全服活动，而不只是一个人的连续天数。',
      'ch3.li1': '青铜 → 白银 → 黄金 → 神话，是真正的阶梯，不是进度条',
      'ch3.li2': '连续记录，以及和朋友之间的实时排行榜',
      'ch3.li3': '遗物库：手绘奖励，在别的应用里你都没见过',
      'relics.eyebrow': '手绘，而非生成',
      'relics.title': '遗物宝库',
      'relics.sub': '超过黄金段位后，徽章不再只是图标。下面每一件遗物都是我们为某个成就单独绘制的孤品，别处绝无。',
      'relics.foot': '目前共有 15 件遗物，分布在最高的五个段位。<a href="/badges/">查看全部 250 枚徽章</a>。',
      'ch4.desc': '当你的书库有了轮廓，推荐流就会用上它。右滑收藏，左滑跳过——它会一直调整，而不是让你填一次分类问卷就此不管。点一下心情标签，它当场重新洗牌。',
      'ch4.li1': '点赞、评论、分享都在卡片上完成，不用来回切换',
      'ch4.li2': '一直在校准的口味雷达，而不是设一次就忘的分类筛选',
      'ch5.desc': '不管你是从书库、朋友的推荐还是推荐流里找到它，都能直接在应用里读。像条漫那样滚动，或像单行本那样翻页，每部作品各自决定。还有环境音、屏幕调暗，以及凌晨一点不想一直点屏幕时的自动滚动。',
      'ch5.li1': '在其他站点上也能当作干净无广告的阅读器，不只是我们做了原生支持的那几个',
      'why.eyebrow': '为什么会有它',
      'why.body': '我们在十几个网站和三十个标签页之间，总是记不清自己读到哪了；试过的每个应用，要么是一张需要登录的表格，要么内容烂到还没找到一部值得读的就已经关掉。于是我们开始做自己真正想要的那一个——由漫画和韩漫读者发起，做给漫画和韩漫读者。一个准确记得你读到哪里的书库。会真心给你推荐、也能看到你此刻沉迷什么的朋友。刚更新那一话的讨论区、小游戏、值得去追的徽章，还有一段你会舍不得断掉的连续阅读记录。',
      'fcard1.title': '漫画书库',
      'fcard1.sub': '漫画、韩漫、国漫都在<em>同一个书架</em>',
      'fcard2.title': '小说更新',
      'fcard2.sub': '不再错过<em>任何一次更新</em>',
      'fcard3.title': '徽章阶梯',
      'fcard3.sub': '250 枚徽章，<em>从青铜到神话</em>',
      'fcard4.title': '为你推荐',
      'fcard4.sub': '<em>越读越懂你</em>的推荐',
      'updates.title': '最新动态',
      'updates.t1': '书目已经上线',
      'updates.d1': '漫画、韩漫、国漫、网络漫画和小说，现在就能浏览，<em>无需注册</em>。',
      'updates.t2': '所有徽章一览',
      'updates.d2': '七个阶层共 250 枚徽章——登录后页面会填上<em>你自己的进度</em>。',
      'updates.t3': '网页和应用，同一个书库',
      'updates.d3': '在这里收藏一部作品，登录后它<em>已经在应用里等你</em>。',
      'updates.t4': '正在走向商店',
      'updates.d4': 'MangaRecs 正在最后测试——<em>留下邮箱</em>，上线当天我们就通知你。',
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
      'whatsnew.eyebrow': '仍在持续更新',
      'whatsnew.title': '最新版本',
      'whatsnew.li1': '一键导入 AniList 或 MyAnimeList 的整个书库。它只会让你往前走，绝不会覆盖你已有的进度。',
      'whatsnew.li2': '整个应用现已真正支持六种语言，连弹窗和错误页面都不例外。',
      'whatsnew.li3': '读到一半锁屏，阅读环境音也会继续播放；一旦断网，会立刻用横幅提示你。',
      'whatsnew.foot': '每个版本的完整更新说明都在应用内的「设置 → 关于 → 应用版本」里。',
      'download.eyebrow': '即将上线',
      'download.body': 'MangaRecs 正在提交前的最后测试阶段。一旦上线，商店链接会第一时间放在这里。',
      'download.platforms': '上线即支持 iOS 与 Android。',
      'download.ios': 'App Store',
      'download.android': 'Google Play',
      'download.soon': '即将',
      'download.emailLabel': '你的邮箱地址',
      'download.notify': '上线时通知我',
      'download.fineprint': '上线当天只发一封邮件，此外绝不打扰。详见<a href="/privacy/">隐私政策</a>。',
      'download.count': '已有 {n} 位读者加入名单。',
      'faq.eyebrow': '常见问题',
      'footer.tagline': '你的漫画与韩漫书库的社交据点：记录它、推荐它、聊聊它。由读者打造，持续更新。',
      'footer.browseTitle': '浏览',
      'footer.connectTitle': '联系',
      'faq.title': '常见问题',
      'faq.q1': 'MangaRecs 是应用还是网站？',
      'faq.a1': 'MangaRecs 是 iOS 和 Android 上的手机应用，这个网站是它的伴侣：浏览书目，登录之后你的书库会和应用保持同步。',
      'faq.q2': '免费吗？',
      'faq.a2': '免费。在这里浏览书目从不需要登录，应用本身也免费——记录书库、和朋友聊天、阅读，都没有付费墙。',
      'faq.q3': 'MangaRecs 会提供章节内容吗？',
      'faq.a3': '不会。MangaRecs 帮你发现作品、记录读到哪里，本身并不托管或分发漫画、韩漫、条漫或网络漫画。',
      'faq.q4': '支持哪些形式？',
      'faq.a4': '漫画、韩漫、国漫、网络漫画和轻小说，五种形式都在同一个书目和同一个书库里。',
      'faq.q5': '什么时候上线，在哪里？',
      'faq.a5': '目前正在最后测试，即将登陆 App Store 与 Google Play。不需要自行安装 APK，两个平台都是正常的商店安装。',
      'faq.q6': '一定要注册账号吗？',
      'faq.a6': '只是浏览的话不需要。只有当你希望收藏和阅读进度在网站与应用之间同步时，才需要登录。',
      'faq.q7': '那这样合法吗？',
      'faq.a7': '合法。书目数据来自 AniList 的公开 API；如果某部作品标明了阅读来源，链接会指向官方或我们并不运营的第三方站点。由我们托管的只有认证创作者通过创作者后台上传的原创作品，且都经过本人授权。',
      'faq.q8': '可以删除账号和里面的所有内容吗？',
      'faq.a8': '可以，不用给任何人发邮件：在应用中进入「设置 → 账号 → 删除」。账号、阅读记录、徽章、好友和保存的数据都会被永久删除，而不只是隐藏。详情见<a href="/privacy/">隐私政策</a>。',
      'faq.q9': '我的阅读数据会怎样？',
      'faq.a9': '它只属于你的书库，以及你与已添加好友共享的动态。没有广告，不卖也不出租给任何人，更不会拿去训练模型。删除账号，这一切都会随你一起消失。',
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
      'hero.tag': 'Una biblioteca social de manga y manhwa. Sigue lo que estás leyendo, encuentra tu próxima serie, recomiéndala a tus amigos y comenta los capítulos en comunidad, no repartido entre una docena de pestañas.',
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
      'ch2.desc': 'Mira lo que tus amigos están leyendo ahora mismo, no lo que terminaron hace meses. Mándales el capítulo que te destrozó, o «recomiéndales» una serie entera directamente a su biblioteca. Los hilos ocultan spoilers por capítulo, así que alguien tres capítulos por detrás puede leerlos sin quemarse.',
      'ch2.li1': 'Recomienda un título directo a la biblioteca de un amigo: no un enlace, un guardado de verdad',
      'ch2.li2': 'Actividad de lectura en vivo, no una marca de «última conexión» caducada',
      'ch2.li3': 'Hilos de discusión con spoilers ocultos, por capítulo y por serie',
      'ch3.desc': '250 insignias que de verdad merece la pena perseguir, no un trofeo que solo cambia de color. Sube de Bronce a Mítico, mantén viva tu racha y desbloquea reliquias: ilustraciones de armas dibujadas por nosotros, no iconos sacados de un pack. También es la base de los modos comunitarios que vienen después: piensa en eventos para todo el servidor, no solo en un contador personal.',
      'ch3.li1': 'Bronce → Plata → Oro → Mítico: una escalera de verdad, no una barra de progreso',
      'ch3.li2': 'Rachas y una clasificación en vivo frente a tus amigos',
      'ch3.li3': 'La Cámara de Reliquias: recompensas dibujadas a mano, nada que hayas visto en otras cien apps',
      'relics.eyebrow': 'Dibujadas a mano, no generadas',
      'relics.title': 'La Cámara de Reliquias',
      'relics.sub': 'A partir de Oro, las insignias dejan de ser iconos. Cada reliquia de abajo es una pieza única que dibujamos para un solo logro, y no existe en ningún otro sitio.',
      'relics.foot': 'Por ahora existen quince reliquias, repartidas en los cinco niveles más altos. <a href="/badges/">Ver las 250 insignias</a>.',
      'ch4.desc': 'En cuanto tu biblioteca toma forma, el feed la usa. Desliza a la derecha para guardar, a la izquierda para pasar: se va ajustando en lugar de pedirte una encuesta de géneros que rellenas una vez y se olvida. Toca una etiqueta de ánimo y se reordena al instante.',
      'ch4.li1': 'Dale me gusta, comenta y comparte desde la propia tarjeta, sin cambiar de pestaña',
      'ch4.li2': 'Un radar de gustos que sigue ajustándose, no un filtro de géneros que configuras y olvidas',
      'ch5.desc': 'Lo hayas encontrado donde lo hayas encontrado —tu biblioteca, la recomendación de un amigo o el feed—, léelo dentro de la app. Desplázate como en un webtoon o pasa página como en un manga, tú decides en cada serie. Con sonido ambiente, atenuador de pantalla y desplazamiento automático para esos capítulos de la una de la madrugada.',
      'ch5.li1': 'También funciona como lector limpio y sin anuncios en otros sitios, no solo en los que tienen soporte nativo',
      'why.eyebrow': 'Por qué existe',
      'why.body': 'Perdíamos el hilo de lo que estábamos leyendo entre una docena de webs y treinta pestañas abiertas, y cada app que probamos era o una hoja de cálculo con inicio de sesión o tanta morralla que la cerrábamos sin encontrar una sola cosa que mereciera la pena. Así que empezamos a construir la que de verdad queríamos: fundada por lectores de manga y manhwa, para lectores de manga y manhwa. Una biblioteca que recuerda exactamente dónde lo dejaste. Amigos que te pasan recomendaciones reales y que ven en qué andas metido ahora mismo. Un tablón para comentar el capítulo recién salido, minijuegos, insignias que merece la pena perseguir y una racha de lectura que te va a fastidiar romper.',
      'fcard1.title': 'Biblioteca de manga',
      'fcard1.sub': 'Manga, manhwa y manhua en <em>un solo estante</em>',
      'fcard2.title': 'Novedades de novelas',
      'fcard2.sub': 'No te pierdas <em>ningún capítulo</em>',
      'fcard3.title': 'Escalera de insignias',
      'fcard3.sub': '250 insignias, <em>de Bronce a Mítico</em>',
      'fcard4.title': 'Para ti',
      'fcard4.sub': 'Recomendaciones que <em>aprenden mientras lees</em>',
      'updates.title': 'Novedades',
      'updates.t1': 'El catálogo ya está aquí',
      'updates.d1': 'Manga, manhwa, manhua, webcómics y novelas, disponibles ahora mismo y <em>sin cuenta</em>.',
      'updates.t2': 'Todas las insignias, listadas',
      'updates.d2': 'Las 250 insignias en siete niveles: inicia sesión y la página se rellena con <em>tu propio progreso</em>.',
      'updates.t3': 'Web y app, una biblioteca',
      'updates.d3': 'Guarda un título aquí y <em>ya te está esperando en la app</em> cuando inicies sesión.',
      'updates.t4': 'Camino de las tiendas',
      'updates.d4': 'MangaRecs está en pruebas finales: <em>déjanos tu correo</em> y te avisamos el día que salga.',
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
      'whatsnew.eyebrow': 'Seguimos publicando',
      'whatsnew.title': 'La última versión',
      'whatsnew.li1': 'Importa toda tu biblioteca de AniList o MyAnimeList de un toque: solo avanza, así que nunca puede deshacer el progreso que ya tenías.',
      'whatsnew.li2': 'La app está de verdad traducida a los seis idiomas, hasta los avisos emergentes y las pantallas de error.',
      'whatsnew.li3': 'El sonido ambiente sigue sonando aunque se bloquee la pantalla a mitad de capítulo, y un aviso te dice en el momento en que pierdes conexión.',
      'whatsnew.foot': 'Las notas completas de cada versión están en la app, en Ajustes → Información → Versión.',
      'download.eyebrow': 'Muy pronto',
      'download.body': 'MangaRecs está en las pruebas finales antes de enviarla a las tiendas. Vuelve por aquí: los enlaces aparecerán en cuanto esté disponible.',
      'download.platforms': 'iOS y Android desde el primer día.',
      'download.ios': 'App Store',
      'download.android': 'Google Play',
      'download.soon': 'pronto',
      'download.emailLabel': 'Tu correo electrónico',
      'download.notify': 'Avísame en el lanzamiento',
      'download.fineprint': 'Un correo, el día del lanzamiento. Nada más, nunca. Consulta la <a href="/privacy/">Política de Privacidad</a>.',
      'download.count': 'Ya hay {n} lectores en la lista.',
      'faq.eyebrow': 'Preguntas frecuentes',
      'footer.tagline': 'La casa social de tu biblioteca de manga y manhwa: llévala, recomiéndala, coméntala. Hecha por lectores, actualizada sin parar.',
      'footer.browseTitle': 'Explorar',
      'footer.connectTitle': 'Contacto',
      'faq.title': 'Preguntas, respondidas',
      'faq.q1': '¿MangaRecs es una app o una web?',
      'faq.a1': 'MangaRecs es una app para iOS y Android. Esta web es su acompañante: explora el catálogo y, en cuanto inicies sesión aquí, tu biblioteca se mantiene sincronizada con la app.',
      'faq.q2': '¿Es gratis?',
      'faq.a2': 'Sí. Explorar el catálogo nunca exige iniciar sesión, y la app en sí es gratuita: no hay muro de pago para llevar tu biblioteca, hablar con amigos o leer.',
      'faq.q3': '¿MangaRecs aloja los capítulos?',
      'faq.a3': 'No. MangaRecs te ayuda a descubrir títulos y llevar la cuenta de lo que lees; no aloja ni distribuye manga, manhwa, manhua ni webcómics.',
      'faq.q4': '¿Qué formatos admite?',
      'faq.a4': 'Manga, manhwa, manhua, webcómics y novelas: cinco formatos en un solo catálogo y una sola biblioteca.',
      'faq.q5': '¿Cuándo sale, y dónde?',
      'faq.a5': 'Está en pruebas finales, camino de App Store y Google Play. Nada de instalar un APK a mano: será una instalación normal desde la tienda en ambas plataformas.',
      'faq.q6': '¿Necesito una cuenta?',
      'faq.a6': 'Para explorar, no. Inicia sesión solo cuando quieras que tus títulos guardados y tu progreso se sincronicen entre esta web y la app.',
      'faq.q7': 'Entonces, ¿es legal?',
      'faq.a7': 'Sí. Los datos del catálogo vienen de la API pública de AniList, y cuando un título indica dónde leerlo, ese enlace lleva a un sitio oficial o de terceros que no gestionamos. Lo único alojado por nosotros son obras originales que creadores verificados suben desde el Panel de Creador, con su permiso.',
      'faq.q8': '¿Puedo borrar mi cuenta y todo lo que contiene?',
      'faq.a8': 'Sí, desde la app y sin escribirle a nadie: Ajustes → Cuenta → Eliminar. Borra de forma permanente tu cuenta, tu historial de lectura, tus insignias, tus amigos y tus datos guardados; no los esconde. El detalle completo está en la <a href="/privacy/">Política de Privacidad</a>.',
      'faq.q9': '¿Qué pasa con mis datos de lectura?',
      'faq.a9': 'Se quedan en tu biblioteca y en la actividad que compartes con los amigos que hayas añadido, y ya. Sin anuncios, sin vender ni ceder nada a nadie, y sin usarlo para entrenar nada. Si borras tu cuenta, todo se va contigo.',
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
      'hero.tag': "Une bibliothèque sociale de mangas et de manhwas. Suivez vos lectures, trouvez votre prochaine série, recommandez-la à vos amis et discutez des chapitres en communauté, plutôt que dans une douzaine d'onglets.",
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
      'ch2.desc': "Vous voyez ce que vos amis lisent en ce moment, pas ce qu'ils ont terminé il y a des mois. Envoyez-leur le chapitre qui vous a démoli, ou « recommandez-leur » une série entière directement dans leur bibliothèque. Les fils masquent les spoilers chapitre par chapitre : quelqu'un qui a trois chapitres de retard peut tout parcourir sans rien se faire gâcher.",
      'ch2.li1': "Recommandez un titre directement dans la bibliothèque d'un ami — pas un lien, un vrai enregistrement",
      'ch2.li2': "L'activité de lecture en direct, pas un « vu pour la dernière fois » périmé",
      'ch2.li3': 'Des fils de discussion à spoilers masqués, par chapitre et par série',
      'ch3.desc': "250 badges à courir après pour de vrai, pas un trophée unique qui change juste de couleur. Grimpez de Bronze à Mythique, gardez une série de jours en vie et débloquez des reliques — des armes dessinées par nous, pas des icônes prises dans un pack. C'est aussi la base des modes communautaires qui arrivent : imaginez des événements à l'échelle du serveur, pas un simple compteur personnel.",
      'ch3.li1': 'Bronze → Argent → Or → Mythique : une vraie échelle, pas une barre de progression',
      'ch3.li2': 'Des séries de jours et un classement en direct face à vos amis',
      'ch3.li3': "La Chambre des reliques : des récompenses dessinées à la main, rien que vous ayez vu dans cent autres applis",
      'relics.eyebrow': 'Dessinées à la main, pas générées',
      'relics.title': 'La Chambre des Reliques',
      'relics.sub': "Au-delà de l'Or, les badges cessent d'être de simples icônes. Chaque relique ci-dessous est une pièce unique dessinée pour un seul exploit, et elle n'existe nulle part ailleurs.",
      'relics.foot': 'Quinze reliques existent à ce jour, réparties sur les cinq plus hauts paliers. <a href="/badges/">Voir les 250 badges</a>.',
      'ch4.desc': "Dès que votre bibliothèque prend forme, le fil s'en sert. Balayez à droite pour enregistrer, à gauche pour passer : il s'ajuste en continu au lieu de vous faire remplir un questionnaire de genres une fois pour toutes. Touchez une humeur et tout se réorganise sur-le-champ.",
      'ch4.li1': "J'aime, commentaire et partage directement depuis la carte, sans changer d'onglet",
      'ch4.li2': "Un radar de goûts qui continue de s'ajuster, pas un filtre de genres réglé une fois puis oublié",
      'ch5.desc': "Où que vous l'ayez trouvé — votre bibliothèque, la recommandation d'un ami ou le fil —, lisez-le directement dans l'application. En défilement comme un webtoon ou page par page comme un manga, à vous de choisir pour chaque série. Avec ambiance sonore, atténuation de l'écran et défilement automatique pour les chapitres lus à une heure du matin.",
      'ch5.li1': "Fait aussi office de lecteur propre et sans publicité sur d'autres sites, pas seulement ceux que nous prenons en charge nativement",
      'why.eyebrow': 'Pourquoi ça existe',
      'why.body': "On perdait le fil de ce qu'on lisait entre une douzaine de sites et trente onglets ouverts, et chaque application essayée était soit un tableur avec identifiants, soit tellement bâclée qu'on la refermait sans avoir trouvé une seule chose à lire. Alors on a commencé à construire celle qu'on voulait vraiment — fondée par des lecteurs de manga et de manhwa, pour des lecteurs de manga et de manhwa. Une bibliothèque qui retient exactement où vous vous êtes arrêté. Des amis qui vous passent de vraies recommandations et qui voient ce qui vous obsède en ce moment. Un espace de discussion pour le chapitre qui vient de sortir, des mini-jeux, des badges qui valent la peine, et une série de jours que vous n'aurez pas envie de casser.",
      'fcard1.title': 'Bibliothèque manga',
      'fcard1.sub': 'Manga, manhwa et manhua sur <em>une seule étagère</em>',
      'fcard2.title': 'Sorties de romans',
      'fcard2.sub': 'Ne ratez plus <em>une seule sortie</em>',
      'fcard3.title': 'Échelle de badges',
      'fcard3.sub': '250 badges, <em>de Bronze à Mythique</em>',
      'fcard4.title': 'Pour vous',
      'fcard4.sub': 'Des recommandations qui <em>apprennent à vous lire</em>',
      'updates.title': 'Dernières nouveautés',
      'updates.t1': 'Le catalogue est en ligne',
      'updates.d1': 'Manga, manhwa, manhua, webcomics et romans, consultables dès maintenant, <em>sans compte</em>.',
      'updates.t2': 'Tous les badges, listés',
      'updates.d2': "Les 250 badges sur sept paliers — connectez-vous et la page se remplit avec <em>votre propre progression</em>.",
      'updates.t3': 'Le web et l’application, une seule bibliothèque',
      'updates.d3': "Enregistrez un titre ici et il <em>vous attend déjà dans l'application</em> à la connexion.",
      'updates.t4': 'En route vers les stores',
      'updates.d4': "MangaRecs est en tests finaux — <em>laissez votre e-mail</em> et on vous prévient le jour de la sortie.",
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
      'whatsnew.eyebrow': 'Toujours en chantier',
      'whatsnew.title': 'La dernière version',
      'whatsnew.li1': "Importez toute votre bibliothèque depuis AniList ou MyAnimeList en un geste : l'import ne fait qu'avancer, il ne peut donc jamais effacer la progression que vous aviez déjà.",
      'whatsnew.li2': "L'application est désormais vraiment traduite dans les six langues, jusqu'aux fenêtres surgissantes et aux écrans d'erreur.",
      'whatsnew.li3': "L'ambiance sonore continue quand l'écran se verrouille en plein chapitre, et un bandeau vous prévient dès que la connexion tombe.",
      'whatsnew.foot': "Les notes complètes de chaque version sont dans l'application, sous Réglages → À propos → Version.",
      'download.eyebrow': 'Bientôt disponible',
      'download.body': "MangaRecs est en phase de tests finaux avant soumission. Repassez ici : les liens vers les stores arriveront dès la mise en ligne.",
      'download.platforms': 'iOS et Android dès le lancement.',
      'download.ios': 'App Store',
      'download.android': 'Google Play',
      'download.soon': 'bientôt',
      'download.emailLabel': 'Votre adresse e-mail',
      'download.notify': 'Prévenez-moi au lancement',
      'download.fineprint': "Un seul e-mail, le jour du lancement. Rien d'autre, jamais. Voir la <a href=\"/privacy/\">politique de confidentialité</a>.",
      'download.count': '{n} lecteurs sont déjà inscrits.',
      'faq.eyebrow': 'FAQ',
      'footer.tagline': "Le point de ralliement de votre bibliothèque manga et manhwa : suivez-la, recommandez-la, discutez-en. Faite par des lecteurs, mise à jour sans arrêt.",
      'footer.browseTitle': 'Parcourir',
      'footer.connectTitle': 'Nous contacter',
      'faq.title': 'Vos questions, nos réponses',
      'faq.q1': 'MangaRecs, c’est une application ou un site ?',
      'faq.a1': "MangaRecs est une application mobile pour iOS et Android. Ce site l'accompagne : parcourez le catalogue et, une fois connecté ici, votre bibliothèque reste synchronisée avec l'application.",
      'faq.q2': 'Est-ce gratuit ?',
      'faq.a2': "Oui. Parcourir le catalogue ne demande jamais de compte, et l'application elle-même est gratuite : aucun paiement pour suivre votre bibliothèque, parler à vos amis ou lire.",
      'faq.q3': 'MangaRecs héberge-t-il les chapitres ?',
      'faq.a3': "Non. MangaRecs vous aide à découvrir des titres et à savoir où vous en êtes ; il n'héberge ni ne diffuse aucun manga, manhwa, manhua ou webcomic.",
      'faq.q4': 'Quels formats sont pris en charge ?',
      'faq.a4': 'Manga, manhwa, manhua, webcomics et romans : cinq formats, un seul catalogue, une seule bibliothèque.',
      'faq.q5': 'Quand et où sort-il ?',
      'faq.a5': "L'application est en tests finaux, en route vers l'App Store et Google Play. Pas d'APK à installer soi-même : ce sera une installation normale depuis le store sur les deux plateformes.",
      'faq.q6': "Faut-il un compte ?",
      'faq.a6': 'Pas pour parcourir le catalogue. Connectez-vous seulement si vous voulez que vos titres enregistrés et votre progression se synchronisent entre ce site et l’application.',
      'faq.q7': 'Est-ce légal, alors ?',
      'faq.a7': "Oui. Les données du catalogue viennent de l'API publique d'AniList, et quand un titre indique où le lire, le lien mène à un site officiel ou tiers que nous n'exploitons pas. La seule chose hébergée par nous, ce sont les œuvres originales publiées par des créateurs vérifiés via le Tableau de bord créateur, avec leur accord.",
      'faq.q8': 'Puis-je supprimer mon compte et tout ce qu’il contient ?',
      'faq.a8': "Oui, depuis l'application et sans écrire à personne : Réglages → Compte → Supprimer. Cela efface définitivement votre compte, votre historique de lecture, vos badges, vos amis et vos données enregistrées — ce n'est pas un simple masquage. Le détail est dans la <a href=\"/privacy/\">politique de confidentialité</a>.",
      'faq.q9': 'Que deviennent mes données de lecture ?',
      'faq.a9': "Elles restent votre bibliothèque et l'activité que vous partagez avec les amis que vous avez ajoutés, point. Pas de publicité, rien de vendu ni de loué à qui que ce soit, et aucun entraînement de modèle. Supprimez votre compte et tout part avec vous.",
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
    // Prefer the utility cluster (theme / account / menu) — the switcher is
    // chrome, not a destination, and .nav-actions now holds both groups.
    var host = document.querySelector('.nav-utils') || document.querySelector('.nav-actions');
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
    // Ahead of the account button (or the CTA on an unclustered bar) so the
    // switcher never pushes the primary action around as its label changes.
    var anchor = host.querySelector('.nav-cta') || host.querySelector('.account-wrap');
    if (anchor) host.insertBefore(wrap, anchor); else host.appendChild(wrap);
  }

  function init() { buildSwitcher(); apply(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.MangaRecsI18n = { t: t, set: setLanguage, get: function () { return current; }, languages: LANGS };
})();
