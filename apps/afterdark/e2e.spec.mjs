// afterdark — a one-track techno rave behind a WebGL rave field, with a Three.js trio of rigged dancers.
// Under the gate the player is a mock state machine (no third-party stream from CI) seeded into the LIVE rave
// on mount, and the 3D stage is SKIPPED (Draco/addons/GLBs over CDNs flake CI) — so everything is asserted
// through the DOM: the data-* atoms, the filmstrip picker chips, the transport. Never real audio or the GLBs.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-rave]")) > 0) break; await h.wait(300); } };
const wrap = "[data-rave]";

export default [
  {
    name: "сцена: живий рейв, транспорт, філмстрип на 11 — стартовий склад 3", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-stage]")) === 1, "немає полотна рейв-поля");
      h.expect((await h.count("[data-dancers]")) === 1, "немає полотна 3D-сцени");
      h.expect((await h.count("#play")) === 1, "немає кнопки відтворення");
      h.expect((await h.count("[data-girl]")) === 11, "має бути 11 чипів танцівниць");
      h.expect((await h.count("[data-all]")) === 1, "немає кнопки «Усі»");
      // під гейтом сцена одразу live (шот бачить заповнений екран)
      h.expect((await h.attr(wrap, "data-state")) === "live", "стан не live під гейтом");
      h.expect((await h.attr("#play", "data-playing")) === "true", "не грає під гейтом");
      h.expect((await h.attr(wrap, "data-cast")) === "3", "стартовий склад не 3");
      const pressed = [];
      for (const g of ["kaya", "michelle", "arissa", "eve", "sophie"]) pressed.push(await h.attr(`[data-girl="${g}"]`, "aria-pressed"));
      h.expect(pressed.filter((x) => x === "true").length === 3, "на сцені мають бути 3 (kaya/michelle/arissa)");
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
    name: "дівчата: мультивибір — тап додає/знімає зі сцени, «Усі» вмикає всіх", run: async (h) => {
      await ready(h);
      // eve не у стартовому складі → тап додає її
      await h.tap('[data-girl="eve"]'); await h.wait(200);
      h.expect((await h.attr('[data-girl="eve"]', "aria-pressed")) === "true", "eve не додалась на сцену");
      h.expect((await h.attr(wrap, "data-cast")) === "4", "склад не став 4");
      // michelle у складі → тап знімає
      await h.tap('[data-girl="michelle"]'); await h.wait(200);
      h.expect((await h.attr('[data-girl="michelle"]', "aria-pressed")) !== "true", "michelle не знялась");
      h.expect((await h.attr(wrap, "data-cast")) === "3", "склад не повернувся до 3");
      // «Усі» → всі 11 на сцені
      await h.tap('[data-all]'); await h.wait(250);
      h.expect((await h.attr(wrap, "data-cast")) === "11", "«Усі» не вибрала всіх");
      h.expect((await h.attr('[data-girl="pirate"]', "aria-pressed")) === "true", "pirate не на сцені після «Усі»");
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
