// The preset library — "sweets": well-known Shodan searches a person can run with one tap, each with a plain
// description of what it turns up and why it matters, so Маяк reads as an exposure-awareness tool, not a
// weapon. Sources: github.com/jakejarvis/awesome-shodan-queries, osintme.com "100 great Shodan queries".
// Every entry is VIEW-ONLY research: Маяк never logs in anywhere. `q` is the Shodan query; `free` is the
// plain word the free tier can search by (no credit), or "" when the preset needs a filtered (paid) query.
export const PRESET = {
  // cameras
  camera: { q: "port:554,5554,8554", free: "webcam" },
  cam_dahua: { q: "product:Dahua", free: "dahua" },
  cam_hik: { q: "product:Hikvision", free: "hikvision" },
  cam_axis: { q: "product:Axis", free: "axis" },
  cam_onvif: { q: "port:3702", free: "onvif" },
  cam_screenshot: { q: "has_screenshot:true port:554", free: "" },
  cam_webcamxp: { q: '"Server: webcamXP"', free: "webcamxp" },
  cam_yawcam: { q: '"Server: yawcam"', free: "yawcam" },
  // databases
  databases: { q: "port:3306,5432,27017,6379,9200", free: "mongodb" },
  db_mongo: { q: "product:MongoDB", free: "mongodb" },
  mongo_open: { q: '"MongoDB Server Information" port:27017 -authentication', free: "" },
  db_redis: { q: "product:Redis", free: "redis" },
  redis_open: { q: '"-ERR unknown command" "+PONG" port:6379', free: "" },
  db_mysql: { q: "product:MySQL", free: "mysql" },
  db_postgres: { q: "product:PostgreSQL", free: "postgresql" },
  elastic: { q: "product:Elastic port:9200", free: "elastic" },
  db_couchdb: { q: "product:CouchDB", free: "couchdb" },
  db_memcached: { q: "product:Memcached", free: "memcached" },
  // remote access
  acc_rdp: { q: "port:3389", free: "rdp" },
  ssh: { q: "port:22", free: "openssh" },
  vnc: { q: '"authentication disabled" port:5900', free: "" },
  acc_telnet: { q: "port:23", free: "telnet" },
  telnet_root: { q: '"root@" port:23 -login -password', free: "" },
  acc_winbox: { q: "port:8291", free: "mikrotik" },
  acc_citrix: { q: '"Citrix Gateway"', free: "citrix" },
  acc_teamviewer: { q: "product:TeamViewer", free: "teamviewer" },
  // open files & shares
  indexof: { q: 'http.title:"Index of /"', free: "index of" },
  ftp: { q: '"230 Login successful" port:21', free: "ftp" },
  ftp_anon: { q: '"220" "230 Anonymous access granted" port:21', free: "" },
  files_smb: { q: "port:445", free: "samba" },
  files_rsync: { q: "port:873 Module", free: "rsync" },
  files_nfs: { q: "port:2049", free: "nfs" },
  files_ftp_dir: { q: 'port:21 "Directory"', free: "" },
  // devices & industrial
  printers: { q: "port:9100", free: "printer" },
  scada: { q: "port:502", free: "modbus" },
  dev_s7: { q: "port:102", free: "siemens" },
  dev_bacnet: { q: "port:47808", free: "bacnet" },
  dev_niagara: { q: '"Server: Niagara" port:80', free: "niagara" },
  dev_upnp: { q: "port:1900", free: "upnp" },
  dev_pihole: { q: '"dns" "Pi-hole"', free: "pi-hole" },
  dev_jenkins: { q: '"X-Jenkins"', free: "jenkins" },
  dev_docker: { q: '"Docker" port:2375', free: "" },
  // known vulnerabilities (audit your own)
  heartbleed: { q: "vuln:CVE-2014-0160", free: "" },
  vuln_bluekeep: { q: "vuln:CVE-2019-0708", free: "" },
  vuln_eternalblue: { q: "vuln:MS17-010", free: "" },
  vuln_log4shell: { q: "vuln:CVE-2021-44228", free: "" },
  vuln_proxyshell: { q: "vuln:CVE-2021-34473", free: "" },
  vuln_spring4shell: { q: "vuln:CVE-2022-22965", free: "" },
};

