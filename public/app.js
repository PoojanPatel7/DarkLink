// ============================================================
// DarkLink — 60 FPS Hardware WebCodecs Engine & Android Controls
// ============================================================

(function () {
  // DOM Elements
  const statusBadge = document.getElementById("statusBadge");
  const statusText = document.getElementById("statusText");
  const fpsCounter = document.getElementById("fpsCounter");
  const latencyCounter = document.getElementById("latencyCounter");
  const stealthIndicator = document.getElementById("stealthIndicator");
  const lockBadge = document.getElementById("lockBadge");
  const lockStatusText = document.getElementById("lockStatusText");
  const standbyScreen = document.getElementById("standbyScreen");
  const screenCanvas = document.getElementById("screenCanvas");
  const screenViewport = document.getElementById("screenViewport");
  const phoneChassis = document.getElementById("phoneChassis");
  const touchRipple = document.getElementById("touchRipple");

  // Screen Bottom Navigation Bar Elements (Completely OUT of the screen canvas)
  const navBtnBack = document.getElementById("navBtnBack");
  const navBtnHome = document.getElementById("navBtnHome");
  const navBtnRecents = document.getElementById("navBtnRecents");
  const navBtnPower = document.getElementById("navBtnPower");
  const navBtnUnlock = document.getElementById("navBtnUnlock");

  // Header Actions & Stealth Controls
  const btnToggleDarkScreen = document.getElementById("btnToggleDarkScreen");
  const darkScreenText = document.getElementById("darkScreenText");
  const btnRemoteUnlock = document.getElementById("btnRemoteUnlock");
  const btnDeviceList = document.getElementById("btnDeviceList");
  const deviceCountLabel = document.getElementById("deviceCountLabel");

  // Side Dock Buttons
  const btnPower = document.getElementById("btnPower");
  const btnSwipeUnlock = document.getElementById("btnSwipeUnlock");
  const btnUnlockShortcut = document.getElementById("btnUnlockShortcut");
  const btnBack = document.getElementById("btnBack");
  const btnHome = document.getElementById("btnHome");
  const btnRecents = document.getElementById("btnRecents");
  const btnNotifications = document.getElementById("btnNotifications");
  const btnQuickSettings = document.getElementById("btnQuickSettings");
  const btnVolumeUp = document.getElementById("btnVolumeUp");
  const btnVolumeDown = document.getElementById("btnVolumeDown");
  const btnToggleStealth = document.getElementById("btnToggleStealth");
  const btnSystemLock = document.getElementById("btnSystemLock");

  // View Zoom & Floating PiP Controls
  const btnZoomOut = document.getElementById("btnZoomOut");
  const btnZoomIn = document.getElementById("btnZoomIn");
  const zoomLevelDisplay = document.getElementById("zoomLevelDisplay");
  const btnFitScreen = document.getElementById("btnFitScreen");
  const btnFloatingPiP = document.getElementById("btnFloatingPiP");

  // Modals & Banners
  const qrModal = document.getElementById("qrModal");
  const btnOpenQr = document.getElementById("btnOpenQr");
  const btnScanPairPrompt = document.getElementById("btnScanPairPrompt");
  const btnCloseModal = document.getElementById("btnCloseModal");
  const qrImage = document.getElementById("qrImage");
  const qrLoading = document.getElementById("qrLoading");
  const metaIp = document.getElementById("metaIp");
  const metaWs = document.getElementById("metaWs");
  const secureAppBanner = document.getElementById("secureAppBanner");
  const btnDismissSecure = document.getElementById("btnDismissSecure");

  // Remote PIN Unlock Modal Elements
  const unlockModal = document.getElementById("unlockModal");
  const btnCloseUnlockModal = document.getElementById("btnCloseUnlockModal");
  const remotePinInput = document.getElementById("remotePinInput");
  const btnPinClear = document.getElementById("btnPinClear");
  const btnPinSwipeOnly = document.getElementById("btnPinSwipeOnly");
  const btnPinSubmit = document.getElementById("btnPinSubmit");

  // Device Switcher Modal Elements
  const deviceModal = document.getElementById("deviceModal");
  const btnCloseDeviceModal = document.getElementById("btnCloseDeviceModal");
  const deviceListContainer = document.getElementById("deviceListContainer");

  // Tamper Alert Toast Elements
  const tamperToast = document.getElementById("tamperToast");
  const tamperMessage = document.getElementById("tamperMessage");
  const btnCloseTamperToast = document.getElementById("btnCloseTamperToast");

  const ctx = screenCanvas.getContext("2d", { alpha: false, desynchronized: true });

  let ws = null;
  let isConnected = false;
  let isPhoneOnline = false;
  let isStealthMode = false;
  let isPhoneLocked = false;
  let currentZoom = 1.0;
  let pipWindow = null;

  // Multi-Device state
  let activeDeviceId = null;
  let onlineDevices = [];
  let savedFirestoreDevices = [];

  // Touch tracking state
  let isPointerDown = false;
  let lastX = 0;
  let lastY = 0;

  // FPS calculation
  let frameCount = 0;
  let lastFpsUpdate = performance.now();

  // Ping tracking
  let pingInterval = null;

  // WebCodecs H.264 VideoDecoder state
  let videoDecoder = null;
  let isDecoderConfigured = false;
  let ptsTimestamp = 0;
  const isWebCodecsSupported = typeof window.VideoDecoder === "function";


  // 1. Initialize WebCodecs Hardware H.264 VideoDecoder (60 FPS)
  function setupVideoDecoder() {
    if (!isWebCodecsSupported) {
      console.warn("[DarkLink] WebCodecs not supported. Falling back to ImageBitmap.");
      return;
    }

    try {
      if (videoDecoder && videoDecoder.state !== "closed") {
        videoDecoder.close();
      }

      videoDecoder = new VideoDecoder({
        output: (videoFrame) => {
          if (!isPhoneOnline) updatePhoneStatus(true);

          if (screenCanvas.width !== videoFrame.displayWidth || screenCanvas.height !== videoFrame.displayHeight) {
            screenCanvas.width = videoFrame.displayWidth;
            screenCanvas.height = videoFrame.displayHeight;
            const aspect = videoFrame.displayWidth / videoFrame.displayHeight;
            phoneChassis.style.aspectRatio = `${aspect}`;
          }

          // Hardware accelerated draw
          ctx.drawImage(videoFrame, 0, 0, screenCanvas.width, screenCanvas.height);
          videoFrame.close();
          onFrameRendered();
        },
        error: (err) => {
          console.error("[DarkLink] VideoDecoder error:", err);
          isDecoderConfigured = false;
        }
      });

      videoDecoder.configure({
        codec: "avc1.420028", // H.264 Baseline Profile Level 4.0
        hardwareAcceleration: "prefer-hardware",
        optimizeForLatency: true
      });
      isDecoderConfigured = true;
      console.log("[DarkLink] WebCodecs Hardware 60 FPS VideoDecoder initialized!");
    } catch (e) {
      console.error("[DarkLink] Failed to configure WebCodecs:", e);
      isDecoderConfigured = false;
    }
  }

  function onFrameRendered() {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsUpdate >= 1000) {
      fpsCounter.textContent = frameCount;
      frameCount = 0;
      lastFpsUpdate = now;
    }
  }

  // 2. Fetch Network Pairing Info
  async function loadConnectionInfo() {
    try {
      const user = window.DarkLinkAuth ? window.DarkLinkAuth.getUser() : null;
      const uidQuery = user ? `?uid=${encodeURIComponent(user.uid)}` : "";
      const res = await fetch(`/api/info${uidQuery}`);
      const data = await res.json();
      if (data.success) {
        metaIp.textContent = data.ip + ":" + data.port;
        metaWs.textContent = data.wsUrl;
        if (data.qrDataUrl) {
          qrImage.src = data.qrDataUrl;
          qrImage.style.display = "block";
          qrLoading.style.display = "none";
        }
      }
    } catch (err) {
      console.error("Failed to load connection info:", err);
    }
  }

  // 3. Connect to WebSocket Relay Server
  function initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?role=browser`;

    ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      console.log("[DarkLink] Connected to PC WebSocket Server");
      isConnected = true;
      startPingHeartbeat();
      setupVideoDecoder();
      sendToPhone({ type: "request_keyframe" });
    };

    ws.onmessage = async (event) => {
      if (event.data instanceof ArrayBuffer) {
        handleBinaryFrame(new Uint8Array(event.data));
      } else {
        try {
          const msg = JSON.parse(event.data);
          handleServerMessage(msg);
        } catch (e) {
          console.warn("[DarkLink] Message:", event.data);
        }
      }
    };

    ws.onclose = () => {
      console.warn("[DarkLink] WebSocket disconnected. Reconnecting in 2s...");
      isConnected = false;
      updatePhoneStatus(false);
      stopPingHeartbeat();
      setTimeout(initWebSocket, 2000);
    };

    ws.onerror = (err) => {
      console.error("[DarkLink] WebSocket error:", err);
    };
  }

  // 4. Handle Incoming H.264 Chunk (or JPEG fallback)
  function handleBinaryFrame(bytes) {
    if (!bytes || bytes.length === 0) return;

    // Check for JPEG SOI marker (0xFF, 0xD8)
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
      const blob = new Blob([bytes], { type: "image/jpeg" });
      createImageBitmap(blob).then((bmp) => {
        if (!isPhoneOnline) updatePhoneStatus(true);
        if (screenCanvas.width !== bmp.width || screenCanvas.height !== bmp.height) {
          screenCanvas.width = bmp.width;
          screenCanvas.height = bmp.height;
          phoneChassis.style.aspectRatio = `${bmp.width / bmp.height}`;
        }
        ctx.drawImage(bmp, 0, 0);
        bmp.close();
        onFrameRendered();
      }).catch(console.error);
      return;
    }

    // Hardware H.264 decoding with WebCodecs
    if (isDecoderConfigured && videoDecoder && videoDecoder.state === "configured") {
      try {
        // Detect NAL unit type: 5 = IDR (keyframe), 7 = SPS, 8 = PPS
        let isKey = false;
        for (let i = 0; i < Math.min(bytes.length - 4, 48); i++) {
          if (bytes[i] === 0 && bytes[i + 1] === 0 && ((bytes[i + 2] === 0 && bytes[i + 3] === 1) || bytes[i + 2] === 1)) {
            const nalByte = bytes[i + 2] === 1 ? bytes[i + 3] : bytes[i + 4];
            const nalType = nalByte & 0x1F;
            if (nalType === 5 || nalType === 7 || nalType === 8) {
              isKey = true;
              break;
            }
          }
        }

        ptsTimestamp += 16666; // 16.6ms for 60 FPS
        const chunk = new EncodedVideoChunk({
          type: isKey ? "key" : "delta",
          timestamp: ptsTimestamp,
          data: bytes
        });
        videoDecoder.decode(chunk);
      } catch (err) {
        console.error("Decode chunk error:", err);
      }
    }
  }

  // 5. Handle Server Text Messages
  const bankKeywords = [
    "bank", "pay", "upi", "wallet", "credit", "chase", "citi", "wellsfargo",
    "bofa", "paisa", "gpay", "phonepe", "paytm", "sbi", "hdfc", "icici",
    "axis", "kotak", "cred", "secure", "authenticator", "pass", "vault"
  ];

  if (btnDismissSecure && secureAppBanner) {
    btnDismissSecure.addEventListener("click", () => {
      secureAppBanner.classList.add("hidden");
    });
  }

  function handleWindowChange(pkg) {
    if (!pkg || !secureAppBanner) return;
    const lower = pkg.toLowerCase();
    const isBank = bankKeywords.some(k => lower.includes(k));
    if (isBank) {
      secureAppBanner.classList.remove("hidden");
    } else {
      secureAppBanner.classList.add("hidden");
    }
  }

  function handleServerMessage(msg) {
    if (msg.type === "status") {
      updatePhoneStatus(msg.connected);
      if (msg.deviceId && !activeDeviceId) {
        activeDeviceId = msg.deviceId;
      }
      if (msg.deviceInfo) {
        statusText.textContent = `Streaming: ${msg.deviceInfo.manufacturer || ""} ${msg.deviceInfo.model || "Phone"}`.trim();
      }
      if (msg.lockState) {
        updateLockState(msg.lockState.locked, msg.lockState.screenOn);
      }
      if (msg.stealthState !== undefined) {
        setStealthUI(msg.stealthState);
      }
    } else if (msg.type === "devices_updated") {
      onlineDevices = msg.devices || [];
      if (!activeDeviceId && onlineDevices.length > 0) {
        activeDeviceId = onlineDevices[0].id;
        statusText.textContent = `Streaming: ${onlineDevices[0].model || "Phone"}`;
      }
      updateDeviceCount();
      renderDevicesList();

      // Automatically register connected devices to Firestore under the user's account
      if (window.DarkLinkAuth && window.DarkLinkAuth.getUser()) {
        const user = window.DarkLinkAuth.getUser();
        onlineDevices.forEach((dev) => {
          window.DarkLinkAuth.registerDevice(dev.id, {
            id: dev.id,
            model: dev.model,
            width: dev.width,
            height: dev.height,
            userEmail: user.email
          });
        });
      }
    } else if (msg.type === "device_selected") {
      activeDeviceId = msg.deviceId;
      const target = onlineDevices.find(d => d.id === msg.deviceId);
      if (target && statusText) {
        statusText.textContent = `Streaming: ${target.model || "Phone"}`;
      }
      renderDevicesList();
    } else if (msg.type === "lock_state") {
      updateLockState(msg.locked, msg.screenOn);
    } else if (msg.type === "stealth_state") {
      setStealthUI(msg.enabled);
    } else if (msg.type === "tamper_alert") {
      showTamperAlert(msg.reason);
    } else if (msg.type === "pong") {
      const rtt = Math.round(performance.now() - msg.timestamp);
      latencyCounter.textContent = `${rtt} ms`;
    } else if (msg.type === "window_change") {
      handleWindowChange(msg.package);
    }
  }

  function updateLockState(locked, screenOn) {
    isPhoneLocked = !!locked;
    if (lockBadge && lockStatusText) {
      if (locked) {
        lockBadge.classList.add("locked");
        lockStatusText.textContent = "Locked";
      } else {
        lockBadge.classList.remove("locked");
        lockStatusText.textContent = "Unlocked";
      }
    }
    if (screenOn === false) {
      console.log("[DarkLink] Phone display reported asleep / off.");
    }
  }

  function showTamperAlert(reason) {
    if (!tamperToast) return;
    if (tamperMessage) {
      tamperMessage.textContent = reason || "Physical touch detected on phone screen at home! Phone locked.";
    }
    tamperToast.classList.remove("hidden");
    setTimeout(() => {
      tamperToast.classList.add("hidden");
    }, 8000);
  }

  function updatePhoneStatus(online) {
    isPhoneOnline = online;
    if (online) {
      statusBadge.classList.remove("offline");
      statusBadge.classList.add("online");
      statusText.textContent = "Phone Connected (60 FPS)";
      standbyScreen.classList.add("hidden");
    } else {
      statusBadge.classList.remove("online");
      statusBadge.classList.add("offline");
      statusText.textContent = "Waiting for Phone...";
      standbyScreen.classList.remove("hidden");
      fpsCounter.textContent = "0";
      latencyCounter.textContent = "-- ms";
    }
  }

  function startPingHeartbeat() {
    stopPingHeartbeat();
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping", timestamp: performance.now() }));
      }
    }, 2000);
  }

  function stopPingHeartbeat() {
    if (pingInterval) clearInterval(pingInterval);
  }

  function sendToPhone(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // 6. Coordinates & Mouse Gestures
  function getNormalizedCoords(e) {
    const rect = screenCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  }

  function showTouchRipple(x, y) {
    touchRipple.style.left = `${x * 100}%`;
    touchRipple.style.top = `${y * 100}%`;
    touchRipple.classList.add("active");
    setTimeout(() => touchRipple.classList.remove("active"), 200);
  }

  screenCanvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    isPointerDown = true;
    const { x, y } = getNormalizedCoords(e);
    lastX = x;
    lastY = y;
    showTouchRipple(x, y);
    sendToPhone({ type: "touch", event: "down", x, y });
  });

  function onMouseMove(e) {
    if (!isPointerDown) return;
    const { x, y } = getNormalizedCoords(e);
    if (Math.hypot(x - lastX, y - lastY) > 0.002) {
      lastX = x;
      lastY = y;
      sendToPhone({ type: "touch", event: "move", x, y });
    }
  }

  function onMouseUp(e) {
    if (!isPointerDown) return;
    isPointerDown = false;
    const { x, y } = getNormalizedCoords(e);
    sendToPhone({ type: "touch", event: "up", x, y });
  }

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  // Right-click = Android Back
  screenCanvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    sendToPhone({ type: "key", key: "BACK" });
  });

  // Mouse wheel scroll
  screenCanvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const { x, y } = getNormalizedCoords(e);
    const direction = e.deltaY > 0 ? "SCROLL_DOWN" : "SCROLL_UP";
    sendToPhone({ type: "scroll", direction, x, y });
  }, { passive: false });

  // 7. Physical Keyboard & Universal Text / Paste Input Forwarding
  function handlePaste(e) {
    if (qrModal && !qrModal.classList.contains("hidden")) return;
    const text = e.clipboardData?.getData("text");
    if (text) {
      sendToPhone({ type: "text", text: text });
    }
  }

  window.addEventListener("paste", handlePaste);

  function handleGlobalKeyDown(e) {
    if (qrModal && !qrModal.classList.contains("hidden")) return;

    // Zoom shortcuts: Ctrl + '=', Ctrl + '-', Ctrl + '0'
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoom(currentZoom + 0.1);
        return;
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom(currentZoom - 0.1);
        return;
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1.0);
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      sendToPhone({ type: "key", key: "ENTER" });
    } else if (e.key === "Backspace") {
      e.preventDefault();
      sendToPhone({ type: "key", key: "BACKSPACE" });
    } else if (e.key === "Escape") {
      e.preventDefault();
      sendToPhone({ type: "key", key: "BACK" });
    } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      sendToPhone({ type: "text", text: e.key });
    }
  }

  window.addEventListener("keydown", handleGlobalKeyDown);

  // 8. Remote Screen Sizing & Zoom Adjustment
  function setZoom(scale) {
    currentZoom = Math.max(0.4, Math.min(1.6, Math.round(scale * 10) / 10));
    phoneChassis.style.setProperty("--phone-scale", currentZoom);
    if (zoomLevelDisplay) {
      zoomLevelDisplay.textContent = `${Math.round(currentZoom * 100)}%`;
    }
  }

  if (btnZoomIn) {
    btnZoomIn.addEventListener("click", () => setZoom(currentZoom + 0.1));
  }
  if (btnZoomOut) {
    btnZoomOut.addEventListener("click", () => setZoom(currentZoom - 0.1));
  }
  if (btnFitScreen) {
    btnFitScreen.addEventListener("click", () => {
      const workspace = document.querySelector(".workspace");
      if (workspace) {
        const availableHeight = workspace.clientHeight - 32;
        const targetHeight = 840;
        const optimal = Math.min(1.2, Math.max(0.5, availableHeight / targetHeight));
        setZoom(optimal);
      } else {
        setZoom(1.0);
      }
    });
  }

  // 9. Floating Always-On-Top Window (Document Picture-in-Picture)
  async function toggleFloatingPiP() {
    if (!("documentPictureInPicture" in window)) {
      alert("Floating View (Always on Top over Windows apps) requires Chrome or Edge browser (Document Picture-in-Picture API). Please open DarkLink in Google Chrome or Microsoft Edge.");
      return;
    }

    if (pipWindow) {
      pipWindow.close();
      return;
    }

    try {
      // Calculate exact phone aspect ratio
      const aspect = (screenCanvas && screenCanvas.width && screenCanvas.height)
        ? (screenCanvas.width / screenCanvas.height)
        : (9 / 19.5);

      const pipHeight = Math.min(window.screen.availHeight - 80, 780);
      const pipWidth = Math.round(pipHeight * aspect);

      pipWindow = await window.documentPictureInPicture.requestWindow({
        width: pipWidth,
        height: pipHeight,
      });

      // Clone all style sheets to PiP window
      [...document.styleSheets].forEach((sheet) => {
        try {
          const cssRules = [...sheet.cssRules].map((rule) => rule.cssText).join("");
          const style = pipWindow.document.createElement("style");
          style.textContent = cssRules;
          pipWindow.document.head.appendChild(style);
        } catch (e) {
          const link = pipWindow.document.createElement("link");
          link.rel = "stylesheet";
          link.type = sheet.type;
          link.media = sheet.media;
          link.href = sheet.href;
          pipWindow.document.head.appendChild(link);
        }
      });

      // Configure PiP window layout: pure borderless phone shape
      pipWindow.document.title = "DarkLink — Always on Top";
      pipWindow.document.body.classList.add("in-pip-mode");

      // Transfer phone screen container into PiP window
      const stage = document.querySelector(".workspace");
      pipWindow.document.body.appendChild(phoneChassis);

      // Wire full interactive navigation, gestures, typing & paste in floating window
      pipWindow.addEventListener("mousemove", onMouseMove);
      pipWindow.addEventListener("mouseup", onMouseUp);
      pipWindow.addEventListener("keydown", handleGlobalKeyDown);
      pipWindow.addEventListener("paste", handlePaste);

      // Update button UI state
      if (btnFloatingPiP) {
        btnFloatingPiP.classList.add("active");
        const span = btnFloatingPiP.querySelector("span");
        if (span) span.textContent = "Dock Back";
      }

      // Return phone screen to main window when PiP is closed
      pipWindow.addEventListener("pagehide", () => {
        if (stage && phoneChassis) {
          stage.insertBefore(phoneChassis, stage.firstChild);
        }
        if (btnFloatingPiP) {
          btnFloatingPiP.classList.remove("active");
          const span = btnFloatingPiP.querySelector("span");
          if (span) span.textContent = "Float on Top";
        }
        pipWindow = null;
      });

    } catch (err) {
      console.error("[DarkLink] Failed to create Document PiP:", err);
    }
  }

  if (btnFloatingPiP) {
    btnFloatingPiP.addEventListener("click", toggleFloatingPiP);
  }

  // 10. Remote Power / Screen Off (Stealth Lock)
  // Turns physical phone screen pitch black & powers down AMOLED,
  // while keeping PC mirror and remote controls 100% active and interactive.
  function triggerWakeOrLock() {
    isStealthMode = !isStealthMode;
    setStealthUI(isStealthMode);
    sendToPhone({ type: "stealth", enabled: isStealthMode });
    setTimeout(() => {
      sendToPhone({ type: "request_keyframe" });
    }, 200);
  }

  // 11. Remote Unlock: Wake screen & smooth Swipe Up to reveal PIN/Pattern
  function triggerSwipeUnlock() {
    sendToPhone({ type: "wake" });
    if (btnSwipeUnlock) {
      btnSwipeUnlock.style.transform = "scale(0.92)";
      setTimeout(() => { btnSwipeUnlock.style.transform = ""; }, 150);
    }

    setTimeout(() => {
      sendToPhone({ type: "unlock_swipe" });
      setTimeout(() => {
        sendToPhone({ type: "request_keyframe" });
      }, 350);
    }, 400);
  }

  // Bottom Navigation Bar Buttons (Docked below the screen, completely OUT of canvas)
  if (navBtnBack) {
    navBtnBack.addEventListener("click", (e) => {
      e.stopPropagation();
      sendToPhone({ type: "key", key: "BACK" });
    });
  }

  if (navBtnHome) {
    navBtnHome.addEventListener("click", (e) => {
      e.stopPropagation();
      sendToPhone({ type: "key", key: "HOME" });
    });
  }

  if (navBtnRecents) {
    navBtnRecents.addEventListener("click", (e) => {
      e.stopPropagation();
      sendToPhone({ type: "key", key: "RECENTS" });
    });
  }

  if (navBtnPower) {
    navBtnPower.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerWakeOrLock();
    });
  }

  if (navBtnUnlock) {
    navBtnUnlock.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerSwipeUnlock();
    });
  }

  // Side Dock Controls
  btnPower.addEventListener("click", triggerWakeOrLock);
  if (btnSystemLock) {
    btnSystemLock.addEventListener("click", () => {
      sendToPhone({ type: "lock" });
    });
  }
  btnSwipeUnlock.addEventListener("click", triggerSwipeUnlock);
  if (btnUnlockShortcut) {
    btnUnlockShortcut.addEventListener("click", triggerSwipeUnlock);
  }

  btnBack.addEventListener("click", () => sendToPhone({ type: "key", key: "BACK" }));
  btnHome.addEventListener("click", () => sendToPhone({ type: "key", key: "HOME" }));
  btnRecents.addEventListener("click", () => sendToPhone({ type: "key", key: "RECENTS" }));
  btnNotifications.addEventListener("click", () => sendToPhone({ type: "key", key: "NOTIFICATIONS" }));
  btnQuickSettings.addEventListener("click", () => sendToPhone({ type: "key", key: "QUICK_SETTINGS" }));
  btnVolumeUp.addEventListener("click", () => sendToPhone({ type: "key", key: "VOLUME_UP" }));
  btnVolumeDown.addEventListener("click", () => sendToPhone({ type: "key", key: "VOLUME_DOWN" }));

  // Stealth Mode Toggle (Blackout Phone Screen while retaining PC View)
  if (btnToggleStealth) {
    btnToggleStealth.addEventListener("click", () => {
      isStealthMode = !isStealthMode;
      setStealthUI(isStealthMode);
      sendToPhone({ type: "stealth", enabled: isStealthMode });
    });
  }

  if (stealthIndicator) {
    stealthIndicator.addEventListener("click", () => {
      isStealthMode = false;
      setStealthUI(false);
      sendToPhone({ type: "stealth", enabled: false });
    });
  }

  function setStealthUI(enabled) {
    isStealthMode = enabled;
    if (enabled) {
      if (stealthIndicator) stealthIndicator.classList.remove("hidden");
      if (btnToggleStealth) btnToggleStealth.classList.add("active");
      if (btnToggleDarkScreen) {
        btnToggleDarkScreen.classList.add("active");
        if (darkScreenText) darkScreenText.textContent = "Dark Screen: ON";
      }
      if (btnPower) {
        btnPower.classList.add("active");
        const tooltip = btnPower.querySelector(".dock-tooltip");
        if (tooltip) tooltip.textContent = "Screen is OFF (Click to Wake)";
      }
      if (navBtnPower) {
        navBtnPower.classList.add("active");
        navBtnPower.title = "Screen is OFF (Click to Wake)";
      }
    } else {
      if (stealthIndicator) stealthIndicator.classList.add("hidden");
      if (btnToggleStealth) btnToggleStealth.classList.remove("active");
      if (btnToggleDarkScreen) {
        btnToggleDarkScreen.classList.remove("active");
        if (darkScreenText) darkScreenText.textContent = "Dark Screen: OFF";
      }
      if (btnPower) {
        btnPower.classList.remove("active");
        const tooltip = btnPower.querySelector(".dock-tooltip");
        if (tooltip) tooltip.textContent = "Screen Off (Use from PC)";
      }
      if (navBtnPower) {
        navBtnPower.classList.remove("active");
        navBtnPower.title = "Turn Phone Screen Off (Stealth Mode)";
      }
    }
  }

  if (btnToggleDarkScreen) {
    btnToggleDarkScreen.addEventListener("click", () => {
      isStealthMode = !isStealthMode;
      setStealthUI(isStealthMode);
      sendToPhone({ type: "stealth", enabled: isStealthMode });
    });
  }

  // 10. Remote PIN Unlock Modal Controls
  function openUnlockModal() {
    if (remotePinInput) remotePinInput.value = "";
    if (unlockModal) unlockModal.classList.remove("hidden");
  }

  function closeUnlockModal() {
    if (unlockModal) unlockModal.classList.add("hidden");
  }

  if (btnRemoteUnlock) {
    btnRemoteUnlock.addEventListener("click", openUnlockModal);
  }

  if (btnCloseUnlockModal) {
    btnCloseUnlockModal.addEventListener("click", closeUnlockModal);
  }

  if (unlockModal) {
    unlockModal.addEventListener("click", (e) => {
      if (e.target === unlockModal) closeUnlockModal();
    });
  }

  // Handle keypad digit clicks
  document.querySelectorAll(".pin-key[data-digit]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (remotePinInput && remotePinInput.value.length < 8) {
        remotePinInput.value += btn.getAttribute("data-digit");
      }
    });
  });

  if (btnPinClear) {
    btnPinClear.addEventListener("click", () => {
      if (remotePinInput && remotePinInput.value.length > 0) {
        remotePinInput.value = remotePinInput.value.slice(0, -1);
      }
    });
  }

  if (btnPinSwipeOnly) {
    btnPinSwipeOnly.addEventListener("click", () => {
      triggerSwipeUnlock();
      closeUnlockModal();
    });
  }

  function submitRemotePin() {
    const pin = remotePinInput ? remotePinInput.value : "";
    if (pin.length > 0) {
      sendToPhone({ type: "remote_unlock", pin: pin });
      closeUnlockModal();
    } else {
      triggerSwipeUnlock();
      closeUnlockModal();
    }
  }

  if (btnPinSubmit) {
    btnPinSubmit.addEventListener("click", submitRemotePin);
  }

  // Allow physical PC keyboard typing for PIN modal
  window.addEventListener("keydown", (e) => {
    if (unlockModal && !unlockModal.classList.contains("hidden")) {
      if (e.key >= "0" && e.key <= "9") {
        if (remotePinInput && remotePinInput.value.length < 8) {
          remotePinInput.value += e.key;
        }
        e.preventDefault();
      } else if (e.key === "Backspace") {
        if (remotePinInput && remotePinInput.value.length > 0) {
          remotePinInput.value = remotePinInput.value.slice(0, -1);
        }
        e.preventDefault();
      } else if (e.key === "Enter") {
        submitRemotePin();
        e.preventDefault();
      } else if (e.key === "Escape") {
        closeUnlockModal();
        e.preventDefault();
      }
    }
  });

  // 11. Device Switcher & Management
  function updateDeviceCount() {
    const allDeviceIds = new Set([
      ...onlineDevices.map(d => d.id),
      ...savedFirestoreDevices.map(d => d.id)
    ]);
    if (deviceCountLabel) {
      deviceCountLabel.textContent = `Devices (${allDeviceIds.size})`;
    }
  }

  function selectDevice(deviceId) {
    activeDeviceId = deviceId;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "select_device",
        deviceId: deviceId
      }));
    }
    const targetDev = onlineDevices.find(d => d.id === deviceId) || savedFirestoreDevices.find(d => d.id === deviceId);
    if (targetDev && statusText) {
      statusText.textContent = `Streaming: ${targetDev.model || "Phone"}`;
    }
    renderDevicesList();
  }

  function renderDevicesList() {
    if (!deviceListContainer) return;

    const deviceMap = new Map();

    savedFirestoreDevices.forEach((d) => {
      deviceMap.set(d.id, { ...d, isOnline: false });
    });

    onlineDevices.forEach((d) => {
      deviceMap.set(d.id, { ...d, isOnline: true });
    });

    const devices = Array.from(deviceMap.values());

    if (devices.length === 0) {
      deviceListContainer.innerHTML = `
        <div class="empty-device-state">
          <div class="empty-device-icon">📱</div>
          <h4 style="margin: 0 0 6px 0; color: #fff;">No Devices Linked Yet</h4>
          <p style="margin: 0; font-size: 0.88rem;">Click "Pair / Add Another Device" below to connect your first phone.</p>
        </div>
      `;
      return;
    }

    deviceListContainer.innerHTML = "";
    devices.forEach((dev) => {
      const isOnline = !!dev.isOnline;
      const isSelected = dev.id === activeDeviceId;

      const card = document.createElement("div");
      card.className = `device-card ${isSelected ? "device-card-active" : ""}`;
      card.innerHTML = `
        <div class="device-card-left">
          <div class="device-avatar ${isOnline ? "online" : "offline"}">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="2" width="14" height="20" rx="3" ry="3"></rect>
              <line x1="12" y1="18" x2="12.01" y2="18"></line>
            </svg>
          </div>
          <div class="device-card-info">
            <div class="device-card-header">
              <span class="device-card-name">${dev.model || "Android Phone"}</span>
              ${isSelected ? '<span class="device-badge-active">Streaming</span>' : ""}
            </div>
            <div class="device-card-meta">
              <span class="${isOnline ? "device-badge-online" : "device-badge-offline"}">
                ● ${isOnline ? "Online & Ready" : "Offline (Not Streaming)"}
              </span>
              <span>•</span>
              <span class="device-id-code">${dev.id}</span>
              ${dev.width ? `<span>•</span><span>${dev.width}x${dev.height}</span>` : ""}
            </div>
            ${!isOnline ? '<div style="font-size:0.75rem; color:#94a3b8; margin-top:3px;">Open DarkLink on this phone & tap "Connect & Start Mirroring" to stream.</div>' : ''}
          </div>
        </div>
        <div class="device-card-actions">
          ${
            isSelected
              ? `<button class="btn-selected-pill" disabled>✓ Active</button>`
              : isOnline
              ? `<button class="btn-primary btn-connect-dev" data-dev-id="${dev.id}">Select & Stream</button>`
              : `<button class="btn-secondary btn-pair-dev" title="Open QR Code to connect this phone">Pair via QR</button>`
          }
        </div>
      `;

      const connectBtn = card.querySelector(".btn-connect-dev:not([disabled])");
      if (connectBtn) {
        connectBtn.addEventListener("click", () => {
          selectDevice(dev.id);
          closeDeviceModal();
          sendToPhone({ type: "wake" });
          sendToPhone({ type: "request_keyframe" });
        });
      }

      const pairBtn = card.querySelector(".btn-pair-dev");
      if (pairBtn) {
        pairBtn.addEventListener("click", () => {
          closeDeviceModal();
          openQrModal();
        });
      }

      deviceListContainer.appendChild(card);
    });
  }

  async function openDeviceModal() {
    if (deviceModal) deviceModal.classList.remove("hidden");
    renderDevicesList();

    try {
      const res = await fetch("/api/devices");
      const data = await res.json();
      if (data.success) {
        onlineDevices = data.devices || [];
        if (!activeDeviceId && onlineDevices.length > 0) {
          activeDeviceId = onlineDevices[0].id;
        }
        updateDeviceCount();
        renderDevicesList();
      }
    } catch (err) {
      console.warn("Fetch devices:", err);
    }
  }

  function closeDeviceModal() {
    if (deviceModal) deviceModal.classList.add("hidden");
  }

  if (btnDeviceList) btnDeviceList.addEventListener("click", openDeviceModal);
  if (btnCloseDeviceModal) btnCloseDeviceModal.addEventListener("click", closeDeviceModal);
  if (deviceModal) {
    deviceModal.addEventListener("click", (e) => {
      if (e.target === deviceModal) closeDeviceModal();
    });
  }

  const btnModalAddDevice = document.getElementById("btnModalAddDevice");
  if (btnModalAddDevice) {
    btnModalAddDevice.addEventListener("click", () => {
      closeDeviceModal();
      openQrModal();
    });
  }

  if (btnCloseTamperToast && tamperToast) {
    btnCloseTamperToast.addEventListener("click", () => {
      tamperToast.classList.add("hidden");
    });
  }

  // 12. QR Modal Controls (Add Device)
  function openQrModal() {
    loadConnectionInfo();
    qrModal.classList.remove("hidden");
  }

  function closeQrModal() {
    qrModal.classList.add("hidden");
  }

  btnOpenQr.addEventListener("click", openQrModal);
  btnScanPairPrompt.addEventListener("click", openQrModal);
  btnCloseModal.addEventListener("click", closeQrModal);
  qrModal.addEventListener("click", (e) => {
    if (e.target === qrModal) closeQrModal();
  });

  // Global callback for Firestore devices sync
  window.updateFirestoreDevices = (devices) => {
    savedFirestoreDevices = devices || [];
    updateDeviceCount();
    renderDevicesList();
  };

  // Start
  loadConnectionInfo();
  initWebSocket();
})();
