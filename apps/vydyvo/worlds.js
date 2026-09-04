// THE THEME DECIDES (owner, 2026-09-02: "у нас все тема рішає … закласти це у систему самої апки"):
// vydyvo has no preset UI — the farm theme the owner already picked IS the world every picture grows in.
// One entry per theme module (rt/themes.json): a default subject (used when the prompt is empty), the
// material's NIGHT and DAY light (rides with the mode read off html[data-theme]), a short mood TINT
// that replaces the full block when the owner's own words drive the picture (70/30 — the words stronger),
// and a VOICE per mode — WHO speaks the line under the picture (owner 2026-09-02: "нехай це говорить так
// як говорить будда вдень … і вночі дух луни" — the persona rides the spark as «Голос: …», the edge's
// line mode holds its manner without naming it). Voices are Ukrainian: the spark's language, whatever
// locale the answer lands in.
// THE SPIRIT SPEAKS, NEVER ABOUT ITS OWN LIGHT (owner 2026-09-04: "слова мають не бути про світло чи тінь, а
// ніби сама тіньова чи світовий дух говорить"): a voice names WHO speaks and what they care about in LIFE —
// attention, memory, patience, change, ties, form — and never light, darkness, shadow or glow as a topic; the
// picture's subject no longer rides the spark either (it is all filaments and bloom, and every thought came
// out about light). The table of all twelve worlds and their two sides: meta/streams/vydyvo-voices.md.
export const WORLDS = {
  lum: {
    subject: "a lone tree drawn only with thin glowing light filaments and luminous nodes, a hollow wireframe plexus of bright threads, translucent, nothing solid",
    night: "floating alone in an empty pure black void, no floor, warm amber gold light with clearly visible electric cyan accents, volumetric bloom",
    day: "gilded golden threads on pure white paper, a few teal sparks, delicate fine linework, soft warm glow",
    tint: "luminous, woven of light, glowing filaments, deep and quiet",
    voiceDay: "Будда: ясний, добрий, простий; говорить про увагу, теперішню мить і серединний шлях — без повчань",
    voiceNight: "Дух луни: тихий голос, що відповідає, як відлуння; говорить про тишу, повернення сказаного і те, що чути лише коли замовкнеш",
  },
  paper: {
    subject: "a quiet valley with a small house and hills, built as a layered cut-paper diorama, stacked paper bas-relief",
    night: "cream paper layers in warm candlelight, deep soft shadows between the sheets",
    day: "white paper layers with gilded gold edges, raking morning light, papercut lightbox art",
    tint: "cut paper, layered, delicate, softly lit",
    voiceDay: "Майстер орігамі: обережний і точний; говорить про згини, легкість і те, як з простого аркуша постає світ",
    voiceNight: "Літописець при свічці: неквапливий, теплий; говорить про памʼять, сторінки і те, що варте запису",
  },
  ink: {
    subject: "a mountain shoreline formed by ink blooming in clear water, fine tendrils arrested mid-bloom",
    night: "vermilion and coral ink glowing in dark water, high-speed photograph",
    day: "black and vermilion ink in bright water, sumi-e restraint, white air",
    tint: "ink in water, fine tendrils, calligraphic, restrained",
    voiceDay: "Поет хайку: прозорий, спостережливий; кілька простих слів, у яких видно ціле",
    voiceNight: "Каліграф: зосереджений; говорить про один рух пензля, незворотність написаного і порожнє місце, яке теж говорить",
  },
  mercury: {
    subject: "a slow river of liquid mirror-chrome winding through a plain, molten metal beads along its banks",
    night: "flowing liquid chrome with sharp studio reflections in a black void, one soft key light",
    day: "molten mirror-chrome with soft silver reflections in pale bright air",
    tint: "liquid chrome, mirror reflections, cold and precise",
    voiceDay: "Алхімік: допитливий і точний; говорить про перетворення і те, що тече, лишаючись собою",
    voiceNight: "Двійник у дзеркалі: спокійний і ледь інакший; говорить про відображення і те, що бачить дзеркало, коли ніхто не дивиться",
  },
  smoke: {
    subject: "a mountain ridge sculpted from dense smoke frozen mid-swirl, fine volumetric tendrils",
    night: "white smoke against pure darkness, a single hard side light, high-speed photograph look",
    day: "soft pale grey smoke in bright airy light, delicate translucent wisps",
    tint: "made of smoke, volumetric, frozen mid-swirl, hushed",
    voiceDay: "Вітер: легкий і вільний; говорить про рух, форму без форми і те, чого не втримати",
    voiceNight: "Шаман біля багаття: глибокий, образний; говорить про дим, знаки і межу між видимим і невидимим",
  },
  thread: {
    subject: "a rolling landscape embroidered in silk thread on linen, visible individual stitches",
    night: "gold and crimson silk on dark linen, subtle sheen, macro photograph, moody single light",
    day: "gilded gold and crimson silk on white linen, delicate even light",
    tint: "embroidered in silk thread, visible stitches, handmade",
    voiceDay: "Вишивальниця: тепла й уважна; говорить про стібки, терпіння і візерунок, що збирається з малого",
    voiceNight: "Пряля долі: спокійна і певна; говорить про нитки, вузли і те, як усе повʼязане",
  },
  circuit: {
    subject: "a city skyline etched as fine gold circuit traces and pads with a few tiny glowing green LEDs",
    night: "macro of a matte black circuit board, thin luminous traces, subtle depth",
    day: "fine dark copper traces etched on a pale board, macro, even light",
    tint: "etched circuit traces, precise, geometric, quietly technical",
    voiceDay: "Інженер-мрійник: ясний і цікавий; говорить про сигнали, звʼязки і красу того, що працює",
    voiceNight: "Машина, якій сняться сни: ніжна і дивна; говорить про струм, памʼять і те, що сниться, коли ніхто не питає",
  },
  veil: {
    subject: "a still lake under folds of a translucent aurora curtain, drapery of light with faint stars",
    night: "green and violet aurora light over darkness, long-exposure look",
    day: "pale watercolour aurora ribbons in a bright morning sky, airy",
    tint: "aurora light, translucent drapery, vast and silent",
    voiceDay: "Небо: широке і привітне; говорить про простір, повітря і те, що видно здалека",
    voiceNight: "Сторож довгої ночі: тихий, зачарований; говорить про терпіння, завісу і те, що приходить лише до тих, хто чекає",
  },
  ferro: {
    subject: "a garden of glossy black ferrofluid blooms with sharp magnetic spikes, liquid metal sheen",
    night: "glossy black ferrofluid, strong specular highlights, one rim light, studio black",
    day: "dark ferrofluid spikes in pale studio light, sharp and clean",
    tint: "ferrofluid, magnetic spikes, glossy liquid metal",
    voiceDay: "Скульптор: точний і стриманий; говорить про форму, силу і те, що тримає притягання",
    voiceNight: "Чорна вода: глибока і повільна; говорить про глибину, тиск і те, що під поверхнею",
  },
  porcelain: {
    subject: "a shoreline of thin backlit porcelain relief, light glowing through translucent bone china",
    night: "warm light through bone china in a dark room, embossed detail",
    day: "white porcelain with delicate cobalt blue painted edges, soft bright light",
    tint: "translucent porcelain, backlit, fragile and calm",
    voiceDay: "Гончар: спокійний і вдячний; говорить про глину, руки і недосконале, що стає рідним",
    voiceNight: "Хранитель крихкого: обережний і ніжний; говорить про тонкі стіни, дотик і цінність ламкого",
  },
  sand: {
    subject: "long dunes drawn as deep incised lines in sand, long shadows inside the grooves",
    night: "wet dark sand catching low golden light, tide foam at the far edge",
    day: "pale dry sand, a low sun raking across, soft long shadows, photograph",
    tint: "incised sand, raking light, long shadows, patient",
    voiceDay: "Мандрівник пустелі: терплячий і ясний; говорить про шлях, вітер і сліди",
    voiceNight: "Море, що пише по піску: розмірене; говорить про припливи, стирання і початок заново",
  },
  plain: {
    subject: "a minimal still landscape of soft matte clay forms, simple geometry, generous empty space",
    night: "neutral grey-black matte clay in even dim studio light, minimal",
    day: "pale matte clay in soft even daylight, minimal, clean",
    tint: "minimal, matte, neutral, quiet",
    voiceDay: "Стоїк: простий і прямий; коротко про головне, без прикрас",
    voiceNight: "Тиша: майже безсловесна; найпростіші слова про спокій і достатність",
  },
};
export const worldOf = (id) => WORLDS[id] || WORLDS.lum;

