// afterdark — a one-track techno rave behind a WebGL rave field, with a Three.js trio of rigged dancers.
// Under the gate the player is a mock state machine (no third-party stream from CI) seeded into the LIVE rave
// on mount, and the 3D stage is SKIPPED (Draco/addons/GLBs over CDNs flake CI) — so everything is asserted
// through the DOM: the data-* atoms, the filmstrip picker chips, the transport. Never real audio or the GLBs.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-rave]")) > 0) break; await h.wait(300); } };
const wrap = "[data-rave]";

export default [
  {
    name: "сцена: живий рейв, транспорт — стартовий склад 3, острівець без стрічок", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-stage]")) === 1, "немає полотна рейв-поля");
      h.expect((await h.count("[data-dancers]")) === 1, "немає полотна 3D-сцени");
      h.expect((await h.count("#play")) === 1, "немає кнопки відтворення");
      // під гейтом сцена одразу live (шот бачить заповнений екран)
      h.expect((await h.attr(wrap, "data-state")) === "live", "стан не live під гейтом");
      h.expect((await h.attr("#play", "data-playing")) === "true", "не грає під гейтом");
      h.expect((await h.attr(wrap, "data-cast")) === "3", "стартовий склад не 3");
      h.expect((await h.count("[data-enter]")) === 0, "накладка входу лишилась під гейтом");
    },
  },
  {
    name: "транспорт: пауза зупиняє, повторний тап знову вмикає (стан live)", run: async (h) => {
      await ready(h);
      await h.tap("#play"); await h.wait(250);
      h.expect((await h.attr("#play", "data-playing")) !== "true", "не зупинився");
      h.expect((await h.attr(wrap, "data-state")) === "idle", "після паузи стан не idle");
      await h.tap("#play"); await h.wait(250);
      h.expect((await h.attr("#play", "data-playing")) === "true", "не відновив гру");
      h.expect((await h.attr(wrap, "data-state")) === "live", "після відновлення не live");
    },
  },
  {
    name: "каст: сітка на 105 аватарів, тап додає/знімає зі сцени, ліміт 12, «Мікс» набирає 12, «Топ» повертає трійку", run: async (h) => {
      await h.click('[data-tab="cast"]'); await h.wait(300);
      h.expect((await h.count("[data-char-grid]")) === 1, "немає сітки персонажів");
      h.expect((await h.count("[data-char]")) === 105, `має бути 105 аватарів, є ${await h.count("[data-char]")}`);
      h.expect((await h.text("[data-cast-count]")).trim() === "3/12", "лічильник не 3/12 на старті");
      await h.tap('[data-char="eve"]'); await h.wait(200);
      h.expect((await h.attr('[data-char="eve"]', "aria-pressed")) === "true", "eve не додалась на сцену");
      h.expect((await h.text("[data-cast-count]")).trim() === "4/12", "склад не став 4");
      await h.tap('[data-char="michelle"]'); await h.wait(200);
      h.expect((await h.attr('[data-char="michelle"]', "aria-pressed")) !== "true", "michelle не знялась");
      await h.tap("[data-mix]"); await h.wait(250);
      h.expect((await h.text("[data-cast-count]")).trim() === "12/12", "«Мікс» не набрав 12");
      // the cap: a 13th tap is refused with a hint, the count stays 12
      const off = await h.attr('[data-char][aria-pressed="false"]', "data-char");
      await h.tap(`[data-char="${off}"]`); await h.wait(200);
      h.expect((await h.text("[data-cast-count]")).trim() === "12/12", "ліміт 12 не втримався");
      await h.tap("[data-cast-top]"); await h.wait(200);
      h.expect((await h.text("[data-cast-count]")).trim() === "3/12", "«Топ» не повернув трійку");
      // the stage follows the working set
      await h.click('[data-tab="stage"]'); await ready(h);
      h.expect((await h.attr(wrap, "data-cast")) === "3", "сцена не підхопила склад");
    },
  },
  {
    name: "каст → «Створити»: аркуш з описом, ім'ям і видом; кнопка неактивна без опису (нічого не генерує під гейтом)", run: async (h) => {
      await h.click('[data-tab="cast"]'); await h.wait(200);
      h.expect((await h.count("[data-gen-open]")) === 1, "немає кнопки «Створити»");
      await h.tap("[data-gen-open]"); await h.wait(300);
      h.expect((await h.count("dialog[open] [data-gen-form]")) === 1, "аркуш створення не відкрився");
      h.expect((await h.count("[data-gen-prompt]")) === 1 && (await h.count('[data-gen-kind="creature"]')) === 1, "у формі немає опису або виду");
      h.expect((await h.count("[data-gen-go][disabled]")) === 1, "кнопка має бути неактивна без опису");
      h.expect((await h.count("[data-gen-progress]")) === 0, "прогрес не має показуватись до старту");
      await h.click('[data-tab="stage"]'); await h.wait(120);
    },
  },
  {
    name: "каст → танці: 36 кураторських + танці бібліотеки, «Ще +» відкриває решту, «Топ» повертає дефолт", run: async (h) => {
      await h.click('[data-tab="cast"]'); await h.wait(200);
      await h.click('[data-cast-section="moves"]'); await h.wait(300);
      for (let i = 0; i < 30; i++) { if ((await h.count("[data-more]")) > 0) break; await h.wait(200); }   // the library JSON
      h.expect((await h.count("[data-move-list] [data-move]")) > 36, `танців має бути більше 36 (кураторські + бібліотека), є ${await h.count("[data-move-list] [data-move]")}`);
      h.expect((await h.count("[data-more-list]")) === 0, "інші рухи мають бути сховані за «Ще +»");
      const def = Number(await h.attr("[data-moves]", "data-moves"));
      h.expect(def > 5 && def < 36, `дефолтний набір дивний: ${def}`);
      await h.tap('[data-move="125670901"]'); await h.wait(200);
      h.expect((await h.attr('[data-move="125670901"]', "aria-pressed")) === "true", "Twist не додався");
      h.expect(Number(await h.attr("[data-moves]", "data-moves")) === def + 1, "лічильник не виріс");
      await h.tap("[data-more]"); await h.wait(400);
      h.expect((await h.count("[data-more-list] [data-move]")) > 100, "«Ще +» не відкрив інші рухи");
      await h.tap("[data-stars]"); await h.wait(250);
      h.expect(Number(await h.attr("[data-moves]", "data-moves")) === def, "«Топ» не повернув дефолт");
      await h.click('[data-tab="stage"]'); await h.wait(120);
    },
  },
  {
    name: "острівець: тумблер згортає панель у кнопку і розгортає назад", run: async (h) => {
      await ready(h);
      h.expect((await h.attr("[data-dock-toggle]", "aria-expanded")) === "true", "панель має бути розгорнута спочатку");
      await h.tap("[data-dock-toggle]"); await h.wait(600);
      h.expect((await h.attr("[data-dock-toggle]", "aria-expanded")) === "false", "панель не згорнулась");
      await h.tap("[data-dock-toggle]"); await h.wait(600);
      h.expect((await h.attr("[data-dock-toggle]", "aria-expanded")) === "true", "панель не розгорнулась");
    },
  },
  {
    name: "звук: кнопка вимкнення звуку перемикається", run: async (h) => {
      await ready(h);
      const before = await h.attr("[data-mute]", "aria-pressed");
      await h.tap("[data-mute]"); await h.wait(200);
      h.expect((await h.attr("[data-mute]", "aria-pressed")) !== before, "стан звуку не змінився");
      await h.tap("[data-mute]"); await h.wait(150);
      h.expect((await h.attr("[data-mute]", "aria-pressed")) === before, "звук не повернувся у вихідний стан");
    },
  },
  {
    name: "рейв-поле: де є WebGL, воно малюється саме ним (не тихий відкат)", run: async (h) => {
      await ready(h);
      for (let i = 0; i < 30; i++) { if ((await h.attr("[data-stage]", "data-render")) === "webgl") break; await h.wait(200); }
      const has = await h.attr("[data-stage]", "data-haswebgl");
      if (has === "yes") h.expect((await h.attr("[data-stage]", "data-render")) === "webgl", `WebGL є, а поле не малюється: err=${await h.attr("[data-stage]", "data-err")}`);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Language|Dark theme/i.test(await h.bodyText()), "англійська не застосувалась");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мова|Темна тема/.test(await h.bodyText()), "українська не застосувалась");
      await h.click('[data-tab="stage"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив модалку");
    },
  },
];
