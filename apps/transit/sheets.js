import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { hitTimes } from "/_rt/astro.js";
import { houseOf, HIT_PRECISION } from "/_rt/natal.js";
import { placeLabel } from "/_rt/places.js";
import { interpret, warmInterpret, isInterpreted, transitRead, warmTransitRead, isTransitRead, placementRead, warmPlacementRead, isPlacementRead, portraitRead, warmPortraitRead, isPortraitRead, houseRead, warmHouseRead, isHouseRead, askedRead, warmAskedRead, isAskedRead } from "/_rt/ai-astro.js";
import { BODY, SIGN, HOUSE, ASPECT as ASPECT_MEAN, ANGLE, DIGNITY, RULERS, ELEMENT_NAME, ELEMENT_MEANS, MODALITY_NAME, MODALITY_MEANS, RETRO_NOTE, dignityOf, chartRuler, rulerOf, balance, say, groundSky, groundTransit, groundPlacement, groundPortrait, groundCusp, groundQuestion, QUESTIONS, questionById } from "/_rt/signif.js";
import { ELEMENT, MODALITY } from "/_rt/synastry.js";
import { Scramble } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";
import { Sheet } from "/_rt/ui.js";
import { Reading } from "./reading.js";
import { LBL, signOf, bodyLabel, dm, ASPECT_KEY, cap1, signName, digKey, fmtHitAt, hitKey } from "./lib.js";

