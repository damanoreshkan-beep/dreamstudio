const live = async (h) => { for (let i = 0; i < 25; i++) { if ((await h.count("[data-live]")) > 0) return; await h.wait(200); } };
const sheet = async (h, id, want) => { for (let i = 0; i < 10; i++) { if (((await h.prop(id, "open")) === true) === want) return true; await h.wait(100); } return false; };

export default [
  {
    name: "прилад живий: швидкість, нахил, пробіг, курс", run: async (h) => {
      await live(h);
      h.expect((await h.count("[data-live] svg[data-face]")) === 1, "немає циферблата з показом");
      h.expect(/^128 /.test(await h.attr("svg[data-face]", "aria-label")), `швидкість не на циферблаті: "${await h.attr("svg[data-face]", "aria-label")}"`);
      h.expect((await h.attr("[data-lean]", "data-lean")) === "34", "кут нахилу не показано");
      h.expect(/34°/.test(await h.text("[data-lean]")), "нахил без градусів");
      h.expect(/342[.,]6/.test(await h.text("[data-today]")), "немає пробігу за сьогодні");
      h.expect(/ПнСх|NE/.test(await h.text("[data-course]")), "немає курсу");
    },
  },
  {
    name: "циферблат — головне на екрані, а не смужка над кнопками", run: async (h) => {
      await live(h);
      const stage = await h.prop("[data-stage-box]", "offsetHeight"), view = await h.prop("#view", "offsetHeight");
      const wide = (await h.prop("[data-stage-box]", "offsetWidth")) / (await h.prop("#view", "offsetWidth"));
      h.expect(stage / view >= 0.45 || wide >= 0.38, `циферблат займає ${Math.round(100 * stage / view)}% висоти і ${Math.round(100 * wide)}% ширини`);
    },
  },
  {
    name: "чотири скіни; вибір переживає перезавантаження; Back закриває панель", run: async (h) => {
      await live(h);
      await h.tap("#look");
      h.expect(await sheet(h, "#look-sheet", true), "панель не відкрилась");
      for (const id of ["sport", "lcd", "hud", "classic"]) {
        await h.tap(`button[data-skin="${id}"]`); await h.wait(200);
        h.expect((await h.count(`[data-live] svg[data-face="${id}"]`)) === 1, `скін ${id} не намалювався з показом`);
        h.expect((await h.attr(`button[data-skin="${id}"]`, "aria-pressed")) === "true", `скін ${id} не позначено обраним`);
        h.expect(/^128 /.test(await h.attr("svg[data-face]", "aria-label")), `скін ${id} загубив швидкість`);
      }
      await h.tap('button[data-skin="lcd"]'); await h.wait(200);
      await h.back();
      h.expect(await sheet(h, "#look-sheet", false), "Back не закрив панель");
      await h.reload(); await live(h);
      h.expect((await h.count('svg[data-face="lcd"]')) === 1, "скін не пережив перезавантаження");
      await h.tap("#look"); await sheet(h, "#look-sheet", true);
      await h.tap('button[data-skin="classic"]'); await h.wait(200);
      await h.back(); await sheet(h, "#look-sheet", false);
    },
  },
  {
    name: "сигнал швидкості: поріг нижче швидкості — тривога, вище або вимкнено — тиша", run: async (h) => {
      await live(h);
      await h.tap("#look"); await sheet(h, "#look-sheet", true);
      await h.tap('button[data-limit="110"]'); await h.wait(200);
      h.expect((await h.attr("[data-moto]", "data-over")) === "1", "128 при порозі 110 — тривоги немає");
      await h.tap('button[data-limit="130"]'); await h.wait(200);
      h.expect((await h.attr("[data-moto]", "data-over")) === "0", "128 при порозі 130 — хибна тривога");
      await h.tap('button[data-limit="0"]'); await h.wait(200);
      h.expect((await h.attr("[data-moto]", "data-over")) === "0", "сигнал вимкнено, а тривога горить");
      await h.back(); await sheet(h, "#look-sheet", false);
    },
  },
  {
    name: "фініш і старт: перший старт попереджає, Back закриває попередження", run: async (h) => {
      await live(h);
      await h.tap("#go"); await h.wait(250);
      h.expect((await h.attr("[data-moto]", "data-on")) === "0", "Фініш не зупинив поїздку");
      h.expect((await h.count("[data-live]")) === 0, "після фінішу лишився показ швидкості");
      await h.tap("#go");
      h.expect(await sheet(h, "#notice-sheet", true), "перший старт без попередження");
      await h.back();
      h.expect(await sheet(h, "#notice-sheet", false), "Back не закрив попередження");
      h.expect((await h.attr("[data-moto]", "data-on")) === "0", "поїздка почалась без згоди");
      await h.tap("#go"); await sheet(h, "#notice-sheet", true);
      await h.tap("#notice-go"); await h.wait(400);
      h.expect((await h.attr("[data-moto]", "data-on")) === "1", "після згоди поїздка не почалась");
      h.expect(await sheet(h, "#notice-sheet", false), "попередження лишилось відкритим");
      await h.tap("#go"); await h.wait(250);
      await h.tap("#go"); await h.wait(400);
      h.expect((await h.attr("[data-moto]", "data-on")) === "1", "другий старт не почав поїздку одразу");
      h.expect((await h.prop("#notice-sheet", "open")) !== true, "попередження показано вдруге");
    },
  },
  {
    name: "журнал: рекорди, календар, день із графіком швидкості", run: async (h) => {
      await h.tap('[data-tab="log"]'); await h.wait(400);
      h.expect((await h.count("[data-records]")) === 1, "немає рекордів");
      h.expect(/\d+\s*(км\/год|km\/h)/.test(await h.text("[data-records]")), "рекорд швидкості без числа");
      h.expect((await h.count("[data-calendar]")) === 1, "немає календаря");
      h.expect((await h.count("[data-day] [data-curve] path")) === 2, "у дня немає графіка швидкості");
      const today = await h.attr("[data-day]", "data-day");
      h.expect(/^\d{4}-\d\d-\d\d$/.test(today), `день не обрано: "${today}"`);
      await h.tap('[data-cal-step="prev"]'); await h.wait(300);
      h.expect((await h.count("[data-cal-day]")) >= 1, "у минулому місяці жодної поїздки");
      await h.tap("[data-cal-day]"); await h.wait(300);
      const other = await h.attr("[data-day]", "data-day");
      h.expect(other !== today && other < today, `день з календаря не відкрився: "${other}"`);
      h.expect((await h.count("[data-day] [data-curve] path")) === 2, "в обраного дня немає графіка");
      await h.tap('[data-tab="ride"]'); await h.wait(200);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.tap('[data-tab="me"]'); await h.wait(150);
      await h.tap('[data-loc="en"]'); await h.wait(250);
      h.expect(/Speedometer|Language/i.test(await h.bodyText()), "не EN");
      await h.tap('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Спідометр|Мова/.test(await h.bodyText()), "не UA");
      await h.tap('[data-tab="ride"]'); await h.wait(150);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.tap('[data-tab="me"]'); await h.wait(150);
      await h.tap("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
      await h.tap('[data-tab="ride"]'); await h.wait(150);
    },
  },
];
