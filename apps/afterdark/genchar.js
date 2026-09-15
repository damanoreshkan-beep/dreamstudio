// afterdark — a NEW CHARACTER FROM WORDS: the generator itself lives in the product's rt/genchar.js (promoted
// 2026-09-13 when blackout became the second app making characters); this file binds it to afterdark's atoms,
// its localStorage slot and its cast (a finished body goes straight on stage).
import { makeGenerator } from "/_rt/genchar.js";
import { $genCharLoading, $genCharPct, $genCharError, $newChar, addMyChar, toggleChar, wallet } from "./state.js";

const gen = makeGenerator({
  app: "afterdark", jobKey: "afterdark:genJob",
  $loading: $genCharLoading, $pct: $genCharPct, $error: $genCharError,
  onDone: (c) => { addMyChar(c); toggleChar(c.id); $newChar.set(c.id); wallet.refresh(); },
  onCharged: wallet.refresh,
  onFail: () => setTimeout(wallet.refresh, 1500),   // the edge refunds as the job fails; look once it has
});
export const { generateCharacter, resumeGeneration, cancelGenerate, genElapsed } = gen;

setTimeout(resumeGeneration, 0);   // after /_rt/index.js has installed the sealed fetch
