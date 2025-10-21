---
title: AI Control Tower Integration
---

# Connect WLED to an AI Control Tower

AI Control Tower (ACT) style automations orchestrate tasks by calling external APIs. WLED already exposes a rich [HTTP](/interfaces/http-api) and [JSON](/interfaces/json-api) interface, so you can let ACT scenarios steer your lights without custom firmware builds or plug-ins. This page explains the core concepts and highlights the minimum configuration needed so your automations can change colors, trigger presets, or gather device status in real time.

## Prerequisites

- A working WLED controller running 0.14.0 or newer and joined to the same network as your automation server.
- AI Control Tower (or a comparable orchestration stack) with access to WLED over HTTP(s) or MQTT.
- Optional: an MQTT broker if you prefer event-driven updates.

## 1. Map your WLED devices inside ACT

1. Give each WLED device a friendly name in **Config → WiFi Setup** so ACT dashboards can surface descriptive labels.
2. Record the device IP address or mDNS hostname (`wled-<mac>.local`).
3. Store basic metadata (segment counts, preset IDs, favorite effects) in your ACT inventory so flows can reference them without additional lookups.

!!! tip "Use WLED's JSON device info endpoint"
    The `/json/info` endpoint returns model, LED counts, power consumption data, and segment details. Capture this during asset onboarding to keep your ACT catalog accurate.

## 2. Trigger scenes with HTTP requests

Most ACT platforms can call REST endpoints. WLED accepts HTTP `GET` or `POST` requests, so you can create lightweight automations without scripting on the controller.

```http
POST http://<wled-ip>/json/state
Content-Type: application/json

{"on":true,"bri":192,"seg":[{"id":0,"fx":42,"pal":9}]}
```

Key ideas:

- `on`: toggles the power relay.
- `bri`: sets brightness (`0-255`).
- `seg`: targets specific segments. Here we select effect 42 (Rainbow Runner) and palette 9 (Party). Adjust values to match your presets.
- Presets can be recalled by sending `{"ps": <preset-id>}`. Use this when ACT wants to trigger complex multi-segment looks with a single command.

!!! warning "Avoid blocking flows"
    WLED replies immediately, but long-running ACT actions should still add timeouts and retries. If the controller is offline, queue the scene change and notify your operators instead of blocking the entire workflow.

## 3. Poll or subscribe to state changes

- **HTTP polling:** `GET /json/state` returns the current color, brightness, segment list, and playlist data. Poll sparingly (e.g., every 5–10 seconds) to avoid clogging your Wi-Fi network.
- **MQTT telemetry:** Enable MQTT in **Config → Sync Interfaces** and point WLED at your broker. ACT can subscribe to `<wled-topic>/g` for the JSON state payload every time something changes. Pair this with command topics (`<wled-topic>/c`) for bidirectional control.

## 4. Chain ACT skills together

Combine WLED automations with your other ACT connectors:

- Trigger a calming preset when environmental sensors report high noise levels.
- Run bright white scenes for maintenance tickets and roll back to the previous preset after completion.
- Push visual alerts that mirror incident severity from ticketing or monitoring tools.

Store reusable routines as ACT "skills" so operators can trigger them from a chatbot, UI button, or scheduled workflow.

## 5. Troubleshooting checklist

- Confirm ACT can resolve the WLED hostname and reach port 80 (or your custom HTTPS proxy).
- If commands silently fail, inspect the ACT logs for HTTP 401/403 errors—these usually point to captive portals or firewall restrictions.
- Use WLED's **Config → Security** page to set an admin password if your ACT instance spans multiple tenants.
- For MQTT issues, verify the broker topic prefix matches what ACT expects and that retained messages are disabled unless you need persistent states.

With these practices in place, AI Control Tower orchestrations can reliably steer your WLED installations, unlocking adaptive lighting scenarios driven by the rest of your automation stack.
