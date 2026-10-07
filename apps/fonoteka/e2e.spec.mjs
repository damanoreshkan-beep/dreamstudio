const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-song]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "полиця: три пісні з фікстури, зчитування місця, транспорт без крутилок", run: async (h) => {
      await ready(h); await h.wait(300);
      h.expect((await h.attr("[data-fonoteka]", "data-songs")) === "3", "не три пісні під гейтом");
      h.expect(/Never Gonna Give You Up \(slowed \+ reverb\)/.test(await h.bodyText()), "немає назви з тегу");
      h.expect(/Польова пісня/.test(await h.bodyText()), "немає назви з імені файлу");
      h.expect(/Rick Astley · 4:11 · 6\.0 MB/.test(await h.bodyText()), "немає рядка виконавець · довжина · розмір");
      h.expect(/3 пісень · 17\.9 MB з 3 GB|3 songs · 17\.9 MB of 3 GB/.test(await h.text("[data-usage]")), "немає зчитування місця");
      h.expect((await h.count("[data-transport]")) === 1 && (await h.count("#play")) === 1, "немає одного транспорту");
      h.expect((await h.count("[data-add]")) === 1 && (await h.count('[data-picker][type="file"]')) === 1, "немає кнопки «Додати mp3» з вибором файлу");
      h.expect((await h.count(".loading")) === 0, "крутилка на екрані");
    },
  },
  {
    name: "плеєр: тап на пісню грає її (aria-pressed, data-playing, назва в транспорті), play/pause, next по колу", run: async (h) => {
      await ready(h);
      await h.tap('[data-play="b2c3d4e5f6071829"]'); await h.wait(200);
      h.expect((await h.attr('[data-play="b2c3d4e5f6071829"]', "aria-pressed")) === "true", "пісня не вибрана");
      h.expect((await h.attr("[data-fonoteka]", "data-playing")) === "true", "гра не почалась");
      h.expect(/Never Gonna Give You Up/.test(await h.text("[data-transport]")), "транспорт не показує пісню");
      await h.tap("#play"); await h.wait(150);
      h.expect((await h.attr("[data-fonoteka]", "data-playing")) !== "true", "пауза не спрацювала");
      await h.tap("#next"); await h.wait(200);
      h.expect((await h.attr('[data-play="c3d4e5f607182930"]', "aria-pressed")) === "true", "next не перейшов на наступну");
      await h.tap("#next"); await h.wait(200);
      h.expect((await h.attr('[data-play="a1b2c3d4e5f60718"]', "aria-pressed")) === "true", "після останньої — не перша");
    },
  },
  {
    name: "видалення: конфірм-шторка, Back скасовує, підтвердження прибирає рядок і каже «Видалено»", run: async (h) => {
      await ready(h);
      await h.tap('[data-del="c3d4e5f607182930"]'); await h.wait(250);
      h.expect((await h.prop("#confirm", "open")) === true, "конфірм не відкрився");
      await h.back(); await h.wait(250);
      h.expect((await h.prop("#confirm", "open")) !== true, "Back не закрив конфірм");
      h.expect((await h.count('[data-song="c3d4e5f607182930"]')) === 1, "пісня зникла без підтвердження");
      await h.tap('[data-del="c3d4e5f607182930"]'); await h.wait(250);
      await h.click("#confirm-go"); await h.wait(400);
      h.expect((await h.count('[data-song="c3d4e5f607182930"]')) === 0, "пісня лишилась після підтвердження");
      h.expect(/Видалено|Deleted/.test(await h.bodyText()), "немає підтвердження");
      h.expect((await h.attr("[data-fonoteka]", "data-songs")) === "2", "лічильник не зменшився");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Fonoteka|Songs|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Фонотека|Пісні|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="songs"]'); await h.wait(120);
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