const GATE_INTERP = { uk: "Сатурн у квадратурі до натального Сонця робить цей період вимогливим: те, що ти будуєш, перевіряють на міцність, і поспіх лише додасть тертя. Транзитний Меркурій ретроградним рухом повертає до старої розмови, яку варто переписати, а не форсувати. Тригон Юпітера до натального Місяця дає тиху опору — рухайся послідовно, і обов'язок обернеться на структуру, а не на пастку.", en: "Saturn square your natal Sun makes this stretch exacting: what you are building is being tested for load, and pushing only adds friction. A retrograde Mercury turns you back to an old conversation worth rewriting rather than forcing. Jupiter's trine to your natal Moon lends quiet support — move step by step and the duty becomes structure, not a snare." };
const GATE_TRANSIT = { uk: "Сонце проходить квадратурою до твого Асцендента — до самої точки, якою ти зустрічаєш світ. Сонце освітлює те, чого торкається, і ненадовго робить це центром: кілька днів навколо тебе більше уваги, ніж зазвичай, і менше можливості лишитися непоміченим. Квадратура означає тертя між тим, ким ти є всередині, і тим, як тебе бачать, — щось одне доведеться посунути. Орб уже менший за градус і аспект сходиться, тож це відбувається зараз, а не насувається. Сонце проходить градус за добу, тому мірою тут є дні: за тиждень від цього лишиться тільки те, що ти встиг(ла) з ним зробити.", en: "The Sun is passing square your Ascendant — the very point you meet the world with. The Sun lights up whatever it touches and briefly makes it the centre: for a few days there is more attention on you than usual and less room to go unnoticed. A square means friction between who you are inside and how you are seen, and one of the two will have to give. The orb is already inside a degree and the aspect is applying, so this is happening now rather than approaching. The Sun covers a degree a day, so the unit here is days: in a week only what you did with it will be left." };
const GATE_PLACEMENT = { uk: "Місяць — це те, чим ти реагуєш раніше за думку, і в Рибах він реагує співчуттям: межа між твоїм і чужим станом тут тонка, і ти вбираєш настрій кімнати, ще не встигнувши його назвати. У пʼятому домі це виходить назовні як творення і прив'язаність — тебе живить те, що зроблено з любові й для когось конкретного. Сила цього положення в уяві та відгуку, ціна — у дрейфі й у чужому смутку, взятому за власний. Навчитися розрізняти, чиє це почуття, тут важливіше, ніж навчитися його стримувати.", en: "The Moon is what reacts in you before thought does, and in Pisces it reacts with sympathy: the line between your state and someone else's is thin here, and you absorb the mood of a room before you can name it. In the fifth house that comes out as making things and as attachment — you are fed by what is made out of love and for someone in particular. The gift of this placement is imagination and responsiveness; the cost is drift, and other people's sadness carried as your own. Learning whose feeling it is matters more here than learning to hold it in." };
const GATE_HOUSE = { uk: "Другий дім — це те, що ти вважаєш своїм: гроші, речі, здатність заробити і власне відчуття вартості. Стрілець на куспіді додає сюди широти й віри в те, що вистачить, — ти радше ризикнеш і доробиш, ніж будеш рахувати наперед. Управитель цього дому Юпітер стоїть у девʼятому, а це означає, що твої ресурси майже завжди переплетені з чужими: спільні бюджети, борги, спадок, домовленості на довіру. Планет у самому домі немає, і в традиції це не порожнеча — просто справи цього дому робляться там, де стоїть його управитель. Тож питання не в тому, скільки в тебе є, а з ким це «є» пов’язане.", en: "The second house is what you count as yours: money, possessions, the ability to earn, and your own sense of worth. Sagittarius on the cusp brings width and a working faith that there will be enough — you would rather take the risk and make it up afterwards than count in advance. Jupiter rules this house and stands in the ninth, which means your resources are almost always tangled with someone else’s: shared budgets, debts, inheritance, arrangements held together by trust. No planet stands in the house itself, and in the tradition that is not emptiness — the affairs of the house are simply carried out where its ruler sits. So the question is less how much you have than whose it is bound up with." };
const GATE_PORTRAIT = { uk: "Сонце в Раку при Асценденті в Терезах дає поєднання обережного серця і привітної поверхні: ти зустрічаєш світ рівно й тактовно, а вирішуєш усе всередині, за зачиненими дверима. Місяць у Рибах поглиблює це — реакція йде раніше за слова, і вона майже завжди про когось іншого. \n\nУправителька карти Венера стоїть у восьмому домі, тож те, що для тебе справді важить, ніколи не лежить на видноті: близькість тут вимірюється мірою довіри, а не кількістю часу. У карті переважає вода при браку вогню, і це означає, що почати щось тобі важче, ніж витримати. Кардинальна якість дає поштовх, але поштовх цей іде від обставин, а не від нетерпіння. \n\nНайщільніший аспект — тригон Сонця до Місяця: воля і почуття тут не воюють, і саме тому ти рідко помічаєш, наскільки на них спираєшся. Сатурн у десятому домі додає до цього обовʼязок, який ти сам собі виписав. Разом це карта людини, яку легко недооцінити ззовні й важко зрушити зсередини.", en: "A Cancer Sun under a Libra Ascendant sets a careful heart behind an agreeable surface: you meet the world evenly and tactfully, and decide everything inside, behind a closed door. The Moon in Pisces deepens that — the reaction comes before the words, and it is almost always about someone else. \n\nVenus, ruler of the chart, stands in the eighth house, so what actually matters to you is never left in plain view: closeness here is measured in trust rather than in hours. Water dominates the chart and fire is thin, which means starting a thing costs you more than enduring it. The cardinal emphasis does supply a push, but the push comes from circumstance rather than impatience. \n\nThe tightest aspect is the Sun trine the Moon: will and feeling are not at war here, which is exactly why you rarely notice how much you lean on them. Saturn in the tenth adds a duty you wrote for yourself. Together this is the chart of someone easy to underestimate from outside and hard to move from within." };

const AI_SKY = { get: interpret, has: isInterpreted, warm: warmInterpret };
const AI_TRANSIT = { get: transitRead, has: isTransitRead, warm: warmTransitRead };
const AI_PLACEMENT = { get: placementRead, has: isPlacementRead, warm: warmPlacementRead };
const AI_PORTRAIT = { get: portraitRead, has: isPortraitRead, warm: warmPortraitRead };
const AI_HOUSE = { get: houseRead, has: isHouseRead, warm: warmHouseRead };
const AI_ASK = { get: askedRead, has: isAskedRead, warm: warmAskedRead };

const Section = (label, body) => html`<div class="flex flex-col gap-1.5">
  <div class=${LBL}>${label}</div>
  ${body}
</div>`;
const WELL = "rounded-[var(--ms-r-in)] sf-inset px-3 py-1";

