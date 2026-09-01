/**
 * Zero-Cost No-Code Chatbot SaaS - Isolated Shadow DOM Embeddable Widget
 * Self-contained, lightweight, zero framework dependencies, zero CSS collisions.
 */
(function () {
  if (window.__CHATFLOW_WIDGET_INITIALIZED__) return;
  window.__CHATFLOW_WIDGET_INITIALIZED__ = true;

  // Retrieve configuration from script tag dataset
  const currentScript = document.currentScript || document.querySelector("script[data-tenant-id], script[data-tenant-slug]");
  const tenantSlug = currentScript?.getAttribute("data-tenant-slug") || currentScript?.getAttribute("data-tenant-id") || "acme-corp";
  const customFlowId = currentScript?.getAttribute("data-flow-id") || null;
  const baseUrl = currentScript?.src ? new URL(currentScript.src).origin : window.location.origin;

  // Persistent Visitor UUID in LocalStorage
  const STORAGE_KEY_VISITOR = `chatflow_${tenantSlug}_visitor`;
  const STORAGE_KEY_CONV = `chatflow_${tenantSlug}_conv_id`;
  const STORAGE_KEY_TOKEN = `chatflow_${tenantSlug}_session_token`;

  function getVisitorId() {
    let vid = localStorage.getItem(STORAGE_KEY_VISITOR);
    if (!vid) {
      vid = "vis_" + Math.random().toString(36).substring(2, 12) + "_" + Date.now();
      localStorage.setItem(STORAGE_KEY_VISITOR, vid);
    }
    return vid;
  }

  const visitorId = getVisitorId();
  let conversationId = localStorage.getItem(STORAGE_KEY_CONV);
  let sessionToken = localStorage.getItem(STORAGE_KEY_TOKEN);
  let sessionStatus = "ACTIVE";
  let interactiveNode = null;
  let widgetConfig = null;
  let isOpen = false;
  let pollInterval = null;

  // Create Shadow DOM Container Host
  const hostElement = document.createElement("div");
  hostElement.id = "chatflow-widget-host";
  document.body.appendChild(hostElement);
  const shadow = hostElement.attachShadow({ mode: "open" });

  // Web Audio Synthesizer for ₹0 zero-file audio chime
  function playNotificationChime() {
    if (!widgetConfig?.soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {}
  }

  // Stylesheet inside Shadow DOM
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    
    #launcher-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
    }
    .pos-bottom-left { right: auto !important; left: 24px !important; align-items: flex-start !important; }

    #greeting-badge {
      background: #ffffff;
      color: #1e293b;
      padding: 10px 14px;
      border-radius: 14px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      border: 1px solid #e2e8f0;
      animation: chatflowFadeIn 0.3s ease;
      max-width: 260px;
    }
    #greeting-badge:hover { transform: translateY(-2px); }

    #launcher-button {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--primary-color, #4f46e5);
      color: #ffffff;
      border: none;
      box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.4), 0 8px 10px -6px rgba(79, 70, 229, 0.2);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    #launcher-button:hover { transform: scale(1.08); }
    #launcher-button:active { transform: scale(0.95); }

    #chat-window {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 380px;
      height: 600px;
      max-height: calc(100vh - 120px);
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 20px 35px -5px rgba(0, 0, 0, 0.15), 0 10px 15px -5px rgba(0, 0, 0, 0.08);
      border: 1px solid #e2e8f0;
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: 2147483646;
      animation: chatflowSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .pos-bottom-left #chat-window { right: auto !important; left: 24px !important; }

    /* Mobile Responsive Sliding Drawer */
    @media (max-width: 480px) {
      #chat-window {
        width: 100vw !important;
        height: 100vh !important;
        max-height: 100vh !important;
        bottom: 0 !important;
        right: 0 !important;
        left: 0 !important;
        border-radius: 0 !important;
        border: none !important;
      }
    }

    #chat-header {
      background: var(--primary-color, #4f46e5);
      color: #ffffff;
      padding: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
    }
    .header-info { display: flex; align-items: center; gap: 10px; }
    .bot-avatar { width: 36px; height: 36px; border-radius: 50%; background: #ffffff; padding: 2px; }
    .bot-title { font-size: 14px; font-weight: 700; }
    .bot-status { font-size: 11px; opacity: 0.85; display: flex; align-items: center; gap: 4px; }
    .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #4ade80; }
    .header-close { background: transparent; border: none; color: #ffffff; cursor: pointer; padding: 4px; border-radius: 6px; }

    #messages-body {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #f8fafc;
    }

    .msg-row { display: flex; gap: 8px; width: 100%; }
    .msg-row.bot { justify-content: flex-start; }
    .msg-row.user { justify-content: flex-end; }

    .bubble {
      max-width: 82%;
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 13px;
      line-height: 1.45;
      word-break: break-word;
      animation: chatflowFadeIn 0.2s ease;
    }
    .msg-row.bot .bubble {
      background: #ffffff;
      color: #1e293b;
      border: 1px solid #e2e8f0;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    .msg-row.user .bubble {
      background: var(--primary-color, #4f46e5);
      color: #ffffff;
      border-bottom-right-radius: 4px;
    }

    .bubble img { max-width: 100%; border-radius: 8px; margin-top: 6px; display: block; }
    .bubble a { color: inherit; text-decoration: underline; }

    /* Interactive Options & Forms */
    #interactive-container {
      margin-top: 4px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .btn-option {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: var(--primary-color, #4f46e5);
      font-weight: 600;
      font-size: 12px;
      padding: 8px 14px;
      border-radius: 20px;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s;
    }
    .btn-option:hover { background: #eef2ff; border-color: var(--primary-color, #4f46e5); }

    /* Typing Indicator */
    .typing-dots { display: flex; gap: 4px; padding: 4px 8px; align-items: center; }
    .typing-dot { width: 5px; height: 5px; border-radius: 50%; background: #94a3b8; animation: typingBounce 1.2s infinite ease-in-out; }
    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }

    /* Footer Input */
    #input-footer {
      padding: 12px;
      background: #ffffff;
      border-top: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    #text-input {
      flex: 1;
      border: 1px solid #cbd5e1;
      border-radius: 20px;
      padding: 8px 14px;
      font-size: 13px;
      outline: none;
    }
    #text-input:focus { border-color: var(--primary-color, #4f46e5); }
    #send-btn, #upload-btn {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: none;
      background: var(--primary-color, #4f46e5);
      color: #ffffff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    #upload-btn { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

    @keyframes chatflowFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes chatflowSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes typingBounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
  `;
  shadow.appendChild(style);

  // Widget DOM Skeleton
  const widgetContainer = document.createElement("div");
  widgetContainer.id = "launcher-container";
  widgetContainer.innerHTML = `
    <div id="greeting-badge" style="display: none;">
      <span id="greeting-text">👋 Need help? Let's chat!</span>
    </div>
    <button id="launcher-button" aria-label="Open Chat">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </button>
    <div id="chat-window">
      <div id="chat-header">
        <div class="header-info">
          <img id="bot-avatar" class="bot-avatar" src="" alt="Avatar" />
          <div>
            <div id="bot-name" class="bot-title">Assistant</div>
            <div id="bot-subtitle" class="bot-status"><span class="status-dot"></span> Replies instantly</div>
          </div>
        </div>
        <button id="close-btn" class="header-close" aria-label="Close Chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div id="messages-body"></div>
      <form id="input-footer">
        <input type="file" id="file-input" style="display: none;" />
        <button type="button" id="upload-btn" title="Upload Attachment">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
        </button>
        <input type="text" id="text-input" placeholder="Type a message..." autocomplete="off" />
        <button type="submit" id="send-btn" aria-label="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </form>
    </div>
  `;
  shadow.appendChild(widgetContainer);

  const launcherBtn = shadow.getElementById("launcher-button");
  const greetingBadge = shadow.getElementById("greeting-badge");
  const greetingText = shadow.getElementById("greeting-text");
  const chatWindow = shadow.getElementById("chat-window");
  const closeBtn = shadow.getElementById("close-btn");
  const messagesBody = shadow.getElementById("messages-body");
  const inputForm = shadow.getElementById("input-footer");
  const textInput = shadow.getElementById("text-input");
  const sendBtn = shadow.getElementById("send-btn");
  const fileInput = shadow.getElementById("file-input");
  const uploadBtn = shadow.getElementById("upload-btn");
  const botAvatar = shadow.getElementById("bot-avatar");
  const botName = shadow.getElementById("bot-name");
  const botSubtitle = shadow.getElementById("bot-subtitle");

  function scrollToBottom() {
    messagesBody.scrollTop = messagesBody.scrollHeight;
  }

  function appendMessage(sender, text, mediaUrl, mediaType) {
    const row = document.createElement("div");
    row.className = `msg-row ${sender === "user" ? "user" : "bot"}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    if (mediaUrl) {
      if (mediaType === "image" || /\.(jpg|jpeg|png|gif|webp)$/i.test(mediaUrl)) {
        const img = document.createElement("img");
        img.src = mediaUrl;
        bubble.appendChild(img);
      } else {
        const link = document.createElement("a");
        link.href = mediaUrl;
        link.target = "_blank";
        link.textContent = "📎 View Attachment";
        link.style.display = "block";
        link.style.marginTop = "4px";
        bubble.appendChild(link);
      }
    }

    row.appendChild(bubble);
    messagesBody.appendChild(row);
    scrollToBottom();
  }

  function showTypingIndicator() {
    const row = document.createElement("div");
    row.id = "typing-indicator-row";
    row.className = "msg-row bot";
    row.innerHTML = `<div class="bubble"><div class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div></div>`;
    messagesBody.appendChild(row);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const row = shadow.getElementById("typing-indicator-row");
    if (row) row.remove();
  }

  function renderInteractiveOptions(node) {
    const existing = shadow.getElementById("interactive-container");
    if (existing) existing.remove();

    if (!node) return;
    const nodeType = node.data?.nodeType || node.type;

    if (nodeType === "buttons" && node.data?.options?.length > 0) {
      const container = document.createElement("div");
      container.id = "interactive-container";

      node.data.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = "btn-option";
        btn.textContent = opt.label;
        btn.onclick = () => {
          container.remove();
          handleSendMessage({
            type: "button_click",
            value: opt.value || opt.label,
            label: opt.label,
            buttonId: opt.id,
          });
        };
        container.appendChild(btn);
      });

      messagesBody.appendChild(container);
      scrollToBottom();
    }
  }

  // Handle sending a message
  async function handleSendMessage(inputObj) {
    const val = inputObj.label || (typeof inputObj.value === "string" ? inputObj.value : "File submitted");
    appendMessage("user", val);

    showTypingIndicator();
    textInput.value = "";
    sendBtn.disabled = true;

    try {
      const res = await fetch(`${baseUrl}/api/widget/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          sessionToken,
          flowId: customFlowId,
          userInput: inputObj,
        }),
      });

      const data = await res.json();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      removeTypingIndicator();

      if (data.success) {
        sessionStatus = data.sessionStatus;
        interactiveNode = data.interactiveNode;

        (data.botMessages || []).forEach((m) => {
          appendMessage("bot", m.content, m.attachments ? JSON.parse(m.attachments)[0]?.url : undefined);
          playNotificationChime();
        });

        renderInteractiveOptions(interactiveNode);

        if (interactiveNode?.data?.inputPlaceholder) {
          textInput.placeholder = interactiveNode.data.inputPlaceholder;
        } else {
          textInput.placeholder = "Type a message...";
        }
      }
    } catch (e) {
      removeTypingIndicator();
      appendMessage("bot", "Network error. Please try again.");
    } finally {
      sendBtn.disabled = false;
    }
  }

  // Initialize Session
  async function initSession() {
    try {
      const res = await fetch(`${baseUrl}/api/widget/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug,
          visitorId,
          flowId: customFlowId,
          referrer: document.referrer,
          device: window.innerWidth < 768 ? "mobile" : "desktop",
        }),
      });

      const data = await res.json();
      if (data.success) {
        conversationId = data.conversationId;
        sessionToken = data.sessionToken;
        localStorage.setItem(STORAGE_KEY_CONV, conversationId);
        localStorage.setItem(STORAGE_KEY_TOKEN, sessionToken);
        sessionStatus = data.sessionStatus;
        interactiveNode = data.interactiveNode;

        messagesBody.innerHTML = "";
        (data.messages || []).forEach((m) => {
          let attUrl = undefined;
          if (m.attachments) {
            try {
              attUrl = JSON.parse(m.attachments)[0]?.url;
            } catch {}
          }
          appendMessage(m.senderType === "VISITOR" ? "user" : "bot", m.content, attUrl);
        });

        renderInteractiveOptions(interactiveNode);
        startPolling();
      }
    } catch (e) {
      console.warn("ChatFlow session init failed:", e);
    }
  }

  // Poll for live agent handover replies
  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!conversationId || !sessionToken || !isOpen) return;
      try {
        const res = await fetch(`${baseUrl}/api/widget/sync?conversationId=${encodeURIComponent(conversationId)}&sessionToken=${encodeURIComponent(sessionToken)}`);
        const data = await res.json();
        if (data.success && data.messages) {
          const currentCount = messagesBody.querySelectorAll(".msg-row").length;
          if (data.messages.length > currentCount) {
            // New message arrived
            const newMsgs = data.messages.slice(currentCount);
            newMsgs.forEach((m) => {
              appendMessage(m.senderType === "VISITOR" ? "user" : "bot", m.content);
              if (m.senderType !== "VISITOR") playNotificationChime();
            });
          }
        }
      } catch {}
    }, 4000);
  }

  // Load Configuration & Theme
  async function loadConfig() {
    try {
      const res = await fetch(`${baseUrl}/api/widget/config?tenantSlug=${tenantSlug}`);
      const data = await res.json();
      if (data.success && data.widget) {
        widgetConfig = data.widget;
        hostElement.style.setProperty("--primary-color", widgetConfig.primaryColor || "#4f46e5");
        botAvatar.src = widgetConfig.avatarUrl || "https://api.dicebear.com/7.x/bottts/svg?seed=" + tenantSlug;
        botName.textContent = widgetConfig.botName || "Assistant";
        botSubtitle.innerHTML = `<span class="status-dot"></span> ${widgetConfig.botSubtitle || "Replies instantly"}`;

        if (widgetConfig.launcherPosition === "bottom-left") {
          widgetContainer.classList.add("pos-bottom-left");
        }

        if (widgetConfig.showGreetingBadge && widgetConfig.greetingBadge) {
          greetingText.textContent = widgetConfig.greetingBadge;
          greetingBadge.style.display = "flex";
        }
      }
    } catch (e) {
      console.warn("ChatFlow loadConfig error:", e);
    }
  }

  // Event Listeners
  function toggleChat() {
    isOpen = !isOpen;
    chatWindow.style.display = isOpen ? "flex" : "none";
    greetingBadge.style.display = "none";
    if (isOpen) {
      if (!conversationId) initSession();
      textInput.focus();
    }
  }

  launcherBtn.onclick = toggleChat;
  greetingBadge.onclick = toggleChat;
  closeBtn.onclick = toggleChat;

  inputForm.onsubmit = (e) => {
    e.preventDefault();
    const val = textInput.value.trim();
    if (!val) return;
    handleSendMessage({ type: "text", value: val });
  };

  uploadBtn.onclick = () => fileInput.click();
  fileInput.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("tenantSlug", tenantSlug);
    formData.append("conversationId", conversationId || "");
    formData.append("sessionToken", sessionToken || "");

    showTypingIndicator();
    try {
      const res = await fetch(`${baseUrl}/api/widget/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      removeTypingIndicator();
      if (data.success && data.file) {
        handleSendMessage({
          type: "attachment_upload",
          value: data.file,
          label: `Uploaded ${data.file.name}`,
        });
      }
    } catch {
      removeTypingIndicator();
      appendMessage("bot", "File upload failed.");
    }
  };

  // Run on load
  loadConfig();
})();
