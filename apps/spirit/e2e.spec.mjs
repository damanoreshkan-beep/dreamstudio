// The deck is static and in canonical order, so every check is deterministic without a seed. The spirit
// speaks a fixed line under the gate (no network). Card art is the vendored public-domain RWS scans.
export default [
  {
    name: "колода за структурою: 5 розділів, 78 карт", run: async (h) => {
      h.expect((await h.count("[data-section]")) === 5, "має бути 5 розділів (аркани + 4 масті)");
      h.expect((await h.count("[data-deck-card]")) === 78, "у колоді не 78 карт");
      h.expect((await h.count('[data-section="major"] [data-deck-card]')) === 22, "старших арканів не 22");
      h.expect((await h.count('[data-section="cups"] [data-deck-card]')) === 14, "кубків не 14");
    },
  },
  {
    name: "сторінка карти: назва, пряме положення, слова духа й значення; Back закриває", run: async (h) => {
      await h.click('[data-deck-card="ar07"]'); await h.wait(300);
      h.expect((await h.prop("#card", "open")) === true, "сторінка карти не відкрилась");
      h.expect(/Колісниця|Chariot/i.test(await h.text("[data-name]")), "не та карта");
      h.expect(/Пряма|Upright/i.test(await h.text("[data-orient]")), "карта має відкриватись прямою");
      h.expect((await h.text("[data-spirit-text]")).trim().length > 40, "порожні слова духа");
      h.expect((await h.text("[data-meaning]")).trim().length > 10, "значення карти не показане");
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#card", "open")) !== true, "Back не закрив сторінку");
    },
  },
  {
    name: "перевернути: положення міняється, порада йде за ним", run: async (h) => {
      await h.click('[data-deck-card="ar07"]'); await h.wait(300);
      await h.click("[data-flip]"); await h.wait(200);
      h.expect((await h.attr("[data-card]", "data-reversed")) === "1", "карта не перевернулась");
      h.expect(/Перевернута|Reversed/i.test(await h.text("[data-orient]")), "положення не змінилось");
      h.expect((await h.text("[data-spirit-text]")).trim().length > 40, "немає поради для перевернутої");
      await h.tap("[data-card]"); await h.wait(200);
      h.expect((await h.attr("[data-card]", "data-reversed")) === "0", "тап по карті не повернув її");
      await h.back(); await h.wait(300);
    },
  },
  {
    name: "шеврони йдуть колодою по порядку й по колу, нова карта знову пряма", run: async (h) => {
      await h.click('[data-deck-card="ar00"]'); await h.wait(300);
      await h.click("[data-flip]"); await h.wait(150);
      await h.click("[data-next]"); await h.wait(250);
      h.expect(/Маг|Magician/i.test(await h.text("[data-name]")), "після Дурня має бути Маг");
      h.expect((await h.attr("[data-card]", "data-reversed")) === "0", "нова карта має відкриватись прямою");
      await h.click("[data-prev]"); await h.click("[data-prev]"); await h.wait(250);
      h.expect(/Пентакл|Pentacles/i.test(await h.text("[data-name]")), "з першої назад має бути остання (Король Пентаклів)");
      await h.back(); await h.wait(300);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Card Spirit|Study the deck/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Дух карти|Вивчай колоду/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="deck"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
