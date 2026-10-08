// personavoice — a persona's reply spoken in the persona's own voice (owner, 2026-10-08: «озвучити голосом персони»).
// What the screen decides without the network: how a reply is cut into the pieces the voice route takes, and which
// parts of the persona's voice apply to the language of the reply. The voice itself is cast once on the edge
// (chars.js voiceOf: OmniVoice's Voice Design vocabulary) and spoken through /feed/task route /feed/voice.

/** The voice route speaks at most 400 characters (~30 s); a little under, so a word is never cut by the cap. */
export const CHUNK_MAX = 380;

/**
 * A reply → the pieces to speak, in order: whole sentences packed up to `max`; a sentence longer than that is cut
 * at its last comma, else its last space, before the limit. Whitespace collapsed; nothing empty. Pure.
 */
export function speechChunks(text, max = CHUNK_MAX) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (!flat) return [];
  const sentences = flat.match(/[^.!?…]+(?:[.!?…]+["»”')\]]*|$)\s*/g) || [flat];
  const out = [];
  let cur = "";
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ""; };
  for (let s of sentences) {
    while (s.length > max) {
      const head = s.slice(0, max);
      const cut = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "));
      const at = cut > max * 0.4 ? cut + 1 : (head.lastIndexOf(" ") > max * 0.4 ? head.lastIndexOf(" ") : max);
      push(); cur = s.slice(0, at); push();
      s = s.slice(at).trimStart();
    }
    if ((cur + s).length > max) push();
    cur += s;
  }
  push();
  return out;
}

/**
 * The persona's voice for THIS reply: OmniVoice's English-accent dropdown acts on English speech only, so a
 * Ukrainian (Cyrillic) reply drops the accent rather than asking for one the model will ignore. Pure.
 */
export function designFor(voice, text) {
  if (!voice || typeof voice !== "object") return null;
  const d = { ...voice };
  if (/[Ѐ-ӿ]/.test(String(text || ""))) delete d.accent;
  return d;
}

/** The i18n key of a speaking phase (the row under the reply). Pure. */
export const voicePhaseKey = (phase) => ({ casting: "voiceCasting", making: "voiceMaking", playing: "voiceSpeaking", paused: "voicePaused", error: "voiceFailed" })[phase] || "";
