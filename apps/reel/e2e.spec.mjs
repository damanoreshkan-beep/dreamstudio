// reel — the headless gate seeds a 3-clip public-domain mock (never the network), so the reel always renders
// populated, and a DIVE lands on a second seeded batch ("Deeper …") so the drill-down is provable offline.
// We assert: the slide feed + its filters, the dive (the island's avatar, subscribe, back — by button AND by
// system Back), the grouped sources tab, and the Liked tab playing in place. We never assert a stream PLAYS —
// headless has no video. Drags aren't dispatchable from this surface, and since 2026-09-20 the dive into a
// clip's own page is a drag ONLY (the island's chevron came out — the gesture already did it, and it names
// its destination under the finger). What the gate can still tap is the account circle, which is the same
// dive into a different url, so the stack, the naming and the way back stay provable.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-reel]")) > 0) break; await h.wait(300); } };
// the black-poster filter is async (loads the poster into a canvas) → poll until the feed settles
const settles = async (h, n) => { for (let i = 0; i < 25; i++) { if ((await h.count("[data-reel]")) === n) return true; await h.wait(200); } return false; };
// Три контроли переїхали з острівця у шторку «Ще» (він став схожий на панель керування). Функція нікуди не
// зникла — вона на один тап глибше, тож і тести дістають її через ці двері, а не через ослаблене твердження.
const openMore = async (h) => { await h.tap("[data-more]"); await h.wait(400); };
const has = async (h, re) => re.test(await h.bodyText());

