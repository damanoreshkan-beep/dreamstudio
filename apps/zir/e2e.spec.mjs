// The gate has no network, no camera and no GPU minute to spend: state.js seeds the stage as DONE with a local
// photo and its 4× twin, and every "enlarge" re-seeds locally after a short beat. The whole screen — the
// compare, the readout, the actions, the options sheet, the full-size view, the new-photo chooser — is
// exercised without a single call out.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-result]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "сцена: порівняння до/після, розміри, дії", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-compare]")) === 1, "немає порівняння");
      h.expect((await h.count("[data-before]")) === 1 && (await h.count("[data-after]")) === 1, "немає двох картинок під роздільником");
      h.expect(/768×1024 → 3072×4096/.test(await h.text("[data-px]")), "розміри не показані");
      h.expect((await h.count("[data-go]")) === 1, "немає кнопки дії");
      h.expect((await h.count("[data-act=save]")) === 1, "немає збереження");
      h.expect((await h.count("[data-act=share]")) === 1, "немає поділитися");
      h.expect((await h.count("[data-act=again]")) === 1, "немає повторного збільшення");
      h.expect(await h.attr('[data-q="hd"]', "aria-pressed") === "true", "якість Точно не активна");
    },
  },
  {
    // The picture is the subject: the stage must take the larger share of the view, the island what is left.
    name: "сцена отримує більшу частку екрана, ніж острів", run: async (h) => {
      await ready(h);
      const stage = await h.css("[data-stage-box]", "height"), island = await h.css("[data-island]", "height");
      h.expect(parseFloat(stage) > parseFloat(island), `сцена ${stage} не більша за острів ${island}`);
    },
  },
  {
    // The divider starts in the middle and the enlarged picture is clipped to its left — the one geometry the
    // gate can assert without a pointer drag (the helper taps centres; a centre tap moves nothing).
    name: "роздільник посередині, «після» обрізане до нього", run: async (h) => {
      await ready(h);
      h.expect(await h.attr("[data-compare]", "aria-valuenow") === "50", "роздільник не посередині");
      // Chrome serialises the attribute as `inset(0px 50% 0px 0px)` — match the 50%, not the spelling (CI, 2026-09-02)
      h.expect(/inset\([^)]*\b50(\.0+)?%/.test(await h.attr("[data-after]", "style")), "«після» не обрізане до роздільника");
    },
  },
  {
    name: "збільшити ще робить результат джерелом і збільшує знову (гейт: без мережі)", run: async (h) => {
      await ready(h);
      await h.click("[data-act=again]"); await h.wait(200);
      h.expect((await h.count("[data-compare]")) === 0, "після «ще» порівняння мало зникнути");
      await h.click("[data-go]");
      for (let i = 0; i < 20; i++) { if ((await h.count("[data-compare]")) > 0) break; await h.wait(150); }
      h.expect((await h.count("[data-compare]")) === 1, "повторне збільшення не дало результату");
    },
  },
  {
    name: "якість перемикається на Швидко і назад", run: async (h) => {
      await ready(h);
      await h.click('[data-q="fast"]'); await h.wait(120);
      h.expect(await h.attr('[data-q="fast"]', "aria-pressed") === "true", "Швидко не увімкнулось");
      await h.click('[data-q="hd"]'); await h.wait(120);
      h.expect(await h.attr('[data-q="hd"]', "aria-pressed") === "true", "Точно не повернулось");
    },
  },
  {
    name: "параметри: sheet з моделями, Back закриває", run: async (h) => {
      await ready(h);
      await h.click("[data-opts]"); await h.wait(250);
      h.expect((await h.prop("#opts", "open")) === true, "sheet параметрів не відкрився");
      h.expect((await h.count("[data-model]")) >= 2, "моделі не показані");
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#opts", "open")) === false, "Back не закрив sheet параметрів");
    },
  },
  {
    name: "повний розмір відкривається; Back закриває", run: async (h) => {
      await ready(h);
      await h.click("[data-view]"); await h.wait(250);
      h.expect((await h.count("[data-lightbox]")) === 1, "повний розмір не відкрився");
      await h.back(); await h.wait(300);
      h.expect((await h.count("[data-lightbox]")) === 0, "Back не закрив повний розмір");
    },
  },
  {
    name: "нове фото повертає вибір джерела", run: async (h) => {
      await ready(h);
      await h.click("[data-new]"); await h.wait(200);
      h.expect((await h.count("[data-source]")) === 1, "вибір джерела не показано");
      h.expect((await h.count("[data-src-upload]")) === 1 && (await h.count("[data-src-camera]")) === 1 && (await h.count("[data-src-last]")) === 1, "не всі три джерела");
      await h.click("[data-src-last]"); await h.wait(200);
      h.expect((await h.count("[data-result]")) === 1, "остання картинка не стала джерелом");
      h.expect((await h.count("[data-go]:disabled")) === 0, "кнопка дії вимкнена при наявному фото");
    },
  },
];
