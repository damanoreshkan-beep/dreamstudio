import { test, expect } from "https://deno.land/std@0.224.0/testing/bdd.ts";

test("muzak: loads and shows input", async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.goto("http://localhost:8080/store/muzak/");
  const input = await page.$("input[placeholder*='Paste']");
  expect(input).toBeTruthy();
  await browser.close();
});

test("muzak: shows error on invalid URL", async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.goto("http://localhost:8080/store/muzak/");
  await page.type("input", "invalid-url");
  await page.press("input", "Enter");
  await page.waitForTimeout(500);
  const error = await page.$(".alert");
  expect(error).toBeTruthy();
  await browser.close();
});

test("muzak: paste button works", async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.goto("http://localhost:8080/store/muzak/");
  const pasteBtn = await page.$("button:has-text('Paste')");
  expect(pasteBtn).toBeTruthy();
  await browser.close();
});

export const gate = {
  name: "muzak",
  rules: [
    { selector: "input[placeholder*='Paste']", must: "exist", reason: "input field required" },
    { selector: "button", must: "exist", reason: "paste button required" },
    { selector: "[data-muzak]", must: "exist", reason: "app container required" },
  ],
};