const Fact = (label, value, key) => html`<div data-fact=${key || null} class="flex items-baseline gap-3 py-1.5 border-b border-base-300/40 last:border-0">
  <span class=${`${LBL} w-[5.5rem] shrink-0`}>${label}</span>
  <span class="text-[0.84rem] min-w-0 flex-1">${value}</span>
</div>`;

const Mean = (src, text) => html`<div data-mean class="py-1.5 border-b border-base-300/40 last:border-0">
  <div class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-primary">${src}</div>
  <div class="text-[0.84rem] leading-snug">${text}</div>
</div>`;

export function TransitSheet({ open, onClose, C, t, loc, dateLabel }) {
  const a = (open && C.ready) ? C.hits.find((x) => hitKey(x) === open) : null;
  const [times, setTimes] = useState(null);
  const akey = a ? hitKey(a) : "", whenMs = C.when.getTime();
  useEffect(() => {
    if (!a) { setTimes(null); return; }
    let dead = false;
    const id = setTimeout(() => { if (!dead) setTimes(hitTimes(a.t, a.natalLon, a.signedAngle, whenMs)); }, 0);
    return () => { dead = true; clearTimeout(id); };
  }, [akey, whenMs]);
  if (!a) return null;
  const tp = C.sky.find((p) => p.key === a.t);
  const retro = C.retro(a.t, tp.lon);
  const house = ANGLE[a.n] ? null : houseOf(a.natalLon, C.H.cusps);
  const prec = HIT_PRECISION[a.t] || "minute";
  const fmt = (ms) => fmtHitAt(ms, prec, loc);
  const dateEN = C.when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const hitList = times || [];
  const { text: input, sig } = groundTransit({ c: a, transitLon: tp.lon, natalHouse: house,
    houseSystem: C.system, retro, dateEN, hits: hitList.map((ms) => ({ ms, label: new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) })) });

  const title = `${bodyLabel(t, a.t)} ${T(t, ASPECT_KEY[a.type])} ${T(t, "natalMark")} ${bodyLabel(t, a.n)}`;
  const nb = BODY[a.n], na = ANGLE[a.n];
  return html`<${Sheet} id="transitsheet" open=${true} onClose=${onClose} title=${title} subtitle=${dateLabel} icon="lucide:sparkles">
    <div class="flex flex-col gap-4">
      <${Reading} sig=${sig} input=${input} loc=${loc} api=${AI_TRANSIT} t=${t} wait=${times === null}
        gateText=${GATE_TRANSIT[loc] || GATE_TRANSIT.en} lines=${[32, 34, 30, 33, 22]} />

      ${Section(T(t, "factsTitle"), html`<div class=${WELL}>
        ${Fact(T(t, "fOrb"), html`<span class=${`tabular-nums font-mono ${a.exact ? "text-primary font-semibold" : ""}`}>${a.orb.toFixed(2)}°</span>
          <span class="text-base-content/70"> · ${T(t, a.exact ? "fExact" : "fInRange")}</span>
          ${a.applying != null ? html`<span class="text-base-content/70"> · ${T(t, a.applying ? "aspApplying" : "aspSeparating")}</span>` : null}`, "orb")}
        ${Fact(T(t, "fTransiting"), html`${signName(t, signOf(tp.lon))} ${dm(tp.lon)}${retro ? html`<span class="text-warning font-mono ml-1">℞</span>` : null}`)}
        ${Fact(T(t, "fNatal"), html`${signName(t, signOf(a.natalLon))} ${dm(a.natalLon)}${house ? html`<span class="text-base-content/70"> · ${T(t, "houseShort")}${house} (${T(t, "hs" + cap1(C.system))})</span>` : null}`)}
        ${hitList.length ? Fact(T(t, "fPerfects"), html`<span class="font-mono tabular-nums text-[0.78rem]">${hitList.map(fmt).join(" · ")}</span>
          ${hitList.length > 1 ? html`<span class="text-base-content/70"> · ${T(t, "passes")} ${hitList.length}</span>` : null}`, "perfects")
          : times === null ? Fact(T(t, "fPerfects"), html`<span class="font-mono text-[0.78rem] text-base-content/70"><${Scramble} len=${18} /></span>`, "perfects")
          : Fact(T(t, "fPerfects"), html`<span class="text-base-content/70">${T(t, "noExactHit")}</span>`, "perfects")}
        ${Fact(T(t, "fTempo"), say(BODY[a.t].tempo, loc), "tempo")}
      </div>`)}

      ${Section(T(t, "meansTitle"), html`<div class=${WELL}>
        ${Mean(`${bodyLabel(t, a.t)} · ${T(t, "mMoving")}`, `${cap1(say(BODY[a.t].role, loc))}. ${cap1(say(BODY[a.t].act, loc))}.`)}
        ${Mean(T(t, ASPECT_KEY[a.type]), cap1(say(ASPECT_MEAN[a.type], loc)))}
        ${Mean(`${bodyLabel(t, a.n)} · ${T(t, "mTouched")}`, na ? cap1(say(na.topic, loc)) : cap1(say(nb.role, loc)))}
        ${house ? Mean(`${T(t, "houseShort")}${house} · ${T(t, "mField")}`, html`${cap1(say(HOUSE[house - 1].topic, loc))}. <span class="text-base-content/70">${T(t, "mTrad")}: ${say(HOUSE[house - 1].trad, loc)}.</span>`) : null}
        ${Mean(T(t, "mStrain"), cap1(say(BODY[a.t].strain, loc)))}
        ${retro ? Mean("℞", cap1(say(RETRO_NOTE, loc))) : null}
      </div>`)}
    </div>
  </${Sheet}>`;
}

