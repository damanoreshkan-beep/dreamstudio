// The gate has no camera, no network and no GPU minute to spend: the stage projects assets/mock.webp through
// the same shader (GlStage's `cam`, core ≥ 1.2.31), a tap on a material re-inks it, the shutter freezes it and
// the keeper "lands" after a beat as the same still; enlarge ×4 lands the same still at four times the size.
// The whole one-shot loop — the strip, the shutter, the flip, developing, save, enlarge, share, full size, a
// material as the way back — is exercised without a single call out.
const ready = async (h) => { for (let i = 0; i < 40; i++) { if ((await h.count('[data-stage][data-cam="yes"]')) > 0) break; await h.wait(250); } };
const develop = async (h) => { await h.click("[data-shutter]"); for (let i = 0; i < 30; i++) { if ((await h.count("[data-keeper]")) > 0) break; await h.wait(100); } };

export default [
  {
    name: "дзеркало: сцена проєктує кадр, одинадцять матеріалів, Сяйво активне, затвор і переворот", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-live]")) === 1, "сцена не позначена як жива");
      h.expect((await h.count("[data-mat]")) === 11, "не одинадцять матеріалів");
      h.expect(await h.attr('[data-mat="lum"]', "aria-pressed") === "true", "Сяйво не активне");
      h.expect((await h.count("[data-shutter]")) === 1 && (await h.count("[data-shutter]:disabled")) === 0, "затвор відсутній або вимкнений");
      h.expect((await h.count("[data-flip]")) === 1, "немає перевороту камери");
      h.expect((await h.count("[data-torch]")) === 0, "спалах показано без треку, що його декларує");
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
      h.expect(await h.attr("[data-live]", "data-material") === "ink", "сцена не знає про Туш");
    },
  },
  {
    name: "перевернути камеру: дзеркало вмикається і вимикається", run: async (h) => {
      await ready(h);
      await h.click("[data-flip]"); await h.wait(120);
      h.expect(await h.attr("[data-live]", "data-facing") === "user", "фронтальна камера не увімкнулась");
      await h.click("[data-flip]"); await h.wait(120);
      h.expect(await h.attr("[data-live]", "data-facing") === "environment", "задня камера не повернулась");
    },
  },
  {
    name: "зняти → проявляється → готово: велика «Зберегти», поділитися, ×4; матеріал повертає камеру (гейт: без мережі)", run: async (h) => {
      await ready(h);
      await develop(h);
      h.expect((await h.count("[data-keeper]")) === 1, "проявлений кадр не зʼявився");
      h.expect(await h.attr("[data-live]", "data-phase") === "done", "фаза не done");
      h.expect((await h.count("[data-act=save]")) === 1 && /Зберегти/.test(await h.text("[data-act=save]")), "немає великої «Зберегти»");
      h.expect((await h.count("[data-act=share]")) === 1 && (await h.count("[data-act=hd]")) === 1, "немає поділитися / ×4");
      h.expect((await h.count("[data-shutter]")) === 0, "затвор лишився під проявленим кадром");
      h.expect((await h.count('[data-mat="smoke"]:disabled')) === 0, "стрічка вимкнена — а вона є дорогою назад");
      await h.click('[data-mat="smoke"]'); await h.wait(150);
      h.expect((await h.count("[data-keeper]")) === 0, "кадр не зник після вибору матеріалу");
      h.expect((await h.count("[data-shutter]")) === 1, "затвор не повернувся");
      h.expect(await h.attr("[data-live]", "data-material") === "smoke", "камера не в обраному матеріалі");
    },
  },
  {
    name: "збільшити ×4: кадр стає вчетверо більшим, розмір замість кнопки", run: async (h) => {
      await ready(h);
      await develop(h);
      await h.click("[data-act=hd]");
      for (let i = 0; i < 30; i++) { if ((await h.count("[data-px]")) > 0) break; await h.wait(100); }
      h.expect(/3072×4096/.test(await h.text("[data-px]")), "розмір після збільшення не 3072×4096");
      h.expect((await h.count("[data-act=hd]")) === 0, "«збільшити» лишилось після збільшення");
      h.expect((await h.count("[data-keeper][data-hd]")) === 1, "кадр не позначений як збільшений");
      h.expect((await h.count("[data-act=save]")) === 1, "«Зберегти» зникла після збільшення");
    },
  },
  {
    name: "повний розмір відкривається тапом на сцену; Back закриває", run: async (h) => {
      await ready(h);
      await develop(h);
      await h.click("[data-gestures]"); await h.wait(250);
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
