// mayak — the list is a small searchable table; a category filters the fixture; a row opens the map page.
const seed = async (h) => { for (let i = 0; i < 26; i++) { if ((await h.count("[data-list]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "карта: пошук + таблиця, максимум 20 у списку", run: async (h) => {
      await seed(h);
      h.expect((await h.count("#host-search")) === 1, "немає поля пошуку");
      h.expect((await h.count("[data-cat-btn]")) === 6, "немає шести категорій");
      h.expect((await h.count("[data-result]")) <= 20, "у списку більше ніж 20 рядків");
      h.expect((await h.count("[data-result]")) >= 1, "список порожній");
      h.expect((await h.count("canvas")) === 0, "на списку не має бути глобуса");
      h.expect((await h.count("[data-sample]")) >= 1, "фікстура не позначена демоданими");
    },
  },
  {
    name: "карта: категорія «бази» лишає лише бази фікстури", run: async (h) => {
      await seed(h);
      await h.click('[data-cat-btn="databases"]'); await h.wait(400);
      h.expect((await h.count('[data-cat="databases"]')) === 1, "категорія не вибралась");
      h.expect((await h.count('[data-total="3"]')) === 1, "баз фікстури не три");
    },
  },
  {
    name: "карта: клік по рядку → сторінка з картою, назад повертає", run: async (h) => {
      await seed(h);
      await h.click("[data-result]"); await h.wait(500);
      h.expect((await h.count("[data-host]")) === 1, "не відкрилась сторінка хоста");
      h.expect((await h.count("canvas")) === 1, "немає карти на сторінці хоста");
      h.expect((await h.count("[data-back]")) === 1, "немає кнопки назад");
      await h.back(); await h.wait(400);
      h.expect((await h.count("[data-host]")) === 0, "назад не закрив сторінку хоста");
      h.expect((await h.count("#host-search")) === 1, "не повернулись до списку");
    },
  },
  {
    name: "стан: картка акаунта з планом і кредитами", run: async (h) => {
      await h.click('[data-tab="state"]'); await h.wait(400);
      h.expect((await h.count('[data-plan="edu"]')) === 1, "немає картки плану");
      h.expect(/62/.test(await h.bodyText()), "немає скан-кредитів");
      await h.click('[data-tab="map"]'); await h.wait(200);
    },
  },
  {
    name: "шлях: гілки DNS і стрічка вузлів із фікстури", run: async (h) => {
      await h.click('[data-tab="path"]'); await h.wait(500);
      h.expect((await h.count("[data-dns]")) === 1, "немає DNS-гілок");
      h.expect((await h.count("[data-leaf]")) >= 3, "гілки не проросли");
      h.expect((await h.count('[data-hops="7"]')) === 1, "немає семи вузлів");
    },
  },
];