export function PlacementSheet({ open, onClose, C, t, loc }) {
  if (!open || !C.ready) return null;
  const key = open;
  const na = ANGLE[key];
  const lon = na ? (key === "asc" ? C.H.asc : key === "mc" ? C.H.mc : C.H.vertex) : (C.natal.find((p) => p.key === key) || {}).lon;
  if (lon == null) return null;
  const s = signOf(lon);
  const house = na ? null : houseOf(lon, C.H.cusps);
  const retro = na ? false : C.natalRetroFor(key, lon);
  const dig = na ? null : dignityOf(key, s);
  const { text: input, sig } = groundPlacement({ key, lon, house, houseSystem: C.system, retro });
  const rulers = RULERS[s];

  return html`<${Sheet} id="placementsheet" open=${true} onClose=${onClose} icon="lucide:sparkles"
      title=${`${bodyLabel(t, key)} ${T(t, "sl" + s)}`}
      subtitle=${house ? `${dm(lon)} · ${T(t, "houseShort")}${house}` : dm(lon)}>
    <div class="flex flex-col gap-4">
      <${Reading} sig=${sig} input=${input} loc=${loc} api=${AI_PLACEMENT} t=${t}
        gateText=${GATE_PLACEMENT[loc] || GATE_PLACEMENT.en} lines=${[31, 33, 29, 24]} />

      ${Section(T(t, "factsTitle"), html`<div class=${WELL}>
        ${Fact(T(t, "fSign"), html`${signName(t, s)} ${dm(lon)}${retro ? html`<span class="text-warning font-mono ml-1">℞</span>` : null}`)}
        ${house ? Fact(T(t, "fHouse"), `${T(t, "houseShort")}${house} · ${T(t, "hs" + cap1(C.system))}`, "house") : null}
        ${Fact(T(t, "fElement"), `${cap1(say(ELEMENT_NAME[ELEMENT(s)], loc))} · ${cap1(say(MODALITY_NAME[MODALITY(s)], loc))}`)}
        ${Fact(T(t, "fRuler"), html`${bodyLabel(t, rulers[0])}${rulers[1] ? html`<span class="text-base-content/70"> · ${bodyLabel(t, rulers[1])} (${T(t, "mModern")})</span>` : null}`)}
        ${dig ? Fact(T(t, "fDignity"), html`<span class=${dig === "none" ? "text-base-content/70" : "text-primary font-medium"}>${T(t, digKey(dig))}</span>`, "dignity") : null}
      </div>`)}

      ${Section(T(t, "meansTitle"), html`<div class=${WELL}>
        ${Mean(`${bodyLabel(t, key)} · ${T(t, "mWhat")}`, na ? html`${cap1(say(na.topic, loc))}. <span class="text-base-content/70">${cap1(say(na.axis, loc))}.</span>` : cap1(say(BODY[key].role, loc)))}
        ${Mean(`${signName(t, s)} · ${T(t, "mHow")}`, `${cap1(say(SIGN[s].mode, loc))}. ${cap1(say(SIGN[s].gift, loc))} — ${say(SIGN[s].excess, loc)}.`)}
        ${house ? Mean(`${T(t, "houseShort")}${house} · ${T(t, "mWhere")}`, html`${cap1(say(HOUSE[house - 1].topic, loc))}. <span class="text-base-content/70">${T(t, "mTrad")}: ${say(HOUSE[house - 1].trad, loc)}.</span>`) : null}
        ${Mean(`${cap1(say(ELEMENT_NAME[ELEMENT(s)], loc))} · ${say(MODALITY_NAME[MODALITY(s)], loc)}`, `${cap1(say(ELEMENT_MEANS[ELEMENT(s)], loc))}. ${cap1(say(MODALITY_MEANS[MODALITY(s)], loc))}.`)}
        ${dig && dig !== "none" ? Mean(T(t, digKey(dig)), cap1(say(DIGNITY[dig], loc))) : null}
        ${retro ? Mean("℞", cap1(say(RETRO_NOTE, loc))) : null}
      </div>`)}
    </div>
  </${Sheet}>`;
}

