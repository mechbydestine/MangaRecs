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
      'whatsnew.eyebrow': 'Still shipping',
      'whatsnew.title': 'The Latest Build',
      'whatsnew.li1': "Import your whole library from AniList or MyAnimeList in one tap — it only ever moves you forward, so it can't undo progress you already have.",
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
      'download.fineprint': 'One email, on launch day — nothing else, ever. See the <a href="/privacy/">Privacy Policy</a>.',
      'download.count': '{n} readers are already on the list.',
      'faq.title': 'Questions, Answered',
      'faq.q1': 'Is MangaRecs an app or a website?',
      'faq.a1': 'MangaRecs is a mobile app for iOS and Android. This website is its companion — browse the catalog, and once you sign in here, your library stays in sync with the app.',
      'faq.q2': 'Is it free?',
      'faq.a2': 'Yes. Browsing the catalog here never requires a login, and the app itself is free — no paywall to track your library, talk to friends, or read.',
      'faq.q3': 'Does MangaRecs host the actual chapters?',
      'faq.a3': "No. MangaRecs helps you discover titles and keep track of what you're reading — it doesn't host or distribute manga, manhwa, manhua, or webcomic content itself.",
      'faq.q4': 'What formats does it support?',
      'faq.a4': 'Manga, manhwa, manhua, webcomics, and novels — five formats, all in one catalog and one library.',
      'faq.q5': 'When does it launch, and where?',
      'faq.a5': "MangaRecs is in final testing now, heading to the App Store and Google Play. No sideloaded APK — it'll be a normal store install on both platforms.",
      'faq.q6': 'Do I need an account?',
      'faq.a6': 'Not to browse. Sign in only when you want your saved titles and reading progress to sync between this site and the app.',
      'faq.q7': 'Is it legal, then?',
      'faq.a7': "Yes. Catalog data comes from AniList's public API, and where a title lists somewhere to read, that link goes to an official or third-party site we don't run. The one thing hosted by us is original work uploaded by verified creators through the Creator Dashboard, with their permission.",
      'faq.q8': 'Can I delete my account and everything in it?',
      'faq.a8': "Yes, in the app, without emailing anyone: Settings → Account → Delete. It permanently removes your account, reading history, badges, friends, and saved data — it doesn't just hide them. The full detail is in the <a href=\"/privacy/\">Privacy Policy</a>.",
      'faq.q9': 'What happens to my reading data?',
      'faq.a9': "It stays your library and the activity you share with friends you've added — that's it. No ads, nothing sold or rented to anyone, and no training data. Delete your account and all of it goes with you.",
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
