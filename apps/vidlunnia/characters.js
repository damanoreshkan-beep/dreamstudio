/** The presets in strip order; `recipe` is what /feed/voice receives as `instruct`. */
export const CHARACTERS = [
  { id: "spongebob", group: "cartoon", recipe: "Male, Young Adult, Very High Pitch, American Accent" },
  { id: "patrick", group: "cartoon", recipe: "Male, Young Adult, Low Pitch, American Accent" },
  { id: "homer-simpson", group: "cartoon", recipe: "Male, Middle-aged, Moderate Pitch, American Accent" },
  { id: "mickey-mouse", group: "cartoon", recipe: "Male, Young Adult, Very High Pitch, American Accent" },
  { id: "bugs-bunny", group: "cartoon", recipe: "Male, Young Adult, High Pitch, American Accent" },
  { id: "shrek", group: "cartoon", recipe: "Male, Middle-aged, Very Low Pitch, British Accent" },
  { id: "donkey", group: "cartoon", recipe: "Male, Young Adult, High Pitch, American Accent" },
  { id: "minion", group: "cartoon", recipe: "Male, Child, Very High Pitch" },
  { id: "batman", group: "hero", recipe: "Male, Middle-aged, Very Low Pitch, Whisper" },
  { id: "darth-vader", group: "hero", recipe: "Male, Middle-aged, Very Low Pitch, American Accent" },
  { id: "yoda", group: "hero", recipe: "Male, Elderly, High Pitch" },
  { id: "hulk", group: "hero", recipe: "Male, Middle-aged, Very Low Pitch, American Accent" },
  { id: "joker", group: "hero", recipe: "Male, Middle-aged, High Pitch, American Accent" },
  { id: "groot", group: "hero", recipe: "Male, Young Adult, Very Low Pitch" },
  { id: "gandalf", group: "tale", recipe: "Male, Elderly, Low Pitch, British Accent" },
  { id: "elsa", group: "tale", recipe: "Female, Young Adult, Moderate Pitch, American Accent" },
  { id: "pikachu", group: "tale", recipe: "Male, Child, Very High Pitch, Japanese Accent" },
  { id: "mario", group: "tale", recipe: "Male, Middle-aged, High Pitch" },
  { id: "gollum", group: "tale", recipe: "Male, Elderly, High Pitch, Whisper" },
  { id: "baba-yaga", group: "tale", recipe: "Female, Elderly, Low Pitch" },
];
export const characterOf = (id) => CHARACTERS.find((c) => c.id === id) || null;