export function CuspSheet({ open, onClose, C, t, loc }) {
  if (open == null || !C.ready) return null;
  const house = Number(open);
  if (!(house >= 1 && house <= 12)) return null;
  const cuspLon = C.H.cusps[house - 1];
  const s = signOf(cuspLon);
  const r = rulerOf(cuspLon);
  const co = RULERS[s][1] || null;
  const rp = C.natal.find((p) => p.key === r.body);
  const ruler = rp ? { key: r.body, lon: rp.lon, house: houseOf(rp.lon, C.H.cusps), retro: C.natalRetroFor(r.body, rp.lon) } : null;
  const tenants = C.natal.filter((p) => houseOf(p.lon, C.H.cusps) === house)
    .map((p) => ({ key: p.key, lon: p.lon, retro: C.natalRetroFor(p.key, p.lon) }));
  const { text: input, sig } = groundCusp({ house, cuspLon, houseSystem: C.system, ruler, coRuler: co, tenants });
  const rDig = ruler ? dignityOf(ruler.key, signOf(ruler.lon)) : null;

  return html`<${Sheet} id="cuspsheet" open=${true} onClose=${onClose} icon="lucide:sparkles"
      title=${`${T(t, "houseWord")} ${house}`} subtitle=${`${signName(t, s)} ${dm(cuspLon)}`}>
    <div class="flex flex-col gap-4">
      <${Reading} sig=${sig} input=${input} loc=${loc} api=${AI_HOUSE} t=${t}
        gateText=${GATE_HOUSE[loc] || GATE_HOUSE.en} lines=${[32, 30, 33, 29, 21]} />

      ${Section(T(t, "factsTitle"), html`<div class=${WELL}>
        ${Fact(T(t, "fCusp"), `${signName(t, s)} ${dm(cuspLon)} · ${T(t, "hs" + cap1(C.system))}`, "cusp")}
        ${ruler ? Fact(T(t, "fHouseRuler"), html`<span data-cusp-ruler>${bodyLabel(t, ruler.key)}</span>
          <span class="text-base-content/70"> · ${signName(t, signOf(ruler.lon))} · ${T(t, "houseShort")}${ruler.house}</span>
          ${ruler.retro ? html`<span class="text-warning font-mono ml-1">℞</span>` : null}
          ${rDig && rDig !== "none" ? html`<span class="text-primary"> · ${T(t, digKey(rDig))}</span>` : null}`, "houseRuler") : null}
        ${co ? Fact(T(t, "mModern"), bodyLabel(t, co)) : null}
        ${Fact(T(t, "fTenants"), tenants.length
          ? html`${tenants.map((p) => bodyLabel(t, p.key)).join(" · ")}`
          : html`<span class="text-base-content/70">${T(t, "fNoTenants")}</span>`, "tenants")}
      </div>`)}

      ${Section(T(t, "meansTitle"), html`<div class=${WELL}>
        ${Mean(`${T(t, "houseWord")} ${house}`, html`${cap1(say(HOUSE[house - 1].topic, loc))}. <span class="text-base-content/70">${T(t, "mTrad")}: ${say(HOUSE[house - 1].trad, loc)}.</span>`)}
        ${Mean(`${signName(t, s)} · ${T(t, "mHow")}`, `${cap1(say(SIGN[s].mode, loc))} ${cap1(say(SIGN[s].gift, loc))} — ${say(SIGN[s].excess, loc)}.`)}
        ${ruler ? Mean(`${bodyLabel(t, ruler.key)} · ${T(t, "mRules")}`, cap1(say(BODY[ruler.key].role, loc))) : null}
      </div>`)}
    </div>
  </${Sheet}>`;
}

