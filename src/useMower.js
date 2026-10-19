import {useCallback, useEffect, useRef, useState} from 'react';

// useMower: React hook that connects the website to the Arduino GIGA running
// the web-control firmware (dana-mower-firmware, PlatformIO env giga_r1_m7_web).
//
// The GIGA serves a small JSON API:
//   /status  telemetry (armed, CAN health, per-inverter rpm/phase/fault/voltage)
//   /arm     request Power Ready (inverter contactor closes, motors stay off)
//   /drive   ?l=<-1..1>&r=<-1..1> wheel commands, scaled by the firmware's max rpm
//   /stop    ramp the wheels to 0 and stop, stay armed
//   /disarm  motors off immediately, return to Startup
//
// Safety model: the firmware stops the wheels if /drive is not repeated within
// its timeout (500 ms), so the mower only moves while a button is held down.
// This hook re-sends /drive every DRIVE_MS while held and sends /stop on release.

// Where requests go. '/mower' goes through the Vite dev-server proxy
// (vite.config.js), which forwards to the GIGA; this avoids the browser's
// cross-origin and local-network blocking. A full http://<ip> address in the
// Mower address box talks to the GIGA directly instead.
const HOST_KEY = 'smartmow.host.v2';  // localStorage key for the address box
const DEFAULT_HOST = '/mower';
const POLL_MS = 1000;             // status refresh while idle
const DRIVE_MS = 100;             // /drive repeat rate while a button is held
const REQUEST_TIMEOUT_MS = 800;   // a slower reply counts as "not reachable"

// Address saved from a previous visit; localStorage can throw in private mode.
const loadHost = () => {
  try { return localStorage.getItem(HOST_KEY) || DEFAULT_HOST } catch { return DEFAULT_HOST }
};

// Wheel commands (left, right) for each D-pad direction at full speed.
// Left/right spin the wheels in opposite directions (skid-steer turn).
const DIRECTIONS = {Forward: [1, 1], Reverse: [-1, -1], Left: [-1, 1], Right: [1, -1]};

// speedPct: the Remote Control page's "Maximum speed" slider (0-100).
export default function useMower(speedPct) {
  const [host, setHostState] = useState(loadHost);
  const [status, setStatus] = useState(null);   // last /status JSON, null = offline
  const [error, setError] = useState('');       // firmware or network error text
  const speedRef = useRef(speedPct);            // read by the drive timer
  const driveTimer = useRef(null);              // set while a button is held
  const driveBusy = useRef(false);              // one /drive in flight at a time
  speedRef.current = speedPct;

  // Sends one GET request and stores the returned status. Any failure (timeout,
  // network error, bad JSON) marks the mower offline.
  const call = useCallback(async (path) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(host.replace(/\/+$/, '') + path, {cache: 'no-store', signal: ctrl.signal});
      const json = await res.json();
      if (json.inverters) setStatus(json);
      setError(json.error || '');
      return json;
    } catch (e) {
      setStatus(null);
      setError('Mower not reachable at ' + (host === DEFAULT_HOST ? 'proxy ' + host : host));
      return null;
    } finally {
      clearTimeout(t);
    }
  }, [host]);

  // Poll /status once a second; skipped while driving, since every /drive
  // reply already carries the full status.
  useEffect(() => {
    call('/status');
    const id = setInterval(() => { if (!driveTimer.current) call('/status') }, POLL_MS);
    return () => clearInterval(id);
  }, [call]);

  // One /drive request at the current slider speed. Skipped if the previous
  // one has not answered yet, so slow Wi-Fi cannot queue up stale commands.
  const sendDrive = useCallback(async (dir) => {
    if (driveBusy.current) return;
    driveBusy.current = true;
    const s = speedRef.current / 100;
    const [l, r] = DIRECTIONS[dir];
    await call(`/drive?l=${(l * s).toFixed(3)}&r=${(r * s).toFixed(3)}`);
    driveBusy.current = false;
  }, [call]);

  // Button released: stop repeating /drive and ask for a graceful stop.
  const release = useCallback(() => {
    if (!driveTimer.current) return;
    clearInterval(driveTimer.current);
    driveTimer.current = null;
    call('/stop');
  }, [call]);

  // Button pressed: send /drive now, then every DRIVE_MS until release().
  const press = useCallback((dir) => {
    release();
    sendDrive(dir);
    driveTimer.current = setInterval(() => sendDrive(dir), DRIVE_MS);
  }, [release, sendDrive]);

  // Losing focus or hiding the tab while holding a button must stop the mower.
  useEffect(() => {
    const onHide = () => release();
    window.addEventListener('blur', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('blur', onHide);
      document.removeEventListener('visibilitychange', onHide);
      release();
    };
  }, [release]);

  // Address box changes are remembered for the next visit.
  const setHost = (h) => {
    setHostState(h);
    try { localStorage.setItem(HOST_KEY, h) } catch {}
  };

  return {
    host, setHost, status, error,
    online: !!status,
    armed: !!status?.armed,
    maxRpm: status?.maxRpm ?? 200,   // firmware's TM4_DRIVE_MAX_RPM (100% speed)
    arm: () => call('/arm'),
    disarm: () => { release(); return call('/disarm') },
    stop: () => { release(); return call('/stop') },
    press, release,
  };
}
