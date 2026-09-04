// Under the gate a race is a 90 ms wait that yields two gradient frames — no network, no GPU, no sign-in.
// Poll the frame that is ON, not the <img> (both slots exist from the first render).
const ready = async (h) => { for (let i = 0; i < 30; i++) { if ((await h.count("[data-frame][data-on]")) > 0) break; await h.wait(400); } };

export default [
  {
    name: "кадр на сцені, статус у рядку", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-frame][data-on]")) === 1, "немає кадру на сцені");
      h.expect(/\S/.test(await h.text("[data-status]")), "порожній рядок статусу");
      // the THEME is the world: the stage carries its id — no preset UI, no theme label anywhere
      h.expect(/\S/.test(await h.attr("[data-stage]", "data-vy-world") || ""), "сцена не знає світу теми");
      h.expect((await h.count("[data-preset-card]")) === 0, "пресети мали зникнути");
    },
  },
  {
    name: "налаштування: таймер і якість перемикаються, Back закриває", run: async (h) => {
      await ready(h);
      await h.click("[data-settings]"); await h.wait(250);
      h.expect((await h.prop("#vy-settings", "open")) === true, "sheet налаштувань не відкрився");
      await h.click('[data-every="30"]'); await h.wait(150);
      h.expect((await h.attr("[data-stage]", "data-vy-every")) === "30", "таймер не змінився");
      await h.click('[data-q="fast"]'); await h.wait(150);
      h.expect((await h.attr('[data-q="fast"]', "aria-pressed")) === "true", "якість не перемкнулась");
      await h.click('[data-every="120"]'); await h.click('[data-q="2k"]'); await h.wait(100);
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
    // nothing is kept (owner 2026-09-04): there is no collection to count — the wand's proof is the number of
    // FRESH frames waiting for the stage, which the stage carries as data-vy-ahead
    name: "паличка: явна генерація негайно малює свіжі кадри наперед", run: async (h) => {
      await ready(h);
      const ahead = async () => Number(await h.attr("[data-stage]", "data-vy-ahead"));
      const before = await ahead();
      await h.tap("[data-gen-now]"); await h.wait(1500);
      h.expect((await ahead()) > before, "свіжих кадрів наперед не побільшало після явної генерації");
    },
  },
  {
    // the characters are their own choice (owner 2026-09-04): twelve tiles, a tap picks the character AND opens the
    // show; the pick survives a reload as opts.char, and the stage now belongs to that world
    name: "персонажі: сітка з дванадцяти, тап обирає і відкриває показ", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-chars] [data-char]")) === 12, "у сітці має бути дванадцять персонажів");
      h.expect((await h.count("[data-char='lum'][data-on]")) === 1, "до вибору обраний lum");
      await h.tap("[data-char='ink']"); await h.wait(400);
      h.expect((await h.count("[data-stage][data-show]")) === 1, "тап по персонажу не відкрив показ");
      h.expect((await h.attr("[data-stage]", "data-vy-world")) === "ink", "сцена не перейшла у світ обраного персонажа");
      await h.back(); await h.wait(300);
      h.expect((await h.count("[data-char='ink'][data-on]")) === 1, "вибір не позначено в сітці");
    },
  },
  {
    name: "промпт зберігається, хрестик стирає і зникає", run: async (h) => {
      await h.type("[data-prompt]", "туман над рікою"); await h.wait(200);
      h.expect(((await h.storage("ms:vydyvo:opts")) || "").includes("туман"), "промпт не збережено");
      h.expect((await h.count("[data-clear]")) === 1, "немає хрестика біля введених слів");
      await h.click("[data-clear]"); await h.wait(200);
      h.expect(!((await h.storage("ms:vydyvo:opts")) || "").includes("туман"), "хрестик не стер слова");
      h.expect((await h.count("[data-clear]")) === 0, "хрестик лишився над порожнім полем");
    },
  },
  {
    // The veil itself is a sub-second state under the gate (the fixture paints a matching frame in ~90 ms,
    // faster than a poll can look) — the CHECKABLE invariant is the outcome: after a theme flip the stage
    // ends up holding a frame of the new mode, with no veil left. The veil's look is the eye's job.
    name: "зміна теми: сцена отримує кадр нового режиму, вуаль знімається", run: async (h) => {
      await ready(h);
      await h.click('[data-tab="me"]'); await h.wait(200);
      await h.click('#p-theme [data-mode="day"]'); await h.wait(250);
      await h.click('[data-tab="stage"]'); await h.wait(150);
      for (let i = 0; i < 24 && (await h.attr("[data-stage]", "data-vy-mode")) !== "light"; i++) await h.wait(400);
      h.expect((await h.attr("[data-stage]", "data-vy-mode")) === "light", "кадр світлого режиму так і не став на сцену");
      h.expect((await h.count("[data-veiled]")) === 0, "вуаль лишилась над кадром свого режиму");
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('#p-theme [data-mode="night"]'); await h.wait(200);
      await h.click('[data-tab="stage"]'); await h.wait(150);
      for (let i = 0; i < 24 && (await h.attr("[data-stage]", "data-vy-mode")) !== "dark"; i++) await h.wait(400);
      h.expect((await h.attr("[data-stage]", "data-vy-mode")) === "dark", "повернення в ніч не повернуло нічний кадр");
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
