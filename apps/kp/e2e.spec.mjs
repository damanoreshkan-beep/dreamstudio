// The gate/mock uses a static sample (a G1 storm), so the gauge + forecast render deterministically.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-kp]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "магнітні бурі: гейдж Kp + прогноз рендеряться", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-kp]")) === 1, "немає індексу Kp");
      h.expect(/5\.0/.test(await h.text("[data-kp]")), "невірне значення Kp семплу");
      h.expect((await h.count("svg")) >= 2, "немає гейджа/графіка");
      h.expect(/G1|Kp/i.test(await h.bodyText()), "немає рівня шторму / Kp");
      h.expect(/512/.test(await h.bodyText()), "немає сонячного вітру");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Storm|Solar|Language|Forecast/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/бур|вітер|Мова|Прогноз/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="now"]'); await h.wait(120);
    },
  },
  {
    // The bell is systemic, so this is the farm's proof that an app gets it from one spec key — and the
    // case that would have stayed green while the card rendered nothing at all.
    name: "дзвінок: з панелі, одним тапом від слова", run: async (h) => {
      await ready(h);
      // The point of the case is the DOOR, not the card: the bell lives in the bar of every tab, because a
      // reader who came to look at Kp never opens the settings page.
      h.expect((await h.count("#watch-btn")) === 1, "немає дзвінка в панелі");
      await h.click("#watch-btn"); await h.wait(400);
      h.expect((await h.count('[data-watch="kp"]')) === 1, "немає картки сповіщень");
      h.expect((await h.count("[data-watch-add]")) === 1, "немає кнопки додати");
      // «в км не зрозуміло. просто це "близько" і все» — Kp теж число, яке лише вдає знання, тому поріг тут
      // тепер слово зі шкали NOAA, а не цифра з повзунка. Ні поля, ні вище/нижче: слово несе і напрям.
      h.expect((await h.count("[data-watch-bands] [data-watch-band]")) >= 2, "немає слів замість порогу");
      h.expect((await h.count("[data-watch-value]")) === 0, "поле числа лишилось там, де читають слово");
      h.expect((await h.count("[data-watch-rules] li")) >= 1, "немає списку правил");
      await h.back(); await h.wait(250);
      h.expect((await h.count('[data-watch="kp"]')) === 0, "Back не закрив екран");
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
