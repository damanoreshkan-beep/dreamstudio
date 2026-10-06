const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-takt]")) > 0) break; await h.wait(300); } };
const wrap = "[data-takt]";

export default [
  {
    name: "ефір: поле + одна кнопка, під гейтом грає без мережі, панель на місці", run: async (h) => {
      await ready(h); await h.wait(400);
      h.expect((await h.count("[data-stage]")) === 1, "немає полотна поля");
      h.expect(!(await h.attr("[data-stage]", "data-err")), "шейдер не зібрався: " + (await h.attr("[data-stage]", "data-err")));
      h.expect((await h.count("#play")) === 1, "немає кнопки відтворення");
      h.expect((await h.count("#prev")) + (await h.count("#next")) === 0, "зайві клавіші транспорту");
      h.expect((await h.attr(wrap, "data-state")) === "live", "стан не live під гейтом");
      h.expect((await h.attr("#play", "data-playing")) === "true", "не грає під гейтом");
      h.expect((await h.attr(wrap, "data-immersive")) === "no", "панель сховалась під гейтом");
      h.expect((await h.count("[data-island]")) === 0, "на екрані є щось крім кнопки");
    },
  },
  {
    name: "кнопка: стоп зупиняє, повторний тап знову вмикає", run: async (h) => {
      await ready(h);
      await h.tap("#play"); await h.wait(250);
      h.expect((await h.attr("#play", "data-playing")) !== "true", "не зупинився");
      h.expect((await h.attr(wrap, "data-state")) === "idle", "після стопу стан не idle");
      await h.tap("#play"); await h.wait(250);
      h.expect((await h.attr("#play", "data-playing")) === "true", "не відновив гру");
      h.expect((await h.attr(wrap, "data-state")) === "live", "після відновлення не live");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Takt|On air|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Такт|Ефір|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="air"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
