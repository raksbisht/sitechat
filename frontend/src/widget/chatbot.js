/**
 * SiteChat embeddable widget — source for build.js.
 * Edit here, then run: npm run build
 */
(function () {
  "use strict";

  /* Dashboard SPA embeds this script for preview; skip entirely so the widget never blocks nav or delays app.js. */
  try {
    if (document.body && document.body.hasAttribute("data-sitechat-dashboard")) {
      return;
    }
  } catch (e) {}

  const scriptEl =
    document.currentScript ||
    (function findThisScript() {
      const scripts = document.getElementsByTagName("script");
      for (let i = scripts.length - 1; i >= 0; i--) {
        const src = scripts[i].src || "";
        if (/\/chatbot(\.min)?\.js(\?|$)/i.test(src)) return scripts[i];
      }
      return null;
    })();

  function defaultEmbedApiUrl() {
    try {
      if (typeof window !== "undefined" && window.location) {
        if (window.location.origin && window.location.protocol !== "file:") {
          return window.location.origin;
        }
      }
    } catch (e) {}
    return "http://localhost:8000";
  }

  const datasetApi = scriptEl?.dataset?.apiUrl != null ? String(scriptEl.dataset.apiUrl).trim() : "";

  const config = {
    siteId: scriptEl?.dataset?.siteId || "default",
    apiUrl: datasetApi || defaultEmbedApiUrl(),
    position: scriptEl?.dataset?.position || "bottom-right",
    primaryColor: scriptEl?.dataset?.primaryColor || "#1B5E3B",
    title: scriptEl?.dataset?.title || "Ask AI",
    welcomeMessage: "Hi! How can I help you today?",
    showSources: true,
    hideBranding: false,
    customBrandingText: null,
    customBrandingUrl: null,
  };

  const sessionId = "widget-" + Math.random().toString(36).substring(2, 15);

  const handoffState = {
    mode: "ai",
    handoffId: null,
    agentName: null,
    pollInterval: null,
    lastMessageTime: null,
    isAvailable: true,
    offlineMessage: null,
  };

  function adjustHexColor(hex, delta) {
    const raw = hex.replace("#", "");
    const n = parseInt(raw, 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + delta));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + delta));
    const b = Math.min(255, Math.max(0, (n & 255) + delta));
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  }

  // --- Remote site config + theme overrides (accent color from API) ---
  async function fetchSiteConfig() {
    try {
      const G = await fetch(config.apiUrl + "/api/sites/" + config.siteId + "/config");
      if (G["ok"]) {
        const H = await G["json"]();
        H["appearance"] && (config.primaryColor = H["appearance"]["primary_color"] || config.primaryColor, config.title = H["appearance"]["chat_title"] || config.title, 
        config.welcomeMessage = H["appearance"]["welcome_message"] || config.welcomeMessage, config.position = H["appearance"]["position"] || config.position, 
        config.hideBranding = H["appearance"]["hide_branding"] === true, config.customBrandingText = H["appearance"]["custom_branding_text"] || null, 
        config.customBrandingUrl = H["appearance"]["custom_branding_url"] || null), H["behavior"] && (config.showSources = H["behavior"]["show_sources"] !== false), 
        injectDynamicThemeStyles(), syncHeaderAndWelcomeText(), updateBrandingFooter();
      }
    } catch (I) {
      console["warn"]("Could not fetch site config, using defaults:", I);
    }
  }
  function injectDynamicThemeStyles() {
    const G = document["getElementById"]("sitechat-dynamic-styles");
    G && G["remove"]();
    const H = document["createElement"]("style");
    H["id"] = "sitechat-dynamic-styles", H["textContent"] = "\n      .sitechat-toggle {\n        background: linear-gradient(135deg, " + config.primaryColor + ", " + adjustHexColor(config.primaryColor, -20) + ") !important;\n      }\n      .sitechat-header {\n        background: linear-gradient(135deg, " + config.primaryColor + ", " + adjustHexColor(config.primaryColor, -20) + ") !important;\n      }\n      .sitechat-avatar.bot {\n        background: linear-gradient(135deg, " + config.primaryColor + ", " + adjustHexColor(config.primaryColor, -30) + ") !important;\n        box-shadow: 0 2px 8px " + config.primaryColor + "40 !important;\n      }\n      .sitechat-message.user {\n        background: linear-gradient(135deg, " + config.primaryColor + ", " + adjustHexColor(config.primaryColor, -25) + ") !important;\n        box-shadow: 0 2px 12px " + config.primaryColor + "30 !important;\n      }\n      .sitechat-typing span {\n        background: linear-gradient(135deg, " + config.primaryColor + ", " + adjustHexColor(config.primaryColor, -20) + ") !important;\n      }\n      .sitechat-send {\n        background: linear-gradient(135deg, " + config.primaryColor + ", " + adjustHexColor(config.primaryColor, -20) + ") !important;\n      }\n      .sitechat-welcome-icon {\n        background: linear-gradient(135deg, " + config.primaryColor + "15, " + config.primaryColor + "25) !important;\n      }\n      .sitechat-welcome-icon::before {\n        background: linear-gradient(135deg, " + config.primaryColor + "40, transparent) !important;\n      }\n      .sitechat-welcome-icon svg {\n        color: " + config.primaryColor + " !important;\n      }\n      .sitechat-suggestion:hover {\n        background: " + config.primaryColor + "08 !important;\n        border-color: " + config.primaryColor + "30 !important;\n        color: " + config.primaryColor + " !important;\n      }\n      .sitechat-source-link {\n        color: " + config.primaryColor + " !important;\n        background: linear-gradient(135deg, " + config.primaryColor + "08, " + config.primaryColor + "12) !important;\n        border: 1px solid " + config.primaryColor + "20 !important;\n      }\n      .sitechat-source-link:hover {\n        background: linear-gradient(135deg, " + config.primaryColor + "15, " + config.primaryColor + "20) !important;\n        border-color: " + config.primaryColor + "40 !important;\n        box-shadow: 0 2px 8px " + config.primaryColor + "20 !important;\n      }\n      .sitechat-message.bot code {\n        color: " + config.primaryColor + " !important;\n      }\n      .sitechat-feedback-btn.active {\n        border-color: " + config.primaryColor + "40 !important;\n      }\n    ", 
    document["head"]["appendChild"](H);
  }
  function injectResponsiveStyles() {
    const G = document["getElementById"]("sitechat-responsive-styles");
    G && G["remove"]();
    const H = document["createElement"]("style");
    H["id"] = "sitechat-responsive-styles";
    H["textContent"] = `
      @media (max-width: 900px) {
        .sitechat-window {
          width: min(420px, calc(100vw - 24px)) !important;
          height: min(70vh, 560px) !important;
          right: 12px !important;
          left: 12px !important;
          margin: 0 auto !important;
          bottom: calc(82px + env(safe-area-inset-bottom, 0px)) !important;
        }
        .sitechat-toggle {
          right: 12px !important;
          bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
          width: 56px !important;
          height: 56px !important;
        }
        .sitechat-toggle svg {
          width: 24px !important;
          height: 24px !important;
        }
        .sitechat-nudge {
          right: 12px !important;
          left: 12px !important;
          max-width: none !important;
          bottom: calc(82px + env(safe-area-inset-bottom, 0px)) !important;
        }
      }

      @media (max-width: 640px) {
        .sitechat-window {
          width: auto !important;
          left: 8px !important;
          right: 8px !important;
          bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important;
          height: calc(100vh - 108px - env(safe-area-inset-bottom, 0px)) !important;
          max-height: none !important;
          border-radius: 14px !important;
        }
        .sitechat-header {
          padding: 14px 16px !important;
        }
        .sitechat-header-icon {
          width: 36px !important;
          height: 36px !important;
        }
        .sitechat-header-icon svg {
          width: 18px !important;
          height: 18px !important;
        }
        .sitechat-messages {
          padding: 14px !important;
          gap: 12px !important;
        }
        .sitechat-input-wrapper {
          padding: 10px !important;
        }
        .sitechat-message {
          font-size: 13px !important;
          padding: 12px 14px !important;
        }
        .sitechat-branding {
          padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px)) !important;
        }
        .sitechat-nudge {
          left: 8px !important;
          right: 8px !important;
          bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important;
          border-radius: 12px !important;
        }
      }

      @media (max-width: 380px) {
        .sitechat-window {
          height: calc(100vh - 96px - env(safe-area-inset-bottom, 0px)) !important;
        }
        .sitechat-header-text h3 {
          font-size: 15px !important;
        }
        .sitechat-header-text p {
          font-size: 12px !important;
        }
      }
    `;
    document["head"]["appendChild"](H);
  }
  function syncHeaderAndWelcomeText() {
    const G = document["querySelector"](".sitechat-header-text h3");
    if (G) G["textContent"] = config.title;
    const H = document["querySelector"](".sitechat-welcome h4"), I = document["querySelector"](".sitechat-welcome p");
    if (I) I["textContent"] = config.welcomeMessage;
  }
  function updateBrandingFooter() {
    const G = document["querySelector"](".sitechat-branding");
    if (!G) return;
    const H = G["querySelector"]("a");
    if (config.hideBranding) {
      config.customBrandingText ? (G["style"]["display"] = "block", H && (H["innerHTML"] = config.customBrandingText, config.customBrandingUrl ? (H["href"] = config.customBrandingUrl, 
      H["style"]["cursor"] = "pointer") : (H["removeAttribute"]("href"), H["style"]["cursor"] = "default"))) : G["style"]["display"] = "none";
      return;
    }
    G["style"]["display"] = "block", H && (H["innerHTML"] = "Powered by <strong>SiteChat</strong>", H["href"] = config.apiUrl, 
    H["style"]["cursor"] = "pointer");
  }
  fetchSiteConfig();

  // --- Proactive triggers (time on page, scroll, exit intent, etc.) ---
  const visitorBehavior = {
    timeOnPage: 0,
    maxScrollDepth: 0,
    currentUrl: window["location"]["pathname"],
    exitIntentDetected: false,
    pageViews: 1,
    timerInterval: null,
    init() {
      this["loadVisitorData"](), this["startTimeTracking"](), this["trackScroll"](), this["trackExitIntent"](), this["incrementPageViews"]();
    },
    loadVisitorData() {
      try {
        const G = localStorage["getItem"]("sitechat_visitor_" + config.siteId);
        if (G) {
          const H = JSON["parse"](G);
          this["pageViews"] = (H["pageViews"] || 0) + 1;
        }
      } catch (I) {}
    },
    saveVisitorData() {
      try {
        localStorage["setItem"]("sitechat_visitor_" + config.siteId, JSON["stringify"]({
          pageViews: this["pageViews"],
          lastVisit: Date["now"]()
        }));
      } catch (G) {}
    },
    incrementPageViews() {
      this["saveVisitorData"]();
    },
    startTimeTracking() {
      this["timerInterval"] = setInterval(() => {
        this["timeOnPage"]++, triggerEngine.checkTriggers();
      }, 1e3);
    },
    trackScroll() {
      const G = () => {
        const I = window["pageYOffset"] || document["documentElement"]["scrollTop"], J = document["documentElement"]["scrollHeight"] - document["documentElement"]["clientHeight"], K = J > 0 ? Math["round"](I / J * 100) : 0;
        K > this["maxScrollDepth"] && (this["maxScrollDepth"] = K, triggerEngine.checkTriggers());
      };
      let H;
      window["addEventListener"]("scroll", () => {
        clearTimeout(H), H = setTimeout(G, 100);
      }, {
        passive: true
      });
    },
    trackExitIntent() {
      document["addEventListener"]("mouseleave", G => {
        G["clientY"] <= 0 && !this["exitIntentDetected"] && (this["exitIntentDetected"] = true, triggerEngine.checkTriggers());
      });
    },
    getBehavior() {
      return {
        timeOnPage: this["timeOnPage"],
        maxScrollDepth: this["maxScrollDepth"],
        currentUrl: this["currentUrl"],
        exitIntentDetected: this["exitIntentDetected"],
        pageViews: this["pageViews"]
      };
    }
  }, triggerEngine = {
    triggers: [],
    globalCooldownMs: 3e4,
    lastTriggerTime: 0,
    shownTriggerIds: new Set(),
    visitorShownTriggerIds: new Set(),
    isInitialized: false,
    async init() {
      await this["fetchTriggers"](), this["loadShownTriggers"](), this["isInitialized"] = true;
    },
    async fetchTriggers() {
      try {
        const G = await fetch(config.apiUrl + "/api/widget/" + config.siteId + "/triggers");
        if (G["ok"]) {
          const H = await G["json"]();
          this["triggers"] = H["triggers"] || [], this["globalCooldownMs"] = H["global_cooldown_ms"] || 3e4;
        }
      } catch (I) {
        console["warn"]("Could not fetch triggers:", I);
      }
    },
    loadShownTriggers() {
      try {
        const G = sessionStorage["getItem"]("sitechat_triggers_" + config.siteId);
        if (G) {
          const I = JSON["parse"](G);
          this["shownTriggerIds"] = new Set(I);
        }
        const H = localStorage["getItem"]("sitechat_visitor_triggers_" + config.siteId);
        if (H) {
          const J = JSON["parse"](H);
          this["visitorShownTriggerIds"] = new Set(J);
        }
      } catch (K) {}
    },
    saveShownTrigger(G, H) {
      this["shownTriggerIds"]["add"](G);
      try {
        sessionStorage["setItem"]("sitechat_triggers_" + config.siteId, JSON["stringify"]([ ...this["shownTriggerIds"] ])), H && (this["visitorShownTriggerIds"]["add"](G), 
        localStorage["setItem"]("sitechat_visitor_triggers_" + config.siteId, JSON["stringify"]([ ...this["visitorShownTriggerIds"] ])));
      } catch (I) {}
    },
    checkTriggers() {
      if (!this["isInitialized"] || this["triggers"]["length"] === 0) return;
      if (chatOpen) return;
      const G = Date["now"]();
      if (G - this["lastTriggerTime"] < this["globalCooldownMs"]) return;
      const H = visitorBehavior.getBehavior();
      for (const I of this["triggers"]) {
        if (!I["enabled"]) continue;
        if (I["show_once_per_session"] && this["shownTriggerIds"]["has"](I["id"])) continue;
        if (I["show_once_per_visitor"] && this["visitorShownTriggerIds"]["has"](I["id"])) continue;
        if (this["evaluateTrigger"](I, H)) {
          this["fireTrigger"](I);
          break;
        }
      }
    },
    evaluateTrigger(G, H) {
      if (!G["conditions"] || G["conditions"]["length"] === 0) return false;
      return G["conditions"]["every"](I => this["checkCondition"](I, H));
    },
    checkCondition(G, H) {
      const {type: I, value: J, operator: K} = G;
      switch (I) {
       case "time":
        return this["compare"](H["timeOnPage"], J, K);

       case "scroll":
        return this["compare"](H["maxScrollDepth"], J, K);

       case "exit_intent":
        return H["exitIntentDetected"] === true;

       case "url":
        return this["matchUrl"](H["currentUrl"], J, K);

       case "visit_count":
        return this["compare"](H["pageViews"], J, K);

       default:
        return false;
      }
    },
    compare(G, H, I) {
      switch (I) {
       case "eq":
        return G === H;

       case "gte":
        return G >= H;

       case "lte":
        return G <= H;

       case "gt":
        return G > H;

       case "lt":
        return G < H;

       default:
        return G >= H;
      }
    },
    matchUrl(G, H, I) {
      if (I === "eq") return G === H;
      if (I === "contains") return G["includes"](H);
      if (I === "matches") try {
        const J = new RegExp(H["replace"](/\*/g, ".*"));
        return J["test"](G);
      } catch (K) {
        return G["includes"](H);
      }
      return G["includes"](H);
    },
    fireTrigger(G) {
      this["lastTriggerTime"] = Date["now"](), this["saveShownTrigger"](G["id"], G["show_once_per_visitor"]);
      const H = G["delay_after_trigger_ms"] || 0;
      setTimeout(() => {
        showNudge(G), this["logEvent"](G["id"], "shown");
      }, H);
    },
    async logEvent(G, H) {
      try {
        const I = new URLSearchParams({
          trigger_id: G,
          session_id: sessionId,
          event_type: H
        });
        await fetch(config.apiUrl + "/api/widget/" + config.siteId + "/triggers/event?" + I, {
          method: "POST"
        });
      } catch (J) {}
    }
  };
  // --- Nudge bubble (proactive triggers) ---
  let activeNudgeEl = null;
  function showNudge(G) {
    activeNudgeEl && activeNudgeEl["remove"]();
    const H = document["createElement"]("div");
    H["className"] = "sitechat-nudge", H["innerHTML"] = '\n      <div class="sitechat-nudge-message">' + escapeHtml(G["message"]) + '</div>\n      <button class="sitechat-nudge-close" aria-label="Dismiss">×</button>\n    ', 
    H["querySelector"](".sitechat-nudge-close")["addEventListener"]("click", I => {
      I["stopPropagation"](), H["classList"]["add"]("sitechat-nudge-out"), triggerEngine.logEvent(G["id"], "dismissed"), setTimeout(() => H["remove"](), 300), 
      activeNudgeEl = null;
    }), H["addEventListener"]("click", () => {
      H["remove"](), activeNudgeEl = null, triggerEngine.logEvent(G["id"], "clicked"), chatOpen = true, toggleBtn["classList"]["add"]("open"), windowEl["classList"]["add"]("open"), 
      inputEl["focus"](), triggerEngine.logEvent(G["id"], "converted");
    }), document["body"]["appendChild"](H), activeNudgeEl = H, scheduleMobileViewportOffsets(), requestAnimationFrame(() => {
      H["classList"]["add"]("sitechat-nudge-in");
    });
  }
  function escapeHtml(G) {
    const H = document["createElement"]("div");
    return H["textContent"] = G, H["innerHTML"];
  }

  // --- Human handoff + agent polling ---
  const handoff = {
    async checkAvailability() {
      try {
        const G = await fetch(config.apiUrl + "/api/sites/" + config.siteId + "/handoff/availability");
        if (G["ok"]) {
          const H = await G["json"]();
          return handoffState.isAvailable = H["available"], handoffState.offlineMessage = H["offline_message"], H;
        }
      } catch (I) {
        console["warn"]("Could not check handoff availability:", I);
      }
      return {
        available: true,
        is_within_hours: true
      };
    },
    async requestHandoff(G = "user_request") {
      const H = await this["checkAvailability"]();
      if (!H["available"]) {
        this["showOfflineForm"]();
        return;
      }
      const I = this["getAIConversation"]();
      try {
        const J = await fetch(config.apiUrl + "/api/handoff", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON["stringify"]({
            session_id: sessionId,
            site_id: config.siteId,
            reason: G,
            ai_conversation: I
          })
        });
        if (J["ok"]) {
          const K = await J["json"]();
          handoffState.handoffId = K["handoff_id"], handoffState.mode = "pending", this["updateUIForHandoff"](), this["addSystemMessage"]("Connecting you to a human agent. Please wait..."), 
          this["startPolling"]();
        }
      } catch (L) {
        console["error"]("Failed to request handoff:", L), this["addSystemMessage"]("Sorry, we could not connect you to an agent. Please try again later.");
      }
    },
    getAIConversation() {
      const G = messagesEl["querySelectorAll"](".sitechat-message-wrapper"), H = [];
      return G["forEach"](I => {
        const J = I["classList"]["contains"]("user"), K = I["querySelector"](".sitechat-message");
        K && H["push"]({
          role: J ? "user" : "assistant",
          content: K["textContent"] || ""
        });
      }), H;
    },
    showOfflineForm() {
      const G = '\n        <div class="sitechat-offline-form">\n          <div class="sitechat-offline-icon">\n            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n              <circle cx="12" cy="12" r="10"/>\n              <path d="M12 6v6l4 2"/>\n            </svg>\n          </div>\n          <h4>We\'re currently offline</h4>\n          <p>' + escapeHtml(handoffState.offlineMessage || "Leave your email and we'll get back to you.") + '</p>\n          <form class="sitechat-offline-email-form">\n            <input type="email" placeholder="Your email address" required class="sitechat-offline-email">\n            <button type="submit" class="sitechat-offline-submit">Send</button>\n          </form>\n        </div>\n      ', H = document["createElement"]("div");
      H["className"] = "sitechat-message-wrapper bot", H["innerHTML"] = '\n        <div class="sitechat-avatar bot">\n          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>\n            <circle cx="12" cy="7" r="4"/>\n          </svg>\n        </div>\n        <div class="sitechat-message-content">\n          <div class="sitechat-message bot">' + G + "</div>\n        </div>\n      ", 
      messagesEl["appendChild"](H), messagesEl["scrollTop"] = messagesEl["scrollHeight"];
      const I = H["querySelector"](".sitechat-offline-email-form");
      I["addEventListener"]("submit", async J => {
        J["preventDefault"]();
        const K = H["querySelector"](".sitechat-offline-email")["value"];
        try {
          await fetch(config.apiUrl + "/api/handoff", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON["stringify"]({
              session_id: sessionId,
              site_id: config.siteId,
              reason: "user_request",
              visitor_email: K,
              ai_conversation: this["getAIConversation"]()
            })
          }), H["querySelector"](".sitechat-message")["innerHTML"] = '\n            <div class="sitechat-offline-success">\n              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                <polyline points="20 6 9 17 4 12"/>\n              </svg>\n              <p>Thanks! We\'ll get back to you at <strong>' + escapeHtml(K) + "</strong> as soon as possible.</p>\n            </div>\n          ";
        } catch (L) {
          console["error"]("Failed to submit offline request:", L);
        }
      });
    },
    updateUIForHandoff() {
      const G = document["querySelector"](".sitechat-header");
      if (G) {
        G["classList"]["add"]("handoff-mode");
        const I = G["querySelector"](".sitechat-header-text p");
        I && (I["textContent"] = handoffState.mode === "active" ? "Chatting with " + (handoffState.agentName || "Agent") : "Waiting for agent...");
      }
      const H = document["querySelector"](".sitechat-handoff-btn");
      H && (H["style"]["display"] = "none");
    },
    addSystemMessage(G) {
      const H = document["createElement"]("div");
      H["className"] = "sitechat-system-message", H["innerHTML"] = "<span>" + escapeHtml(G) + "</span>", messagesEl["appendChild"](H), messagesEl["scrollTop"] = messagesEl["scrollHeight"];
    },
    addAgentMessage(G, H) {
      const I = document["createElement"]("div");
      I["className"] = "sitechat-message-wrapper bot agent", I["innerHTML"] = '\n        <div class="sitechat-avatar bot agent">\n          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>\n            <circle cx="12" cy="7" r="4"/>\n          </svg>\n        </div>\n        <div class="sitechat-message-content">\n          <div class="sitechat-message bot">' + escapeHtml(G) + '</div>\n          <div class="sitechat-message-time">' + (H || "Agent") + " · " + (new Date)["toLocaleTimeString"]([], {
        hour: "2-digit",
        minute: "2-digit"
      }) + "</div>\n        </div>\n      ", messagesEl["appendChild"](I), messagesEl["scrollTop"] = messagesEl["scrollHeight"];
    },
    startPolling() {
      handoffState.pollInterval && clearInterval(handoffState.pollInterval), handoffState.pollInterval = setInterval(() => this["pollMessages"](), 2e3);
    },
    stopPolling() {
      handoffState.pollInterval && (clearInterval(handoffState.pollInterval), handoffState.pollInterval = null);
    },
    async pollMessages() {
      if (!handoffState.handoffId) return;
      try {
        let G = config.apiUrl + "/api/handoff/" + handoffState.handoffId + "/messages";
        handoffState.lastMessageTime && (G += "?since=" + handoffState.lastMessageTime);
        const H = await fetch(G);
        if (H["ok"]) {
          const I = await H["json"]();
          I["status"] === "active" && handoffState.mode !== "active" && (handoffState.mode = "active", handoffState.agentName = I["agent_name"], this["updateUIForHandoff"](), 
          this["addSystemMessage"]((I["agent_name"] || "An agent") + " has joined the conversation."));
          if (I["status"] === "resolved") {
            handoffState.mode = "resolved", this["stopPolling"](), this["addSystemMessage"]("This conversation has been resolved. Thank you!"), 
            this["resetToAIMode"]();
            return;
          }
          if (I["status"] === "abandoned") {
            this["stopPolling"](), this["addSystemMessage"]("You are back on the AI assistant."), this["clearHandoffLocal"]();
            return;
          }
          I["messages"] && I["messages"]["length"] > 0 && I["messages"]["forEach"](J => {
            J["role"] === "agent" && (this["addAgentMessage"](J["content"], J["sender_name"]), handoffState.lastMessageTime = J["timestamp"]);
          });
        }
      } catch (J) {
        console["warn"]("Failed to poll messages:", J);
      }
    },
    async sendMessage(G) {
      if (!handoffState.handoffId) return false;
      try {
        const H = await fetch(config.apiUrl + "/api/handoff/" + handoffState.handoffId + "/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON["stringify"]({
            content: G
          })
        });
        return H["ok"];
      } catch (I) {
        return console["error"]("Failed to send handoff message:", I), false;
      }
    },
    clearHandoffLocal() {
      handoffState.mode = "ai", handoffState.handoffId = null, handoffState.agentName = null, handoffState.lastMessageTime = null;
      const G = document["querySelector"](".sitechat-header");
      if (G) {
        G["classList"]["remove"]("handoff-mode");
        const I = G["querySelector"](".sitechat-header-text p");
        if (I) I["textContent"] = "Powered by AI";
      }
      const H = document["querySelector"](".sitechat-handoff-btn");
      if (H) H["style"]["display"] = "";
    },
    resetToAIMode() {
      setTimeout(() => this["clearHandoffLocal"](), 3e3);
    }
  };
  visitorBehavior.init(), triggerEngine.init();
  window["addEventListener"]("pagehide", () => {
    if (handoffState.handoffId && (handoffState.mode === "pending" || handoffState.mode === "active")) {
      const Hid = handoffState.handoffId;
      const abandonUrl = config.apiUrl + "/api/handoff/" + encodeURIComponent(Hid) + "/abandon";
      const abandonBody = JSON.stringify({ session_id: sessionId });
      if (
        !(
          navigator.sendBeacon &&
          navigator.sendBeacon(abandonUrl, new Blob([abandonBody], { type: "application/json" }))
        )
      ) {
        fetch(abandonUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: abandonBody,
          keepalive: true,
        }).catch(() => {});
      }
    }
  });
  // --- Base layout CSS + widget DOM (self-contained widget bubble) ---
  const baseWidgetCss = "\n    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');\n    \n    .sitechat-widget * {\n      margin: 0;\n      padding: 0;\n      box-sizing: border-box;\n      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n    }\n    \n    .sitechat-toggle {\n      position: fixed;\n      bottom: 24px;\n      right: 24px;\n      width: 60px;\n      height: 60px;\n      border-radius: 50%;\n      background: linear-gradient(135deg, " + config.primaryColor + ", " + adjustHexColor(config.primaryColor, -20) + ");\n      border: none;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);\n      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n      z-index: 99998;\n    }\n    \n    .sitechat-toggle:hover {\n      transform: scale(1.05);\n      box-shadow: 0 6px 25px rgba(99, 102, 241, 0.5);\n    }\n    \n    .sitechat-toggle svg {\n      width: 28px;\n      height: 28px;\n      color: white;\n      transition: all 0.3s ease;\n    }\n    \n    .sitechat-toggle.open .sitechat-icon-chat { display: none; }\n    .sitechat-toggle:not(.open) .sitechat-icon-close { display: none; }\n    \n    .sitechat-window {\n      position: fixed;\n      bottom: 100px;\n      right: 24px;\n      width: 400px;\n      height: 560px;\n      background: #ffffff;\n      border-radius: 16px;\n      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);\n      display: flex;\n      flex-direction: column;\n      overflow: hidden;\n      z-index: 99999;\n      opacity: 0;\n      visibility: hidden;\n      transform: translateY(20px) scale(0.95);\n      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n    }\n    \n    .sitechat-window.open {\n      opacity: 1;\n      visibility: visible;\n      transform: translateY(0) scale(1);\n    }\n    \n    .sitechat-header {\n      background: linear-gradient(135deg, " + config.primaryColor + ", " + adjustHexColor(config.primaryColor, -20) + ");\n      color: white;\n      padding: 20px 24px;\n      display: flex;\n      align-items: center;\n      gap: 12px;\n    }\n    \n    .sitechat-header-icon {\n      width: 40px;\n      height: 40px;\n      background: rgba(255, 255, 255, 0.2);\n      border-radius: 10px;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n    }\n    \n    .sitechat-header-icon svg {\n      width: 22px;\n      height: 22px;\n    }\n    \n    .sitechat-header-text h3 {\n      font-size: 16px;\n      font-weight: 600;\n      margin-bottom: 2px;\n    }\n    \n    .sitechat-header-text p {\n      font-size: 13px;\n      opacity: 0.9;\n    }\n    \n    .sitechat-messages {\n      flex: 1;\n      overflow-y: auto;\n      padding: 20px;\n      display: flex;\n      flex-direction: column;\n      gap: 16px;\n      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);\n    }\n    \n    .sitechat-messages::-webkit-scrollbar {\n      width: 6px;\n    }\n    \n    .sitechat-messages::-webkit-scrollbar-track {\n      background: transparent;\n    }\n    \n    .sitechat-messages::-webkit-scrollbar-thumb {\n      background: #cbd5e1;\n      border-radius: 3px;\n    }\n    \n    .sitechat-message-wrapper {\n      display: flex;\n      gap: 10px;\n      animation: messageIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);\n    }\n    \n    .sitechat-message-wrapper.user {\n      flex-direction: row-reverse;\n    }\n    \n    .sitechat-avatar {\n      width: 32px;\n      height: 32px;\n      border-radius: 50%;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      flex-shrink: 0;\n      font-size: 14px;\n      font-weight: 600;\n    }\n    \n    .sitechat-avatar.bot {\n      background: linear-gradient(135deg, " + config.primaryColor + ", " + adjustHexColor(config.primaryColor, -30) + ");\n      color: white;\n      box-shadow: 0 2px 8px " + config.primaryColor + "40;\n    }\n    \n    .sitechat-avatar.bot svg {\n      width: 18px;\n      height: 18px;\n    }\n    \n    .sitechat-avatar.user {\n      background: linear-gradient(135deg, #64748b, #475569);\n      color: white;\n    }\n    \n    .sitechat-message-content {\n      max-width: calc(100% - 50px);\n      display: flex;\n      flex-direction: column;\n      gap: 4px;\n    }\n    \n    .sitechat-message {\n      padding: 14px 18px;\n      border-radius: 18px;\n      font-size: 14px;\n      line-height: 1.6;\n      word-wrap: break-word;\n    }\n    \n    @keyframes messageIn {\n      from {\n        opacity: 0;\n        transform: translateY(12px);\n      }\n      to {\n        opacity: 1;\n        transform: translateY(0);\n      }\n    }\n    \n    .sitechat-message.user {\n      background: linear-gradient(135deg, " + config.primaryColor + ", " + adjustHexColor(config.primaryColor, -25) + ");\n      color: white;\n      border-bottom-right-radius: 6px;\n      box-shadow: 0 2px 12px " + config.primaryColor + "30;\n    }\n    \n    .sitechat-message.bot {\n      background: white;\n      color: #1e293b;\n      border-bottom-left-radius: 6px;\n      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);\n      border: 1px solid rgba(0, 0, 0, 0.04);\n    }\n    \n    .sitechat-message.bot p {\n      margin: 0 0 10px 0;\n    }\n    \n    .sitechat-message.bot p:last-child {\n      margin-bottom: 0;\n    }\n    \n    .sitechat-message.bot ul,\n    .sitechat-message.bot ol {\n      margin: 8px 0;\n      padding-left: 20px;\n    }\n    \n    .sitechat-message.bot li {\n      margin: 4px 0;\n    }\n    \n    .sitechat-message.bot strong {\n      font-weight: 600;\n      color: #0f172a;\n    }\n    \n    .sitechat-message.bot code {\n      background: #f1f5f9;\n      padding: 2px 6px;\n      border-radius: 4px;\n      font-family: 'SF Mono', Monaco, monospace;\n      font-size: 13px;\n      color: " + config.primaryColor + ";\n    }\n    \n    .sitechat-message-time {\n      font-size: 11px;\n      color: #94a3b8;\n      padding: 0 4px;\n    }\n    \n    .sitechat-message-wrapper.user .sitechat-message-time {\n      text-align: right;\n    }\n    \n    .sitechat-feedback {\n      display: flex;\n      gap: 8px;\n      margin-top: 8px;\n      padding: 0 4px;\n    }\n    \n    .sitechat-feedback-btn {\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      width: 28px;\n      height: 28px;\n      background: transparent;\n      border: 1px solid #e2e8f0;\n      border-radius: 6px;\n      cursor: pointer;\n      transition: all 0.2s ease;\n      color: #94a3b8;\n    }\n    \n    .sitechat-feedback-btn:hover {\n      background: #f8fafc;\n      color: #64748b;\n    }\n    \n    .sitechat-feedback-btn.active {\n      border-color: " + config.primaryColor + "40;\n    }\n    \n    .sitechat-feedback-btn.active.positive {\n      background: #dcfce7;\n      color: #16a34a;\n      border-color: #16a34a40;\n    }\n    \n    .sitechat-feedback-btn.active.negative {\n      background: #fee2e2;\n      color: #dc2626;\n      border-color: #dc262640;\n    }\n    \n    .sitechat-feedback-btn svg {\n      width: 14px;\n      height: 14px;\n    }\n    \n    .sitechat-feedback-thanks {\n      font-size: 11px;\n      color: #10b981;\n      display: flex;\n      align-items: center;\n      gap: 4px;\n    }\n    \n    .sitechat-feedback-thanks svg {\n      width: 12px;\n      height: 12px;\n    }\n    \n    .sitechat-welcome {\n      display: flex;\n      flex-direction: column;\n      align-items: center;\n      justify-content: center;\n      text-align: center;\n      padding: 50px 30px;\n      color: #64748b;\n      animation: welcomeFade 0.5s ease;\n    }\n    \n    @keyframes welcomeFade {\n      from { opacity: 0; transform: scale(0.95); }\n      to { opacity: 1; transform: scale(1); }\n    }\n    \n    .sitechat-welcome-icon {\n      width: 72px;\n      height: 72px;\n      background: linear-gradient(135deg, " + config.primaryColor + "15, " + config.primaryColor + "25);\n      border-radius: 20px;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      margin-bottom: 20px;\n      position: relative;\n    }\n    \n    .sitechat-welcome-icon::before {\n      content: '';\n      position: absolute;\n      inset: -3px;\n      background: linear-gradient(135deg, " + config.primaryColor + "40, transparent);\n      border-radius: 22px;\n      z-index: -1;\n    }\n    \n    .sitechat-welcome-icon svg {\n      width: 36px;\n      height: 36px;\n      color: " + config.primaryColor + ";\n    }\n    \n    .sitechat-welcome h4 {\n      font-size: 18px;\n      font-weight: 600;\n      color: #1e293b;\n      margin-bottom: 8px;\n    }\n    \n    .sitechat-welcome p {\n      font-size: 14px;\n      line-height: 1.5;\n      max-width: 240px;\n    }\n    \n    .sitechat-welcome-suggestions {\n      display: flex;\n      flex-direction: column;\n      gap: 8px;\n      margin-top: 20px;\n      width: 100%;\n    }\n    \n    .sitechat-suggestion {\n      padding: 10px 16px;\n      background: white;\n      border: 1px solid #e2e8f0;\n      border-radius: 10px;\n      font-size: 13px;\n      color: #475569;\n      cursor: pointer;\n      transition: all 0.2s ease;\n      text-align: left;\n    }\n    \n    .sitechat-suggestion:hover {\n      background: " + config.primaryColor + "08;\n      border-color: " + config.primaryColor + "30;\n      color: " + config.primaryColor + ";\n      transform: translateX(4px);\n    }\n    \n    .sitechat-sources {\n      margin-top: 12px;\n      padding-top: 12px;\n      border-top: 1px solid #e2e8f0;\n    }\n    \n    .sitechat-sources-label {\n      display: flex;\n      align-items: center;\n      gap: 6px;\n      font-size: 11px;\n      font-weight: 600;\n      color: #64748b;\n      text-transform: uppercase;\n      letter-spacing: 0.05em;\n      margin-bottom: 8px;\n    }\n    \n    .sitechat-sources-label svg {\n      width: 12px;\n      height: 12px;\n    }\n    \n    .sitechat-sources-list {\n      display: flex;\n      flex-wrap: wrap;\n      gap: 6px;\n    }\n    \n    .sitechat-source-link {\n      display: inline-flex;\n      align-items: center;\n      gap: 5px;\n      font-size: 12px;\n      color: " + config.primaryColor + ";\n      text-decoration: none;\n      padding: 6px 10px;\n      background: linear-gradient(135deg, " + config.primaryColor + "08, " + config.primaryColor + "12);\n      border: 1px solid " + config.primaryColor + "20;\n      border-radius: 8px;\n      transition: all 0.2s ease;\n      max-width: 200px;\n      overflow: hidden;\n      text-overflow: ellipsis;\n      white-space: nowrap;\n    }\n    \n    .sitechat-source-link svg {\n      width: 12px;\n      height: 12px;\n      flex-shrink: 0;\n      opacity: 0.7;\n    }\n    \n    .sitechat-source-link:hover {\n      background: linear-gradient(135deg, " + config.primaryColor + "15, " + config.primaryColor + "20);\n      border-color: " + config.primaryColor + "40;\n      transform: translateY(-1px);\n      box-shadow: 0 2px 8px " + config.primaryColor + "20;\n    }\n    \n    .sitechat-typing-wrapper {\n      display: flex;\n      gap: 10px;\n      align-items: flex-start;\n      animation: messageIn 0.3s ease;\n    }\n    \n    .sitechat-typing {\n      display: flex;\n      gap: 5px;\n      padding: 14px 18px;\n      background: white;\n      border-radius: 18px;\n      border-bottom-left-radius: 6px;\n      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);\n      border: 1px solid rgba(0, 0, 0, 0.04);\n    }\n    \n    .sitechat-typing span {\n      width: 8px;\n      height: 8px;\n      background: linear-gradient(135deg, " + config.primaryColor + ", " + adjustHexColor(config.primaryColor, -20) + ");\n      border-radius: 50%;\n      animation: typingBounce 1.4s infinite ease-in-out;\n    }\n    \n    .sitechat-typing span:nth-child(1) { animation-delay: 0s; }\n    .sitechat-typing span:nth-child(2) { animation-delay: 0.15s; }\n    .sitechat-typing span:nth-child(3) { animation-delay: 0.3s; }\n    \n    @keyframes typingBounce {\n      0%, 60%, 100% { \n        transform: translateY(0);\n        opacity: 0.4;\n      }\n      30% { \n        transform: translateY(-6px);\n        opacity: 1;\n      }\n    }\n    \n    .sitechat-input-wrapper {\n      padding: 16px;\n      background: white;\n      border-top: 1px solid #e5e7eb;\n    }\n    \n    .sitechat-input-form {\n      display: flex;\n      gap: 10px;\n      background: #f3f4f6;\n      border-radius: 12px;\n      padding: 6px;\n    }\n    \n    .sitechat-input {\n      flex: 1;\n      border: none;\n      background: transparent;\n      padding: 10px 12px;\n      font-size: 14px;\n      color: #374151;\n      outline: none;\n    }\n    \n    .sitechat-input::placeholder {\n      color: #9ca3af;\n    }\n    \n    .sitechat-send {\n      width: 44px;\n      height: 44px;\n      border-radius: 10px;\n      background: linear-gradient(135deg, " + config.primaryColor + ", " + adjustHexColor(config.primaryColor, -20) + ");\n      border: none;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      transition: all 0.2s;\n    }\n    \n    .sitechat-send:hover:not(:disabled) {\n      transform: scale(1.05);\n    }\n    \n    .sitechat-send:disabled {\n      background: #d1d5db;\n      cursor: not-allowed;\n    }\n    \n    .sitechat-send svg {\n      width: 20px;\n      height: 20px;\n      color: white;\n    }\n    \n    @media (max-width: 480px) {\n      .sitechat-window {\n        width: calc(100% - 32px);\n        right: 16px;\n        bottom: 90px;\n        height: calc(100vh - 120px);\n        max-height: 560px;\n      }\n      \n      .sitechat-toggle {\n        right: 16px;\n        bottom: 16px;\n      }\n    }\n    \n    /* Nudge Bubble Styles */\n    .sitechat-nudge {\n      position: fixed;\n      bottom: 100px;\n      right: 24px;\n      max-width: 280px;\n      background: white;\n      border-radius: 16px;\n      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1);\n      z-index: 99997;\n      cursor: pointer;\n      opacity: 0;\n      transform: translateY(20px) scale(0.9);\n      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n      overflow: hidden;\n    }\n    \n    .sitechat-nudge::before {\n      content: '';\n      position: absolute;\n      top: 0;\n      left: 0;\n      right: 0;\n      height: 4px;\n      background: linear-gradient(135deg, " + config.primaryColor + ", " + adjustHexColor(config.primaryColor, -20) + ");\n    }\n    \n    .sitechat-nudge-in {\n      opacity: 1;\n      transform: translateY(0) scale(1);\n    }\n    \n    .sitechat-nudge-out {\n      opacity: 0;\n      transform: translateY(10px) scale(0.95);\n    }\n    \n    .sitechat-nudge-message {\n      padding: 16px 40px 16px 16px;\n      font-size: 14px;\n      line-height: 1.5;\n      color: #1e293b;\n    }\n    \n    .sitechat-nudge-close {\n      position: absolute;\n      top: 8px;\n      right: 8px;\n      width: 24px;\n      height: 24px;\n      border: none;\n      background: #f1f5f9;\n      border-radius: 50%;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      font-size: 16px;\n      color: #64748b;\n      transition: all 0.2s ease;\n    }\n    \n    .sitechat-nudge-close:hover {\n      background: #e2e8f0;\n      color: #475569;\n    }\n    \n    .sitechat-nudge:hover {\n      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18), 0 6px 16px rgba(0, 0, 0, 0.12);\n    }\n    \n    @media (max-width: 480px) {\n      .sitechat-nudge {\n        right: 16px;\n        bottom: 90px;\n        max-width: calc(100% - 32px);\n      }\n    }\n    \n    /* Human Handoff Styles */\n    .sitechat-handoff-btn {\n      margin-left: auto;\n      width: 36px;\n      height: 36px;\n      border: none;\n      background: rgba(255, 255, 255, 0.2);\n      border-radius: 8px;\n      cursor: pointer;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      transition: all 0.2s ease;\n    }\n    \n    .sitechat-handoff-btn:hover {\n      background: rgba(255, 255, 255, 0.3);\n      transform: scale(1.05);\n    }\n    \n    .sitechat-handoff-btn svg {\n      width: 18px;\n      height: 18px;\n      color: white;\n    }\n    \n    .sitechat-header.handoff-mode {\n      background: linear-gradient(135deg, #059669, #047857) !important;\n    }\n    \n    .sitechat-avatar.agent {\n      background: linear-gradient(135deg, #059669, #047857) !important;\n    }\n    \n    .sitechat-system-message {\n      display: flex;\n      justify-content: center;\n      padding: 8px 16px;\n      animation: messageIn 0.3s ease;\n    }\n    \n    .sitechat-system-message span {\n      background: #f1f5f9;\n      color: #64748b;\n      font-size: 12px;\n      padding: 6px 12px;\n      border-radius: 12px;\n    }\n    \n    .sitechat-handoff-suggestion {\n      background: linear-gradient(135deg, #f0fdf4, #dcfce7);\n      border: 1px solid #bbf7d0;\n      border-radius: 12px;\n      padding: 16px;\n      margin: 8px 0;\n      animation: messageIn 0.3s ease;\n    }\n    \n    .sitechat-handoff-suggestion p {\n      font-size: 14px;\n      color: #166534;\n      margin-bottom: 12px;\n    }\n    \n    .sitechat-handoff-suggestion-buttons {\n      display: flex;\n      gap: 8px;\n    }\n    \n    .sitechat-handoff-yes {\n      flex: 1;\n      padding: 10px 16px;\n      background: #059669;\n      color: white;\n      border: none;\n      border-radius: 8px;\n      font-size: 13px;\n      font-weight: 500;\n      cursor: pointer;\n      transition: all 0.2s ease;\n    }\n    \n    .sitechat-handoff-yes:hover {\n      background: #047857;\n    }\n    \n    .sitechat-handoff-no {\n      flex: 1;\n      padding: 10px 16px;\n      background: white;\n      color: #475569;\n      border: 1px solid #e2e8f0;\n      border-radius: 8px;\n      font-size: 13px;\n      font-weight: 500;\n      cursor: pointer;\n      transition: all 0.2s ease;\n    }\n    \n    .sitechat-handoff-no:hover {\n      background: #f8fafc;\n      border-color: #cbd5e1;\n    }\n    \n    .sitechat-offline-form {\n      text-align: center;\n      padding: 8px;\n    }\n    \n    .sitechat-offline-icon {\n      width: 48px;\n      height: 48px;\n      background: #fef3c7;\n      border-radius: 50%;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      margin: 0 auto 12px;\n    }\n    \n    .sitechat-offline-icon svg {\n      width: 24px;\n      height: 24px;\n      color: #d97706;\n    }\n    \n    .sitechat-offline-form h4 {\n      font-size: 15px;\n      font-weight: 600;\n      color: #1e293b;\n      margin-bottom: 6px;\n    }\n    \n    .sitechat-offline-form p {\n      font-size: 13px;\n      color: #64748b;\n      margin-bottom: 16px;\n    }\n    \n    .sitechat-offline-email-form {\n      display: flex;\n      gap: 8px;\n    }\n    \n    .sitechat-offline-email {\n      flex: 1;\n      padding: 10px 12px;\n      border: 1px solid #e2e8f0;\n      border-radius: 8px;\n      font-size: 14px;\n      outline: none;\n    }\n    \n    .sitechat-offline-email:focus {\n      border-color: #059669;\n    }\n    \n    .sitechat-offline-submit {\n      padding: 10px 16px;\n      background: #059669;\n      color: white;\n      border: none;\n      border-radius: 8px;\n      font-size: 14px;\n      font-weight: 500;\n      cursor: pointer;\n      transition: all 0.2s ease;\n    }\n    \n    .sitechat-offline-submit:hover {\n      background: #047857;\n    }\n    \n    .sitechat-offline-success {\n      display: flex;\n      flex-direction: column;\n      align-items: center;\n      gap: 12px;\n      padding: 16px;\n    }\n    \n    .sitechat-offline-success svg {\n      width: 32px;\n      height: 32px;\n      color: #059669;\n    }\n    \n    .sitechat-offline-success p {\n      font-size: 14px;\n      color: #374151;\n      text-align: center;\n    }\n    \n    /* Branding Footer */\n    .sitechat-branding {\n      padding: 8px 16px;\n      text-align: center;\n      border-top: 1px solid #f3f4f6;\n      background: #fafafa;\n      border-radius: 0 0 16px 16px;\n    }\n    \n    .sitechat-branding a {\n      font-size: 11px;\n      color: #9ca3af;\n      text-decoration: none;\n      transition: color 0.2s ease;\n    }\n    \n    .sitechat-branding a:hover {\n      color: #6b7280;\n    }\n    \n    .sitechat-branding strong {\n      font-weight: 600;\n    }\n  ";
  const baseStyleEl = document["createElement"]("style");
  baseStyleEl["textContent"] = baseWidgetCss, document["head"]["appendChild"](baseStyleEl);
  const widgetRoot = document["createElement"]("div");
  widgetRoot["className"] = "sitechat-widget", widgetRoot["innerHTML"] = '\n    <button class="sitechat-toggle" aria-label="Toggle chat">\n      <svg class="sitechat-icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>\n      </svg>\n      <svg class="sitechat-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n        <line x1="18" y1="6" x2="6" y2="18"/>\n        <line x1="6" y1="6" x2="18" y2="18"/>\n      </svg>\n    </button>\n    \n    <div class="sitechat-window">\n      <div class="sitechat-header">\n        <div class="sitechat-header-icon">\n          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n            <path d="M12 2L2 7l10 5 10-5-10-5z"/>\n            <path d="M2 17l10 5 10-5"/>\n            <path d="M2 12l10 5 10-5"/>\n          </svg>\n        </div>\n        <div class="sitechat-header-text">\n          <h3>' + config.title + '</h3>\n          <p>Powered by AI</p>\n        </div>\n        <button class="sitechat-handoff-btn" title="Talk to a human">\n          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>\n            <circle cx="12" cy="7" r="4"/>\n          </svg>\n        </button>\n      </div>\n      \n      <div class="sitechat-messages">\n        <div class="sitechat-welcome">\n          <div class="sitechat-welcome-icon">\n            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">\n              <path d="M12 2L2 7l10 5 10-5-10-5z"/>\n              <path d="M2 17l10 5 10-5"/>\n              <path d="M2 12l10 5 10-5"/>\n            </svg>\n          </div>\n          <h4>Hi there! 👋</h4>\n          <p>I\'m your AI assistant. Ask me anything about this website.</p>\n          <div class="sitechat-welcome-suggestions">\n            <button class="sitechat-suggestion" data-query="What can you help me with?">What can you help me with?</button>\n            <button class="sitechat-suggestion" data-query="Tell me about this website">Tell me about this website</button>\n          </div>\n        </div>\n      </div>\n      \n      <div class="sitechat-input-wrapper">\n        <form class="sitechat-input-form">\n          <input type="text" class="sitechat-input" placeholder="Type your message..." autocomplete="off">\n          <button type="submit" class="sitechat-send" disabled>\n            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n              <line x1="22" y1="2" x2="11" y2="13"/>\n              <polygon points="22 2 15 22 11 13 2 9 22 2"/>\n            </svg>\n          </button>\n        </form>\n      </div>\n      \n      <div class="sitechat-branding">\n        <a href="'+ config.apiUrl +'" target="_blank" rel="noopener noreferrer">\n          Powered by <strong>SiteChat</strong>\n        </a>\n      </div>\n    </div>\n  ', 
  document["body"]["appendChild"](widgetRoot), injectResponsiveStyles(), updateBrandingFooter();
  const toggleBtn = widgetRoot["querySelector"](".sitechat-toggle"),
    windowEl = widgetRoot["querySelector"](".sitechat-window"),
    messagesEl = widgetRoot["querySelector"](".sitechat-messages"),
    inputForm = widgetRoot["querySelector"](".sitechat-input-form"),
    inputEl = widgetRoot["querySelector"](".sitechat-input"),
    sendBtn = widgetRoot["querySelector"](".sitechat-send"),
    handoffBtn = widgetRoot["querySelector"](".sitechat-handoff-btn");
  function isMobileViewport() {
    try {
      return window.matchMedia("(max-width: 900px)").matches;
    } catch (G) {
      return window.innerWidth <= 900;
    }
  }
  function applyMobileViewportOffsets() {
    if (!isMobileViewport()) {
      toggleBtn.style.removeProperty("bottom");
      windowEl.style.removeProperty("bottom");
      if (activeNudgeEl) activeNudgeEl.style.removeProperty("bottom");
      return;
    }
    const G = window.visualViewport;
    const H = G ? Math.max(0, window.innerHeight - (G.height + G.offsetTop)) : 0;
    const I = Math.max(12, 12 + H);
    const J = Math.max(76, 76 + H);
    toggleBtn.style.bottom = "calc(" + I + "px + env(safe-area-inset-bottom, 0px))";
    windowEl.style.bottom = "calc(" + J + "px + env(safe-area-inset-bottom, 0px))";
    if (activeNudgeEl) activeNudgeEl.style.bottom = "calc(" + J + "px + env(safe-area-inset-bottom, 0px))";
  }
  let viewportOffsetRaf = null;
  function scheduleMobileViewportOffsets() {
    if (viewportOffsetRaf) cancelAnimationFrame(viewportOffsetRaf);
    viewportOffsetRaf = requestAnimationFrame(() => {
      viewportOffsetRaf = null, applyMobileViewportOffsets();
    });
  }
  window.addEventListener("resize", scheduleMobileViewportOffsets, {
    passive: true
  }), window.addEventListener("orientationchange", scheduleMobileViewportOffsets, {
    passive: true
  }), window.visualViewport && (window.visualViewport.addEventListener("resize", scheduleMobileViewportOffsets, {
    passive: true
  }), window.visualViewport.addEventListener("scroll", scheduleMobileViewportOffsets, {
    passive: true
  })), scheduleMobileViewportOffsets();
  let chatOpen = false, welcomeRemoved = false, lastMessageIndex = -1;
  toggleBtn["addEventListener"]("click", () => {
    const wasOpen = chatOpen;
    chatOpen = !chatOpen;
    toggleBtn["classList"]["toggle"]("open", chatOpen);
    windowEl["classList"]["toggle"]("open", chatOpen);
    if (wasOpen && !chatOpen && handoffState.handoffId && (handoffState.mode === "pending" || handoffState.mode === "active")) {
      const Hid = handoffState.handoffId;
      fetch(config.apiUrl + "/api/handoff/" + encodeURIComponent(Hid) + "/abandon", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON["stringify"]({
          session_id: sessionId
        })
      })["catch"](() => {});
      handoff["stopPolling"]();
      handoff["clearHandoffLocal"]();
    }
    if (chatOpen) inputEl["focus"]();
  }), handoffBtn["addEventListener"]("click", () => {
    handoff["requestHandoff"]("user_request");
  }), inputEl["addEventListener"]("input", () => {
    sendBtn["disabled"] = !inputEl["value"]["trim"]();
  }), widgetRoot["addEventListener"]("click", G => {
    if (G["target"]["classList"]["contains"]("sitechat-suggestion")) {
      const H = G["target"]["dataset"]["query"];
      H && (inputEl["value"] = H, sendBtn["disabled"] = false, inputForm["dispatchEvent"](new Event("submit")));
    }
  }), widgetRoot["addEventListener"]("click", async G => {
    const H = G["target"]["closest"](".sitechat-feedback-btn");
    if (!H) return;
    const I = H["closest"](".sitechat-feedback"), J = parseInt(I["dataset"]["msgIndex"]), K = H["dataset"]["feedback"];
    I["querySelectorAll"](".sitechat-feedback-btn")["forEach"](L => {
      L["classList"]["remove"]("active", "positive", "negative");
    }), H["classList"]["add"]("active", K);
    try {
      await fetch(config.apiUrl + "/api/chat/feedback?session_id=" + sessionId + "&message_index=" + J + "&feedback=" + K, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      }), setTimeout(() => {
        I["innerHTML"] = '\n          <div class="sitechat-feedback-thanks">\n            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n              <polyline points="20 6 9 17 4 12"/>\n            </svg>\n            Thanks for your feedback!\n          </div>\n        ';
      }, 300);
    } catch (L) {
      console["error"]("Failed to submit feedback:", L);
    }
  }), inputForm["addEventListener"]("submit", async G => {
    G["preventDefault"]();
    const H = inputEl["value"]["trim"]();
    if (!H) return;
    inputEl["value"] = "", sendBtn["disabled"] = true;
    if (!welcomeRemoved) {
      const J = messagesEl["querySelector"](".sitechat-welcome");
      if (J) J["remove"]();
      welcomeRemoved = true;
    }
    appendMessage(H, "user");
    if (handoffState.mode === "pending" || handoffState.mode === "active") {
      const K = await handoff["sendMessage"](H);
      !K && handoff["addSystemMessage"]("Failed to send message. Please try again.");
      return;
    }
    const typingRow = showTypingIndicator();
    try {
      const L = await fetch(config.apiUrl + "/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON["stringify"]({
          message: H,
          session_id: sessionId,
          site_id: config.siteId
        })
      }), M = await L["json"]();
      typingRow["remove"](), appendMessage(M["answer"] || M["response"] || "No response", "bot", M["sources"]), M["suggest_handoff"] && showHandoffSuggestion(M["handoff_reason"]);
    } catch (N) {
      typingRow["remove"](), appendMessage("Sorry, something went wrong. Please try again.", "bot");
    }
  });
  function showHandoffSuggestion(G) {
    const H = document["createElement"]("div");
    H["className"] = "sitechat-handoff-suggestion", H["innerHTML"] = '\n      <p>Would you like to speak with a human agent?</p>\n      <div class="sitechat-handoff-suggestion-buttons">\n        <button class="sitechat-handoff-yes">Yes, connect me</button>\n        <button class="sitechat-handoff-no">No, thanks</button>\n      </div>\n    ', 
    H["querySelector"](".sitechat-handoff-yes")["addEventListener"]("click", () => {
      H["remove"](), handoff["requestHandoff"](G || "ai_suggested");
    }), H["querySelector"](".sitechat-handoff-no")["addEventListener"]("click", () => {
      H["remove"]();
    }), messagesEl["appendChild"](H), messagesEl["scrollTop"] = messagesEl["scrollHeight"];
  }
  function appendMessage(G, H, I = []) {
    lastMessageIndex++;
    const msgIndex = lastMessageIndex, K = document["createElement"]("div");
    K["className"] = "sitechat-message-wrapper " + H;
    const L = document["createElement"]("div");
    L["className"] = "sitechat-avatar " + H;
    H === "bot" ? L["innerHTML"] = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n        <path d="M12 2L2 7l10 5 10-5-10-5z"/>\n        <path d="M2 17l10 5 10-5"/>\n        <path d="M2 12l10 5 10-5"/>\n      </svg>' : L["textContent"] = "U";
    const M = document["createElement"]("div");
    M["className"] = "sitechat-message-content";
    const N = document["createElement"]("div");
    N["className"] = "sitechat-message " + H;
    let O = G;
    H === "bot" && (O = markdownToHtml(G));
    let P = O;
    config.showSources && I && I["length"] > 0 && (P += '\n        <div class="sitechat-sources">\n          <div class="sitechat-sources-label">\n            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>\n              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>\n            </svg>\n            Sources\n          </div>\n          <div class="sitechat-sources-list">\n            ' + I["map"](R => '\n              <a href="' + R["url"] + '" target="_blank" class="sitechat-source-link" title="' + R["url"] + '">\n                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>\n                  <polyline points="15 3 21 3 21 9"/>\n                  <line x1="10" y1="14" x2="21" y2="3"/>\n                </svg>\n                ' + (R["title"] || "Source") + "\n              </a>\n            ")["join"]("") + "\n          </div>\n        </div>\n      ");
    N["innerHTML"] = P, M["appendChild"](N);
    const Q = document["createElement"]("div");
    Q["className"] = "sitechat-message-time", Q["textContent"] = (new Date)["toLocaleTimeString"]([], {
      hour: "2-digit",
      minute: "2-digit"
    }), M["appendChild"](Q);
    if (H === "bot") {
      const R = document["createElement"]("div");
      R["className"] = "sitechat-feedback", R["dataset"]["msgIndex"] = msgIndex, R["innerHTML"] = '\n        <button class="sitechat-feedback-btn" data-feedback="positive" title="Helpful">\n          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>\n          </svg>\n        </button>\n        <button class="sitechat-feedback-btn" data-feedback="negative" title="Not helpful">\n          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>\n          </svg>\n        </button>\n      ', 
      M["appendChild"](R);
    }
    K["appendChild"](L), K["appendChild"](M), messagesEl["appendChild"](K), messagesEl["scrollTop"] = messagesEl["scrollHeight"];
  }
  function markdownToHtml(G) {
    let H = G["replace"](/\*\*(.*?)\*\*/g, "<strong>$1</strong>")["replace"](/`([^`]+)`/g, "<code>$1</code>")["split"]("\n\n")["map"](I => I["trim"]())["filter"](I => I)["map"](I => {
      if (I["match"](/^[\*\-]\s/m)) {
        const J = I["split"]("\n")["map"](K => K["replace"](/^[\*\-]\s/, "")["trim"]())["filter"](K => K);
        return "<ul>" + J["map"](K => "<li>" + K + "</li>")["join"]("") + "</ul>";
      }
      if (I["match"](/^\d+\.\s/m)) {
        const K = I["split"]("\n")["map"](L => L["replace"](/^\d+\.\s/, "")["trim"]())["filter"](L => L);
        return "<ol>" + K["map"](L => "<li>" + L + "</li>")["join"]("") + "</ol>";
      }
      return "<p>" + I["replace"](/\n/g, "<br>") + "</p>";
    })["join"]("");
    return H;
  }
  function showTypingIndicator() {
    const G = document["createElement"]("div");
    G["className"] = "sitechat-typing-wrapper";
    const H = document["createElement"]("div");
    H["className"] = "sitechat-avatar bot", H["innerHTML"] = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n      <path d="M12 2L2 7l10 5 10-5-10-5z"/>\n      <path d="M2 17l10 5 10-5"/>\n      <path d="M2 12l10 5 10-5"/>\n    </svg>';
    const I = document["createElement"]("div");
    return I["className"] = "sitechat-typing", I["innerHTML"] = "<span></span><span></span><span></span>", G["appendChild"](H), 
    G["appendChild"](I), messagesEl["appendChild"](G), messagesEl["scrollTop"] = messagesEl["scrollHeight"], G;
  }
})();
