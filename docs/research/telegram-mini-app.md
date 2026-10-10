# Telegram Mini App — replace our bicycles, or ride alongside them?

Owner, 2026-10-10: «може доцільно одразу встановити telegram mini app, здається там вже багато чого резолвиться
із коробки, і замінить нам велосипеди наші». Research only; the decision is the owner's. Platform facts are
from core.telegram.org/bots/webapps and the Bot API changelog (latest **10.3, 2026-08-24**, checked live), the
Telegram clients' source, and MDN browser-compat-data; the farm inventory is from reading the three repos.

## The finding that reframes the question: the farm already IS a Mini App

- `@microspec/core` `runtime/tma.js` (173 lines): injects `telegram-web-app.js` only when the URL carries
  `tgWebApp`, calls `ready/expand/requestFullscreen`, mirrors safe areas, routes `startapp=<appid>`, pays Stars
  through `openInvoice`. `index.js` runs it at boot and signs in with `loginTelegram()` (initData → edge
  `tg.js`/`tgverify.js`, `/feed/tg/verify`).
- `@dreamstudio_x_bot` (edge `bot.js`): `/start`, `/apps`, `/random`, `/support`; every "open" is a `web_app`
  button into the store or an app. Stars tips (`stars.js`) and Star coin packs into the wallet are live.
- Unused from the platform: `shareMessage`/`savePreparedInlineMessage`, CloudStorage/DeviceStorage/
  SecureStorage, Telegram haptics, theme params (only insets and `setHeaderColor`), `requestWriteAccess`,
  `addToHomeScreen`, direct links `t.me/<bot>/<app>?startapp=`.

So "install a Mini App" is done at the base level. The real question is what MORE of the platform to use, and
whether it can replace the PWA/APK.

## Can it replace the PWA/APK? No — 34 of 92 apps need what Telegram's WebView cannot give

| Need | Inside Telegram | Our apps |
|---|---|---|
| WebUSB (HackRF, RTL-SDR, LoRa) | no — Android WebView has none, iOS none (BCD, crbug 41441927) | 5 |
| Web Bluetooth | no | 1 |
| Receiving shares (share_target) | no (BCD `webview_android: false`) | 4 |
| Offline / service worker | iOS WKWebView has no SW; a launch needs Telegram's servers for initData anyway | all 92 are offline today |
| Background audio + lock-screen controls | the WebView dies with the Mini App; MediaSession absent on Android WebView; minimised playback UNVERIFIED | 11 |
| Camera / mic | works (own prompt); Android `<input capture>` opens the gallery (bugs.telegram.org/c/44936) | 17 / 4 |
| `navigator.share` | no on Android WebView — `shareMessage` instead | 9 |
| Push / notifications | only bot messages after `requestWriteAccess` | 4 |
| Session in localStorage | Web K/A run it in an iframe → partitioned storage, sessions break (bugs.telegram.org/c/33862) | 24 signed-in |

Plus risks no code fixes: Telegram is banned on devices in Ukraine's state bodies, military and critical
infrastructure (NCCC, 2024); a bot ban, outage or regional block takes a Telegram-only channel down whole;
digital goods there may be sold only for Stars, refunds come off our balance, termination is Telegram's call.

## What the platform gives that we would otherwise build — ranked by value to us

1. **Fonoteka: a song shared as a NATIVE Telegram audio message.** `savePreparedInlineMessage` takes any
   `InlineQueryResult`, including `InlineQueryResultAudio`/`CachedAudio` (Bot API 8.0); `shareMessage` sends it
   to a chat the person picks. The friend gets Telegram's own music player: background play, the lock screen,
   the playlist. Outside Telegram the public link (edge `songpage.js`, og:video mp4) stays. Edge: one route
   (prepare the message by the bot); client: one branch in `shareSong` when `inTelegram()`.
2. **Direct links `t.me/dreamstudio_x_bot/<app>?startapp=<payload>`** (6.7) + one **Main Mini App** per bot
   (7.8: profile button, the Apps tab, media previews; the Mini App Store features only Main Mini Apps with
   Stars). An app shared as such a link opens inside Telegram, signed in, no install. Needs BotFather `/newapp`
   per short name — the owner's account.
3. **Session in SecureStorage/DeviceStorage** (9.0) — fixes the Web K/A iframe that drops localStorage; one
   change in the core's `auth.js` for the Telegram branch.
4. **Bot notifications after `requestWriteAccess`** (6.9) — the watch/alert apps reach a Telegram user without
   Web Push.
5. Small: Telegram haptics (`HapticFeedback`, works where `navigator.vibrate` is absent on iOS), theme params,
   `addToHomeScreen` (a real shortcut on Android 8+; on iOS only a Safari hop).

Not worth it: CloudStorage (1024 keys × 4 KB per user per bot, shared by all 92 apps — Postgres already holds
the state), Telegram Serverless (2026-10-06, V8 isolates, no npm — we have a Deno backend).

## Recommendation

Keep the PWA/APK as the product; deepen the Mini App as the second door, from the same code. If the owner
says yes, in order: (1) fonoteka native audio share in Telegram, (2) Main Mini App + `t.me/…?startapp` links
for the store and each app, (3) SecureStorage session, (4) bot notifications. Each is a separate decision.

Sources: core.telegram.org/bots/webapps · core.telegram.org/bots/api-changelog · core.telegram.org/bots/api
· telegram.org/tos/bot-developers · core.telegram.org/bots/serverless · MDN browser-compat-data ·
bugs.telegram.org/c/44936, /c/33862 · pravda.com.ua/eng/news/2024/10/07/7478512.
