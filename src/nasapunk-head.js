/* 首屏加载控制
   百分比是首屏准备检查点，不是下载字节比例；不劫持 fetch/XHR。
   12% 文档解析 → 28% 应用挂载 → 45% 页面外壳 → 72% 内容就绪
   → 80% 样式 → 86% 字体 → 97% 首屏图片 → 100% 稳定、可以进入。
   不等待屏幕外懒加载图、视频完整下载或跨域 iframe 内部资源。
   资源就绪 + 最低展示时长满足后才到 100%，完成后再退场。
*/
(() => {
  "use strict";
  if (window.__nasapunkBoot) return;
  const html = document.documentElement;
  if (/\/@(?:manage|init)(?:\/|$)/.test(location.pathname)) return;
  html.setAttribute("data-nasapunk-theme", "01");
  let initialMode;
  try { initialMode = sessionStorage.getItem("nasapunk-color-mode-session"); } catch {}
  html.dataset.nasapunkMode = /^(light|dark)$/.test(initialMode) ? initialMode : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const CONFIG = { ...{
    enabled: true,
    minimumMs: 1800,     // 最低展示时长；慢速加载按实际就绪时间等待
    stableMs: 180,       // 避免懒加载组件切换间隙误判
    completeHoldMs: 180, // 100% 确实画出来以后，再开始退场
    stalledMs: 40000     // 仅异常兜底：40 秒无检查点进展，揭开原页面
  }, ...(window.NASAPUNK_CONFIG?.loading || {}) };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let panel, observer, watchTimer, mountedAt, readySince = 0;
  let frame = 0, inspectFrame = 0, completeTimer, leaveTimer;
  let target = 0, shown = 0, tweenTarget = -1, tweenFrom = 0, tweenStart = 0;
  let lastAdvance = performance.now(), lastInteger = -1;
  let readyView, readySignature = "", completing = false, finished = false;
  let track, percent;
  let artComplete = reduced, progressPainted = false;
  const completedArtGroups = new Set();
  const settledSheets = new WeakMap();
  const lockedNodes = new Map();
  // 首屏生命周期接口，供页面适配器在后台路由或加载失败时清理遮罩。
  window.__nasapunkBoot = { finish: cancel, get done() { return finished; } };

  function stopWatching() {
    observer?.disconnect();
    clearInterval(watchTimer);
    cancelAnimationFrame(inspectFrame);
    document.removeEventListener("load", onResource, true);
    document.removeEventListener("error", onResource, true);
    document.removeEventListener("DOMContentLoaded", queueInspect);
    document.fonts?.removeEventListener("loadingdone", queueInspect);
    document.fonts?.removeEventListener("loadingerror", queueInspect);
  }
  function unlock() {
    for (const [node, wasInert] of lockedNodes) node.inert = wasInert;
    lockedNodes.clear();
  }
  function cancel() {
    if (finished) return;
    finished = true;
    stopWatching();
    cancelAnimationFrame(frame);
    clearTimeout(completeTimer);
    clearTimeout(leaveTimer);
    window.removeEventListener("pagehide", cancel);
    window.removeEventListener("resize", syncArtSpacing);
    panel?.removeEventListener("animationend", onBootAnimation);
    panel?.removeEventListener("animationcancel", onBootAnimation);
    unlock();
    panel?.remove();
    window.dispatchEvent(new Event("nasapunk:boot-complete"));
  }
  function leave() {
    if (finished) return;
    progressPainted = true;
    // 缓存命中也让标题与最后一层残影完整展示，避免退场切断入场动画。
    if (!artComplete || panel.dataset.state === "complete" || panel.dataset.state === "leaving") return;
    panel.dataset.state = "complete";
    // 两帧后开始计时，确保浏览器先绘制 100%，再开始完成停留时间。
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        completeTimer = setTimeout(() => {
          if (finished) return;
          unlock();
          panel.dataset.state = "leaving";
          leaveTimer = setTimeout(cancel, reduced ? 0 : 500);
        }, reduced ? 0 : CONFIG.completeHoldMs);
      });
    });
  }
  function startArt() {
    if (finished || panel.hasAttribute("data-art-ready")) return;
    panel.setAttribute("data-art-ready", "");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      artComplete = true;
      if (progressPainted) leave();
    }
  }
  function onBootAnimation(event) {
    if (event.target.matches(".nasapunk-boot-instrument") && event.animationName === "nasapunk-instrument") {
      startArt();
    } else if (event.animationName === "nasapunk-echo-spread" && Math.abs(Number(event.target.dataset.nasapunkEchoDepth)) === 3) {
      completedArtGroups.add(event.target);
      if (completedArtGroups.size === 2) {
        artComplete = true;
        if (progressPainted) leave();
      }
    }
  }
  function visible(element) {
    if (!element || !element.getClientRects().length) return false;
    // 以原生 spinner 的存在判断加载状态；页面适配器会将其设为透明。
    return getComputedStyle(element).visibility !== "hidden";
  }
  function onResource(event) {
    const element = event.target;
    if (element instanceof HTMLLinkElement) settledSheets.set(element, element.href);
    queueInspect();
  }
  function advance(value) {
    if (value <= target) return;
    target = value;
    lastAdvance = performance.now();
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function draw(now) {
    frame = 0;
    if (finished) return;
    // 仪表入场前保持 0，避免快缓存时只看见突然跳到接近完成的数字。
    if (!reduced && now - mountedAt < 1080) {
      frame = requestAnimationFrame(draw);
      return;
    }
    if (tweenTarget !== target) {
      tweenTarget = target;
      tweenFrom = shown;
      tweenStart = now;
    }
    const duration = reduced ? 0 : completing ? 300 : 440;
    const t = duration ? Math.min(1, (now - tweenStart) / duration) : 1;
    shown = tweenFrom + (tweenTarget - tweenFrom) * (1 - Math.pow(1 - t, 3));
    // 填充与数字共享插值；真正抵达终点才显示 100，非整数检查点也只显示整数。
    track.style.setProperty("--nasapunk-progress", String(shown / 100));
    // 填充区域 inset=3px；这里使用同一几何边界裁剪反色文字，无须逐帧读取布局。
    const ratio = shown / 100;
    track.style.setProperty("--nasapunk-fill-edge", "calc(" + (ratio * 50) + "% + " + (3 * (1 - ratio)) + "px)");
    const integer = completing && t === 1 ? 100 : Math.min(99, Math.floor(shown));
    if (integer !== lastInteger) {
      lastInteger = integer;
      // 更新 Text 节点，避免触发页面适配器的 childList 观察器。
      percent.forEach(layer => { layer.firstChild.nodeValue = integer + "%"; });
      track.setAttribute("aria-valuenow", String(integer));
    }
    if (t < 1) frame = requestAnimationFrame(draw);
    else if (completing && target === 100) leave();
  }
  function queueInspect() {
    if (!finished && !completing && !inspectFrame) inspectFrame = requestAnimationFrame(inspect);
  }
  function inspect() {
    // 轮询也会调用此函数，先取消尚未执行的检查帧以免重复扫描。
    cancelAnimationFrame(inspectFrame);
    inspectFrame = 0;
    if (finished || completing || !panel) return;
    try {
      const now = performance.now();
      if (now - lastAdvance > CONFIG.stalledMs) {
        console.warn("[NASAPUNK] 首屏检查点长时间无进展，已撤下遮罩以显示原页面；未标记为加载成功。", { checkpoint: target });
        cancel();
        return;
      }
      if (/\/@(?:manage|init)(?:\/|$)/.test(location.pathname)) { cancel(); return; }
      let allReady = false;
      const root = document.getElementById("root");
      // 遮罩期间不让 Tab 移到被遮住的控件；结束时恢复原来的 inert 状态。
      for (const node of [root, document.getElementById("nasapunk-footer")]) {
        if (node && !lockedNodes.has(node)) {
          lockedNodes.set(node, node.inert);
          node.inert = true;
        }
      }
      const parsed = document.readyState !== "loading";
      if (parsed) advance(12);
      if (parsed && root?.children.length) {
        advance(28);
        const login = root.querySelector('input[name="username"], input[name="otp"], #totp');
        const box = root.querySelector(".obj-box");
        const shell = root.querySelector(".header, .body");
        if (visible(login) || visible(shell)) advance(45);
        const isLogin = /\/@login(?:\/|$)/.test(location.pathname);
        const view = isLogin ? login : box;
        // 等待 README / 文件预览也完成；目录树、播放器按钮不阻塞首屏。
        const busy = Array.from(root.querySelectorAll('.hope-spinner, [aria-busy="true"]')).some(el =>
          !el.closest('.folder-tree-box, .left-toolbar, button, [role="button"]') && visible(el));
        const contentReady = visible(view) && (isLogin || box.children.length > 0) && !busy;
        if (contentReady) {
          advance(72);
          const sheets = Array.from(document.querySelectorAll('link[rel~="stylesheet"]')).filter(link =>
            !link.disabled && (!link.media || matchMedia(link.media).matches));
          // 错误也是资源的终态，由浏览器使用兜底样式，不永久等待失效链接。
          const sheetsDone = sheets.filter(link => link.sheet || settledSheets.get(link) === link.href).length;
          advance(72 + (sheets.length ? 8 * sheetsDone / sheets.length : 8));
          const fontsDone = !document.fonts || document.fonts.status === "loaded";
          if (sheetsDone === sheets.length && fontsDone) {
            advance(86);
            const images = Array.from(root.querySelectorAll("img")).filter(img => {
              if (!visible(img) || (!img.currentSrc && !img.getAttribute("src") && !img.getAttribute("srcset"))) return false;
              const rect = img.getBoundingClientRect();
              return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
            });
            const imagesDone = images.filter(img => img.complete).length;
            advance(86 + (images.length ? 11 * imagesDone / images.length : 11));
            allReady = imagesDone === images.length;
            // URL/节点/资源集合变化时重新计稳定窗口，避免 SPA 重定向间隙完成。
            const signature = location.pathname + location.search + "|" + sheets.map(s => s.href).join("|") + "|" + images.map(img => img.currentSrc || img.src).join("|");
            if (view !== readyView || signature !== readySignature) {
              readyView = view;
              readySignature = signature;
              readySince = 0;
            }
          }
        }
      }
      if (!allReady) { readySince = 0; return; }
      if (!readySince) readySince = now;
      if (now - readySince < CONFIG.stableMs || now - mountedAt < (reduced ? 0 : CONFIG.minimumMs)) return;
      // 完成检查点提交以后，未来再出现的资源属于后续页面活动。
      completing = true;
      stopWatching();
      advance(100);
    } catch (error) {
      console.warn("[NASAPUNK] 加载状态检测失败，已撤下遮罩。", error);
      cancel();
    }
  }
  function syncArtSpacing() {
    if (!panel || finished) return;
    // 相邻残影间距为屏宽的 10%，三层共展开 30vw。
    // 按 SVG 的横向缩放换算距离，独立于标题高度，保持每层间距一致。
    panel.querySelectorAll(".nasapunk-boot-art svg").forEach(svg => {
      const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      if (!scale) return;
      const step = innerWidth * .10 / scale;
      svg.querySelectorAll(".nasapunk-art-echo").forEach(echo => {
        const depth = Number(echo.dataset.nasapunkEchoDepth);
        echo.style.setProperty("--nasapunk-echo-offset", (step * depth).toFixed(3) + "px");
      });
    });
  }
  function artwork(word, direction) {
    // 自绘工业宽体字：固定笔画与切角；SVG 直接内嵌，不产生资源请求。
    const glyphs = {
      A: "M0 100V20L20 0H64L84 20V100H58V64H26V100ZM26 24V42H58V24Z",
      S: "M18 0H84V24H26V38H66L84 56V82L66 100H0V76H58V62H18L0 44V18Z",
      P: "M0 100V0H64L84 20V48L64 68H26V100ZM26 24V44H58V24Z",
      K: "M0 0H26V38L57 0H84L44 49L84 100H53L26 64V100H0Z",
      M: "M0 100V0H22L42 34 62 0H84V100H60V43L42 70 24 43V100Z",
      O: "M18 0H66L84 18V82L66 100H18L0 82V18ZM28 25V75H56V25Z",
      N: "M0 100V0H24L60 57V0H84V100H60L24 43V100Z",
      E: "M0 0H84V24H26V38H74V62H26V76H84V100H0Z",
      C: "M18 0H84V26H29L26 29V71L29 74H84V100H18L0 82V18Z",
      L: "M0 0H26V74H84V100H0Z",
      U: "M0 0H26V73L29 76H55L58 73V0H84V82L66 100H18L0 82Z",
      D: "M0 0H63L84 21V79L63 100H0ZM26 24V76H53L58 71V29L53 24Z"
    };
    const name = word.toLowerCase();
    const id = "nasapunk-art-word-" + name;
    const width = word.length * 96 - 12;
    const step = 54; // 首次布局前的默认值，挂载后按屏宽计算实际间距
    const paths = Array.from(word).map((letter, index) =>
      '<path transform="translate(' + (index * 96) + ' 0)" d="' + glyphs[letter] + '"/>').join("");
    // NASAPUNK 残影向右展开，CLOUD 残影向左展开；屏幕从左到右为绿、黄、红。
    const colors = direction > 0 ? ["mint", "ochre", "red"] : ["red", "ochre", "mint"];
    const opacityLevels = ["near", "middle", "far"];
    // 远 → 近 → 主字；半透明残影自然叠色，最上层不透明主字遮住下方残影。
    const echoes = [3, 2, 1].map(index =>
      '<g class="nasapunk-art-echo" data-nasapunk-echo-depth="' + (direction * index) + '" style="--nasapunk-echo-opacity:var(--nasapunk-echo-' + opacityLevels[index - 1] + ');--nasapunk-echo-offset:' + (direction * step * index) +
      'px;--nasapunk-echo-delay:' + (.28 + index * .08).toFixed(2) + 's;--nasapunk-echo-color:var(--nasapunk-' + colors[index - 1] +
      ')"><use href="#' + id + '"/></g>').join("");
    return '<div class="nasapunk-boot-art nasapunk-boot-art--' + name + '" style="--nasapunk-art-ratio:' + width + ' / 100" aria-hidden="true">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' 100" preserveAspectRatio="xMidYMid meet" focusable="false">' +
      '<defs><g id="' + id + '" fill-rule="evenodd">' + paths + '</g></defs>' +
      '<g>' + echoes +
      '<g class="nasapunk-art-front"><use class="nasapunk-art-front-base" href="#' + id + '"/>' +
      '<use class="nasapunk-art-front-ink" href="#' + id + '"/></g></g></svg></div>';
  }
  function mount() {
    if (finished || panel || !document.body) return;
    if (!CONFIG.enabled) { cancel(); return; }
    observer?.disconnect();
    mountedAt = lastAdvance = performance.now();
    panel = document.createElement("div");
    panel.id = "nasapunk-boot";
    panel.innerHTML = '<div class="nasapunk-cross-grid" aria-hidden="true">' + "<i></i>".repeat(15) + "</div>" + artwork("NASAPUNK", 1) + artwork("CLOUD", -1) +
      '<div class="nasapunk-boot-stripes" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '<div class="nasapunk-boot-instrument"><span class="nasapunk-boot-legend" aria-hidden="true">LOADING</span>' +
      '<div class="nasapunk-boot-track" role="progressbar" aria-label="首屏准备进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
      '<div class="nasapunk-boot-fill" aria-hidden="true"><span class="nasapunk-boot-half"></span><span class="nasapunk-boot-half"></span></div>' +
      '<span class="nasapunk-boot-percent" aria-hidden="true">0%</span>' +
      '<span class="nasapunk-boot-percent nasapunk-boot-percent--left" aria-hidden="true">0%</span>' +
      '<span class="nasapunk-boot-percent nasapunk-boot-percent--right" aria-hidden="true">0%</span></div></div>';
    track = panel.querySelector(".nasapunk-boot-track");
    percent = panel.querySelectorAll(".nasapunk-boot-percent");
    panel.addEventListener("animationend", onBootAnimation);
    panel.addEventListener("animationcancel", onBootAnimation);
    document.body.appendChild(panel);
    if (reduced) startArt();
    syncArtSpacing();
    window.addEventListener("resize", syncArtSpacing);
    window.addEventListener("pagehide", cancel);
    observer = new MutationObserver(records => {
      // 自己的百分比文本变化不触发重新扫描整个页面。
      if (records.some(record => !panel.contains(record.target))) queueInspect();
    });
    observer.observe(html, { childList: true, subtree: true });
    document.addEventListener("load", onResource, true);
    document.addEventListener("error", onResource, true);
    document.addEventListener("DOMContentLoaded", queueInspect);
    document.fonts?.addEventListener("loadingdone", queueInspect);
    document.fonts?.addEventListener("loadingerror", queueInspect);
    // 轮询只检查就绪状态，不按时间自增百分比。
    watchTimer = setInterval(inspect, 150);
    advance(5);
    inspect();
  }
  // document.body 可用时挂载首屏遮罩，不依赖 body 入口脚本。
  observer = new MutationObserver(mount);
  observer.observe(html, { childList: true, subtree: true });
  mount();
})();

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
