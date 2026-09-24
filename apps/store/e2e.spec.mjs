// The store is a custom tool app: a night SKY of every app (a fixed canvas with a screen-reader-visible list
// of real [data-app] buttons mirroring it), a search that flattens the farm into rows, a history-backed
// per-app description Sheet, and NEW badges (IndexedDB). apps.json imports locally. The canvas itself a
// headless browser cannot tap, so every assertion runs against the DOM mirror and the search rows — which is
// exactly what the sky's accessible layer exists to guarantee.
const ready = async (h) => { for (let i = 0; i < 12; i++) { if ((await h.count("[data-app]")) > 0) break; await h.wait(200); } };

export default [
  {
    name: "стор: небо з усіма апками; перший візит не позначає нічого як нове", run: async (h) => {
      await ready(h); await h.wait(200);
      h.expect((await h.count(".ms-sky canvas")) === 1, "немає полотна неба");
      h.expect((await h.count("[data-store-mode='sky']")) === 1, "браузерний режим не «небо»");
      // every app is a star, mirrored as a real button for a11y / search / this test
      h.expect((await h.count("[data-app]")) >= 70, "небо не покриває всю ферму");
      const badges = await h.count(".badge-primary");
      h.expect(badges === 0, `перший візит позначив ${badges} застосунків як нові — базова лінія не записалась`);
    },
  },
  {
    name: "пошук згортає небо у рядки; фільтрує; × повертає", run: async (h) => {
      await ready(h);
      const base = await h.count("[data-app]");
      h.expect((await h.count("#search-btn")) === 1, "немає іконки пошуку в рядку «Сьогодні»");
      h.expect((await h.count("[data-search-open]")) === 0, "поле пошуку розгорнуте до дотику");
      await h.type("#store-filter", "рейв"); await h.wait(250);
      h.expect((await h.count("[data-store-mode='search']")) === 1, "пошук не перемкнув режим у список");
      const now = await h.count("[data-app]");
      h.expect(now >= 1 && now < base, "пошук не звузив список");
      h.expect((await h.count("[data-search-open]")) === 1, "запит є, а поле згорнуте — нема як його стерти");
      await h.type("#store-filter", ""); await h.wait(250);
      await h.click("#search-close"); await h.wait(250);
      h.expect((await h.count("[data-store-mode='sky']")) === 1, "× не повернув небо");
    },
  },
  {
    name: "тап по застосунку → шитик опису, Back закриває", run: async (h) => {
      await ready(h);
      await h.click('[data-app="rave"]'); await h.wait(250);
      h.expect((await h.prop("#appsheet", "open")) === true, "не відкрився шитик опису");
      h.expect((await h.count("#open-app")) === 1, "немає кнопки Відкрити в шитику");
      h.expect(/техно|techno/i.test(await h.bodyText()), "немає опису застосунку");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#appsheet", "open")) !== true, "Back не закрив шитик опису");
      h.expect((await h.count("#open-app")) === 0, "вміст шитика лишився в DOM після закриття");
    },
  },
  {
    name: "сторінка апки: Install + скрін + версія", run: async (h) => {
      await ready(h);
      await h.click('[data-app="tide"]'); await h.wait(300);
      h.expect((await h.prop("#appsheet", "open")) === true, "тап по зірці не відкрив сторінку апки");
      h.expect((await h.count("#install-app")) === 1, "немає кнопки Встановити на сторінці апки");
      h.expect((await h.count("#appsheet img[src*='shot-tide']")) === 1, "немає скріншота на сторінці апки");
      h.expect(/v\d/.test(await h.text("#appsheet")), "немає версії на сторінці апки");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#appsheet", "open")) !== true, "Back не закрив сторінку апки");
    },
  },
  {
    name: "i18n EN/UA міняє chrome", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Apps|Language|Me/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Застосунки|Мова|Я/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="apps"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      h.expect((await h.count("#p-install")) === 1, "немає кнопки встановлення");
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив модалку");
    },
  },
  {
    name: "тема: профіль → віджет → «Просто» перемикає лист стилів, «Сяйво» повертає, день/ніч у тій же картці", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(300);
      h.expect((await h.count("#p-material")) === 1, "немає віджета «Тема»");
      h.expect((await h.count('#p-material [data-material-id="plain"]')) === 1, "у стрічці немає картинки «Просто»");
      await h.click('[data-material-id="plain"]'); await h.wait(300);
      h.expect((await h.attr("html", "data-material")) === "plain", "html[data-material] не став plain");
      h.expect((await h.count('link[rel="stylesheet"][href$="/_rt/theme-plain.css"]')) === 1, "лінк теми не переключився на theme-plain.css");
      h.expect((await h.count('link[rel="stylesheet"][href*="daisyui"][href$="themes.css"]')) === 1, "daisyui-ний themes.css мав лишитись незайманим");
      await h.click('[data-material-id="lum"]'); await h.wait(300);
      h.expect((await h.attr("html", "data-material")) === "lum", "повернення до «Сяйва» не спрацювало");
      h.expect((await h.count('link[rel="stylesheet"][href$="/_rt/theme-lum.css"]')) === 1, "лінк теми не повернувся до theme-lum.css");
      await h.click('#p-theme [data-mode="day"]'); await h.wait(200);
      h.expect((await h.attr("html", "data-theme")) === "signal-light", "«День» не перемкнув html[data-theme]");
      await h.click('#p-theme [data-mode="night"]'); await h.wait(200);
      h.expect((await h.attr("html", "data-theme")) === "signal", "«Ніч» не повернула html[data-theme]");
    },
  },
];
