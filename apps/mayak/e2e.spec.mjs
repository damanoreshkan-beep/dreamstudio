// mayak — the globe renders its fixture, a category filters it by kind, the path tab grows its DNS branches.
const seed = async (h) => { for (let i = 0; i < 26; i++) { if ((await h.count("canvas")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "карта: глобус, ряд категорій, лічильник знайденого", run: async (h) => {
      await seed(h);
      h.expect((await h.count("canvas")) === 1, "немає глобуса");
      h.expect((await h.count("[data-shown]")) === 1, "немає лічильника");
      h.expect((await h.count("[data-cat-btn]")) === 6, "немає шести категорій");
      h.expect((await h.count("[data-sample]")) >= 1, "фікстура не позначена демоданими");
    },
  },
  {
    name: "карта: категорія «камери» лишає лише камери фікстури", run: async (h) => {
      await seed(h);
      await h.click('[data-cat-btn="cameras"]'); await h.wait(500);
      h.expect((await h.count('[data-cat="cameras"]')) === 1, "категорія не вибралась");
      h.expect((await h.count('[data-shown="3"]')) === 1, "камер фікстури не три");
      h.expect((await h.count("[data-preset]")) === 1, "немає рядка вендорів");
      await h.click('[data-cat-btn="cameras"]'); await h.wait(300);
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
      await h.click('[data-mode="me"]'); await h.wait(200);
      h.expect((await h.count("#trace-target")) === 0, "у режимі «до мене» поле цілі має зникнути");
      await h.click('[data-tab="map"]'); await h.wait(200);
    },
  },
];
