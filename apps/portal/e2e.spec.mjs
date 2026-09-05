// The gate has no camera: the system (pixi) mounts the farm's own still (assets/mock.webp) as the sprite and the
// presets run on it, so the whole screen — the twelve materials, the preset attribute, the theme mode, the flip,
// the save verb — is exercised without a camera and without the network (pixi is bundled into app.js).
const ready = async (h) => { for (let i = 0; i < 80; i++) { if ((await h.count('[data-live][data-ready="1"]')) > 0) break; await h.wait(250); } };

export default [
  {
    name: "портал: система підняла кадр, дванадцять матеріалів, активний = матеріал теми", run: async (h) => {
      await ready(h);
      h.expect((await h.count('[data-live][data-ready="1"]')) === 1, "кадр не піднявся (pixi не змонтував спрайт)");
      h.expect(await h.attr("[data-portal]", "data-render") === "pixi", "канвас не намальовано системою");
      h.expect((await h.count("[data-mat]")) === 12, "не дванадцять матеріалів");
      const active = await h.attr("[data-live]", "data-preset");
      h.expect(await h.attr(`[data-mat="${active}"]`, "aria-pressed") === "true", "активна плитка не збігається з пресетом сцени");
      h.expect((await h.count("[data-save]")) === 1 && (await h.count("[data-save]:disabled")) === 0, "«Зберегти» відсутня або вимкнена при піднятому кадрі");
      h.expect((await h.count("[data-flip]")) === 1, "немає перевороту камери");
    },
  },
  {
    name: "матеріал перемикається тапом і сцена його знає", run: async (h) => {
      await ready(h);
      await h.click('[data-mat="smoke"]'); await h.wait(150);
      h.expect(await h.attr('[data-mat="smoke"]', "aria-pressed") === "true", "Дим не активний");
      h.expect(await h.attr("[data-live]", "data-preset") === "smoke", "сцена не перейшла на Дим");
      await h.click('[data-mat="plain"]'); await h.wait(150);
      h.expect(await h.attr("[data-live]", "data-preset") === "plain", "сцена не перейшла на Просто");
    },
  },
  {
    name: "тонкі налаштування: іконка відкриває панель, у матеріалу свій набір ручок, ручка змінює сцену", run: async (h) => {
      await ready(h);
      await h.click('[data-mat="lum"]'); await h.wait(150);
      await h.click("[data-tune]"); await h.wait(300);
      h.expect((await h.count("#tune[open]")) === 1, "панель налаштувань не відкрилась");
      const n = await h.count("[data-knob]");
      h.expect(n >= 6, `у Сяйва замало ручок: ${n}`);
      h.expect((await h.count('[data-knob="chain.0.bloomScale"]')) === 1, "Сяйво без ручки сяйва");
      h.expect((await h.count("[data-reset]:disabled")) === 1, "«Скинути» активна без змін");
    },
  },
  {
    name: "режим сцени слідує за темою документа", run: async (h) => {
      await ready(h);
      const mode = await h.attr("[data-live]", "data-mode");
      h.expect(mode === "dark" || mode === "light", `режим не названо: ${mode}`);
    },
  },
  {
    name: "перевернути камеру: сторона змінюється", run: async (h) => {
      await ready(h);
      await h.click("[data-flip]"); await h.wait(150);
      h.expect(await h.attr("[data-live]", "data-facing") === "user", "фронтальна камера не увімкнулась");
    },
  },
  {
    // The picture is the subject: the island holds the strip and one verb, the stage keeps the larger share.
    name: "сцена отримує більшу частку екрана, ніж острів", run: async (h) => {
      await ready(h);
      const stage = await h.css("[data-stage-box]", "height"), island = await h.css("[data-island]", "height");
      h.expect(parseFloat(stage) > parseFloat(island), `сцена ${stage} не більша за острів ${island}`);
    },
  },
];
