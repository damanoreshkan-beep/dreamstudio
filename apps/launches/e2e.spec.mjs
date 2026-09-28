const load = async (h) => { for (let i = 0; i < 24; i++) { if ((await h.count("[data-fav]")) > 0) break; await h.wait(500); } };
const feed = async (h) => { await h.tap('[data-tab="up"]'); await h.wait(150); await load(h); };

export default [
  {
    name: "стрічка групується за тим, наскільки дата справжня", run: async (h) => {
      await feed(h);
      h.expect((await h.count("[data-fav]")) === 4, "не ті картки з датою");
      h.expect((await h.count('[data-section="fuzzy"]')) === 1, "немає розділу без точної дати");
      await h.tap('[data-section="fuzzy"]'); await h.wait(200);
      h.expect((await h.count("[data-fav]")) === 6, "розділ без дати не розкрився");
      const body = await h.bodyText();
      h.expect(/кв\.|Q[1-4]/.test(body), "квартальний запуск показано як точну дату");
      h.expect((await h.count(".card img")) >= 1, "немає зображень");
      await h.tap('[data-section="fuzzy"]'); await h.wait(200);
    },
  },
  {
    name: "тап по картці → деталі з відліком і глобусом, Back закриває", run: async (h) => {
      await feed(h);
      await h.tap(".aw-tap"); await h.wait(500);
      h.expect((await h.count('[role="dialog"]')) === 1, "деталі не відкрились");
      h.expect(/Ракета|Місія|Rocket|Mission/.test(await h.bodyText()), "немає вмісту деталей");
      h.expect((await h.count("[data-launch-body]")) === 1, "немає тіла деталей");
      h.expect(/\d\d:\d\d:\d\d/.test(await h.text("[data-countdown]")), "відлік не йде");
      h.expect(/\d+\.\d+° [NS], \d+\.\d+° [EW]/.test(await h.text("[data-coords]")), "немає координат майданчика");
      await h.back(); await h.wait(300);
      h.expect((await h.count('[role="dialog"]')) === 0, "Back не закрив деталі");
    },
  },
  {
    name: "Земля: майданчики на глобусі, тап розкриває координати", run: async (h) => {
      await feed(h);
      await h.tap('[data-tab="map"]'); await h.wait(800);
      h.expect((await h.count("canvas")) >= 1, "глобус не намалювався");
      h.expect((await h.attr("[data-sites]", "data-sites")) === "5", "не ті майданчики");
      h.expect((await h.count("[data-site-row]")) === 5, "список майданчиків не збігається з глобусом");
      await h.tap("[data-site-row]"); await h.wait(300);
      h.expect(/\d+\.\d+° [NS], \d+\.\d+° [EW]/.test(await h.text("[data-coords]")), "координати не зарезолвились");
      h.expect((await h.count("[data-launch]")) === 2, "у Канавералу не два запуски");
      await h.tap("[data-launch]"); await h.wait(500);
      h.expect((await h.count('[role="dialog"]')) === 1, "з майданчика не відкрились деталі");
      await h.back(); await h.wait(300);
      await feed(h);
    },
  },
  {
    name: "Календар: позначений день фільтрує, місяць гортається", run: async (h) => {
      await feed(h);
      await h.tap('[data-tab="cal"]'); await h.wait(500);
      h.expect((await h.count("[data-calendar]")) === 1, "календаря немає");
      const title = await h.text("[data-cal-title]");
      h.expect(title.length > 3, "місяць без назви");
      h.expect((await h.count("[data-cal-day]")) >= 1, "жодного дня з позначкою");
      h.expect((await h.count("[data-agenda-fuzzy]")) === 1, "немає блоку «без точної дати»");
      await h.tap("[data-cal-day]"); await h.wait(300);
      h.expect((await h.attr("[data-agenda]", "data-day")).length === 10, "день не обрався");
      h.expect((await h.count("[data-agenda-list]")) === 1, "обраний день нічого не показав");
      h.expect((await h.count("[data-launch]")) > 0, "у дні з позначкою немає запусків");
      if ((await h.prop('[data-cal-step="next"]', "disabled")) !== true) {
        await h.tap('[data-cal-step="next"]'); await h.wait(300);
        h.expect((await h.text("[data-cal-title]")) !== title, "місяць не перегорнувся");
        h.expect((await h.attr("[data-agenda]", "data-day")) === "", "день пережив зміну місяця");
      }
      await feed(h);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.tap('[data-tab="me"]'); await h.wait(150);
      await h.tap('[data-loc="en"]'); await h.wait(250);
      h.expect(/Upcoming|Launches|Language/.test(await h.bodyText()), "не EN");
      await h.tap('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Найближчі|запуски|Мова/.test(await h.bodyText()), "не UA");
      await h.tap('[data-tab="up"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.tap('[data-tab="me"]'); await h.wait(150);
      await h.tap("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
      await h.tap('[data-tab="up"]'); await h.wait(120);
    },
  },
];
