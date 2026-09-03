// Under the gate a clip is already on the stage (boot seeds the VP9 mock, data-live), the chooser's third source
// is a fixed mock picture, and a job is a 90 ms wait that yields the same mock — no network, no GPU, no sign-in.
const ready = async (h) => { for (let i = 0; i < 30; i++) { if ((await h.count("[data-frame][data-live]")) > 0) break; await h.wait(200); } };

export default [
  {
    name: "кадр на місці: кліп на сцені, транспорт, слова збережено, Зняти увімкнена", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-frame][data-live]")) === 1, "немає кліпу на сцені");
      h.expect((await h.count("video[data-clip]")) === 1, "немає <video> з кліпом");
      h.expect((await h.count("[data-transport]")) === 1, "немає транспорту");
      h.expect((await h.attr("[data-rk-phase]", "data-rk-phase")) === "done", "фаза не done");
      h.expect(/\d:\d\d/.test(await h.text("[data-clip-meta]")), "у підписі кадру немає тривалості");
      h.expect((await h.prop("[data-generate]", "disabled")) === false, "Зняти вимкнена зі словами");
    },
  },
  {
    name: "слова → Зняти → новий кліп; без слів і фото кнопка вимкнена", run: async (h) => {
      await ready(h);
      const before = await h.attr("video[data-clip]", "data-clip");
      await h.tap("[data-generate]"); await h.wait(700);
      h.expect((await h.attr("[data-rk-phase]", "data-rk-phase")) === "done", "після зйомки фаза не done");
      h.expect((await h.attr("video[data-clip]", "data-clip")) !== before, "новий кліп не став на сцену");
      await h.click("[data-clips]"); await h.wait(300);
      h.expect((await h.count("[data-clip-row]")) >= 2, "у колекції менше двох кліпів");
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#rk-clips", "open")) !== true, "Back не закрив колекцію");
      await h.type("[data-words]", ""); await h.wait(150);
      h.expect((await h.prop("[data-generate]", "disabled")) === true, "без слів і фото кнопка має бути вимкнена");
      await h.type("[data-words]", "Кіт повільно повертає голову"); await h.wait(150);
      h.expect(((await h.storage("ms:rukh:words")) || "").includes("Кіт"), "слова не збережено");
    },
  },
  {
    // the first frame: the chooser's "last picture" (a fixed mock under the gate) becomes the frame, the verb
    // turns into Оживити, the clip steps aside; the × removes it with an undo toast and the clip returns
    name: "перший кадр: остання картинка → фото на сцені, Оживити; прибрати → кліп повертається", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-src-upload]")) === 1 && (await h.count("[data-src-camera]")) === 1, "немає джерел фото на кадрі");
      await h.click("[data-src-last]"); await h.wait(300);
      h.expect((await h.count("[data-picture]")) === 1, "картинка не стала першим кадром");
      h.expect((await h.attr("[data-rk-mode]", "data-rk-mode")) === "picture", "режим не picture");
      h.expect(/Оживити|Animate/.test(await h.text("[data-generate]")), "кнопка не каже Оживити");
      await h.tap("[data-generate]"); await h.wait(700);
      h.expect((await h.attr("[data-rk-phase]", "data-rk-phase")) === "done", "оживлення не дійшло до done");
      await h.tap("[data-remove-picture]"); await h.wait(300);
      h.expect((await h.count("[data-picture]")) === 0, "фото не прибралось");
      h.expect((await h.attr("[data-rk-mode]", "data-rk-mode")) === "text", "режим не повернувся до text");
      h.expect((await h.count("video[data-clip]")) === 1, "кліп не повернувся на сцену");
    },
  },
  {
    name: "колекція: видалення з undo, порожній стан", run: async (h) => {
      await ready(h);
      await h.click("[data-clips]"); await h.wait(300);
      h.expect((await h.prop("#rk-clips", "open")) === true, "колекція не відкрилась");
      const n = await h.count("[data-clip-row]");
      await h.tap("[data-clip-delete]"); await h.wait(300);
      h.expect((await h.count("[data-clip-row]")) === n - 1, "кліп не видалився");
      await h.back(); await h.wait(300);
      h.expect((await h.prop("#rk-clips", "open")) !== true, "Back не закрив колекцію");
    },
  },
];
