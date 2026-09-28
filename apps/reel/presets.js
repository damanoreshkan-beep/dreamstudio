

export const PRESETS = [
  { name: "Mixkit", url: "https://mixkit.co/free-stock-video/" },
  { name: "Space", url: "https://mixkit.co/free-stock-video/space/" },
  { name: "Nature", url: "https://mixkit.co/free-stock-video/nature/" },
  { name: "Aerial", url: "https://mixkit.co/free-stock-video/aerial/" },
  { name: "Abstract", url: "https://mixkit.co/free-stock-video/abstract/" },
  { name: "Dareful 4K", url: "https://dareful.com/" },
  { name: "Wikimedia Commons", url: "https://commons.wikimedia.org/wiki/Category:Animations" },
  { name: "Underwater", url: "https://commons.wikimedia.org/wiki/Category:Underwater_videos" },
  { name: "Time-lapse", url: "https://commons.wikimedia.org/wiki/Category:Time-lapse_videos" },
];
export const DEFAULT_SRC = PRESETS[0].url;
const BLACK_PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAAAAADhZOFXAAAAEklEQVR4nGJgoA4AAAAA//8DAABIAAFYHHymAAAAAElFTkSuQmCC";
export const GREY_PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFUlEQVR4nGJowAEYhpYEAAAA//8DAILzYAFRMt2JAAAAAElFTkSuQmCC";
const GV = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/";
export const MOCK = [
  { video: GV + "BigBuckBunny.mp4", title: "Big Buck Bunny", poster: GV + "images/BigBuckBunny.jpg", page: "https://mixkit.co/watch/10241/",
    channel: { name: "Nine Lives Studio", url: "https://mixkit.co/profiles/user10241/", avatar: null } },
  { video: GV + "ElephantsDream.mp4", title: "Elephants Dream", poster: null, page: "https://mixkit.co/watch/10242/" },
  { video: GV + "Sintel.mp4", title: "Sintel", poster: null, page: "https://mixkit.co/watch/10243/" },
  { video: GV + "BigBuckBunny.mp4", title: "Big Buck Bunny dup", poster: null, page: "https://mixkit.co/watch/10241/" },
  { video: GV + "ForBiggerBlazes.mp4", title: "Broken clip", poster: BLACK_PX, page: "https://mixkit.co/watch/10244/" },
  { video: GV + "ForBiggerEscapes.mp4", title: "Flat placeholder", poster: GREY_PX, page: "https://mixkit.co/watch/10245/" },
];
export const MOCK_DEEP = [
  { video: GV + "ForBiggerFun.mp4", title: "Deeper one", poster: null, page: "https://mixkit.co/watch/55012/",
    channel: { name: "Deeper Studio", url: "https://mixkit.co/profiles/deeper-studio", avatar: null } },
  { video: GV + "ForBiggerJoyrides.mp4", title: "Deeper two", poster: null, page: "https://mixkit.co/watch/55013/" },
];
export const GATE_TITLES = {
  "https://mixkit.co/watch/10241/": "Big%20Buck%20Bunny in 4K &amp; Friends — Mixkit",
  "https://mixkit.co/profiles/user10241/": "Nine%20Lives Studio &amp; Friends — Mixkit",
  "https://mixkit.co/watch/55013/": "Deeper two · Mixkit",
};

export const GATE_SEARCH = "https://mixkit.co/free-stock-video/?q=nature";
export const GATE_SUBS = [
  { id: "https://mixkit.co/watch/70001/", url: "https://mixkit.co/watch/70001/", name: "Fog over the Carpathians at first light, in one long slow take" },
  { id: "https://mixkit.co/watch/70002/", url: "https://mixkit.co/watch/70002/", name: "Night city" },
];

export const GATE_CAST = [
  { name: "Nine Lives Studio", url: "https://mixkit.co/profiles/user10241/", avatar: null },
  { name: "Proog", url: "https://mixkit.co/profiles/proog/", avatar: null },
];
