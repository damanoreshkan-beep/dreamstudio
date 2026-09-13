// blackout — under the gate the 3D stage is SKIPPED (Rapier WASM / Draco / GLBs over CDNs flake CI) and the HUD
// shows a fixed mid-run frame, so everything is asserted through the DOM: the data-* atoms on [data-game], the
// input plumbing (the punch key, the keyboard → the move vector), the skin economy. Never the canvas.
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-game]")) > 0) break; await h.wait(300); } };
const g = (h, k) => h.attr("[data-game]", "data-" + k);

export default [
  {
    name: "забіг: HUD населений під гейтом — стан run, метри, монети, запас світла, полотно, джойстик і удар", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-stage]")) === 1, "немає полотна сцени");
      h.expect((await g(h, "state")) === "run", "стан не run під гейтом");
      h.expect((await g(h, "phys")) === "skipped", "сцена мала бути пропущена під гейтом");
      h.expect((await g(h, "dist")) === "128", `дистанція не 128: ${await g(h, "dist")}`);
      h.expect((await g(h, "coins")) === "7", "монет не 7");
      h.expect((await g(h, "gap")) === "18", "запас світла не 18");
      h.expect((await h.count("[data-joy]")) === 1 && (await h.count("[data-punch]")) === 1, "немає джойстика або кнопки удару");
      h.expect((await h.count("[data-cover]")) === 0 && (await h.count("[data-over]")) === 0, "накладка не має показуватись мід-ран");
    },
  },
  {
    name: "удар: тап по кнопці рахується один раз (pointer + click не подвоюють), клавіша X теж", run: async (h) => {
      await ready(h);
      const n0 = +(await g(h, "punches"));   // relative: the farm's haptic check taps the first key before e2e
      await h.tap("[data-punch]"); await h.wait(150);
      h.expect(+(await g(h, "punches")) === n0 + 1, `ударів після тапу: ${await g(h, "punches")} (було ${n0})`);
      await h.tap("[data-punch]"); await h.wait(150);
      h.expect(+(await g(h, "punches")) === n0 + 2, "другий тап не зарахувався");
      await h.keyDown("KeyX"); await h.keyUp("KeyX"); await h.wait(150);
      h.expect(+(await g(h, "punches")) === n0 + 3, "клавіша X не б'є");
    },
  },
  {
    name: "клавіатура: W тримає вектор руху вперед, відпускання зупиняє; A — вліво", run: async (h) => {
      await ready(h);
      await h.keyDown("KeyW"); await h.wait(100);
      h.expect((await g(h, "move")) === "0.00,-1.00", `вектор при W: ${await g(h, "move")}`);
      await h.keyUp("KeyW"); await h.wait(100);
      h.expect((await g(h, "move")) === "0.00,0.00", "після відпускання не зупинилась");
      await h.keyDown("KeyA"); await h.wait(100);
      h.expect((await g(h, "move")) === "-1.00,0.00", `вектор при A: ${await g(h, "move")}`);
      await h.keyUp("KeyA"); await h.wait(100);
    },
  },
  {
    name: "скіни: 10 бігунів, Arissa одягнута, гаманець 50; купівля за 25 знімає монети й одягає; недоступна — ні; своя — одягається безкоштовно", run: async (h) => {
      await h.click('[data-tab="skins"]'); await h.wait(300);
      h.expect((await h.count("[data-skin-grid] [data-skin]")) === 10, `скінів має бути 10, є ${await h.count("[data-skin-grid] [data-skin]")}`);
      h.expect((await h.attr('[data-skin="arissa"]', "aria-pressed")) === "true", "Arissa не одягнута на старті");
      h.expect((await h.attr("[data-wallet]", "data-wallet")) === "50", "гаманець не 50 під гейтом");
      await h.tap('[data-skin="michelle"]'); await h.wait(200);
      h.expect((await h.attr('[data-skin="michelle"]', "aria-pressed")) === "true", "Michelle не купилась/не одяглась");
      h.expect((await h.attr("[data-wallet]", "data-wallet")) === "25", `гаманець після купівлі: ${await h.attr("[data-wallet]", "data-wallet")}`);
      await h.tap('[data-skin="eve"]'); await h.wait(200);
      h.expect((await h.attr('[data-skin="eve"]', "aria-pressed")) !== "true", "Eve (40) не мала купитись за 25");
      h.expect((await h.attr("[data-wallet]", "data-wallet")) === "25", "гаманець змінився без купівлі");
      await h.tap('[data-skin="arissa"]'); await h.wait(200);
      h.expect((await h.attr('[data-skin="arissa"]', "aria-pressed")) === "true" && (await h.attr("[data-wallet]", "data-wallet")) === "25", "своя Arissa не одяглась безкоштовно");
      await h.click('[data-tab="run"]'); await ready(h);
      h.expect((await g(h, "skin")) === "arissa", "забіг не бачить обраний скін");
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
