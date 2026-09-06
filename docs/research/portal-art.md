# Портал — мистецтво 2027 (2026-09-06)

Власник після Ф2.1: «працює. але не ідеально. тут вже потрібна творча ідея іскуства, не баловство. я не
хочу це ніби із 2010. потрібно сучасно 2027 незвичайні сучасні ефекти». І правило: не вигадувати —
брати готове робоче за основу і збагачувати.

## 1. Теза

2010 — це фільтр поверх картинки: статичний матеріал, віньєтка, зерно. 2027 — картинка є **середовищем з
фізикою**, яке людина збурює своїм рухом. Три фізики, які сьогодні визначають живе відео-мистецтво
(інсталяції, TouchDesigner, Shadertoy 2025):

1. **Рідина.** Оптичний потік із камери штовхає GPU-рідину (Навʼє–Стокс: адвекція, завихрення, тиск);
   матеріал і його шлейфи — це барвник у цій рідині. Рух руки лишає вихор, який живе секунди.
2. **Ріст.** Реакція-дифузія (Ґрей–Скотт) засіюється контурами людини: корали / клітини / шипи ростуть на
   тому, що рухається, і зникають, коли рух зупиняється.
3. **Час.** Slit-scan / time displacement: кожен піксель бере свій момент із останніх секунд за яскравістю
   або потоком — рідкий час, Tx-transform. І «рідка камера» — сама картинка адвектується рідиною (datamosh
   без кодека).

Плюс сучасна поверхня: **рідке скло** (iOS 26 «liquid glass»): рідина заломлює камеру, хроматичний розрив на
краях швидкості.

## 2. Джерела (усе клоновано в scratchpad `art/`, читано)

| Що | Звідки | Ліцензія | Що беремо |
|---|---|---|---|
| Рідина | PavelDoGreat/WebGL-Fluid-Simulation `script.js` | MIT | шейдери advection / curl / vorticity / divergence / pressure (Jacobi) / gradientSubtract / splat, порядок `step()`, конфіг (CURL 30, dissipation 0.2/1, PRESSURE 0.8) |
| Оптичний потік | keeffEoghan/glsl-optical-flow `index.glsl` | MIT | `opticalFlow(uv, next, past, offset, lambda)` — градієнтний потік на яскравості (ofxFlowTools) |
| Пінг-понг у Godot | bruce965/godot-gpu-cellular-automata, Namey5/godot-interactive-water | MIT | viewport читає інший viewport; ланцюг viewport'ів = кілька ітерацій за кадр (Maaack/2D-Fluid-Simulation) |
| Реакція-дифузія | Karl Sims karlsims.com/rd.html (рівняння), jasonwebb/reaction-diffusion-playground (CC BY-NC-SA — НЕ копіюємо код, лише параметри f/k) | — | Ґрей–Скотт: A' = A + (dA·∇²A − A·B² + f·(1−A))·dt, B' = B + (dB·∇²B + A·B² − (k+f)·B)·dt; ваги лапласіана Sims |
| Pixel sorting | godotshaders Pseudo Pixel Sorting V2 (Ahopness) | CC0 | маска за яскравістю + «розтікання» стовпців |
| Рідке скло | godotshaders Liquid Glass (Loop_Box) | CC0 | заломлення screen texture зсувом за нормаллю + френель — у нас нормаль = градієнт швидкості рідини |
| Погляди Ф2.1 | Kuwahara, glitch, halftone, grain (CC0) | CC0 | лишаються як «око» матеріалу |
| Камера | godot-demo-projects misc/camera_feed | MIT | `camera.gd` (§8 portal-godot.md) |

## 3. Граф (усе — SubViewport'и, кожен один прохід за кадр; TD-вузли як є в Godot)

