// WebSerial has no device under headless CI — the view gate-seeds "idle" (no ?st), so the e2e checks the
// front-door render, i18n parity and the PWA install modal. The flash flow itself is proven on real hardware.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-dev]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "флеш-екран: пристрій + кнопка Прошити", run: async (h) => {
      await ready(h); await h.wait(300);
      h.expect((await h.count("[data-dev]")) === 1, "немає індикатора пристрою");
      h.expect((await h.count("#flash-btn")) === 1, "немає кнопки Прошити");
      h.expect((await h.attr("[data-phase]", "data-phase")) === "idle", "не idle під гейтом");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Flash|Iskra|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Прошити|Іскра|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="flash"]'); await h.wait(120);
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
