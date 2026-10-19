# SmartMow Website

React + Vite control center for the DANA autonomous mower. The **Remote Control**
page drives the mower's wheels through an Arduino GIGA R1 WiFi running the
`giga_r1_m7_web` env of the mower firmware
([dana-mower-firmware](https://github.com/Shivom2110/dana-mower-firmware),
`firmware/arduino/src/web_control.cpp`). The dashboard battery value, the lawn
map, and the schedule are still demo content.

## How it fits together

```text
browser ──> Vite dev server (/mower proxy) ──Wi-Fi──> GIGA ──CAN──> TM4 inverter ──> motor
```

- `src/useMower.js`: talks to the GIGA's JSON API (status, arm, drive, stop, disarm).
- `src/main.jsx`: the app. The Remote Control page uses `useMower` for hold-to-drive.
- `vite.config.js`: forwards `/mower/*` to the GIGA, so the browser only talks to
  `localhost` and is not blocked by cross-origin or local-network restrictions.

## 1. Flash the GIGA

In the firmware repo, put the Wi-Fi credentials in
`firmware/arduino/src/web_secrets.h` (git-ignored):

```c
#pragma once
#define WEB_WIFI_AP_MODE false
#define WEB_STA_SSID "your-hotspot-name"
#define WEB_STA_PASS "your-hotspot-password"
```

A phone hotspot works well. On iPhone, turn on **Maximize Compatibility**, because
the GIGA only supports 2.4 GHz. Then, from `firmware/arduino`:

```sh
pio run -e giga_r1_m7_web -t upload
pio device monitor -b 115200
```

The serial monitor prints the GIGA's address, for example
`Website API: http://172.20.10.13/status`.

## 2. Run the website

1. Install Node.js LTS from https://nodejs.org if needed.
2. Run `npm install`.
3. Connect the laptop to the same Wi-Fi network as the GIGA.
4. Start the dev server with the GIGA's address:
   ```sh
   MOWER_URL=http://172.20.10.13 npm run dev
   ```
   Without `MOWER_URL`, it uses `http://172.20.10.13`.
5. Open the local URL Vite prints (typically http://localhost:5173) and go to
   **Remote Control**. Leave **Mower address** set to `/mower`.

## 3. Drive

1. **Arm controls** requests Power Ready (the contactor closes). The motors stay off.
2. Set **Maximum speed**. 100% is the firmware's `TM4_DRIVE_MAX_RPM` (200 rpm).
3. **Hold** an arrow to drive. Forward and reverse run both wheels; left and right
   spin them in opposite directions. Only inverters marked `present` in the
   firmware's `tm4_config.h` move.
4. Release to stop. The centre square sends a graceful stop and stays armed.
   **Stop / Disarm** turns the motors off immediately and drops Power Ready.

The wheels also stop if:

- the website stops sending commands for 500 ms (closed or hidden tab, lost Wi-Fi);
- CAN health is lost while armed (re-arm to continue).

The deck (blade) motors are never run from the website.

## Safety

The web-control firmware ignores the ignition, deck-switch, and E-stop inputs,
like the bench tool. **The physical E-stop must cut inverter power independently
and must always be within reach.** The browser Stop button is not an emergency stop.

## API (for testing with curl)

All requests are `GET` and return JSON status:

| Path | Effect |
| --- | --- |
| `/status` | telemetry: armed, CAN health, per-inverter rpm/phase/fault/DC voltage |
| `/arm` | request Power Ready, motors off |
| `/drive?l=0.3&r=0.3` | wheel commands from -1 to 1; repeat within 500 ms |
| `/stop` | ramp to 0 rpm and stop, stay armed |
| `/disarm` | motors off immediately, request Startup |
