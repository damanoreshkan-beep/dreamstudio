# moto — research (2026-10-02)

A motorcycle speedometer for a phone on the bars. Browser only: Geolocation, DeviceMotion, Wake Lock.
Math lives in `rt/ride.js` (`rt/tests/ride_test.js`); the raw sensor is `motion` in the core's `sensors.js`.

## Lean angle — the trap and the recipe

In a coordinated turn the apparent gravity stays on the bike's own vertical, so a gravity-only tilt reads ~0°
however far the bike leans (the unit test asserts exactly that at 40°). What is observable instead:

- **Kinematics**: `sin φ = v · ω / g`, ω the yaw rate about the BIKE's vertical axis (gyro), v the GPS speed.
  Source: US8260505B2 (the same relation with the world yaw rate is `tan φ = v · ψ̇ / g`).
- **Gyro roll rate** integrated for the short term (roll-in, flick), relaxed to a reference with τ = 1.5 s:
  the kinematic angle above 15 km/h, the gravity angle below 10 km/h, hysteresis between.
- Clamp ±65°. A record needs speed > 15 km/h and ~0.3 s of hold; a corner is |φ| > 15° for 1.5 s.

Device frame (W3C Device Orientation spec, verified against Chromium's `device_motion_event_pump.cc`):
`rotationRate.alpha/beta/gamma` are deg/s about the device X/Y/Z; the frame does not turn with the screen.
`accelerationIncludingGravity` at rest is +9.8 on the up axis per spec and on Android, −9.8 on iOS.

**No calibration button.** `mountFrame` takes one gravity sample: "up" is the gravity axis on the side of
(screen-top + screen-normal), because a readable screen faces the rider — that settles the platform sign with
no sniffing; "forward" is the level part of (screen-top − screen-normal). A start on the side stand is ~10°
off; riding straight above 30 km/h for a second re-levels "up" (τ = 3 s). Gyro bias is learned at a stop.

## Speed, distance, stops

- `coords.speed` (Doppler, ~0.1 m/s) when present; position delta only with both fixes ≤ 20 m. Below 0.6 m/s is
  noise and reads 0. Display = EMA 0.5; the needle sweeps on a 1 s linear CSS transition, no rAF loop.
- Distance = ∫ speed dt while moving, never a sum of position deltas (position wanders at a red light).
  Moving above 5 km/h, stopped after 3 s below 3 km/h.
- A gap of 5–120 s (tunnel) is credited as the straight line if ≥ 30 m and ≤ 70 m/s; a longer one is a locked
  phone and credits nothing. No fix for 5 s → the face shows dashes, not the last number.
- Top speed is capped at +12 m/s² per fix so one bad fix cannot set a record.
- 0–100: armed at a standstill, starts at the interpolated 3 km/h crossing, ends at the interpolated 100 km/h
  crossing; ±0.5 s at 1 Hz, shown to one decimal. Backing off 20% cancels the run.

## What the platform cannot do

- `watchPosition` stops when the screen locks; the wake lock is what keeps a ride alive (iOS: tab 16.4+,
  installed PWA 18.4+). The day is saved every 15 s and on `visibilitychange`.
- `navigator.vibrate` does not exist on iOS and is not felt on a handlebar: the alert is the flashing frame.
- iOS grants motion only inside a tap, so `motion.request()` is the first statement of `start()`.
- Handlebar vibration can damage camera OIS (Apple's own warning) — the one-time notice before the first ride.

## Layout

One fit screen; every face is an SVG that scales to the stage. In split-screen/landscape the stage takes
`clamp(38%, 100% − 16rem, 56%)` (`--ms-side-stage`) and the three readouts become rows under 20rem.
Skins: classic (needle), sport (arc), lcd (seven-segment), hud (black face, amber ink, any theme).
