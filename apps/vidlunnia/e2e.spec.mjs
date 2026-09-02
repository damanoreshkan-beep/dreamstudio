// Under the gate the microphone is a synthetic take (seeded on boot, data-live) and a clone is a 90 ms wait
// that yields a synthetic WAV — no network, no GPU, no sign-in. The words persist in localStorage.
const ready = async (h) => { for (let i = 0; i < 30; i++) { if ((await h.count("[data-take][data-live]")) > 0) break; await h.wait(200); } };

export default [
  {
    name: "голос на місці: печатка запису, статус, кнопка Скажи вимкнена без слів", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-take][data-live]")) === 1, "немає запису голосу");
      h.expect((await h.attr("[data-ring-state]", "data-ring-state")) === "sealed", "кільце не показує печатку голосу");
      h.expect(/\d:\d\d/.test(await h.text("[data-take-status]")), "у статусі немає тривалості");
      h.expect((await h.count('[data-record][data-state="again"]')) === 1, "немає кнопки перезапису");
      h.expect((await h.prop("[data-generate]", "disabled")) === true, "Скажи має бути вимкнена без слів");
    },
  },
  {
    // the presets speak without a microphone: a preset voice + words is enough for Say it
    name: "голос-пресет: жіночий/чоловічий доступні без запису, Скажи активна зі словами", run: async (h) => {
      await ready(h);
      h.expect((await h.count('[data-voice="f"]')) === 1 && (await h.count('[data-voice="m"]')) === 1, "немає пресетів голосу");
      await h.click('[data-voice="m"]'); await h.wait(400);
      h.expect((await h.attr('[data-voice="m"]', "aria-pressed")) === "true", "пресет не вибрався");
      await h.type("[data-words]", "Голос без запису"); await h.wait(150);
      h.expect((await h.prop("[data-generate]", "disabled")) === false, "Скажи вимкнена з пресетом і словами");
      h.expect(/\d:\d\d/.test(await h.text("[data-take-status]")), "кільце не показує тривалість пресета");
      await h.click('[data-voice="mine"]'); await h.wait(150);
      h.expect((await h.attr('[data-voice="mine"]', "aria-pressed")) === "true", "свій голос не повернувся");
    },
  },
  {
    name: "слова + манера → відлуння на транспорті, слова збережені", run: async (h) => {
      await ready(h);
      await h.type("[data-words]", "Привіт, світе"); await h.wait(150);
      h.expect(((await h.storage("ms:vidlunnia:words")) || "").includes("Привіт"), "слова не збережено");
      await h.click('[data-manner="whisper"]'); await h.wait(120);
      h.expect((await h.attr('[data-manner="whisper"]', "aria-pressed")) === "true", "манера не перемкнулась");
      h.expect((await h.prop("[data-generate]", "disabled")) === false, "Скажи лишилась вимкненою зі словами");
      await h.tap("[data-generate]"); await h.wait(600);
      h.expect((await h.count("[data-transport]")) === 1, "після генерації немає транспорту");
      h.expect((await h.attr("[data-vd-phase]", "data-vd-phase")) === "done", "фаза не done");
      await h.click('[data-manner="asis"]'); await h.wait(80);
    },
  },
  {
    name: "відлуння: sheet відкривається з рядком, видалення з undo, Back закриває", run: async (h) => {
      await ready(h);
      await h.type("[data-words]", "Друге відлуння"); await h.wait(100);
      await h.tap("[data-generate]"); await h.wait(600);
      await h.click("[data-echoes]"); await h.wait(300);
      h.expect((await h.prop("#vd-echoes", "open")) === true, "sheet відлунь не відкрився");
      const n = await h.count("[data-echo-row]");
      h.expect(n >= 1, "у sheet немає рядків");
      await h.click("[data-echo-delete]"); await h.wait(250);
      h.expect((await h.count("[data-echo-row]")) === n - 1, "рядок не зник після видалення");
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#vd-echoes", "open")) !== true, "Back не закрив sheet");
    },
  },
  {
    name: "i18n EN/UA міняє текст", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Voice|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Голос|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="voice"]'); await h.wait(120);
    },
  },
];