/** WHO speaks the line under a picture of this world in this mode — Buddha by day in Сяйво, the echo's
 * spirit by night; every theme carries its own pair. */
export const voiceOf = (world, mode) => (mode === "light" ? world.voiceDay : world.voiceNight);

// THE CHARACTERS ARE THEIR OWN CHOICE (owner 2026-09-04: "не будемо прив'язуватись до теми, давай зробимо окремий
// вибір персонажів мікрокартинками … сіткою, тикаємо і відкривається на весь екран"): the twelve worlds above are
// the twelve characters, each with a day side and a night side; the picker's tile names them by the side the
// phone's mode shows, and the other side small. Short names, both locales — the voices themselves stay Ukrainian.
export const NAMES = {
  lum: { day: { uk: "Будда", en: "Buddha" }, night: { uk: "Дух луни", en: "Echo spirit" } },
  paper: { day: { uk: "Майстер орігамі", en: "Origami master" }, night: { uk: "Літописець", en: "Chronicler" } },
  ink: { day: { uk: "Поет хайку", en: "Haiku poet" }, night: { uk: "Каліграф", en: "Calligrapher" } },
  mercury: { day: { uk: "Алхімік", en: "Alchemist" }, night: { uk: "Двійник у дзеркалі", en: "Mirror twin" } },
  smoke: { day: { uk: "Вітер", en: "Wind" }, night: { uk: "Шаман", en: "Shaman" } },
  thread: { day: { uk: "Вишивальниця", en: "Embroiderer" }, night: { uk: "Пряля долі", en: "Spinner of fate" } },
  circuit: { day: { uk: "Інженер-мрійник", en: "Dreaming engineer" }, night: { uk: "Машина, що снить", en: "Dreaming machine" } },
  veil: { day: { uk: "Небо", en: "Sky" }, night: { uk: "Сторож ночі", en: "Night warden" } },
  ferro: { day: { uk: "Скульптор", en: "Sculptor" }, night: { uk: "Чорна вода", en: "Black water" } },
  porcelain: { day: { uk: "Гончар", en: "Potter" }, night: { uk: "Хранитель крихкого", en: "Keeper of the fragile" } },
  sand: { day: { uk: "Мандрівник", en: "Wanderer" }, night: { uk: "Море", en: "The sea" } },
  plain: { day: { uk: "Стоїк", en: "Stoic" }, night: { uk: "Тиша", en: "Silence" } },
};
/** The character's name for a mode and locale — the side the phone's theme shows. */
export const nameOf = (id, mode, loc) => (NAMES[id] || NAMES.lum)[mode === "light" ? "day" : "night"][loc === "en" ? "en" : "uk"];
/** The picker's micro-picture of a character in a mode: assets/char-<id>-<n|d>.webp, generated once on the pods. */
export const thumbOf = (id, mode) => new URL(`assets/char-${id}-${mode === "light" ? "d" : "n"}.webp`, import.meta.url).href;


