/* Hope UI 的公开通知事件只调整本主题中的展示时长；内容和关闭仍由原生组件负责。
   在头部资源加载后订阅通知事件，不依赖构建哈希模块或全局计时器替换。 */
(() => {
  "use strict";
  window.__nasapunkNotices?.destroy();
  const html = document.documentElement;
  const entries = new Map();
  const showEvent = "hope-ui:show-notification";
  const updateEvent = "hope-ui:update-notification";
  let frame = 0, stopped = false;
  const themed = () => !/\/@(?:manage|init)(?:\/|$)/.test(location.pathname);
  const bootPending = () => !!document.getElementById("nasapunk-boot") || window.__nasapunkBoot?.done === false;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function holdNativeTimer(event) {
    if (!themed() || !event.detail || typeof event.detail !== "object") return;
    // persistent 阻止原生 mouseleave 重启自动关闭计时器，由主题管理展示时长。
    event.detail.persistent = true;
    event.detail.duration = 5000;
    event.detail.closable = true;
  }
  function clearEntry(entry) {
    clearTimeout(entry.enterTimer); clearTimeout(entry.closeTimer);
  }
  function position() {
    const nav = document.querySelector(".hope-breadcrumb");
    const header = document.querySelector(".header");
    const headerBottom = header?.getBoundingClientRect().bottom || 72;
    const top = Math.max(48, headerBottom + 30, nav?.getBoundingClientRect().top || 0);
    const value = Math.round(Math.min(top, innerHeight * .35)) + "px";
    if (html.style.getPropertyValue("--nasapunk-notice-top") !== value) html.style.setProperty("--nasapunk-notice-top", value);
  }
  function refresh() {
    frame = 0;
    if (stopped) return;
    for (const [node, entry] of entries) {
      if (!node.isConnected) { clearEntry(entry); entries.delete(node); }
    }
    if (!themed()) return;
    position();
    document.querySelectorAll(".hope-notification__list > *").forEach(node => {
      if (node.className.includes("-exit")) return;
      let entry = entries.get(node);
      if (!entry) {
        entry = {}; entries.set(node, entry);
        node.dataset.nasapunkNotice = node.querySelector(".markdown") ? "ANNOUNCEMENT" : "NOTICE";
        node.dataset.nasapunkNoticeState = "waiting";
      }
      if (node.dataset.nasapunkNoticeState !== "waiting" || bootPending()) return;
      // 公告的 Markdown 是懒加载的；正文真正出现后才展示，避免空白卡片消耗时间。
      if (node.querySelector(".markdown") && !node.querySelector(".markdown-body")) return;
      node.dataset.nasapunkNoticeState = "entering";
      // 两帧确保等待状态先被绘制；原生入场类不会覆盖此状态。
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (stopped || !node.isConnected) return;
        node.dataset.nasapunkNoticeState = "visible";
        entry.enterTimer = setTimeout(() => {
          if (!node.isConnected || node.className.includes("-exit")) return;
          node.setAttribute("data-nasapunk-notice-clock", "");
          entry.closeTimer = setTimeout(() => {
            // 调用原生 close，保留 onClose、状态清理与 TransitionGroup 退场。
            node.querySelector(".hope-close-button")?.click();
          }, 5000);
        }, reduced() ? 1 : 300);
      }));
    });
  }
  function schedule() { if (!stopped && !frame) frame = requestAnimationFrame(refresh); }
  const observer = new MutationObserver(schedule);
  observer.observe(html, { childList: true, subtree: true });
  window.addEventListener(showEvent, holdNativeTimer, true);
  window.addEventListener(updateEvent, holdNativeTimer, true);
  window.addEventListener("nasapunk:boot-complete", schedule);
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  window.__nasapunkNotices = {
    destroy() {
      stopped = true; observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener(showEvent, holdNativeTimer, true);
      window.removeEventListener(updateEvent, holdNativeTimer, true);
      window.removeEventListener("nasapunk:boot-complete", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      for (const [node, entry] of entries) {
        clearEntry(entry); node.querySelector(".hope-close-button")?.click();
        node.removeAttribute("data-nasapunk-notice"); node.removeAttribute("data-nasapunk-notice-state"); node.removeAttribute("data-nasapunk-notice-clock");
      }
      entries.clear(); html.style.removeProperty("--nasapunk-notice-top");
    }
  };
  schedule();
})();
