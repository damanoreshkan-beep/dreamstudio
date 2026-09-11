// afterdark — a one-track techno rave behind a WebGL scene. Under the gate the player is a mock state machine
// (no third-party stream from CI) seeded into the LIVE rave on mount, so transport/state/selection are asserted
// through the data-* atoms mirrored into the DOM — never real audio or WebGL.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-rave]")) > 0) break; await h.wait(300); } };
const wrap = "[data-rave]";

export default [
  {
    name: "сцена: живий рейв, транспорт, три танцівниці — одна вибрана", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-stage]")) === 1, "немає полотна сцени");
      h.expect((await h.count("#play")) === 1, "немає кнопки відтворення");
      h.expect((await h.count("[data-girl]")) === 3, "немає трьох танцівниць");
      // під гейтом сцена одразу live (шот бачить заповнений екран)
      h.expect((await h.attr(wrap, "data-state")) === "live", "стан не live під гейтом");
      h.expect((await h.attr("#play", "data-playing")) === "true", "не грає під гейтом");
      const pressed = [];
      for (const g of ["neon", "acid", "goddess"]) pressed.push(await h.attr(`[data-girl="${g}"]`, "aria-pressed"));
      h.expect(pressed.filter((x) => x === "true").length === 1, "має бути рівно одна вибрана танцівниця");
      // «Увійти» вже не показується (гейт сидить за жестом)
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
    name: "танцівниці: вибір іншої перемикає активну (aria-pressed)", run: async (h) => {
      await ready(h);
      await h.tap('[data-girl="acid"]'); await h.wait(200);
      h.expect((await h.attr('[data-girl="acid"]', "aria-pressed")) === "true", "acid не стала активною");
      h.expect((await h.attr('[data-girl="neon"]', "aria-pressed")) !== "true", "neon лишилась активною");
      h.expect((await h.attr(wrap, "data-active-girl")) === "acid", "data-active-girl не оновився");
      await h.tap('[data-girl="goddess"]'); await h.wait(200);
      h.expect((await h.attr('[data-girl="goddess"]', "aria-pressed")) === "true", "goddess не стала активною");
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
    name: "сцена: де є WebGL, вона малюється саме ним (не тихий відкат)", run: async (h) => {
      await ready(h);
      for (let i = 0; i < 30; i++) { if ((await h.attr("[data-stage]", "data-render")) === "webgl") break; await h.wait(200); }
      const has = await h.attr("[data-stage]", "data-haswebgl");
      if (has === "yes") h.expect((await h.attr("[data-stage]", "data-render")) === "webgl", `WebGL є, а сцена не малюється: err=${await h.attr("[data-stage]", "data-err")}`);
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