const $asked = persistentAtom("transit:asked", gate ? ["love", "workNow"] : [], {
  encode: JSON.stringify,
  decode: (s) => { try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter((x) => questionById(x)) : []; } catch { return []; } },
});

const GATE_ASK = {
  love: { uk: "Тебе тягне до людей, з якими спокійно і надійно: сьомий дім у Тельці, а це не про іскру, а про те, щоб поруч було відчутно і не хитало. Управителька дому Венера стоїть у восьмому, тож зближення в тебе відбувається не на видноті — через довіру, спільні справи й те, що не розповідають третім. Венера у Близнюках додає до цього розмову: тебе притягує той, з ким цікаво говорити, і охолоджує той, з ким нема про що. Пʼятий дім тут окремо — легкий флірт і закоханість живуть за іншими правилами, ніж те, що ти справді шукаєш. Традиційно це читається як потяг до повільного зближення, де перевірка часом важить більше за перше враження.", en: "You are drawn to people who feel steady: the seventh house is in Taurus, which is less about the spark than about the ground not moving underfoot. Venus, its ruler, stands in the eighth, so closeness happens out of public view — through trust, shared undertakings and the things not told to third parties. Venus in Gemini adds talk to that: you are drawn to someone worth talking to and cooled by someone there is nothing to say to. The fifth house is a separate matter here — flirtation and infatuation run by different rules than what you are actually looking for. Traditionally this reads as a pull toward slow approach, where being tested by time counts for more than a first impression." },
  workNow: { uk: "Зараз у роботі рухається одне: транзитний Сатурн у тригоні до твого Середини Неба, орб 0.63° і аспект розходиться. Сатурн перевіряє на міцність те, що вже збудовано, а тригон означає, що перевірка йде без опору — радше визнання, ніж тиск. Він стає точним тричі: 29 червня 2026, 23 серпня 2026 і 10 березня 2027, бо між ними Сатурн повертає назад. Сатурн проходить знак за два з половиною роки, тож мірою тут є місяці: це не тиждень, коли щось вирішиться, а період, у який твоя публічна роль набуває форми. Що з цим робити — те, що вже робиш, тільки не кидати на середині.", en: "One thing is moving in your work right now: transiting Saturn trine your Midheaven, orb 0.63°, and separating. Saturn tests what has already been built for load, and a trine means the test comes without resistance — recognition rather than pressure. It perfects three times: 29 June 2026, 23 August 2026 and 10 March 2027, because Saturn turns back between them. Saturn spends two and a half years in a sign, so the unit here is months: this is not a week in which something is decided but a period in which your public role takes its shape. What to do with it is what you are already doing, only without abandoning it halfway." },
};

