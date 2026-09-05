// The gate has no camera, no network and no GPU minute to spend: the stage projects assets/mock.webp through
// the same shader (GlStage's `cam`, core ≥ 1.2.31), a tap on a material re-inks it, the shutter freezes it and
// the keeper "lands" after a beat as the same still. The whole screen — the strip, the shutter, the flip, the
// developing state, the actions, the full-size view — is exercised without a single call out.
const ready = async (h) => { for (let i = 0; i < 40; i++) { if ((await h.count('[data-stage][data-cam="yes"]')) > 0) break; await h.wait(250); } };

export default [
  {
    name: "дзеркало: сцена проєктує кадр, одинадцять матеріалів, Сяйво активне", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-live]")) === 1, "сцена не позначена як жива");
      h.expect((await h.count("[data-mat]")) === 11, "не одинадцять матеріалів");
      h.expect(await h.attr('[data-mat="lum"]', "aria-pressed") === "true", "Сяйво не активне");
      h.expect((await h.count("[data-shutter]")) === 1, "немає затвора");
      h.expect((await h.count("[data-flip]")) === 1, "немає перевороту камери");
      const gl = await h.attr("[data-stage]", "data-haswebgl");
      if (gl === "yes") h.expect(await h.attr("[data-stage]", "data-render") === "webgl", "WebGL є, а кадр не намальовано");
    },
  },
  {
    name: "матеріал перемикається тапом і відбивається на сцені", run: async (h) => {
      await ready(h);
      await h.click('[data-mat="ink"]'); await h.wait(120);
      h.expect(await h.attr('[data-mat="ink"]', "aria-pressed") === "true", "Туш не активна");
      h.expect(await h.attr('[data-mat="lum"]', "aria-pressed") === "false", "Сяйво лишилось активним");
      h.expect(await h.attr("[data-live]", "data-mat") === "ink", "сцена не знає про Туш");
    },
  },
  {
    name: "перевернути камеру: дзеркало вмикається", run: async (h) => {
      await ready(h);
      await h.click("[data-flip]"); await h.wait(120);
      h.expect(await h.attr("[data-live]", "data-facing") === "user", "фронтальна камера не увімкнулась");
      await h.click("[data-flip]"); await h.wait(120);
      h.expect(await h.attr("[data-live]", "data-facing") === "environment", "задня камера не повернулась");
    },
  },
  {
    name: "зняти → проявляється → готово, дії; знову наживо повертає дзеркало (гейт: без мережі)", run: async (h) => {
      await ready(h);
      await h.click("[data-shutter]");
      for (let i = 0; i < 30; i++) { if ((await h.count("[data-keeper]")) > 0) break; await h.wait(100); }
      h.expect((await h.count("[data-keeper]")) === 1, "проявлений кадр не зʼявився");
      h.expect(await h.attr("[data-live]", "data-phase") === "done", "фаза не done");
      h.expect((await h.count("[data-act=save]")) === 1 && (await h.count("[data-act=share]")) === 1, "немає зберегти/поділитися");
      h.expect((await h.count("[data-act=again]")) === 1, "немає «знову наживо»");
      h.expect((await h.count('[data-mat="lum"]:disabled')) === 1, "стрічка не вимкнена, поки кадр проявлений");
      await h.click("[data-act=again]"); await h.wait(150);
      h.expect((await h.count("[data-keeper]")) === 0, "кадр не зник після «знову наживо»");
      h.expect((await h.count("[data-shutter]")) === 1, "затвор не повернувся");
    },
  },
  {
    name: "повний розмір відкривається тапом на кадр; Back закриває", run: async (h) => {
      await ready(h);
      await h.click("[data-shutter]");
      for (let i = 0; i < 30; i++) { if ((await h.count("[data-keeper]")) > 0) break; await h.wait(100); }
      await h.click("[data-keeper]"); await h.wait(250);
      h.expect((await h.count("[data-lightbox]")) === 1, "повний розмір не відкрився");
      await h.back(); await h.wait(300);
      h.expect((await h.count("[data-lightbox]")) === 0, "Back не закрив повний розмір");
    },
  },
  {
    // The picture is the subject: the island holds the strip and one row, the stage keeps the larger share.
    name: "сцена отримує більшу частку екрана, ніж острів", run: async (h) => {
      await ready(h);
      const stage = await h.css("[data-stage-box]", "height"), island = await h.css("[data-island]", "height");
      h.expect(parseFloat(stage) > parseFloat(island), `сцена ${stage} не більша за острів ${island}`);
    },
  },
];
