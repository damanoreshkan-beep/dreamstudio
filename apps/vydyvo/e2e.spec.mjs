// Under the gate a race is a 90 ms wait that yields two gradient frames — no network, no GPU, no sign-in.
// Poll the frame that is ON, not the <img> (both slots exist from the first render).
const ready = async (h) => { for (let i = 0; i < 30; i++) { if ((await h.count("[data-frame][data-on]")) > 0) break; await h.wait(400); } };

export default [
  {
    name: "кадр на сцені, статус у рядку", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-frame][data-on]")) === 1, "немає кадру на сцені");
      h.expect(/\S/.test(await h.text("[data-status]")), "порожній рядок статусу");
    },
  },
  {
    name: "налаштування: пресет, таймер, якість перемикаються, Back закриває", run: async (h) => {
      await ready(h);
      await h.click("[data-settings]"); await h.wait(250);
      h.expect((await h.prop("#vy-settings", "open")) === true, "sheet налаштувань не відкрився");
      await h.click('[data-preset="depth"]'); await h.wait(150);
      h.expect((await h.attr("[data-stage]", "data-vy-preset")) === "depth", "пресет не змінився");
      await h.click('[data-every="30"]'); await h.wait(150);
      h.expect((await h.attr("[data-stage]", "data-vy-every")) === "30", "таймер не змінився");
      await h.click('[data-q="fast"]'); await h.wait(150);
      h.expect((await h.attr('[data-q="fast"]', "aria-pressed")) === "true", "якість не перемкнулась");
      await h.click('[data-preset="still"]'); await h.click('[data-every="120"]'); await h.click('[data-q="2k"]'); await h.wait(100);
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#vy-settings", "open")) !== true, "Back не закрив sheet");
    },
  },
  {
    name: "показ: сцена над хромом із годинником і думкою, Back повертає", run: async (h) => {
      await ready(h);
      await h.tap("[data-show-btn]"); await h.wait(400);
      h.expect((await h.count("[data-stage][data-show]")) === 1, "показ не почався");
      h.expect(/\d{1,2}:\d{2}/.test(await h.text("[data-clock]")), "у показі немає годинника");
      h.expect((await h.count("[data-line]")) === 1, "у показі немає рядка-думки");
      await h.back(); await h.wait(400);
      h.expect((await h.count("[data-stage][data-show]")) === 0, "Back не вийшов із показу");
    },
  },
  {
    name: "далі: наступний кадр стає на сцену", run: async (h) => {
      await ready(h);
      for (let i = 0; i < 20 && (await h.count("[data-frame][src]")) < 2; i++) await h.wait(300);
      const before = await h.attr("[data-frame][data-on]", "data-slot");
      await h.click("[data-skip]"); await h.wait(300);
      h.expect((await h.attr("[data-frame][data-on]", "data-slot")) !== before, "кадр не змінився");
    },
  },
  {
    name: "промпт зберігається між запусками", run: async (h) => {
      await h.type("[data-prompt]", "туман над рікою"); await h.wait(200);
      h.expect(((await h.storage("ms:vydyvo:opts")) || "").includes("туман"), "промпт не збережено");
      await h.type("[data-prompt]", ""); await h.wait(100);
    },
  },
  {
    name: "i18n EN/UA міняє текст", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Screensaver|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Заставка|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="stage"]'); await h.wait(120);
    },
  },
];
