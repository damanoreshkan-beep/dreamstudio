// Under the gate the microphone is a synthetic take (seeded on boot, data-live), the named-voice catalogue is a
// four-voice mock and a job is a 90 ms wait that yields a synthetic WAV — no network, no GPU, no sign-in.
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
    name: "стилі: 21 картка, персонаж обирається, слова + Скажи → відлуння на транспорті", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-style]")) === 21, "має бути «Як є» + 20 персонажів");
      await h.click('[data-style="shrek"]'); await h.wait(120);
      h.expect((await h.attr('[data-style="shrek"]', "aria-pressed")) === "true", "Шрек не обрався");
      await h.type("[data-words]", "Привіт, світе"); await h.wait(150);
      h.expect(((await h.storage("ms:vidlunnia:words")) || "").includes("Привіт"), "слова не збережено");
      h.expect((await h.prop("[data-generate]", "disabled")) === false, "Скажи лишилась вимкненою зі словами");
      await h.tap("[data-generate]"); await h.wait(600);
      h.expect((await h.count("[data-transport]")) === 1, "після генерації немає транспорту");
      h.expect((await h.attr("[data-vd-phase]", "data-vd-phase")) === "done", "фаза не done");
      await h.click('[data-style=""]'); await h.wait(80);
    },
  },
  {
    // the named voices: the sheet lists the app locale's language first; a named voice hides the styles
    name: "голоси: sheet за локаллю, іменований голос обирається, стилі ховаються, Back закриває", run: async (h) => {
      await ready(h);
      await h.click("[data-voice-pick]"); await h.wait(300);
      h.expect((await h.prop("#vd-voices", "open")) === true, "sheet голосів не відкрився");
      h.expect((await h.attr('[data-vlang="uk"]', "aria-pressed")) === "true", "мова голосів не українська за локаллю");
      h.expect((await h.count('[data-voice="f"]')) === 1 && (await h.count('[data-voice="m"]')) === 1, "немає клон-голосів");
      await h.click('[data-named="uk-tetiana"]'); await h.wait(300);
      h.expect((await h.prop("#vd-voices", "open")) !== true, "вибір голосу не закрив sheet");
      h.expect((await h.attr("[data-vd-voice]", "data-vd-voice")) === "uk-tetiana", "іменований голос не став активним");
      h.expect((await h.count("[data-styles]")) === 0, "стилі мали сховатись для іменованого голосу");
      h.expect((await h.text("[data-voice-name]")).includes("Тетяна"), "рядок голосу не показує імʼя");
      await h.click("[data-voice-pick]"); await h.wait(250);
      await h.click('[data-vlang="en"]'); await h.wait(150);
      h.expect((await h.count('[data-named="en-heart"]')) === 1, "англійські голоси не показались");
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#vd-voices", "open")) !== true, "Back не закрив sheet голосів");
      await h.click("[data-voice-pick]"); await h.wait(250);
      await h.click('[data-voice="mine"]'); await h.wait(200);
      h.expect((await h.attr("[data-vd-voice]", "data-vd-voice")) === "mine", "свій голос не повернувся");
      await h.back(); await h.wait(250);
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
    // the take can be thrown away (owner: "я не можу видалити свій запис"): the voice falls back to a preset
    name: "видалення запису: печатка зникає, голос стає пресетом, Мій зникає зі sheet", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-delete-take]")) === 1, "немає кнопки видалення запису");
      await h.tap("[data-delete-take]"); await h.wait(400);
      h.expect((await h.count("[data-take]")) === 0, "запис не зник");
      h.expect((await h.attr("[data-vd-voice]", "data-vd-voice")) === "f", "голос не перейшов на пресет");
      h.expect((await h.count('[data-record][data-state="idle"]')) === 1, "мікрофон не повернувся в стан запису");
      await h.click("[data-voice-pick]"); await h.wait(250);
      h.expect((await h.count('[data-voice="mine"]')) === 0, "Мій лишився без запису");
      await h.back(); await h.wait(250);
      await h.tap("[data-record]"); await h.wait(300);   // the gate seeds a fresh take at once
      h.expect((await h.count("[data-take][data-live]")) === 1, "новий запис не зʼявився");
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