export const CATEGORIES = [
  { id: "cameras", icon: "lucide:cctv", presets: ["camera", "cam_dahua", "cam_hik", "cam_axis", "cam_onvif", "cam_screenshot", "cam_webcamxp", "cam_yawcam"] },
  { id: "databases", icon: "lucide:database", presets: ["databases", "db_mongo", "mongo_open", "db_redis", "redis_open", "db_mysql", "db_postgres", "elastic", "db_couchdb", "db_memcached"] },
  { id: "access", icon: "lucide:monitor", presets: ["acc_rdp", "ssh", "vnc", "acc_telnet", "telnet_root", "acc_winbox", "acc_citrix", "acc_teamviewer"] },
  { id: "files", icon: "lucide:folder-open", presets: ["indexof", "ftp", "ftp_anon", "files_smb", "files_rsync", "files_nfs", "files_ftp_dir"] },
  { id: "devices", icon: "lucide:printer", presets: ["printers", "scada", "dev_s7", "dev_bacnet", "dev_niagara", "dev_upnp", "dev_pihole", "dev_jenkins", "dev_docker"] },
  { id: "vulnerable", icon: "lucide:shield-alert", presets: ["heartbleed", "vuln_bluekeep", "vuln_eternalblue", "vuln_log4shell", "vuln_proxyshell", "vuln_spring4shell"] },
];

export const PRESETS = Object.fromEntries(Object.entries(PRESET).map(([k, v]) => [k, v.q]));

/** The Shodan query for a preset, with the country appended when one is chosen. Pure. */
export function presetQuery(preset, cc) {
  const base = PRESET[preset]?.q;
  if (!base) return "";
  return cc && cc !== "all" ? `${base} country:${cc}` : base;
}

/** The plain-text term a preset searches by on the free tier, or "" when it has none (needs credits). Pure. */
export function freeTerm(preset) { return PRESET[preset]?.free || ""; }

export const FREE = Object.fromEntries(Object.entries(PRESET).map(([k, v]) => [k, v.free]));

const FILTER_TOKENS = ["port:", "product:", "http.title:", "http.html:", "hostname:", "net:", "org:", "asn:", "country:", "city:", "ssl:", "vuln:", "os:", "tag:", "has_screenshot:", "screenshot.label:"];
const isIPv4 = (s) => { const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s); return !!m && m.slice(1).every((o) => Number(o) >= 0 && Number(o) <= 255 && String(Number(o)) === o.replace(/^0+(?=\d)/, "")); };
const isIPv6 = (s) => s.indexOf(":") !== -1 && /^[0-9a-fA-F:]+$/.test(s) && (s.split(":").length >= 3 || s.includes("::"));

export function parseQuery(input, cc) {
  const raw = (input == null ? "" : String(input)).trim();
  const country = (cc && cc !== "all" ? cc : "").trim();
  const lower = raw.toLowerCase();
  if (!raw) return { query: "", mode: "empty" };
  if (isIPv4(raw) || isIPv6(raw)) return { query: `ip:"${raw}"`, mode: "host" };
  if (FILTER_TOKENS.some((tk) => lower.includes(tk))) return { query: country && !lower.includes("country:") ? `${raw} country:${country}` : raw, mode: "raw" };
  if (raw.indexOf(".") !== -1 && !/\s/.test(raw)) return { query: `hostname:"${raw}"`, mode: "domain" };
  return { query: country ? `${raw} country:${country}` : raw, mode: "text" };
}

export const COUNTRIES = ["", "UA", "US", "DE", "GB", "FR", "PL", "NL", "RU", "CN", "JP", "CA", "BR", "IN", "KR", "IT", "ES", "SE", "CH", "AU", "TR", "IL", "SG", "AE", "CZ", "RO", "FI", "NO", "DK", "KP"];

export const KIND_OF = (() => {
  const m = {};
  const kind = { cameras: "camera", databases: "database", access: "access", files: "files", devices: "device", vulnerable: "vuln" };
  for (const c of CATEGORIES) for (const p of c.presets) m[p] = kind[c.id];
  return m;
})();
