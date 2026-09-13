// blackout — under the gate the 3D stage is SKIPPED (Draco / GLBs over CDNs flake CI) and the HUD shows a fixed
// mid-run frame, so everything is asserted through the DOM: the data-* atoms on [data-game], the four verbs
// (keys → the mirrored lane and the act counter), the skin economy, the create sheet. Never the canvas.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-game]")) > 0) break; await h.wait(300); } };
const g = (h, k) => h.attr("[data-game]", "data-" + k);
const key = async (h, code) => { await h.keyDown(code); await h.keyUp(code); await h.wait(120); };

export default [
  {
    name: "забіг: HUD населений під гейтом — стан run, метри, монети, доріжка, близькість орди, полотно, шар свайпу", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-stage]")) === 1, "немає полотна сцени");
      h.expect((await g(h, "state")) === "run", "стан не run під гейтом");
      h.expect((await g(h, "phys")) === "skipped", "сцена мала бути пропущена під гейтом");
      h.expect((await g(h, "dist")) === "128", `дистанція не 128: ${await g(h, "dist")}`);
      h.expect((await g(h, "coins")) === "7", "монет не 7");
      h.expect((await g(h, "lane")) === "1", `доріжка не 1: ${await g(h, "lane")}`);
      h.expect((await g(h, "near")) === "0.35", `близькість орди не 0.35: ${await g(h, "near")}`);
      h.expect((await h.count("[data-swipe]")) === 1, "немає шару свайпу");
      h.expect((await h.count("[data-joy]")) === 0 && (await h.count("[data-punch]")) === 0, "джойстика й удару більше немає");
      h.expect((await h.count("[data-cover]")) === 0 && (await h.count("[data-over]")) === 0, "накладка не має показуватись мід-ран");
    },
  },
  {
    name: "чотири дії: стрілки вліво/вправо рухають доріжку 0…3 і не далі, вгору/вниз рахуються як дії", run: async (h) => {
      await ready(h);
      const n0 = +(await g(h, "acts"));
      await key(h, "ArrowLeft");
      h.expect((await g(h, "lane")) === "0", `після ← доріжка ${await g(h, "lane")}`);
      await key(h, "ArrowLeft");
      h.expect((await g(h, "lane")) === "0", "лівіше нульової не буває");
      await key(h, "ArrowRight"); await key(h, "ArrowRight"); await key(h, "ArrowRight");
      h.expect((await g(h, "lane")) === "3", `після →→→ доріжка ${await g(h, "lane")}`);
      await key(h, "KeyD");
      h.expect((await g(h, "lane")) === "3", "правіше третьої не буває");
      await key(h, "ArrowUp"); await key(h, "ArrowDown");
      h.expect(+(await g(h, "acts")) === n0 + 8, `дій: ${await g(h, "acts")} (було ${n0})`);   // Space is a shot now, not a verb
      await key(h, "ArrowLeft"); await key(h, "ArrowLeft");
      h.expect((await g(h, "lane")) === "1", "не повернулась на стартову доріжку");
    },
  },
  {
    name: "постріл: тап по сцені (без свайпу) рахується як постріл і знімає набій з магазину; Space теж", run: async (h) => {
      await h.click('[data-tab="run"]'); await ready(h);
      const s0 = +(await g(h, "shots")), a0 = +(await g(h, "ammo"));
      h.expect((await g(h, "weapon")) === "pistol", `зброя на старті не пістолет: ${await g(h, "weapon")}`);
      await h.tap("[data-swipe]"); await h.wait(150);
      h.expect(+(await g(h, "shots")) === s0 + 1, `пострілів після тапу: ${await g(h, "shots")} (було ${s0})`);
      h.expect(+(await g(h, "ammo")) === a0 - 1, `набоїв після пострілу: ${await g(h, "ammo")} (було ${a0})`);
      await key(h, "Space");
      h.expect(+(await g(h, "shots")) === s0 + 2, "Space не стріляє");
      h.expect((await h.count("[data-hud-arms]")) === 1 && (await h.count("[data-hud-boost]")) === 1, "у HUD немає зброї або енергії (гейт: буст 4 с)");
    },
  },
  {
    name: "зброя: три стволи, пістолет у руці; дробовик за 350 і автомат за 600 купуються й беруться в руку (1250 → 300); пістолет назад безкоштовно", run: async (h) => {
      await h.click('[data-tab="skins"]'); await h.wait(300);
      h.expect((await h.count("[data-arms-grid] [data-arm]")) === 3, `стволів має бути 3, є ${await h.count("[data-arms-grid] [data-arm]")}`);
      h.expect((await h.attr('[data-arm="pistol"]', "aria-pressed")) === "true", "пістолет не в руці на старті");
      await h.tap('[data-arm="shotgun"]'); await h.wait(200);
      h.expect((await h.attr('[data-arm="shotgun"]', "aria-pressed")) === "true", "дробовик не купився/не взявся");
      h.expect((await h.attr("[data-wallet]", "data-wallet")) === "900", `гаманець після дробовика: ${await h.attr("[data-wallet]", "data-wallet")}`);
      await h.tap('[data-arm="smg"]'); await h.wait(200);
      h.expect((await h.attr('[data-arm="smg"]', "aria-pressed")) === "true" && (await h.attr("[data-wallet]", "data-wallet")) === "300", `автомат: ${await h.attr('[data-arm="smg"]', "aria-pressed")} · гаманець ${await h.attr("[data-wallet]", "data-wallet")}`);
      await h.tap('[data-arm="pistol"]'); await h.wait(200);
      h.expect((await h.attr('[data-arm="pistol"]', "aria-pressed")) === "true" && (await h.attr("[data-wallet]", "data-wallet")) === "300", "пістолет не взявся назад безкоштовно");
    },
  },
  {
    name: "бігуни: 11 у складі + свій, Arissa одягнута, гаманець 300 після зброї; купівля за 25 знімає монети й одягає; свій бігун одягається безкоштовно", run: async (h) => {
      await h.click('[data-tab="skins"]'); await h.wait(300);
      h.expect((await h.count("[data-skin-grid] [data-skin]")) === 11, `скінів має бути 11, є ${await h.count("[data-skin-grid] [data-skin]")}`);
      h.expect((await h.count('[data-mine-grid] [data-skin="my-gate1"]')) === 1, "свого бігуна немає в сітці");
      h.expect((await h.attr('[data-skin="arissa"]', "aria-pressed")) === "true", "Arissa не одягнута на старті");
      h.expect((await h.attr("[data-wallet]", "data-wallet")) === "300", `гаманець після зброї не 300: ${await h.attr("[data-wallet]", "data-wallet")}`);
      await h.tap('[data-skin="michelle"]'); await h.wait(200);
      h.expect((await h.attr('[data-skin="michelle"]', "aria-pressed")) === "true", "Michelle не купилась/не одяглась");
      h.expect((await h.attr("[data-wallet]", "data-wallet")) === "275", `гаманець після купівлі: ${await h.attr("[data-wallet]", "data-wallet")}`);
      await h.tap('[data-skin="my-gate1"]'); await h.wait(200);
      h.expect((await h.attr('[data-skin="my-gate1"]', "aria-pressed")) === "true" && (await h.attr("[data-wallet]", "data-wallet")) === "275", "свій бігун не одягнувся безкоштовно");
      await h.tap('[data-skin="arissa"]'); await h.wait(200);
      h.expect((await h.attr('[data-skin="arissa"]', "aria-pressed")) === "true", "своя Arissa не одяглась назад");
      await h.click('[data-tab="run"]'); await ready(h);
      h.expect((await g(h, "skin")) === "arissa", "забіг не бачить обраний скін");
    },
  },
  {
    name: "свій бігун: «Створити · 1000» відкриває аркуш; без опису кнопка неактивна; «З фото» показує вибір джерела; Back закриває", run: async (h) => {
      await h.click('[data-tab="skins"]'); await h.wait(300);
      h.expect((await h.count("[data-gen-open]")) === 1, "немає картки «Створити»");
      await h.tap("[data-gen-open]"); await h.wait(300);
      h.expect((await h.count("dialog[open] [data-gen-form]")) === 1, "аркуш створення не відкрився");
      h.expect((await h.count("[data-gen-prompt]")) === 1 && (await h.count('[data-gen-kind="creature"]')) === 1, "у формі немає опису або виду");
      h.expect((await h.count("[data-gen-go][disabled]")) === 1, "кнопка має бути неактивна без опису");
      h.expect((await h.count("[data-gen-progress]")) === 0, "прогрес не має показуватись до старту");
      await h.tap('[data-gen-mode="photo"]'); await h.wait(200);
      h.expect((await h.count("[data-src-upload]")) === 1 && (await h.count("[data-src-camera]")) === 1, "режим «З фото» не показує джерела");
      h.expect((await h.count("[data-gen-go][disabled]")) === 1, "без фото кнопка має бути неактивна");
      await h.back(); await h.wait(300);
      h.expect((await h.count("dialog[open] [data-gen-form]")) === 0, "Back не закрив аркуш");
    },
  },
  {
    name: "звук: кнопка в HUD перемикає тишу (aria-pressed, data-muted) і повертає назад", run: async (h) => {
      await h.click('[data-tab="run"]'); await ready(h);
      h.expect((await h.count("[data-mute]")) === 1, "немає кнопки звуку");
      const was = await h.attr("[data-mute]", "data-muted");
      await h.tap("[data-mute]"); await h.wait(150);
      h.expect((await h.attr("[data-mute]", "data-muted")) !== was, "тап не перемкнув тишу");
      h.expect((await h.attr("[data-mute]", "aria-pressed")) === (was === "0" ? "true" : "false"), "aria-pressed не відповідає стану");
      await h.tap("[data-mute]"); await h.wait(150);
      h.expect((await h.attr("[data-mute]", "data-muted")) === was, "другий тап не повернув стан");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Language|Dark theme/i.test(await h.bodyText()), "англійська не застосувалась");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мова|Темна тема/.test(await h.bodyText()), "українська не застосувалась");
      await h.click('[data-tab="run"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив модалку");
    },
  },
];