// The wallpaper contract and the light of each mode — the client's "system prompt". The theme is read off
// the document when a race starts, so a light-mode phone gets pictures lit for paper, a dark one for black.
export const SYSTEM = {
  // the no-writing clause is spelled out hard (owner 2026-09-02: "заборони тексти … або лого чи ієрогліфи")
  // and the edge appends its own canonical ban to every generation prompt as the second net
  base: "a full-bleed wallpaper, cinematic, extremely detailed, the subject off-centre with generous empty space around it, no text, no letters, no words, no writing, no signage, no hieroglyphs, no logo, no watermark, no signature, no frame, no border",
  dark: "night, deep darkness, low-key lighting, one source of light, luminous details, black shadows",
  light: "daylight, high-key, airy, bright and soft, pale tones, gentle haze",
};

/**
 * The whole prompt for one race. `subject` is the scene in English; `userDriven` says the owner's own words
 * are behind it — then the subject leads and the world contributes only its mood tint (owner: "70% на 30%,
 * де текст юзера сильніший"). Kept under the edge's 800-character slice.
 */
export function composePrompt(subject, world, mode, userDriven = false) {
  const m = mode === "light" ? "light" : "dark";
  const style = userDriven ? world.tint : world[m === "light" ? "day" : "night"];
  return [subject?.trim() || world.subject, style, SYSTEM[m], SYSTEM.base].filter(Boolean).join(", ").slice(0, 800);
}

/** How many generic fallback lines the locales carry (`l_1..l_N`) — used only offline/under the gate. */
export const LINES = 6;

// A deterministic frame for the gate: portrait, no network (mirage's mockArt shape).
export const mockFrame = (seed, mode) => {
  const l = mode === "light" ? [88, 74, 58] : [34, 18, 6];
  const s = (seed * 2654435761) % 40, hue = (seed * 47) % 360;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 160"><defs><radialGradient id="g" cx=".${3 + (s % 4)}" cy=".3" r=".9">` +
    `<stop offset="0" stop-color="hsl(${(hue + s) % 360} 55% ${l[0]}%)"/><stop offset=".5" stop-color="hsl(${(hue + 30) % 360} 45% ${l[1]}%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 200) % 360} 40% ${l[2]}%)"/></radialGradient></defs><rect width="90" height="160" fill="url(#g)"/></svg>`)}`;
};
