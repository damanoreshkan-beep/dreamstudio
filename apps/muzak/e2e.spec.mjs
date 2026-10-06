const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-muzak]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "пісня: поле посилання, картка з назвою, виконавцем і тривалістю, кнопка mp3", run: async (h) => {
      await ready(h); await h.wait(300);
      h.expect((await h.count("[data-link]")) === 1, "немає поля посилання");
      h.expect((await h.attr("[data-muzak]", "data-song")) === "dQw4w9WgXcQ", "картка пісні не показана під гейтом");
      h.expect(/Never Gonna Give You Up/.test(await h.text("[data-song-title]")), "немає назви пісні");
      h.expect(/Rick Astley · Whenever You Need Somebody · 1987/.test(await h.bodyText()), "немає рядка виконавець · альбом · рік");
      h.expect(/3:33/.test(await h.bodyText()), "немає тривалості");
      h.expect((await h.count("[data-save]")) === 1, "немає кнопки mp3");
      h.expect((await h.count(".loading")) === 0, "крутилка на екрані");
    },
  },
  {
    name: "скачати: тап зберігає і каже «Збережено»", run: async (h) => {
      await ready(h);
      await h.tap("[data-save]"); await h.wait(400);
      h.expect(/Збережено|Saved/.test(await h.bodyText()), "немає підтвердження");
    },
  },
  {
    name: "посилання: не-YouTube адреса — одна фраза помилки, картка зникає; YouTube-адреса повертає картку", run: async (h) => {
      await ready(h);
      await h.type("[data-link]", "https://example.com/song"); await h.click("[data-find]"); await h.wait(250);
      h.expect((await h.count("[data-err]")) === 1, "немає помилки");
      h.expect(!(await h.attr("[data-muzak]", "data-song")), "картка лишилась");
      await h.type("[data-link]", "https://youtu.be/dQw4w9WgXcQ"); await h.click("[data-find]"); await h.wait(300);
      h.expect((await h.count("[data-err]")) === 0, "помилка не зникла");
      h.expect((await h.attr("[data-muzak]", "data-song")) === "dQw4w9WgXcQ", "картка не повернулась");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Muzak|Song|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Музак|Пісня|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="song"]'); await h.wait(120);
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
