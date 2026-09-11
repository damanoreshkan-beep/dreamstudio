// afterdark — a one-track techno rave behind a WebGL rave field, with a Three.js trio of rigged dancers.
// Under the gate the player is a mock state machine (no third-party stream from CI) seeded into the LIVE rave
// on mount, and the 3D stage is SKIPPED (Draco/addons/GLBs over CDNs flake CI) — so everything is asserted
// through the DOM: the data-* atoms, the filmstrip picker chips, the transport. Never real audio or the GLBs.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-rave]")) > 0) break; await h.wait(300); } };
const wrap = "[data-rave]";

export default [
  {
    name: "сцена: живий рейв, транспорт, філмстрип дівчат — одна лідерка", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-stage]")) === 1, "немає полотна рейв-поля");
      h.expect((await h.count("[data-dancers]")) === 1, "немає полотна 3D-сцени");
      h.expect((await h.count("#play")) === 1, "немає кнопки відтворення");
      h.expect((await h.count("[data-girl]")) === 11, "має бути 11 чипів танцівниць");
      // під гейтом сцена одразу live (шот бачить заповнений екран)
      h.expect((await h.attr(wrap, "data-state")) === "live", "стан не live під гейтом");
      h.expect((await h.attr("#play", "data-playing")) === "true", "не грає під гейтом");
      const pressed = [];
      for (const g of ["kaya", "michelle", "arissa", "eve", "sophie"]) pressed.push(await h.attr(`[data-girl="${g}"]`, "aria-pressed"));
      h.expect(pressed.filter((x) => x === "true").length === 1, "має бути рівно одна лідерка");
      h.expect((await h.attr(wrap, "data-focus")) === "michelle", "стартова лідерка не michelle");
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
    name: "дівчата: вибір іншої лідерки перемикає active (aria-pressed + data-focus)", run: async (h) => {
      await ready(h);
      await h.tap('[data-girl="arissa"]'); await h.wait(200);
      h.expect((await h.attr('[data-girl="arissa"]', "aria-pressed")) === "true", "arissa не стала лідеркою");
      h.expect((await h.attr('[data-girl="michelle"]', "aria-pressed")) !== "true", "michelle лишилась лідеркою");
      h.expect((await h.attr(wrap, "data-focus")) === "arissa", "data-focus не оновився");
      await h.tap('[data-girl="sophie"]'); await h.wait(200);
      h.expect((await h.attr('[data-girl="sophie"]', "aria-pressed")) === "true", "sophie не стала лідеркою");
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
