// Under the gate there's no WebGL/network, so the deck.gl map never inits (probe-guarded) — the DOM is the
// truth. view.js seeds a fixture of Kyiv jobs. These drive the routed structure: the Map tab's single post
// island, the Post page (a routed page, not a sheet), the List tab's rows, and a job's detail page.
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
    name: "List tab shows the jobs as rows, with search",
    async run(h) {
      await h.tap("[data-tab=list]");
      await h.wait(250);
      h.expect((await h.count("[data-search]")) === 1, "немає пошуку у списку");
      h.expect((await h.count("[data-job-row]")) >= 5, "список порожній");
      h.expect(/Frontend/.test(await h.text("[data-job-title]")), "не показано засіяну вакансію");
    },
  },
  {
    name: "a job opens its own detail page with an apply action",
    async run(h) {
      await h.tap("[data-tab=list]");
      await h.wait(200);
      await h.tap("[data-job-row]");
      await h.wait(250);
      h.expect((await h.count("[data-page]")) === 1, "деталь не відкрилась сторінкою");
      h.expect((await h.count("[data-apply]")) >= 1, "немає кнопки відгуку");
      await h.tap("[data-back]");
      await h.wait(200);
    },
  },
];
