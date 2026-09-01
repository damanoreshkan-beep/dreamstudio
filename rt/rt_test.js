// DreamStudio rt/ — the unit-test BARREL for the PRODUCT's runtime modules (the domain half of what used to
// be packages/runtime: tide, astrology, the RF families, instruments, characters…). Same shape as the
// framework's packages/runtime/runtime_test.js; the 8n8 `unit` node runs BOTH barrels when rt/ exists.
// Core modules these tests reach (./audio.js, ./fmradio.js → …) resolve through the symlinks setup.sh
// plants beside the real files — rt/ is a complete mirror of the runtime, half real, half linked.
//   deno test -A rt/rt_test.js
import "./tests/acts_test.js";
import "./tests/air_test.js";
import "./tests/ambient_test.js";
import "./tests/aspects_test.js";
import "./tests/audience_test.js";
import "./tests/bandplan_test.js";
import "./tests/birth_test.js";
import "./tests/blesend_test.js";
import "./tests/blesig_test.js";
import "./tests/burst_test.js";
import "./tests/chan433_test.js";
import "./tests/chat_test.js";
import "./tests/chroma_test.js";
import "./tests/codebreak_test.js";
import "./tests/ctcss_test.js";
import "./tests/demod_test.js";
import "./tests/df_test.js";
import "./tests/earn_test.js";
import "./tests/earshot_test.js";
import "./tests/fmradio_test.js";
import "./tests/grain_test.js";
import "./tests/gsmband_test.js";
import "./tests/hackrf_test.js";
import "./tests/horoscope_test.js";
import "./tests/hunt_test.js";
import "./tests/iching_test.js";
import "./tests/ism433_test.js";
import "./tests/langid_test.js";
import "./tests/lora_test.js";
import "./tests/motion_test.js";
import "./tests/natal_test.js";
import "./tests/ook_test.js";
import "./tests/oui_test.js";
import "./tests/pendulum_test.js";
import "./tests/pinterest_test.js";
import "./tests/places_test.js";
import "./tests/portid_test.js";
import "./tests/pwned_test.js";
import "./tests/radar_test.js";
import "./tests/rds_test.js";
import "./tests/ripple_test.js";
import "./tests/rtlsdr_test.js";
import "./tests/scan433_test.js";
import "./tests/scifi_test.js";
import "./tests/sigil_test.js";
import "./tests/signif_test.js";
import "./tests/sonar_test.js";
import "./tests/swarm_test.js";
import "./tests/sweep_test.js";
import "./tests/sync_test.js";
import "./tests/synastry_test.js";
import "./tests/tarot_test.js";
import "./tests/tide_test.js";
import "./tests/trace_test.js";
import "./tests/underrated_test.js";
import "./tests/urlsafe_test.js";
import "./tests/v2m_test.js";
import "./tests/wind_test.js";
import "./tests/wish_test.js";
import "./tests/theme_test.js";
