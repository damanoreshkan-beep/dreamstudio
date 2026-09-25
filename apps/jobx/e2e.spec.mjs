// Under the gate there's no WebGL/network, so the deck.gl map never inits (probe-guarded) — the DOM is the
// truth. view.js seeds a fixture of Kyiv jobs. These drive the routed structure: the Map tab's single post
// island, the Post page (a routed page, not a sheet), the List tab's rows (newest first, the folded search,
// the employment strip), and a job's detail page with its pinned apply island.
export default [
  {
    name: "Map tab: a single post island, no clutter",
    async run(h) {
      await h.waitFor(/3D-карт|3D map/);
      h.expect((await h.count("[data-post]")) === 1, "немає острівця «Додати» на карті");
      h.expect((await h.count("[data-map],[data-stage]")) >= 1, "немає сцени карти");
    },
  },
  {
    name: "the post island opens a big routed page (not a sheet)",
    async run(h) {
      await h.tap("[data-post]");
      await h.wait(250);
      h.expect((await h.count("[data-page]")) === 1, "пост не відкрився сторінкою");
      h.expect((await h.count("[data-form]")) === 1, "немає форми");
      h.expect((await h.count("[data-f-title]")) === 1 && (await h.count("[data-f-district]")) === 1 && (await h.count("[data-f-contact]")) === 1, "бракує полів форми");
      await h.tap("[data-back]");
      await h.wait(200);
    },
  },
  {
    name: "List tab: rows newest first with an age label, the search folded behind its icon",
    async run(h) {
      await h.tap("[data-tab=list]");
      await h.wait(250);
      h.expect((await h.count("[data-job-row]")) >= 5, "список порожній");
      h.expect((await h.count("[data-search-btn]")) === 1, "немає іконки пошуку");
      h.expect((await h.count("[data-search]")) === 0, "поле пошуку розгорнуте без тапу");
      h.expect(/Frontend/.test(await h.text("[data-job-title]")), "найновіша вакансія не перша");
      h.expect((await h.count("[data-job-age]")) >= 5, "рядки без віку");
      h.expect((await h.count("[data-job-new]")) >= 1, "жодної позначки «нове»");
      h.expect((await h.count("[data-job-pay-text]")) >= 1, "текстова зарплата не показана у рядку");
      // a trailing place in parentheses is stripped in the ROW only
      await h.waitFor(/Кухар-універсал/);
      h.expect(!/Оболонь\)/.test(await h.text("[data-list]")), "адреса у дужках лишилась у заголовку рядка");
    },
  },
  {
    name: "the search unfolds in place, filters, and system Back folds it",
    async run(h) {
      await h.tap("[data-tab=list]");
      await h.wait(200);
      await h.tap("[data-search-btn]");
      await h.wait(250);
      h.expect((await h.count("[data-search]")) === 1, "поле пошуку не розгорнулось");
      await h.type("[data-search]", "Бариста");
      await h.wait(250);
      h.expect((await h.count("[data-job-row]")) === 1, "пошук не відфільтрував");
      await h.back();
      await h.wait(300);
      h.expect((await h.count("[data-search]")) === 0, "Back не згорнув пошук");
      h.expect((await h.count("[data-job-row]")) >= 5, "запит не очистився після згортання");
    },
  },
  {
    name: "the employment strip filters the rows",
    async run(h) {
      await h.tap("[data-tab=list]");
      await h.wait(200);
      h.expect((await h.count("[data-emp-filter]")) === 4, "смужка зайнятості не з чотирьох");
      await h.tap("[data-emp-filter=remote]");
      await h.wait(250);
      h.expect((await h.attr("[data-emp-filter=remote]", "aria-pressed")) === "true", "фільтр не активний");
      h.expect((await h.count("[data-job-row]")) === 2, "фільтр «віддалено» не застосовано");
      await h.tap("[data-emp-filter=all]");
      await h.wait(250);
      h.expect((await h.count("[data-job-row]")) >= 5, "«усі» не повернув рядки");
    },
  },
  {
    name: "a job opens its own detail page with the apply action pinned in an island",
    async run(h) {
      await h.tap("[data-tab=list]");
      await h.wait(200);
      await h.tap("[data-job-row]");
      await h.wait(250);
      h.expect((await h.count("[data-page]")) === 1, "деталь не відкрилась сторінкою");
      h.expect((await h.count("[data-island] [data-apply]")) >= 1, "кнопка відгуку не в острівці");
      h.expect((await h.count("[data-job-where]")) === 1, "немає рядка адреси");
      await h.tap("[data-back]");
      await h.wait(200);
    },
  },
];
