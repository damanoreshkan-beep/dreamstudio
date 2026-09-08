// Поголос — a BLE mesh chat with no transport in a browser, so under the gate mesh.js runs its own
// deterministic mock (gate ⇒ startMock): 2 neighbours nearby, a short PUBLIC thread, one PRIVATE thread.
// The seeded MESSAGES are data, not UI, so their text is the same in both locales — the regexes read them.
// Screen set: Поруч (map) · Публічний (public feed) · Особисті (DM list/thread) · Логи · Я.

const mapReady = async (h) => { for (let i = 0; i < 25; i++) { if ((await h.count('[data-me]')) > 0) break; await h.wait(200); } };
const nodesReady = async (h) => { for (let i = 0; i < 25; i++) { if ((await h.count('[data-node]')) > 0) break; await h.wait(200); } };
const feedReady = async (h) => { for (let i = 0; i < 25; i++) { if ((await h.count('[data-mine]')) > 0) break; await h.wait(200); } };

export default [
  {
    name: "«Поруч» = карта: присутність, лічильник, власний вузол, точки сусідів (без публічної стрічки)",
    async run(h) {
      await mapReady(h);
      h.expect((await h.attr('[data-near]', 'data-peers')) === "2", "лічильник поруч не показує 2");
      h.expect((await h.count('[data-rescan]')) === 1, "немає кнопки пересканування");
      h.expect((await h.count('[data-me]')) === 1, "немає власного вузла на карті");
      await nodesReady(h);
      h.expect((await h.count('[data-node]')) >= 1, "на карті немає точок сусідів");
      // the map is discovery, not the public feed — the broadcast composer lives in «Публічний» now
      h.expect((await h.count('[data-say]')) === 0, "публічне поле вводу не має бути на карті");
    },
  },
  {
    name: "«Особисті»: непрочитане позначає, ХТО пише; відкриття гілки гасить позначку",
    async run(h) {
      await h.click('[data-tab="dm"]');
      await h.wait(400);
      h.expect((await h.count('[data-peer]')) === 2, "у списку не 2 сусіди");
      // a454 has a seeded incoming private line and was never opened → exactly one unread row
      h.expect((await h.count('[data-unread="1"]')) === 1, "немає позначки непрочитаного на тому, хто написав");
      await h.tap('[data-peer][data-unread="1"]');
      await h.wait(300);
      h.expect((await h.count('[data-thread]')) === 1, "гілка не відкрилась");
      h.expect(/зашифровано|encrypted/i.test(await h.bodyText()), "гілка не позначена як шифрована");
      h.expect(/шифровано/.test(await h.text('.ph-feed')), "у гілці немає засіяної приватної історії");
      h.expect((await h.count('[data-say]')) === 1, "у гілці немає поля вводу");
      await h.tap('[data-thread-back]');
      await h.wait(300);
      h.expect((await h.count('[data-peer]')) === 2, "назад не повернув до списку");
      h.expect((await h.count('[data-unread="1"]')) === 0, "відкрита гілка не погасила позначку непрочитаного");
    },
  },
  {
    name: "«Поруч»: нік редагується прямо на власному вузлі й зберігається",
    async run(h) {
      await h.click('[data-tab="room"]');
      await mapReady(h);
      await h.tap('[data-me]');
      await h.wait(200);
      h.expect((await h.count('[data-nick-input]')) === 1, "тап по власному вузлу не відкрив поле ніка");
      await h.type('[data-nick-input]', "тест123");
      await h.wait(120);
      await h.tap('[data-nick-save]');
      await h.wait(250);
      h.expect(/тест123/.test(await h.text('[data-me]')), "новий нік не застосувався на карті");
    },
  },
  {
    name: "«Поруч»: тап по точці сусіда відкриває приватну гілку",
    async run(h) {
      await h.click('[data-tab="room"]');
      await nodesReady(h);
      await h.tap('[data-node]');
      await h.wait(400);
      h.expect((await h.count('[data-thread]')) === 1, "тап по точці не відкрив приватну гілку");
      await h.tap('[data-thread-back]');
      await h.wait(200);
    },
  },
  {
    name: "«Публічний»: засіяна стрічка, надіслане стає власним рядком, поле очищається",
    async run(h) {
      await h.click('[data-tab="pub"]');
      await feedReady(h);
      await h.waitFor(/чую тебе/);
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
    name: "«Поруч»: пересканування досяжне і не ламає карту",
    async run(h) {
      await h.click('[data-tab="room"]');
      await mapReady(h);
      await h.tap('[data-rescan]');
      await h.wait(300);
      h.expect((await h.count('[data-me]')) === 1, "після пересканування карта зникла");
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