function Asked({ qid, C, t, loc, chart, timingFor }) {
  const q = questionById(qid);
  if (!q) return null;
  const timing = q.transit ? timingFor(q) : null;
  const { text: input, sig } = groundQuestion({ q, chart, timing });
  return html`<div data-asked=${qid} class="flex flex-col gap-2">
    <div class="self-end max-w-[85%] rounded-[var(--ms-r-in)] rounded-br-md sf-e2 bg-primary/10 px-3.5 py-2">
      <span class="text-[0.9rem] font-medium text-primary">${say(q.label, loc)}</span>
    </div>
    <div class="self-start w-full rounded-[var(--ms-r-in)] rounded-bl-md sf-inset px-3.5 py-3">
      <${Reading} sig=${sig} input=${input} loc=${loc} api=${AI_ASK} t=${t}
        wait=${!!(q.transit && timing === null)}
        gateText=${(GATE_ASK[qid] || GATE_ASK.love)[loc] || (GATE_ASK[qid] || GATE_ASK.love).en}
        lines=${[31, 34, 30, 32, 24]} />
    </div>
  </div>`;
}

export function AskSheet({ open, onClose, C, t, loc }) {
  const asked = useStore($asked);
  const [hits, setHits] = useState(null);
  const wantsTiming = open && C.ready && asked.some((id) => questionById(id)?.transit);
  const contactSig = C.ready ? C.hits.slice(0, 4).map(hitKey).join(",") : "";
  const whenMs = C.ready ? C.when.getTime() : 0;
  useEffect(() => {
    if (!wantsTiming) { setHits(null); return; }
    let dead = false;
    const id = setTimeout(() => {
      if (dead) return;
      const out = {};
      for (const a of C.hits.slice(0, 4)) out[hitKey(a)] = hitTimes(a.t, a.natalLon, a.signedAngle, whenMs);
      setHits(out);
    }, 0);
    return () => { dead = true; clearTimeout(id); };
  }, [wantsTiming, contactSig, whenMs]);

  if (!open || !C.ready) return null;

  const chart = { cusps: C.H.cusps, houseSystem: C.system, asc: C.H.asc, mc: C.H.mc,
    points: C.natal.map((p) => ({ key: p.key, lon: p.lon, house: houseOf(p.lon, C.H.cusps), retro: C.natalRetroFor(p.key, p.lon) })) };
  const dateEN = C.when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const timingFor = (q) => {
    if (hits === null) return null;
    const want = new Set([...(q.bodies || []), ...(q.angles || [])]);
    const contacts = C.hits.slice(0, 4).filter((a) => want.has(a.n)).map((a) => ({
      c: a, transitLon: C.sky.find((p) => p.key === a.t).lon, retro: C.retro(a.t, C.sky.find((p) => p.key === a.t).lon),
      hits: (hits[hitKey(a)] || []).map((ms) => fmtHitAt(ms, HIT_PRECISION[a.t] || "minute", "en")),
    }));
    return { dateEN, contacts };
  };
  const rest = QUESTIONS.filter((q) => !asked.includes(q.id));

  return html`<${Sheet} id="asksheet" open=${true} onClose=${onClose} title=${T(t, "askTitle")}
      subtitle=${placeLabel(C.b.place) + " · " + C.rec.date} icon="lucide:sparkles">
    ${""}
    <div class="flex flex-col gap-5">
      ${""}
      ${rest.length ? html`<div class="flex flex-wrap gap-2">
        ${rest.map((q) => html`<button data-ask=${q.id} onClick=${() => $asked.set([...$asked.get(), q.id])}
            class="rounded-full sf-raised sf-e2 sf-press px-3.5 py-2 text-[0.9rem] font-medium transition" key=${q.id}>
          ${say(q.label, loc)}
        </button>`)}
      </div>` : null}

      ${asked.length ? html`<div class="flex flex-col gap-5">
        ${rest.length ? html`<div class=${LBL}>${T(t, "askAnswered")}</div>` : null}
        ${asked.slice().reverse().map((id) => html`<${Asked} qid=${id} C=${C} t=${t} loc=${loc} chart=${chart} timingFor=${timingFor} key=${id} />`)}
      </div>` : null}
    </div>
  </${Sheet}>`;
}

