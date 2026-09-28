import { makeGenerator } from "/_rt/genchar.js";
import { $genCharLoading, $genCharPct, $genCharError, $newChar, addMyChar, toggleChar, wallet } from "./state.js";

const gen = makeGenerator({
  app: "afterdark", jobKey: "afterdark:genJob",
  $loading: $genCharLoading, $pct: $genCharPct, $error: $genCharError,
  onDone: (c) => { addMyChar(c); toggleChar(c.id); $newChar.set(c.id); wallet.refresh(); },
  onCharged: wallet.refresh,
  onFail: () => setTimeout(wallet.refresh, 1500),
});
export const { generateCharacter, resumeGeneration, cancelGenerate, genElapsed } = gen;

setTimeout(resumeGeneration, 0);
