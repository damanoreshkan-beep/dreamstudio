// Поголос — a BLE mesh chat with no transport in a browser, so under the gate mesh.js runs its own
// deterministic mock (gate ⇒ startMock): 2 neighbours nearby, a short public thread, one private thread.
// The seeded MESSAGES are data, not UI, so their text is the same in both locales — the regexes read them
// directly. These cases prove the real states are reachable, mutate the room and thread, and walk the tabs;
// the harness's own settled pass runs axe + overflow + shots on every tab in both themes around them.

const roomReady = async (h) => {
  for (let i = 0; i < 25; i++) { if ((await h.count('[data-mine]')) > 0) break; await h.wait(200); }
};

export default [
  {
    name: "«Поруч»: засіяна кімната — присутність, лічильник поруч, поле вводу",
    async run(h) {
      await roomReady(h);
      await h.waitFor(/чую тебе/);
      h.expect((await h.count('[data-mine]')) >= 3, "кімната не засіяна повідомленнями");
      h.expect((await h.count('[data-mine="1"]')) >= 1, "немає власного повідомлення у стрічці");
      // presence chip mirrors the honest count; the wrap carries it as data-peers
      h.expect((await h.attr('[data-near]', 'data-peers')) === "2", "лічильник поруч не показує 2");
      h.expect((await h.count('[data-rescan]')) === 1, "немає кнопки пересканування у чипі присутності");
      h.expect((await h.count('[data-say]')) === 1, "немає поля вводу composer'а");
    },
  },
  {
    name: "«Поруч»: надіслане слово стає власним рядком, поле очищається",
    async run(h) {
      await roomReady(h);
      const before = await h.count('[data-mine="1"]');
      await h.type('[data-say]', "перевірка");
      await h.wait(120);
      await h.tap('[data-send]');
      await h.wait(300);
      h.expect((await h.count('[data-mine="1"]')) === before + 1, "надіслане не зʼявилось у стрічці");
      h.expect(/перевірка/.test(await h.text('.ph-feed')), "у стрічці немає надісланого тексту");
      h.expect((await h.count('[data-say]')) === 1, "поле вводу зникло після надсилання");
    },
  },
  {
    name: "«Поруч»: пересканування досяжне і не ламає кімнату",
    async run(h) {
      await roomReady(h);
      await h.tap('[data-rescan]');
      await h.wait(300);
      h.expect((await h.count('[data-mine]')) >= 3, "після пересканування кімната зникла");
    },
  },
  {
    name: "«Особисті»: список сусідів із ніками",
    async run(h) {
      await h.click('[data-tab="dm"]');
      await h.wait(400);
      h.expect((await h.count('[data-peer]')) === 2, "у списку не 2 сусіди");
      h.expect(/anon5aa3/.test(await h.bodyText()), "не видно ніка сусіда");
      h.expect(/мандрівник/.test(await h.bodyText()), "не видно другого сусіда");
    },
  },
  {
    name: "«Особисті»: відкриття гілки — шифрування, історія, назад повертає до списку",
    async run(h) {
      await h.click('[data-tab="dm"]');
      await h.wait(300);
      await h.tap('[data-peer]');
      await h.wait(300);
      h.expect((await h.count('[data-thread]')) === 1, "гілка не відкрилась");
      h.expect(/зашифровано|encrypted/i.test(await h.bodyText()), "гілка не позначена як шифрована");
      h.expect(/шифровано/.test(await h.text('.ph-feed')), "у гілці немає засіяної приватної історії");
      h.expect((await h.count('[data-say]')) === 1, "у гілці немає поля вводу");
      await h.tap('[data-thread-back]');
      await h.wait(300);
      h.expect((await h.count('[data-thread]')) === 0, "назад не закрив гілку");
      h.expect((await h.count('[data-peer]')) === 2, "назад не повернув до списку сусідів");
    },
  },
  {
    name: "«Логи»: вирок + таблиця стану читаються",
    async run(h) {
      await h.click('[data-tab="logs"]');
      for (let i = 0; i < 25; i++) { if ((await h.count('[data-logs]')) > 0 && (await h.count('[data-tone]')) > 0) break; await h.wait(200); }
      h.expect((await h.count('[data-logs]')) === 1, "немає екрана логів");
      h.expect((await h.count('[data-tone]')) === 1, "немає вироку діагностики");
      h.expect(/mesh\.start/.test(await h.bodyText()), "таблиця стану не показує mesh.start");
    },
  },
  {
    name: "i18n EN/UA",
    async run(h) {
      await h.click('[data-tab="me"]');
      await h.wait(150);
      await h.click('[data-loc="en"]');
      await h.wait(250);
      h.expect(/Language|Dark theme/i.test(await h.bodyText()), "англійська не застосувалась");
      await h.click('[data-loc="uk"]');
      await h.wait(250);
      h.expect(/Мова|Темна тема/.test(await h.bodyText()), "українська не застосувалась");
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває",
    async run(h) {
      await h.click('[data-tab="me"]');
      await h.wait(150);
      await h.click('#p-install');
      await h.wait(150);
      h.expect((await h.prop('#install', 'open')) === true, "модалка встановлення не відкрилась");
      await h.back();
      await h.wait(200);
      h.expect((await h.prop('#install', 'open')) !== true, "Back не закрив модалку");
    },
  },
];