export function PortraitSheet({ open, onClose, C, t, loc }) {
  if (!open || !C.ready) return null;
  const points = C.natal.map((p) => ({ key: p.key, lon: p.lon, house: houseOf(p.lon, C.H.cusps), retro: C.natalRetroFor(p.key, p.lon) }));
  const { text: input, sig } = groundPortrait({ points, asc: C.H.asc, mc: C.H.mc, houseSystem: C.system });
  const bal = balance(points.map((p) => p.lon));
  const ruler = chartRuler(C.H.asc);
  const rulerPt = points.find((p) => p.key === ruler.body);
  const co = RULERS[ruler.sign][1];
  const bars = (counts, names) => html`<div class="flex gap-1.5">
    ${counts.map((n, i) => html`<div class="flex-1 flex flex-col items-center gap-1" key=${i}>
      <div class="w-full h-1.5 rounded-full sf-inset overflow-hidden"><div class="h-full rounded-full bg-primary/70" style=${`width:${points.length ? Math.round(n / points.length * 100) : 0}%`}></div></div>
      <div class=${`${LBL} truncate w-full text-center`}>${say(names[i], loc)}</div>
      <div class="text-[0.78rem] font-mono tabular-nums">${n}</div>
    </div>`)}
  </div>`;

  return html`<${Sheet} id="portraitsheet" open=${true} onClose=${onClose} title=${T(t, "portraitTitle")}
      subtitle=${`${placeLabel(C.b.place)} · ${C.rec.date}`} icon="lucide:sparkles">
    <div class="flex flex-col gap-4">
      <${Reading} sig=${sig} input=${input} loc=${loc} api=${AI_PORTRAIT} t=${t}
        gateText=${GATE_PORTRAIT[loc] || GATE_PORTRAIT.en} lines=${[33, 31, 34, 30, 32, 33, 28, 26]} />

      ${Section(T(t, "factsTitle"), html`<div class=${WELL}>
        ${Fact(T(t, "angAsc"), `${signName(t, signOf(C.H.asc))} ${dm(C.H.asc)}`)}
        ${Fact(T(t, "angMc"), `${signName(t, signOf(C.H.mc))} ${dm(C.H.mc)}`)}
        ${Fact(T(t, "fChartRuler"), html`<span data-chart-ruler>${bodyLabel(t, ruler.body)}</span>${rulerPt ? html`<span class="text-base-content/70"> · ${signName(t, signOf(rulerPt.lon))} · ${T(t, "houseShort")}${rulerPt.house}</span>` : null}
          ${co ? html`<span class="text-base-content/70"> · ${bodyLabel(t, co)} (${T(t, "mModern")})</span>` : null}`, "ruler")}
        ${Fact(T(t, "fHouses"), T(t, "hs" + cap1(C.system)))}
      </div>`)}

      ${Section(T(t, "fBalance"), html`<div class="rounded-[var(--ms-r-in)] sf-inset px-3 py-3 flex flex-col gap-3">
        ${bars(bal.elements, ELEMENT_NAME)}
        ${bars(bal.modalities, MODALITY_NAME)}
      </div>`)}
    </div>
  </${Sheet}>`;
}

export function InterpSheet({ open, onClose, C, t, loc, dateLabel }) {
  if (!open) return null;
  const dateEN = C.when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const skyLon = Object.fromEntries(C.sky.map((p) => [p.key, p.lon]));
  const contacts = C.hits.map((c) => ({
    c,
    transitLon: skyLon[c.t],
    retro: C.retro(c.t, skyLon[c.t]),
    natalHouse: ANGLE[c.n] ? null : houseOf(c.natalLon, C.H.cusps),
  })).filter((x) => x.transitLon != null);
  const moonLon = skyLon.moon;
  const moon = moonLon == null ? null : { lon: moonLon, house: houseOf(moonLon, C.H.cusps), retro: false };
  const { text: input, sig } = groundSky({ dateEN, houseSystem: C.system, contacts, moon });

  return html`<${Sheet} id="interpsheet" open=${true} onClose=${onClose} title=${T(t, "interpTitle")} subtitle=${dateLabel} icon="lucide:sparkles">
      <${Reading} sig=${sig} input=${input} loc=${loc} api=${AI_SKY} t=${t}
        gateText=${GATE_INTERP[loc] || GATE_INTERP.en} lines=${[30, 34, 28, 20]} />
  </${Sheet}>`;
}
