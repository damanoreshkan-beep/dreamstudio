// Under the gate a clip is already on the stage (boot seeds the VP9 mock, data-live), the model rail is a
// three-row mock catalogue, the chooser's third source is a fixed mock picture, and a job is a 90 ms wait that
// yields the same mock — no network, no GPU, no sign-in.
const ready = async (h) => { for (let i = 0; i < 30; i++) { if ((await h.count("[data-frame][data-live]")) > 0) break; await h.wait(200); } };

export default [
  {
    name: "кадр на місці: кліп на сцені, транспорт, рейка моделей, Зняти увімкнена", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-frame][data-live]")) === 1, "немає кліпу на сцені");
      h.expect((await h.count("video[data-clip]")) === 1, "немає <video> з кліпом");
      h.expect((await h.count("[data-transport]")) === 1, "немає транспорту");
      h.expect((await h.attr("[data-rk-phase]", "data-rk-phase")) === "done", "фаза не done");
      h.expect(/\d:\d\d/.test(await h.text("[data-clip-meta]")), "у підписі кадру немає тривалості");
      h.expect((await h.attr('[data-model="auto"]', "aria-pressed")) === "true", "Авто не стандарт");
      h.expect((await h.count("[data-model]")) === 3, "у текстовому режимі рейка має Авто + 2 моделі (i2v-ряд лише з фото)");
      h.expect((await h.count("[data-models-check]")) === 1, "немає кнопки перевірки каталогу");
      h.expect((await h.prop("[data-generate]", "disabled")) === false, "Зняти вимкнена зі словами");
    },
  },
  {
    name: "модель обирається і зберігається; слова → Зняти → новий кліп від обраної моделі", run: async (h) => {
      await ready(h);
      await h.click('[data-model="Lightricks/LTX-2-3"]'); await h.wait(150);
      h.expect((await h.attr('[data-model="Lightricks/LTX-2-3"]', "aria-pressed")) === "true", "модель не обралась");
      h.expect(((await h.storage("ms:rukh:model")) || "").includes("LTX"), "модель не збережено");
      const before = await h.attr("video[data-clip]", "data-clip");
      await h.tap("[data-generate]"); await h.wait(700);
      h.expect((await h.attr("[data-rk-phase]", "data-rk-phase")) === "done", "після зйомки фаза не done");
      h.expect((await h.attr("video[data-clip]", "data-clip")) !== before, "новий кліп не став на сцену");
      h.expect(/LTX/.test(await h.text("[data-transport]")), "транспорт не називає модель кліпу");
      await h.click('[data-model="auto"]'); await h.wait(100);
      await h.type("[data-words]", ""); await h.wait(150);
      h.expect((await h.prop("[data-generate]", "disabled")) === true, "без слів і фото кнопка має бути вимкнена");
      await h.type("[data-words]", "Кіт повільно повертає голову"); await h.wait(150);
      h.expect(((await h.storage("ms:rukh:words")) || "").includes("Кіт"), "слова не збережено");
    },
  },
  {
    // the first frame: the chooser's "last picture" becomes the frame (the i2v row joins the rail, the verb turns
    // into Оживити); × removes it with an undo toast; after a take the clip is ON TOP and the first-frame chip
    // brings the picture back for another take
    name: "перший кадр: остання картинка → фото, i2v-ряд, Оживити; × прибирає; після зйомки кліп зверху, чіп повертає фото", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-src-upload]")) === 1 && (await h.count("[data-src-camera]")) === 1, "немає джерел фото на кадрі");
      await h.click("[data-src-last]"); await h.wait(300);
      h.expect((await h.count("[data-picture]")) === 1, "картинка не стала першим кадром");
      h.expect((await h.attr("[data-rk-mode]", "data-rk-mode")) === "picture", "режим не picture");
      h.expect((await h.count("[data-model]")) === 4, "з фото рейка має показати і i2v-ряд");
      h.expect(/Оживити|Animate/.test(await h.text("[data-generate]")), "кнопка не каже Оживити");
      await h.tap("[data-remove-picture]"); await h.wait(300);
      h.expect((await h.count("[data-picture]")) === 0, "× не прибрав фото");
      h.expect((await h.attr("[data-rk-mode]", "data-rk-mode")) === "text", "режим не повернувся до text");
      await h.click("[data-src-last]"); await h.wait(300);
      await h.tap("[data-generate]"); await h.wait(700);
      h.expect((await h.attr("[data-rk-phase]", "data-rk-phase")) === "done", "оживлення не дійшло до done");
      h.expect((await h.count("[data-picture]")) === 0, "фото лишилось поверх кліпу");
      h.expect((await h.count("video[data-clip]")) === 1, "кліпу немає на сцені");
      h.expect((await h.count("[data-first-frame]")) === 1, "немає чіпа першого кадру на кліпі");
      await h.click("[data-first-frame]"); await h.wait(300);
      h.expect((await h.count("[data-picture]")) === 1, "чіп не повернув фото");
      await h.tap("[data-remove-picture]"); await h.wait(300);
    },
  },
  {
    name: "колекція: рядки з моделлю, видалення з undo, Back закриває", run: async (h) => {
      await ready(h);
      await h.click("[data-clips]"); await h.wait(300);
      h.expect((await h.prop("#rk-clips", "open")) === true, "колекція не відкрилась");
      const n = await h.count("[data-clip-row]");
      h.expect(n >= 2, "у колекції менше двох кліпів");
      await h.tap("[data-clip-delete]"); await h.wait(300);
      h.expect((await h.count("[data-clip-row]")) === n - 1, "кліп не видалився");
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#rk-clips", "open")) !== true, "Back не закрив колекцію");
    },
  },
];
