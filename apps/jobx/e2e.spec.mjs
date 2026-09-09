// Under the gate there is no WebGL and no network, so the 3D deck.gl map never initialises — by design (the
// farm's law: the map is a probe-guarded enhancement, the DOM job panel is the truth). view.js seeds a
// deterministic fixture of Kyiv jobs and fills the map region with the job LIST, so the screen the gate, axe
// and e2e see is populated. These tests drive that DOM panel, the list sheet, and the post form.
export default [
  {
    name: "the panel is populated on mount — a total and real job cards",
    async run(h) {
      await h.waitFor(/Frontend/);
      h.expect((await h.count("[data-job-title]")) >= 5, "не показано вакансій у панелі");
      h.expect(/вакансій/.test(await h.bodyText()), "немає лічильника вакансій у шапці");
      h.expect((await h.count("[data-apply]")) >= 1, "у картці немає кнопки відгуку");
    },
  },
  {
    name: "the stage fills the view (fit tab)",
    async run(h) {
      await h.waitFor(/Frontend/);
      const view = await h.prop("#view", "clientHeight");
      const stage = await h.prop("[data-stage]", "clientHeight");
      h.expect(stage / view >= 0.85, `сцена займає ${Math.round(stage / view * 100)}% екрана, треба ≥85%`);
    },
  },
  {
    name: "the list button opens the full list with a search field",
    async run(h) {
      await h.waitFor(/Frontend/);
      await h.tap("[data-list]");
      await h.wait(250);
      h.expect((await h.count("[data-search]")) === 1, "аркуш списку не показав поле пошуку");
      h.expect((await h.count("[data-job-title]")) >= 5, "аркуш списку порожній");
    },
  },
  {
    name: "the + button opens the post form with its fields",
    async run(h) {
      await h.waitFor(/Frontend/);
      await h.tap("[data-post]");
      await h.wait(250);
      h.expect((await h.count("[data-form]")) === 1, "форма розміщення не відкрилася");
      h.expect((await h.count("[data-f-title]")) === 1, "немає поля «Посада»");
      h.expect((await h.count("[data-pick]")) === 1, "немає вибору локації");
      h.expect((await h.count("[data-f-contact]")) === 1, "немає поля контакту");
    },
  },
];
