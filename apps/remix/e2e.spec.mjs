const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-remix]")) > 0) break; await h.wait(300); } };
// under the gate the fixture song arrives already mixed (view.js MIXED), so the card shows the whole screen
const mixed = async (h) => { await ready(h); if ((await h.count("[data-track]")) === 0) { await h.tap("[data-mix]"); await h.wait(400); } };

export default [
  {
    name: "пісня: поле посилання, картка з назвою і тривалістю, без крутилок", run: async (h) => {
      await ready(h); await h.wait(300);
      h.expect((await h.count("[data-link]")) === 1, "немає поля посилання");
      h.expect((await h.attr("[data-remix]", "data-song")) === "dQw4w9WgXcQ", "картка пісні не показана під гейтом");
      h.expect(/Never Gonna Give You Up/.test(await h.text("[data-song-title]")), "немає назви пісні");
      h.expect(/3:33/.test(await h.bodyText()), "немає тривалості");
      h.expect((await h.count(".loading")) === 0, "крутилка на екрані");
    },
  },
  {
    name: "ремікси: три версії, кожна зі швидкістю і темпом, плюс що почуто в пісні", run: async (h) => {
      await mixed(h);
      h.expect((await h.count("[data-track]")) === 3, "не три версії");
      h.expect((await h.count('[data-track][data-state="ready"]')) === 3, "версії не готові під гейтом");
      const body = await h.bodyText();
      h.expect(/0\.85×/.test(body) && /96 BPM/.test(body), "немає швидкості й нового темпу slowed");
      h.expect(/1\.30×/.test(body) && /147 BPM/.test(body), "немає швидкості й нового темпу nightcore");
      h.expect(/113 BPM/.test(await h.text("[data-readout]")), "немає темпу пісні в зчитуванні");
      h.expect(/щільний мікс|dense mix/.test(await h.text("[data-readout]")), "немає слова про щільність");
      h.expect((await h.count("[data-save]")) === 3, "не три кнопки зберегти");
      h.expect((await h.count("[data-mix]")) === 0, "кнопка реміксів показана, хоча версії вже готові");
    },
  },
  {
    name: "плеєр: вибір версії — aria-pressed, одна кнопка грати перемикає data-playing", run: async (h) => {
      await mixed(h);
      h.expect((await h.attr('[data-pick="slowed"]', "aria-pressed")) === "true", "перша версія не вибрана за замовчуванням");
      await h.tap('[data-pick="nightcore"]'); await h.wait(150);
      h.expect((await h.attr('[data-pick="nightcore"]', "aria-pressed")) === "true", "вибір не перемкнувся");
      h.expect((await h.attr('[data-pick="slowed"]', "aria-pressed")) === "false", "стара версія лишилась вибраною");
      h.expect((await h.count("[data-transport]")) === 1 && (await h.count("#play")) === 1, "немає одного транспорту з однією кнопкою грати");
      await h.tap("#play"); await h.wait(150);
      h.expect((await h.attr("[data-remix]", "data-playing")) === "true", "гра не почалась");
      await h.tap("#play"); await h.wait(150);
      h.expect((await h.attr("[data-remix]", "data-playing")) !== "true", "пауза не спрацювала");
      await h.tap("#next"); await h.wait(150);
      h.expect((await h.attr('[data-pick="slowed"]', "aria-pressed")) === "true", "наступна після останньої — не перша");
    },
  },
  {
    name: "зберегти: тап каже «Збережено»", run: async (h) => {
      await mixed(h);
      await h.tap('[data-save="deep"]'); await h.wait(400);
      h.expect(/Збережено|Saved/.test(await h.bodyText()), "немає підтвердження");
    },
  },
  {
    name: "посилання: не-YouTube адреса — одна фраза помилки, картка і версії зникають; YouTube-адреса повертає картку з кнопкою «Три ремікси», тап мікшує", run: async (h) => {
      await ready(h);
      await h.type("[data-link]", "https://example.com/song"); await h.click("[data-find]"); await h.wait(250);
      h.expect((await h.count("[data-err]")) === 1, "немає помилки");
      h.expect(!(await h.attr("[data-remix]", "data-song")), "картка лишилась");
      h.expect((await h.count("[data-track]")) === 0, "старі версії лишились");
      await h.type("[data-link]", "https://youtu.be/dQw4w9WgXcQ"); await h.click("[data-find]"); await h.wait(300);
      h.expect((await h.count("[data-err]")) === 0, "помилка не зникла");
      h.expect((await h.attr("[data-remix]", "data-song")) === "dQw4w9WgXcQ", "картка не повернулась");
      h.expect((await h.count("[data-mix]")) === 1, "немає кнопки реміксів для нової пісні");
      await h.tap("[data-mix]"); await h.wait(400);
      h.expect((await h.count('[data-track][data-state="ready"]')) === 3, "тап не дав три версії");
    },
  },
  {
    name: "шерінг: посилання з іншого застосунку лягає в поле і одразу шукається", run: async (h) => {
      await h.goto("sh_text=" + encodeURIComponent("дивись https://youtu.be/dQw4w9WgXcQ"), 800); await ready(h); await h.wait(300);
      h.expect((await h.prop("[data-link]", "value")).includes("youtu.be/dQw4w9WgXcQ"), "посилання не лягло в поле");
      h.expect((await h.attr("[data-remix]", "data-song")) === "dQw4w9WgXcQ", "картка не знайшлась");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Remix|Song|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Ремікс|Пісня|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="mix"]'); await h.wait(120);
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