```
Camera (demo) ─► LookView (look: як є / oil / halftone / …)
                    │
Motion A/B (¼ loop, HDR): R = Y, G = енергія |ΔY|, BA = ОПТИЧНИЙ ПОТІК (keeffEoghan) ──┐
                    │                                                                    │
FLUID (¼ loop, HDR16F, ланцюг за кадр, PavelDoGreat крок у крок):                        │
   Vel  = advect(VelOut) · (1 − dissipation) + vorticity(CurlPrev) + splat(flow·force·енергія)
   Div  = ∇·Vel
   P1..P4 = Jacobi(Pprev·0.8, Div)  (4 viewport'и = 4 ітерації за кадр)
   VelOut = Vel − ∇P4 ;  Curl = rot(VelOut)
                    │
Dye A/B (½ loop): dye = mix(Look, advect(dye, VelOut), hold) — «рідка камера» (datamosh) при hold>0
RD1..RD4 (½ loop, HDR): Ґрей–Скотт ×4 за кадр; B засіюється контурами × енергія руху
Slots (екран, clear NEVER): 16 кадрів Look по ¼ у сітці 4×4 — кільце часу
                    │
Cam = screen.gdshader: Dye → [time displacement зі Slots] → [рідке скло за ∇VelOut + хрома]
Loop A/B: Echo = advect(prev, VelOut) · decay (+ zoom/rot/вітер) під Fresh = trace(контури + тон + RD·B) матеріалом
Out = loop над Cam (add / multiply / normal)
Still = те саме на форматі сенсора (Look/Loop; Dye/RD/Slots беруться живі за uv)
```

## 4. Матеріали 2027 (пресети → фізика)

| Тема | Око (look) | Екран (screen) | Рідина | Ріст (RD) | Петля |
|---|---|---|---|---|---|
| Сяйво | як є | — | curl 30, force 8, dissipation 0.3 | — | світло-барвник пливе, довгий хвіст, add |
| Дим | як є | — | curl 20, force 12, dissipation 0.1, гравітація вгору | — | дим = echo в рідині, decay 0.97 |
| Ртуть | chromatic | рідке скло за ∇Vel + хрома | curl 35, force 10 | — | матеріал на вихорах |
| Ферофлюїд | posterize | — | curl 15, force 6 | коралові шипи f 0.055 k 0.062, seed з контурів × рух | матеріал на B, add |
| Туш | oil | — | curl 10, force 5 | мітоз f 0.0367 k 0.0649 | multiply, туш розтікається |
| Завіса | grain | time displacement за яскравістю (16 кадрів) | curl 10 | — | довгий хвіст |
| Плата | glitch | pixel sorting за порогом | потік лише горизонтальний | — | flow [60,0] |
| Просто | як є | — | curl 25, force 10 | — | dye hold 0.92: КАМЕРА як рідина, без матеріалу |
| Папір / Нитка / Пісок / Порцеляна | як у Ф2.1 | — | легка (force 3) | — | як у Ф2.1, echo адвектується |

Ручки рушія: Погляд, Життя (енергія → лінія), Вітер → **Течія** (fluid.force), Мерехтіння; нові: Вихор
(fluid.curl), Памʼять (dye.hold), Ріст (rd.seed).

## 5. Бюджет (S25, 60 fps; Mobile/Vulkan)

Loop 1080×2340 ×2 проходи (echo, trace 9 семплів) ≈ як Ф2.1. Рідина на ¼ (270×585): 8 проходів ×
158 k px = 1.3 M px/кадр — дешевше за один прохід loop. RD на ½ ×4 = 2.5 M px, лише де ввімкнено. Dye ½
×1. Slots: один blit ¼ за кадр. Усі сим-viewport'и `use_hdr_2d` (RGBA16F — знак швидкості, точність RD).
`detail` 1 половинить усе.

## 6. Пастки

- Viewport не може читати сам себе → пінг-понг (Motion, Dye, Loop) або ланцюг (P1..P4, RD1..RD4, Vel→Div→P→VelOut→Curl).
- Ланцюг за кадр: viewport'и рендеряться в порядку дерева — читач має стояти ПІСЛЯ писача в дереві.
- `use_hdr_2d` обовʼязково для знакових полів; без нього швидкість квантується в 0..1.
- Потік у px сим-сітки за кадр; splat нормувати на dt·30, як усе інше.
- Slots з `render_target_clear_mode = NEVER` — Godot чистить viewport при зміні розміру; після `_layout` слоти порожні перший цикл (нормально).
