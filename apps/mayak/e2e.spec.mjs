// mayak — the globe renders its fixture, the island filters it, the other two tabs carry their data hooks.
const seed = async (h) => { for (let i = 0; i < 26; i++) { if ((await h.count("canvas")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "карта: глобус із хостами фікстури, острів знизу", run: async (h) => {
      await seed(h);
      h.expect((await h.count("canvas")) === 1, "немає глобуса");
      h.expect((await h.count("[data-shown]")) === 1, "немає лічильника хостів");
      h.expect((await h.count("#host-search")) === 1, "немає пошуку");
      h.expect((await h.count("[data-sample]")) >= 1, "фікстура не позначена як демодані");
    },
  },
  {
    name: "карта: пошук фільтрує точки локально, фільтр країни теж", run: async (h) => {
      await seed(h);
      await h.type("#host-search", "quad9"); await h.wait(300);
      h.expect((await h.count('[data-shown="1"]')) === 1, "пошук не звузив до одного хоста");
      await h.type("#host-search", ""); await h.wait(300);
      await h.click('[data-country="US"]'); await h.wait(300);
      h.expect((await h.count('[data-shown="3"]')) === 1, "фільтр країни не лишив трьох хостів США");
      await h.click('[data-country="all"]'); await h.wait(200);
    },
  },
  {
    name: "стан: картка акаунта з планом і кредитами", run: async (h) => {
      await h.click('[data-tab="state"]'); await h.wait(400);
      h.expect((await h.count('[data-plan="edu"]')) === 1, "немає картки плану");
      const t = await h.bodyText();
      h.expect(/62/.test(t), "немає скан-кредитів");
      await h.click('[data-tab="map"]'); await h.wait(200);
    },
  },
  {
    name: "шлях: стрічка вузлів і DNS-картка з фікстури, кнопка трасування", run: async (h) => {
      await h.click('[data-tab="path"]'); await h.wait(400);
      h.expect((await h.count('[data-hops="7"]')) === 1, "немає семи вузлів фікстури");
      h.expect((await h.count("[data-hop]")) === 7, "вузли не намальовані");
      h.expect((await h.count("[data-dns]")) === 1, "немає DNS-картки");
      h.expect((await h.count("[data-trace]")) === 1, "немає кнопки трасування");
      await h.click('[data-mode="me"]'); await h.wait(200);
      h.expect((await h.count("#trace-target")) === 0, "у режимі «до мене» поле цілі має зникнути");
      await h.click('[data-tab="map"]'); await h.wait(200);
    },
  },
];
