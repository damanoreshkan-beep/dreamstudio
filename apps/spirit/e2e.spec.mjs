// The gate seeds a fixed date (2027-07-23), so the deck's order and the first card are reproducible;
// shuffle uses a deterministic seed per count, so it still changes the order. The spirit speaks a fixed
// line under the gate (no network). Card art is the vendored public-domain RWS scans — no emoji anywhere.
export default [
  {
    name: "одна карта на весь екран: назва, положення, лічильник 1/78", run: async (h) => {
      h.expect((await h.count("[data-card] img")) === 1, "немає зображення карти");
      h.expect((await h.text("[data-name]")).trim().length > 1, "порожня назва карти");
      h.expect(/Пряма|Перевернута/i.test(await h.text("[data-orient]")), "положення не показане");
      h.expect((await h.text("[data-count]")).trim() === "1/78", "лічильник не 1/78");
    },
  },
  {
    name: "шеврони йдуть колодою по колу, тасування міняє порядок", run: async (h) => {
      const first = await h.attr("[data-card] img", "src");
      await h.click("[data-next]"); await h.wait(150);
      h.expect((await h.text("[data-count]")).trim() === "2/78", "наступна карта не друга");
      h.expect((await h.attr("[data-card] img", "src")) !== first, "наступна карта та сама");
      await h.click("[data-prev]"); await h.wait(150);
      h.expect((await h.text("[data-count]")).trim() === "1/78", "попередня карта не перша");
      await h.click("[data-prev]"); await h.wait(150);
      h.expect((await h.text("[data-count]")).trim() === "78/78", "з першої назад має бути остання");
      await h.click("[data-next]"); await h.wait(150);
      await h.click("[data-shuffle]"); await h.wait(150);
      h.expect((await h.text("[data-count]")).trim() === "1/78", "тасування не повертає на початок");
      h.expect((await h.attr("[data-card] img", "src")) !== first, "тасування не змінило першу карту");
    },
  },
  {
    name: "дух карти: тап відкриває вуаль зі словами й значенням, Back закриває", run: async (h) => {
      await h.tap("[data-card]"); await h.wait(250);
      h.expect((await h.prop("#spirit", "open")) === true, "вуаль духа не відкрилась");
      h.expect((await h.text("[data-spirit-text]")).trim().length > 40, "порожні слова духа");
      h.expect((await h.text("[data-meaning]")).trim().length > 10, "значення карти не показане під словами");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#spirit", "open")) !== true, "Back не закрив вуаль");
    },
  },
  {
    name: "«Наступна карта» у вуалі закриває її й гортає колоду", run: async (h) => {
      const before = (await h.text("[data-count]")).trim();
      await h.tap("[data-card]"); await h.wait(250);
      await h.click("[data-spirit-next]"); await h.wait(300);
      h.expect((await h.prop("#spirit", "open")) !== true, "вуаль не закрилась");
      h.expect((await h.text("[data-count]")).trim() !== before, "колода не перегорнулась");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Card|Upright|Reversed/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Карта|Пряма|Перевернута/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="card"]'); await h.wait(120);
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