export default [
  {
    /* Острівець показує АКАУНТ, який виклав кліп, і тап по ньому — це те саме провалювання, що й свайп,
       лише в стрічку цього акаунта. Кейс існує тому, що перша версія кнопки нічого не робила: обробник
       кликав проп `dive` як функцію, а це об'єкт {label, go}, і на більшості слайдів взагалі null. Гейт
       тоді дав рівно ті самі 19/18 — він не торкався острівця, тож мовчазна кнопка доїхала до прода. */
    name: "акаунт в острівці: тап по аватарці провалює у стрічку цього акаунта, Back повертає",
    run: async (h) => {
      await ready(h);
      /* Не чекаємо на settles(3): той хелпер чекає, поки відпрацює фільтр битих постерів, а він ВАНТАЖИТЬ
         постери мока по мережі. Острівець від них не залежить — під гейтом стрічка засіяна ще до першого
         кадру, тож кружечок акаунта є одразу. Тест про провалювання і не повинен падати від того, що
         десь не відкрився thumbnail. */
      const avatarUp = async () => { for (let i = 0; i < 25; i++) { if ((await h.count("[data-channel]")) === 1) return true; await h.wait(200); } return false; };
      h.expect(await avatarUp(), "в острівці немає кружечка акаунта");
      h.expect((await h.count("[data-feed-back]")) === 0, "на нульовому рівні не має бути кнопки «назад»");
      const src = () => h.attr("[data-island-label]", "data-island-src");     // видимий рядок називає КЛІП, джерело — в атрибуті
      const root = await src();

      await h.tap("[data-channel]"); await h.wait(600);
      h.expect((await h.count("[data-feed-back]")) === 1, "тап по аватарці не провалив рівень — кнопки повернення немає");
      h.expect((await src()) !== root, `острівець лишився на «${root}» — стрічка акаунта не відкрилась`);

      await h.tap("[data-feed-back]"); await h.wait(600);
      h.expect((await src()) === root, "Back не повернув на рівень, з якого провалились");
    },
  },
  {
    name: "стрічка рендериться; биті чорні/пласкі постери й дублікати відфільтровано", run: async (h) => {
      await ready(h);
      // mock seeds 6: 3 good + a duplicate (dedupe drops) + a black-poster clip (black filter drops) +
      // a flat-grey placeholder poster (flat filter drops) → 3 clean
      // The COUNT is the whole claim, and it has to be: a slide renders no title text (by design — the
      // surface carries no captions), so the old `bodyText()` checks for the bad clips' names could never
      // have failed. 6 seeded → 3 slides is what actually proves all three filters ran.
      h.expect(await settles(h, 3), "фільтри не звели стрічку до 3 чистих слайдів (дубль/чорний/плаский постер лишились)");
    },
  },
  {
    /* Раніше тут стверджувалось `count("video") === 1` — і саме та одиниця БУЛА вадою. Один елемент означає,
       що кожен свайп знищує відео й будує нове: новий елемент, нове зʼєднання, очікування `loadeddata` — і
       проміжок, у якому нема чого показати. Це і є блимання, на яке скаржився власник.
       Тож інваріант перевернуто: сусідній слайд ПОВИНЕН мати свій елемент (він буферизується, поки ти
       дивишся поточний), і рівно один із них має грати. Обидві половини потрібні — вікно без «рівно одного
       гравця» це просто кілька відео, що грають одночасно. */
    name: "наступне відео вже змонтоване і буферизується; грає рівно одне", run: async (h) => {
      await ready(h);
      h.expect(await settles(h, 3), "стрічка не влаштувалась на 3 слайдах");
      const mains = await h.count("video[data-main]");
      h.expect(mains >= 2, `змонтовано ${mains} відео — сусідній слайд не преload-иться, свайп знову почне з нуля`);
      h.expect(mains <= 3, `змонтовано ${mains} відео — вікно ширше за PRELOAD, це вже витрата декодерів`);
      /* Рівно один власник відтворення. `paused` — це властивість, не атрибут, тож жоден селектор його не
         бачить; застосунок дзеркалить стан у `data-playing`, і це те, що тут міряється. */
      const playing = await h.count("video[data-main][data-playing]");
      h.expect(playing === 1, `грає ${playing} відео замість одного — вікно преload має буферизувати, а не програвати`);
      /* …і те саме, але по ФАКТУ, а не за наміром. `data-playing` — це проп: він зловить «вікно вважає
         активними всіх» і НЕ зловить «прогрів узяв play() і забув віддати». Прогрів навмисне запускає
         сусіда на один кадр, щоб змусити декод, тож єдине, що тримає його від відтворення, — це pause()
         у тому ж ланцюжку. Читаємо справжню властивість першого неактивного елемента. */
      const neighbourPaused = await h.prop("video[data-main]:not([data-playing])", "paused");
      h.expect(neighbourPaused !== false, "сусідній слайд реально ГРАЄ — прогрів не повернув паузу, і у вікні тепер два відтворення");
    },
  },
  {
    /* Тап по слайду відкриває НАШ плеєр. Так було, потім сторінку повернули на тап (2026-09-04, коли плеєр
       був бетою), а 2026-09-20 власник віддав тап плеєру назад: він тягне сходинки з боксу, адаптується,
       перемотується пальцем і тримає нуар. Сторінка сайту лишилась — але як названий рядок у шторці «Ще»,
       бо це рішення, а не рефлекс. Під гейтом /feed/stream не смикається, і openFull підставляє превʼю,
       тож міряється саме ЗВʼЯЗКА: тап → оверлей → Back. */
    name: "тап по рілзу відкриває наш плеєр; «відкрити у браузері» живе у шторці", run: async (h) => {
      await ready(h);
      h.expect(await settles(h, 3), "стрічка не влаштувалась на 3 слайдах");
      h.expect((await h.count('[role="dialog"]')) === 0, "оверлей уже відкритий до тапу");
      await h.tap("[data-reel]"); await h.wait(700);
      h.expect((await h.count('[role="dialog"]')) === 1, "тап по слайду не відкрив плеєр");
      /* І стрічка під ним МОВЧИТЬ. Два елементи одночасно — це дві звукові доріжки; превʼю, що грає поверх
         відкритого кліпа, це саме те, що suspension має прибирати. */
      h.expect((await h.count("video[data-main][data-playing]")) === 0, "стрічка продовжує грати під відкритим кліпом");
      await h.back(); await h.wait(500);
      h.expect((await h.count('[role="dialog"]')) === 0, "системний Back не закрив плеєр");
      h.expect((await h.count("[data-reel]")) >= 1, "Back вийшов з апки замість закрити оверлей");

      // Кнопки плеєра в острівці більше нема — тап робить те саме і коротше.
      h.expect((await h.count("[data-watch-here]")) === 0, "кнопка плеєра лишилась в острівці — це дубль тапу");
      await openMore(h);
      h.expect((await h.count("[data-open-page]")) === 1, "у шторці немає «відкрити у браузері»");
      await h.back(); await h.wait(400);
    },
  },
  {
    name: "hero: дубльованої кнопки джерел нема (лишився лише таб)", run: async (h) => {
      await ready(h);
      h.expect((await h.count("#source")) === 0, "плаваюча кнопка-дубль #source не прибрана з hero");
      h.expect((await h.count('[data-tab="sources"]')) === 1, "таб «Джерела» відсутній у доку");
    },
  },
  {
    // Слайд — це саме відео. Уся хромованка (чіп провалювання, посилання «відкрити оригінал», біла
    // пігулка «дивитись») зведена в ОДИН нижній острівець: одна заява замість однієї на кожен слайд,
    // і до неї дістає клавіатура. Тест міряє, що на слайді не лишилось нічого, і що функція не зникла.
    name: "поверхня: на слайді нема жодного контролу — все живе в нижньому острівці", run: async (h) => {
      await ready(h);
      await settles(h, 3);
      h.expect((await h.count("[data-reel] a")) === 0, "на слайді лишилось посилання (відкрити оригінал)");
      h.expect((await h.count("[data-reel] button")) === 0, "на слайді лишилась кнопка");
      // В ОСТРІВЦІ лишається тільки те, чого НЕ робить жест: назва, акаунт, «дивитись тут» — і двері «Ще».
      for (const [sel, what] of [["[data-island-label]", "назва"], ["[data-channel]", "акаунт"], ["[data-more]", "двері «Ще»"],
        ["[data-island-search]", "пошук по джерелу"], ["[data-island-cast]", "актори"]]) {
        h.expect((await h.count(sel)) === 1, `в острівці немає контролу: ${what} (${sel})`);
      }
      /* І ця назва — САМОГО КЛІПА, а не стрічки. Свайп міняв картинку й аватарку, а рядок стояв на місці
         («не міняється тайтл в островку» — власник). Ім'я джерела лишається в атрибуті, для списку джерел. */
      h.expect((await h.text("[data-island-label]")) === "Big Buck Bunny",
        `острівець підписаний «${await h.text("[data-island-label]")}» — має називати активний кліп`);
      const srcName = await h.attr("[data-island-label]", "data-island-src");
      h.expect(!!srcName && srcName !== (await h.text("[data-island-label]")),
        `ім'я джерела в острівці — «${srcName}»: воно мусить бути і мусить бути ІНШИМ, ніж назва кліпа, інакше списку джерел нема з чим звірятись`);
      /* …а те, що дублює жест або є РІШЕННЯМ, а не рефлексом, з острівця прибрано. Дві кнопки зняті
         2026-09-20 на вимогу власника і тримаються цим твердженням: провалювання робить свайп (і показує
         назву цілі під пальцем), а сторінку кліпа відкриває сам тап по рілзу. Решта — на тап глибше. */
      for (const [sel, what] of [["[data-dive]", "провалювання (це свайп)"], ["[data-watch]", "сторінка кліпа"],
        ["[data-watch-here]", "плеєр (це тап по рілзу)"], ["[data-clean]", "чистий екран"], ["[data-subscribe]", "підписка"], ["[data-exp]", "експорт"]]) {
        h.expect((await h.count(sel)) === 0, `контрол лишився в острівці: ${what} (${sel})`);
      }
      h.expect((await h.count("[data-open-page]")) === 0, "«відкрити у браузері» стоїть в острівці — його місце у шторці");
      const isl = await h.attr("[data-island]", "class");
      h.expect(!/\bopacity-0\b/.test(isl || ""), "острівець не має бути прихованим");

      // …і кожна з них справді жива за дверима, а не просто видалена.
      await openMore(h);
      for (const [sel, what] of [["[data-clean]", "чистий екран"], ["[data-subscribe]", "підписка"], ["[data-open-page]", "сторінка в браузері"]]) {
        h.expect((await h.count(sel)) === 1, `функція зникла разом з переїздом у шторку: ${what} (${sel})`);
      }
      // Експорт: зберегти і поділитися, для обох форматів — чотири контроли, жодного менше.
      for (const key of ["gif-save", "gif-share", "mp4-save", "mp4-share"]) {
        h.expect((await h.count(`[data-exp="${key}"]`)) === 1, `у шторці немає кнопки експорту: ${key}`);
      }
      // Шторка dismissable, тож системний Back мусить її закрити, а не вийти з апки.
      await h.back(); await h.wait(400);
      h.expect((await h.count("[data-exp]")) === 0, "системний Back не закрив шторку «Ще»");
      h.expect((await h.count("[data-reel]")) >= 1, "Back вийшов з апки замість закрити шторку");
    },
  },
  {
    /* Чистий екран. Уся хромованка живе на ТРЬОХ елементах, і два з них — рантаймові (шапка, док + його
       градієнт), тож ховати їх зсередини застосунку не можна: --hdr-h/--dock-h вимірюються з них. Тому це
       режим рантайму (S.clean), а тут перевіряється рівно те, що власник побачить: після тапу на екрані не
       лишилось нічого, крім відео, свайп працює, і назад повертає ВСЕ — і кнопкою-дверима, і системним Back
       (док зник, тож без history-запису Back вийшов би з апки). */
    name: "чистий екран: тап прибирає шапку, док і острівець — лишається саме відео; Back повертає все", run: async (h) => {
      await ready(h);
      h.expect(await settles(h, 3), "стрічка не влаштувалась на 3 слайдах");
      h.expect((await h.count("nav[data-dock]")) === 1 && (await h.count("header.navbar")) === 1, "хромованки нема ще до входу в чистий екран");
      await openMore(h); await h.tap("[data-clean]"); await h.wait(400);
      for (const [sel, what] of [["header.navbar", "шапка"], ["nav[data-dock]", "док"], ["[data-island]", "острівець"]]) {
        h.expect((await h.count(sel)) === 0, `у чистому екрані лишилась ${what} (${sel})`);
      }
      h.expect((await h.count("[data-reel]")) === 3, "чистий екран знищив саму стрічку");
      h.expect((await h.count("[data-clean-exit]")) === 1, "у чистому екрані нема дверей назад — док прибрано, і вийти нема чим");
      /* Кнопка-двері — і тільки вона. Якщо їх дві (або нуль), «нічого не заважає» перестає бути правдою. */
      await h.tap("[data-clean-exit]"); await h.wait(400);
      h.expect((await h.count("nav[data-dock]")) === 1 && (await h.count("[data-island]")) === 1, "двері не повернули хромованку");
      // …і те саме системним Back: без history-запису він вийшов би з апки, бо доку на екрані нема
      await openMore(h); await h.tap("[data-clean]"); await h.wait(400);
      h.expect((await h.count("nav[data-dock]")) === 0, "повторний вхід у чистий екран не спрацював");
      await h.back(); await h.wait(400);
      h.expect((await h.count("nav[data-dock]")) === 1, "системний Back не повернув док (або вийшов з апки)");
      h.expect((await h.count("[data-reel]")) === 3, "Back вийшов зі стрічки замість повернути керування");
    },
  },
  {
    /* Нуар. Стверджується ОБЧИСЛЕНИЙ filter, а не атрибут на <html> і не клас: правило живе в <style> самої
       сторінки, а весь сенс claim-у — що воно ДОЇХАЛО до слайда. Атрибут довів би лише, що атом перемкнувся.
       Другий бік — межа: острівець сусід [data-reel], а не нащадок, тож favicon і синя кнопка play мусять
       лишитись кольоровими; фільтр на них означав би, що правило зачепило корінь.
       І перезавантаження, бо режим persistent: спосіб дивитись, який зникає з сесією, — це не режим. */
    name: "нуар: перемикач у шторці знебарвлює саме кадр, лишає хром кольоровим і переживає перезапуск", run: async (h) => {
      await ready(h);
      h.expect(await settles(h, 3), "стрічка не влаштувалась на 3 слайдах");
      h.expect((await h.css("[data-reel]", "filter")) === "none", "кадр знебарвлений ще до вмикання нуару");
      await openMore(h);
      h.expect((await h.count("[data-noir]")) === 1, "у шторці «Ще» нема перемикача нуару");
      h.expect((await h.prop("[data-noir]", "checked")) === false, "перемикач нуару стоїть увімкненим за замовчуванням");
      await h.tap("[data-noir]"); await h.wait(400);
      h.expect(/grayscale\(1\)/.test(await h.css("[data-reel]", "filter")), "нуар увімкнено, а слайд лишився кольоровим — CSS не доїхав до кадру");
      h.expect((await h.css("[data-more]", "filter")) === "none", "фільтр дістав і острівець — правило зачепило корінь, а не саму стрічку");
      await h.back(); await h.wait(400);                                   // шторку геть — режим не її власність
      h.expect(/grayscale\(1\)/.test(await h.css("[data-reel]", "filter")), "нуар вимкнувся разом зі шторкою");
      await h.reload(); await ready(h);
      h.expect(await settles(h, 3), "після перезапуску стрічка не влаштувалась");
      h.expect(/grayscale\(1\)/.test(await h.css("[data-reel]", "filter")), "нуар не пережив перезапуск — режим не зберігається");
      await openMore(h);
      h.expect((await h.prop("[data-noir]", "checked")) === true, "режим увімкнений, а перемикач у шторці цього не показує");
      await h.tap("[data-noir]"); await h.wait(400);
      h.expect((await h.css("[data-reel]", "filter")) === "none", "нуар не вимикається — кадр лишився чорно-білим");
      /* Прибрати за собою — і це не охайність, а те, на чому цей тест уже раз впав. Шторка це ОВЕРЛЕЙ:
         поки вона відкрита, перший системний Back у будь-якому наступному тесті закриє її, а не відкрутить
         рівень провалювання (index.js: popstate закриває top-most overlay). Тест, що лишає оверлей, ламає
         не себе, а сусіда через два кейси. */
      await h.back(); await h.wait(400);
      h.expect((await h.count("[data-noir]")) === 0, "шторка лишилась відкритою — наступний системний Back дістанеться їй, а не рівню стрічки");
    },
  },
  {
    name: "провалювання: акаунт відкривається як нове джерело з людською назвою, назад — той самий список", run: async (h) => {
      await ready(h);
      await settles(h, 3);
      h.expect((await h.count("[data-channel]")) >= 1, "в острівці немає цілі провалювання (data-channel)");
      h.expect((await h.count("[data-feed-back]")) === 0, "на нульовому рівні не має бути кнопки «назад»");
      const root = await h.attr("[data-island-label]", "data-island-src");
      const chip = await h.attr("[data-channel]", "aria-label");
      h.expect(/Nine Lives Studio/.test(chip), `кружечок акаунта підписаний «${chip}» — має нести ім'я акаунта, а не форму URL`);
      await h.tap("[data-channel]"); await h.wait(600);
      // the dived page seeds a DIFFERENT batch (2 slides) — the source label and the list both had to change
      h.expect(await settles(h, 2), "провалювання не завантажило стрічку сторінки, на якій лежить рілз");
      h.expect((await h.attr("[data-island-label]", "data-island-src")) !== root, `острівець лишився на «${root}» — джерело не змінилось`);
      // …and it is named by the PAGE, not by the shape of its URL. `/profiles/user10241/` is a handle that
      // names nothing; the mock's page title is "Nine%20Lives Studio &amp; Friends — Mixkit", so the chrome must
      // come off AND the machine text has to be decoded — a percent-escape and an entity, both of which
      // reached the screen raw before humanText existed.
      /* Назва САМОГО ДЖЕРЕЛА живе в атрибуті: видимий рядок тепер називає кліп, на якому ти стоїш (свайп
         міняв картинку й акаунт, а текст стояв — власник, 2026-09-20), а ім'я сторінки нікуди не поділось і
         досі мусить бути розкодованим. */
      const lvl = await h.attr("[data-island-label]", "data-island-src");
      h.expect(lvl === "Nine Lives Studio & Friends", `острівець показує «${lvl}» замість справжньої назви сторінки «Nine Lives Studio & Friends»`);
      h.expect(!/%[0-9A-Fa-f]{2}|&[a-z]+;|&#/.test(lvl), `в назві джерела лишились нерозкодовані символи: «${lvl}»`);
      h.expect((await h.count("[data-feed-back]")) === 1, "після провалювання немає кнопки повернення");
      // …and back restores the ORIGINAL list (a restore, not a refetch)
      await h.tap("[data-feed-back]"); await h.wait(500);
      h.expect((await h.attr("[data-island-label]", "data-island-src")) === root, "повернення не відновило попереднє джерело");
      h.expect(await settles(h, 3), "повернувся не той самий список із 3 слайдів");
      h.expect((await h.count("[data-feed-back]")) === 0, "кнопка повернення лишилась на нульовому рівні");
    },
  },
  {
    name: "провалювання: системний Back відкручує рівень (а не виходить з апки)", run: async (h) => {
      await ready(h);
      /* Рівні звіряються по ДЖЕРЕЛУ (атрибут): обидва акаунти під гейтом відкривають ту саму пару кліпів,
         тож видимий рядок — назва кліпа — на обох рівнях однаковий, і ним рівні не розрізниш. */
      const src = () => h.attr("[data-island-label]", "data-island-src");
      const root = await src();
      await h.tap("[data-channel]"); await h.wait(600);
      const lvl1 = await src();
      h.expect(lvl1 !== root, "провалювання не спрацювало");
      await h.tap("[data-channel]"); await h.wait(600);                // другий рівень — стек, а не один прапорець
      const lvl2 = await src();
      h.expect(lvl2 && lvl2 !== lvl1, `другий рівень не відкрився (острівець лишився на «${lvl1}»)`);
      await h.back(); await h.wait(500);
      h.expect((await src()) === lvl1, "перший системний Back мав відкрутити рівно один рівень, а не впасти в корінь");
      await h.back(); await h.wait(500);
      h.expect((await src()) === root, "другий системний Back не повернув у корінь стрічки");
      h.expect((await h.count("[data-reel]")) >= 1, "апка зникла — Back вийшов далі, ніж мав");
    },
  },
  {
    name: "провалювання: у джерело без підписки — кнопка «підписатись» додає його в таб джерел", run: async (h) => {
      await ready(h);
      await h.tap("[data-channel]"); await h.wait(600);
      // Назву читаємо ДО відкриття шторки: острівець лишається під нею, але міряти видиме крізь оверлей —
      // це вимірювати не те, що бачить власник.
      const island = await h.attr("[data-island-label]", "data-island-src");
      await openMore(h);
      h.expect((await h.count("[data-subscribe]")) === 1, "на непідписаному джерелі немає кнопки підписки");
      await h.tap("[data-subscribe]"); await h.wait(400);
      /* Підписка закриває шторку за собою, тож перевіряти «кнопка зникла» на закритій шторці — це
         твердження, яке правдиве завжди й не перевіряє нічого. Відкриваємо ще раз і міряємо ТАМ, де
         контрол живе: зник він через subbed, а не через те, що ми відвели очі. */
      await openMore(h);
      h.expect((await h.count("[data-subscribe]")) === 0, "після підписки кнопка мала зникнути");
      await h.back(); await h.wait(400);
      h.expect((await h.count("[data-exp]")) === 0, "шторка лишилась відкритою над стрічкою");
      await h.tap('[data-tab="sources"]'); await h.wait(400);
      h.expect(await has(h, /Підписки|Subscriptions/), "таб джерел не відкрився");
      /* Рядок джерела і острівець — це ОДНА відповідь на питання «як зветься ця сторінка», тож звіряємо їх
         рядок у рядок, а не по підрядку. Саме тут вони й розходились: острівцю віддавали <title> сторінки,
         а список довіку показував здогад, зроблений з самого URL у мить підписки. */
      const row = await h.text("[data-src-title]");
      h.expect(row === island, `рядок джерела показує «${row}», а острівець — «${island}»: два різні імені однієї сторінки`);
      /* …і показує його ЦІЛКОМ. Текст у DOM нічого не доводить (innerText той самий і під `truncate`), тож
         міряємо: рядок переносить назву, а не ріже її — ширина вмісту не виходить за ширину елемента. */
      const [sw, cw] = [await h.prop("[data-src-title]", "scrollWidth"), await h.prop("[data-src-title]", "clientWidth")];
      h.expect(sw <= cw + 1, `назву джерела обрізано по горизонталі (${sw}px вмісту в ${cw}px рядка) — вона має переноситись, а не ховатись`);
      h.expect(!/…$/.test(row), `назву джерела вкорочено трикрапкою («${row}») — у рядку є місце на повну`);
      await h.tap('[data-tab="reel"]'); await h.wait(400);
      await h.tap("[data-feed-back]"); await h.wait(400);              // прибираємо за собою — далі тести чекають корінь
    },
  },
  {
    /* Пошук по ДЖЕРЕЛУ, з острівця. У кожного сайту свій патерн, і ми його не вгадуємо: едж читає його з
       посилань, які сайт сам публікує, і віддає приклад результатної URL разом зі стрічкою (`search`).
       Під гейтом цей приклад підставлений (GATE_SEARCH) — інакше кнопки просто не було б, бо вона є лише
       там, куди є куди слати. Кейс міряє весь ланцюг: кнопка → інпут → «Знайти» → джерело стало пошуковим. */
    name: "острівець: пошук по джерелу підставляє термін у патерн сайту", run: async (h) => {
      await h.tap('[data-tab="reel"]'); await h.wait(400);   // не спиратись на прибирання попереднього кейсу: той, що впав, лишає апку де завгодно
      await ready(h);
      h.expect((await h.count("[data-island-search]")) === 1, "в острівці нема кнопки пошуку");
      h.expect((await h.count("#island-q")) === 0, "інпут пошуку стоїть розгорнутим — він має бути за кнопкою");
      await h.tap("[data-island-search]"); await h.wait(400);
      h.expect((await h.count("#island-q")) === 1, "кнопка не розгорнула інпут");
      h.expect((await h.count("[data-island-label]")) === 0, "шухляда пошуку мусить ЗАЙНЯТИ рядок острівця — на 384px інакше нема місця");
      await h.type("#island-q", "sintel"); await h.wait(150);
      await h.tap("#island-find"); await h.wait(800);
      const src = await h.storage("reel:src");
      h.expect(/[?&]q=sintel\b/.test(src || ""), `джерелом стало «${src}» — термін не підставився в патерн сайту`);
      h.expect((await h.count("#island-q")) === 0, "шухляда лишилась відкритою після пошуку");
      h.expect((await h.count("[data-island-label]")) === 1, "острівець не повернувся у звичайний рядок");
    },
  },
  {
    /* Актори. Їх нема в лістингу — вони на сторінці самого кліпа, тож це ОКРЕМИЙ запит, і саме тому він за
       кнопкою: тридцять плиток означали б тридцять завантажень сторінок заради рядка, який більшість не
       відкриє. Тап по обличчю — те саме провалювання, що й по аватарці автора. */
    name: "острівець: кнопка тягне акторів кліпа, тап по обличчю провалює у його стрічку", run: async (h) => {
      await h.tap('[data-tab="reel"]'); await h.wait(400);   // не спиратись на прибирання попереднього кейсу: той, що впав, лишає апку де завгодно
      await ready(h);
      h.expect((await h.count("[data-cast-row]")) === 0, "список акторів показано до того, як його попросили");
      h.expect((await h.count("[data-island-cast]")) === 1, "в острівці нема кнопки акторів");
      await h.tap("[data-island-cast]"); await h.wait(600);
      h.expect((await h.count("[data-cast-row]")) === 1, "кнопка не розгорнула рядок акторів");
      h.expect((await h.count("[data-cast-person]")) >= 1, "рядок акторів порожній");
      h.expect((await h.count("[data-island-label]")) === 1, "актори мусять відкритись НАД рядком, а не замість нього");
      const root = await h.attr("[data-island-label]", "data-island-src");
      await h.tap("[data-cast-person]"); await h.wait(700);
      h.expect((await h.count("[data-cast-row]")) === 0, "шухляда не закрилась після переходу");
      h.expect((await h.attr("[data-island-label]", "data-island-src")) !== root, `острівець лишився на «${root}» — тап по актору нікуди не провалив`);
      await h.tap("[data-feed-back]"); await h.wait(600);                 // прибрати за собою: назад на корінь
    },
  },
  {
    name: "джерела: канали згруповані по сайтах з людськими назвами сторінок (Back закриває шит)", run: async (h) => {
      await ready(h);
      await h.tap('[data-tab="sources"]'); await h.wait(300);           // reel → sources tab (dock)
      h.expect((await h.count("[data-src-row]")) >= 3, "немає готових каналів");
      const txt = await h.bodyText();
      h.expect(/mixkit\.co/.test(txt), "картка сайту не показує домен");
      h.expect(/Space/.test(txt) && !/free-stock-video\/space/.test(txt), "рядок сторінки має показувати назву, а не сирий URL");
      await h.tap("#add-url"); await h.wait(300);
      h.expect((await h.count("#src-input")) === 1, "шит додавання URL не відкрився");
      await h.back(); await h.wait(300);
      h.expect((await h.count("#src-input")) === 0, "Back не закрив шит");
    },
  },
  {
    name: "«відкрити сайт» відкриває зовнішній браузер — жодного iframe-оверлея в апці", run: async (h) => {
      await ready(h);
      await h.tap('[data-tab="sources"]'); await h.wait(300);
      h.expect((await h.count("[data-open-site]")) >= 1, "кнопки «відкрити сайт» немає");
      await h.tap("[data-open-site]"); await h.wait(400);               // opens the external browser (window.open)
      h.expect((await h.count("[data-frame]")) === 0, "iframe-оверлей більше не має існувати в апці");
    },
  },
  {
    /* Голий домен — теж джерело. `type="url"` змушував браузер валідувати поле ПЕРЕД сабмітом, тож
       «site.com» мовчки не завантажувалось: наш `norm()`, який дописує https://, навіть не викликався. */
    name: "додати-URL: голий домен без схеми вантажиться як джерело", run: async (h) => {
      await ready(h);
      const root = await h.attr("[data-island-label]", "data-island-src");
      await h.tap('[data-tab="sources"]'); await h.wait(300);
      await h.tap("#add-url"); await h.wait(300);
      /* Домен БЕРЕТЬСЯ той, що вже є в підписках (mixkit): інакше цей кейс додав би нову картку сайту, а
         наступні кейси рахують картки й ключі сесій — тест не має лишати по собі новий стан. */
      await h.type("#src-input", "mixkit.co"); await h.wait(200);
      await h.tap("#src-load"); await h.wait(800);
      h.expect((await h.count("#src-input")) === 0, "шит не закрився — сабміт не пройшов (поле валідується як url?)");
      const now = await h.attr("[data-island-label]", "data-island-src");
      h.expect(now !== root, `джерело лишилось «${root}» — голий домен не підхопився`);
      h.expect(/Mixkit/i.test(now || ""), `джерело зветься «${now}» — мало вийти з домену, який набрали`);
    },
  },
  {
    /* Поділитись у reel — це вставити URL з іншого боку. Android дає не URL, а ТЕКСТ, у якому посилання
       лежить серед слів (TikTok шле підпис, Telegram — заголовок і лінк), тож резолвер шукає перше справжнє
       посилання й лише потім голий домен. PWA отримує його як sh_* у квері (manifest share_target), APK —
       через шину шелла (share.incoming); тут перевіряються перші двері, бо гейт — браузер, а не APK.
       Другий інваріант не менш важливий за перший: параметри ЗНІМАЮТЬСЯ з адреси. Інакше перезавантаження
       (або відновлення вкладки) додало б те саме джерело вдруге, і адресний рядок носив би чужий підпис. */
    name: "поділитись: посилання серед тексту стає джерелом, а sh_* зникають з адреси", run: async (h) => {
      await ready(h);
      const root = await h.attr("[data-island-label]", "data-island-src");
      /* Ділимось сторінкою ТОГО САМОГО сайту, що вже в підписках: кейс нижче рахує ключі сесій по картках
         сайтів (рівно один) — тест не має права лишити по собі нову картку. */
      await h.goto("sh_text=" + encodeURIComponent("глянь це https://mixkit.co/free-stock-video/nature/ — вогонь"), 1600);
      await ready(h);
      // Твердження про САМ URL, а не про назву, яку з нього виведуть: назва — це здогад, джерело — контракт.
      const src = await h.storage("reel:src");
      h.expect(/mixkit\.co\/free-stock-video\/nature\//.test(src || ""), `джерелом стало «${src}» — посилання з тексту не підхопилось`);
      const now = await h.attr("[data-island-label]", "data-island-src");
      h.expect(now !== root, `острівець лишився на «${root}» — стрічка не перемкнулась на поділене джерело`);
      const here = await h.prop("html", "baseURI");
      h.expect(!/sh_/.test(here || ""), `в адресі лишилось «${here}» — перезавантаження додало б джерело вдруге`);
      await h.goto("", 1200);                                          // прибираємо за собою: далі кейси стартують з чистої адреси
    },
  },
  {
    name: "додати-URL: поле пошуку з'являється лише коли в URL є квері-параметри", run: async (h) => {
      await ready(h);
      await h.tap('[data-tab="sources"]'); await h.wait(300);
      await h.tap("#add-url"); await h.wait(300);
      h.expect((await h.count("#sheet-search")) === 0, "поле пошуку показалось для порожнього URL");
      await h.type("#src-input", "site.com/search?q=cats"); await h.wait(200);   // resolver finds ?q= → searchable
      h.expect((await h.count("#sheet-search")) === 1, "поле пошуку не з'явилось для URL з квері-параметром");
      await h.back(); await h.wait(300);
    },
  },
  {
    /* Сесія сайту: ключ на картці МОГО сайту відкриває шит з одним полем (Cookie сайту) — history-backed, Back
       закриває. Збережена сесія позначає ключ (aria-pressed); «Забути» є лише коли сесія збережена. Пресети (Discover)
       ключа не мають — у чужого каналу нема твого акаунта. Мережі під гейтом немає, тож сам POST з кукі до
       /feed/videos доводиться unit-тестом на edge (pageHeaders/videosBody), а тут — тільки стан і маршрут. */
    name: "сесія сайту: ключ на картці → шит (Back закриває) → збережено → позначено → забути", run: async (h) => {
      await ready(h);
      await h.tap('[data-tab="sources"]'); await h.wait(300);
      h.expect((await h.count("[data-session]")) === 1, `ключ сесії має бути рівно на одній картці (мої сайти), є ${await h.count("[data-session]")}`);
      h.expect((await h.count('[data-session][aria-pressed="true"]')) === 0, "сесія позначена до збереження");
      await h.tap("[data-session]"); await h.wait(300);
      h.expect((await h.count("#sess-input")) === 1, "шит сесії не відкрився");
      h.expect((await h.count("[data-sess-forget]")) === 0, "«Забути» показано, хоча сесії ще нема");
      h.expect((await h.prop("#sess-save", "disabled")) === true, "«Зберегти» активна на порожньому полі");
      await h.back(); await h.wait(300);
      h.expect((await h.count("#sess-input")) === 0, "Back не закрив шит сесії");
      await h.tap("[data-session]"); await h.wait(300);
      await h.type("#sess-input", "il=abc; ss=def"); await h.wait(150);
      await h.tap("#sess-save"); await h.wait(400);
      h.expect((await h.count("#sess-input")) === 0, "збереження не закрило шит");
      h.expect((await h.count('[data-session][aria-pressed="true"]')) === 1, "збережена сесія не позначила ключ");
      await h.tap("[data-session]"); await h.wait(300);
      h.expect((await h.prop("#sess-input", "value")) === "il=abc; ss=def", "шит не показав збережену сесію");
      h.expect((await h.count("[data-sess-forget]")) === 1, "«Забути» не показано для збереженої сесії");
      await h.tap("[data-sess-forget]"); await h.wait(400);
      h.expect((await h.count("#sess-input")) === 0, "«Забути» не закрило шит");
      h.expect((await h.count('[data-session][aria-pressed="true"]')) === 0, "«Забути» не зняло позначку з ключа");
    },
  },
  {
    /* Нуар — це спосіб дивитись, а не властивість однієї вкладки. Сітка лайків — це ті самі кадри, три в
       ряд, і вона лишалась кольоровою, бо прапорець на <html> знімався разом зі стрічкою (власник,
       2026-09-21). Міряється обчислений filter на ПОСТЕРІ й на серденьку поруч: колір — це дія. */
    name: "нуар: сітка лайків теж знебарвлюється, а її контроли лишаються кольоровими", run: async (h) => {
      await h.tap('[data-tab="reel"]'); await h.wait(400);   // попередній кейс лишається у джерелах — там нема ні острівця, ні шторки
      await ready(h);
      await openMore(h);
      await h.tap("[data-noir]"); await h.wait(400);
      // …і доводимо, що перемикач СПРАЦЮВАВ, поки стрічка ще на екрані: інакше «постер кольоровий» нижче
      // означає лише те, що нуар так і не увімкнули, і кейс звітує про чужу біду.
      h.expect(/grayscale\(1\)/.test(await h.css("[data-reel]", "filter")), "нуар не увімкнувся — далі міряти нема чого");
      await h.back(); await h.wait(400);
      await h.tap('[data-tab="liked"]'); await h.wait(600);
      h.expect((await h.count("[data-liked] img")) >= 1, "у сітці лайків нема жодного постера");
      h.expect(/grayscale\(1\)/.test(await h.css("[data-liked] img", "filter")),
        `нуар увімкнено, а постер у лайках лишився кольоровим (filter: ${await h.css("[data-liked] img", "filter")})`);
      h.expect((await h.css("[data-liked] button", "filter")) === "none", "фільтр дістав і контроли плитки — правило зачепило забагато");
      // Прибрати за собою: режим persistent, і наступні кейси міряють кадр.
      await h.tap('[data-tab="reel"]'); await h.wait(500);
      await openMore(h);
      await h.tap("[data-noir]"); await h.wait(400);
      await h.back(); await h.wait(400);
      h.expect((await h.count("[data-noir]")) === 0, "шторка лишилась відкритою — наступний Back дістанеться їй");
    },
  },
  {
    name: "лайки: тайл відкриває стрічку ПРЯМО в табі лайків, системний Back повертає сітку", run: async (h) => {
      await ready(h);
      await h.tap('[data-tab="liked"]'); await h.wait(400);
      h.expect((await h.count("[data-liked-tile]")) === 3, "сітка лайків не заповнена сідованими записами");
      await h.tap("[data-liked-tile]"); await h.wait(600);
      h.expect((await h.count("[data-reel]")) >= 1, "тайл не відкрив стрічку");
      h.expect((await h.count("[data-liked-tile]")) === 0, "сітка лайків лишилась під стрічкою");
      h.expect((await h.attr('[data-tab="liked"]', "aria-current")) === "page", "стрічка перекинула нас в інший таб замість відкритись у лайках");
      await h.back(); await h.wait(500);
      h.expect((await h.count("[data-liked-tile]")) === 3, "системний Back не повернув сітку лайків");
      h.expect((await h.attr('[data-tab="liked"]', "aria-current")) === "page", "Back вискочив із таба лайків");
      /* Чистий екран помирає разом з поверхнею, яку він чистив. S.clean лежить НИЖЧЕ S.stack, тож Back із
         лайкової стрічки спершу знімає рівень стека — і сітка лайків відрендерилась би без шапки й доку, з
         однією маленькою кнопкою замість навігації. Це той самий Back, що й вище, тільки з увімкненим
         чистим екраном: заявка в тому, що виходиш у ПОВНОЦІННУ сітку, а не в обрізану. */
      await h.tap("[data-liked-tile]"); await h.wait(600);
      await openMore(h); await h.tap("[data-clean]"); await h.wait(400);
      h.expect((await h.count("nav[data-dock]")) === 0, "чистий екран не увімкнувся в лайковій стрічці");
      await h.back(); await h.wait(600);
      h.expect((await h.count("[data-liked-tile]")) === 3, "Back із чистого екрана не повернув сітку лайків");
      h.expect((await h.count("nav[data-dock]")) === 1 && (await h.count("header.navbar")) === 1, "сітка лайків повернулась без хромованки — чистий екран пережив поверхню, яку чистив");
      h.expect((await h.count("[data-clean-exit]")) === 0, "двері чистого екрана лишились над сіткою");
    },
  },
];
