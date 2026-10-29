/* 页面适配器：通过稳定的组件类名标记原生控件，添加主题装饰及交互。
   DOM 增删观察处理 SPA 与 Portal；主题状态由单独的属性观察器同步。
   控件事件和认证流程由 OpenList 管理。
*/
(() => {
  "use strict";
  window.__nasapunkSkin?.destroy();
  const html = document.documentElement;
  const config = window.NASAPUNK_CONFIG || {};
  const backgroundLoads = new Map();
  const flowNodes = new Map();
  const headerLinks = new Map();
  let disposed = false, clockTimer = 0, loginDecor = null;
  let frame = 0;
  const localLoading = new Set();
  const systemMode = matchMedia("(prefers-color-scheme: dark)");
  const marked = new Set();
  const markdownPanels = new Set();
  const markdownSurfaces = new Set();
  let footerTarget = null, themeButton = null, lastMode = null, lastModeOwner = null;
  let modeChoice = null;
  try { const saved = sessionStorage.getItem("nasapunk-color-mode-session"); if (saved === "light" || saved === "dark") modeChoice = saved; } catch {}
  const footerResize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  /* 主题状态与原生模式同步 */
  function saveMode(value) {
    modeChoice = value;
    try { if (value) sessionStorage.setItem("nasapunk-color-mode-session", value); else sessionStorage.removeItem("nasapunk-color-mode-session"); } catch {}
  }
  function modeOwners() { return Array.from(document.querySelectorAll(".hope-ui-dark, .hope-ui-light")); }
  function applyMode(mode) {
    html.dataset.nasapunkMode = mode;
    // 同步原生明暗样式类，保持 Hope UI 控件与主题一致。
    for (const owner of modeOwners()) {
      owner.classList.toggle("hope-ui-dark", mode === "dark");
      owner.classList.toggle("hope-ui-light", mode === "light");
    }
  }

  function mark(element, name) {
    if (!element) return;
    if (!element.hasAttribute(name)) element.setAttribute(name, "");
    marked.add(element);
  }
  function syncMode() {
    const owner = modeOwners()[0];
    const actual = owner ? (owner.classList.contains("hope-ui-dark") ? "dark" : "light") : null;
    // 原生侧栏改变模式后，以原生选择为准。
    if (lastMode && owner === lastModeOwner && actual && actual !== lastMode) saveMode(actual);
    const mode = modeChoice || (systemMode.matches ? "dark" : "light");
    applyMode(mode);
    lastMode = mode; lastModeOwner = owner;
    if (themeButton) {
      themeButton.setAttribute("aria-pressed", String(mode === "dark"));
      themeButton.setAttribute("aria-label", mode === "dark" ? "切换为浅色主题" : "切换为深色主题");
      themeButton.title = mode === "dark" ? "浅色主题" : "深色主题";
    }
  }
  function commitMode(next) {
    if (html.dataset.nasapunkMode === next) return;
    const nativeButton = Array.from(document.querySelectorAll('button, [role="button"], .hope-icon-button')).find(button => {
      if (button === themeButton || button.closest("#nasapunk-footer, #nasapunk-boot, .obj-box, .markdown-body, .folder-tree-box")) return false;
      const description = [button.getAttribute("aria-label"), button.getAttribute("title"), button.getAttribute("data-icon"), button.textContent].filter(Boolean).join(" ");
      return description.length < 100 && /切换.*(?:主题|模式)|深色|浅色|黑暗|明亮|暗色|亮色|\bdark\b|\blight\b|toggle.?theme|color.?mode/i.test(description) && !button.disabled;
    });
    if (nativeButton) { saveMode(next); nativeButton.click(); applyMode(next); lastMode = next; schedule(); return; }
    saveMode(next); applyMode(next); lastMode = next; syncMode();
  }

  // 动画只负责展示，不劫持 SolidJS 的路由、文件链接或下载操作。
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let themeScene = null, routeMotion = null, routeFrame = 0, routeTimer = 0;
  let knownRoute = location.pathname + location.search;
  const routeSurfaces = new Set();
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const p = clamp(value); return p * p * (3 - 2 * p); };
  const lerp = (a, b, p) => a + (b - a) * p;
  function finishTheme(commit = true) {
    const scene = themeScene;
    if (!scene) return;
    themeScene = null;
    cancelAnimationFrame(scene.frame); clearTimeout(scene.watchdog);
    try { if (commit && !scene.committed && !disposed) commitMode(scene.next); }
    finally {
      scene.element.remove();
      themeButton?.removeAttribute("aria-busy");
      if (themeButton) themeButton.disabled = false;
    }
  }
  function toggleMode() {
    if (themeScene || disposed) return;
    const next = html.dataset.nasapunkMode === "dark" ? "light" : "dark";
    if (config.themeTransitions === false || reducedMotion.matches || document.hidden) { commitMode(next); return; }
    endRouteMotion();
    const style = getComputedStyle(document.body);
    const oldColor = style.backgroundColor;
    // 从主题实际 CSS 变量中读取目标底色；单独的探针不会触发 OpenList 模式变化。
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none";
    probe.style.backgroundColor = getComputedStyle(html).getPropertyValue(next === "dark" ? "--nasapunk-night-paper" : "--nasapunk-day-paper");
    document.body.append(probe);
    const newColor = config.backgrounds?.main?.color && CSS.supports("color", config.backgrounds.main.color)
      ? config.backgrounds.main.color : getComputedStyle(probe).backgroundColor;
    probe.remove();
    const element = document.createElement("div");
    element.id = "nasapunk-theme-scene"; element.setAttribute("aria-hidden", "true");
    element.style.color = getComputedStyle(themeButton || html).color;
    element.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">' +
      '<defs><clipPath id="nasapunk-rise-clip" clipPathUnits="userSpaceOnUse"><path/></clipPath>' +
      '<radialGradient id="nasapunk-light-front" gradientUnits="userSpaceOnUse"><stop/><stop/><stop/><stop/></radialGradient>' +
      '<mask id="nasapunk-light-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style="mask-type:luminance"><rect fill="url(#nasapunk-light-front)"/></mask></defs>' +
      '<g class="nasapunk-scene-field" clip-path="url(#nasapunk-rise-clip)"><rect class="nasapunk-scene-old"/><rect class="nasapunk-scene-new" mask="url(#nasapunk-light-mask)"/></g>' +
      '<g class="nasapunk-scene-symbol" opacity="0"><g class="nasapunk-scene-orbit"><path class="nasapunk-scene-disc" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linejoin="round"/>' +
      Array.from({length:8}, () => '<line stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>').join("") + '</g></g></svg>';
    document.body.append(element);
    const svg = element.querySelector("svg"), clip = svg.querySelector("clipPath path");
    const oldRect = svg.querySelector(".nasapunk-scene-old"), newRect = svg.querySelector(".nasapunk-scene-new");
    const mask = svg.querySelector("mask"), maskRect = mask.querySelector("rect"), gradient = svg.querySelector("radialGradient");
    const stops = Array.from(gradient.children), symbol = svg.querySelector(".nasapunk-scene-symbol"), disc = svg.querySelector(".nasapunk-scene-disc");
    const rays = Array.from(svg.querySelectorAll("line"));
    oldRect.setAttribute("fill", oldColor); newRect.setAttribute("fill", newColor);
    const inward = next === "dark";
    stops.forEach((stop, i) => stop.setAttribute("stop-color", (i < 2) === inward ? "black" : "white"));
    stops[0].setAttribute("offset", "0"); stops[3].setAttribute("offset", "1");
    const sun = [0,-36, -19.88,-36,-36,-19.88,-36,0, -36,19.88,-19.88,36,0,36, 19.88,36,36,19.88,36,0, 36,-19.88,19.88,-36,0,-36];
    const moon = [8,-36, -17,-42,-38,-21,-38,0, -38,21,-21,38,0,38, 17,38,30,28,36,12, 5,24,-22,-5,8,-36];
    // x、y、倾角、半边长：两侧错落分布，每颗星的两条线等长且互相垂直。
    const stars = [[46,-58,18,5],[68,23,48,4],[-35,61,-16,6],[-64,-19,32,4.5]];
    let sceneWidth = 0, sceneHeight = 0;
    const began = performance.now();
    const scene = { element, next, frame: 0, committed: false, watchdog: 0 };
    themeScene = scene;
    if (themeButton) { themeButton.disabled = true; themeButton.setAttribute("aria-busy", "true"); }
    // 异常或浏览器后台节流时也会释放全屏遮罩。
    scene.watchdog = setTimeout(() => finishTheme(true), 5000);
    function draw(now) {
      if (themeScene !== scene || disposed) return;
      try {
        const elapsed = now - began;
        const w = innerWidth, h = innerHeight, rise = smooth(elapsed / 800), bloom = smooth((elapsed - 680) / 370);
        // 固定几何只在尺寸变化时更新，避免每帧重写整张 SVG 的布局。
        if(w !== sceneWidth || h !== sceneHeight) {
          sceneWidth=w;sceneHeight=h;svg.setAttribute("viewBox", '0 0 ' + w + ' ' + h);
          for (const rect of [oldRect, newRect, maskRect, mask]) { rect.setAttribute("width", w); rect.setAttribute("height", h); rect.setAttribute("x", 0); rect.setAttribute("y", 0); }
          gradient.setAttribute("cx", w/2); gradient.setAttribute("cy", h/2); gradient.setAttribute("r", Math.hypot(w,h)/2);
          const scale = Math.min(2, Math.max(1.25, Math.min(w,h)/420));
          symbol.setAttribute("transform", 'translate('+w/2+' '+h/2+') scale('+scale+')');
        }
        // 先以细长尖端上升，尾部延伸到屏幕底边之外；越过顶部后才横向铺满。
        const tip = h * (1 - 1.35 * rise), tail = h * 1.4;
        const spread = w * (.04 + .23 * rise + .95 * bloom);
        const cap = w * (.004 + .016 * rise + .85 * bloom);
        clip.setAttribute("d", bloom === 1 ? 'M0 0H'+w+'V'+h+'H0Z' :
          'M'+(w/2-spread)+' '+tail+' C'+(w/2-spread*.65)+' '+(tip+(tail-tip)*.72)+' '+(w/2-cap)+' '+(tip+(tail-tip)*.24)+' '+(w/2-cap)+' '+tip+
          ' Q'+(w/2)+' '+(tip-h*.04)+' '+(w/2+cap)+' '+tip+' C'+(w/2+cap)+' '+(tip+(tail-tip)*.24)+' '+(w/2+spread*.65)+' '+(tip+(tail-tip)*.72)+' '+(w/2+spread)+' '+tail+'Z');
        const morph = smooth((elapsed - 1410) / 1100);
        const radius = inward ? 1.2 - 1.4 * morph : -.2 + 1.4 * morph;
        stops[1].setAttribute("offset", clamp(radius-.16)); stops[2].setAttribute("offset", clamp(radius+.16));
        // 反向切换时先展示静止月亮，再由星光聚拢回太阳。
        const shape = inward ? morph : 1-morph;
        const points = sun.map((value, i) => lerp(value, moon[i], shape));
        const rotation = -Math.PI/2 * shape;
        function rotate(x,y) { return [x*Math.cos(rotation)-y*Math.sin(rotation),x*Math.sin(rotation)+y*Math.cos(rotation)]; }
        for(let i=0;i<points.length;i+=2) [points[i],points[i+1]]=rotate(points[i],points[i+1]);
        disc.setAttribute("d", 'M'+points.slice(0,2).join(' ')+' C'+points.slice(2).join(' ')+' Z');
        rays.forEach((ray,i) => {
          const angle = i*Math.PI/4-Math.PI/2, star=stars[Math.floor(i/2)], horizontal=i%2===0;
          const a=rotate(52*Math.cos(angle),52*Math.sin(angle)), b=rotate(66*Math.cos(angle),66*Math.sin(angle));
          const tilt=star[2]*Math.PI/180+(horizontal?0:Math.PI/2),sx=Math.cos(tilt)*star[3],sy=Math.sin(tilt)*star[3];
          const destA=[star[0]-sx,star[1]-sy],destB=[star[0]+sx,star[1]+sy];
          const pair=Math.floor(i/2), travel=smooth(clamp((shape-pair*.025)/(1-pair*.025)));
          const arc=Math.sin(Math.PI*travel)*12, bearing=Math.atan2(star[1],star[0]);
          const dx=arc*Math.cos(bearing),dy=arc*Math.sin(bearing);
          ray.setAttribute("x1",lerp(a[0],destA[0],travel)+dx);ray.setAttribute("y1",lerp(a[1],destA[1],travel)+dy);
          ray.setAttribute("x2",lerp(b[0],destB[0],travel)+dx);ray.setAttribute("y2",lerp(b[1],destB[1],travel)+dy);
        });
        symbol.setAttribute("opacity", smooth((elapsed-1050)/180));
        // 先完成遮罩内的颜色和图标变化，再切换页面，最后揭开遮罩。
        if (elapsed >= 2510 && !scene.committed) { scene.committed=true; commitMode(next); }
        element.style.opacity = String(1-smooth((elapsed-2630)/340));
        if(elapsed >= 2970) { finishTheme(false); return; }
        scene.frame=requestAnimationFrame(draw);
      } catch (error) { console.warn("NASAPUNK theme transition:", error); finishTheme(true); }
    }
    scene.frame=requestAnimationFrame(draw);
  }
  function endRouteMotion() {
    cancelAnimationFrame(routeFrame); clearTimeout(routeTimer); routeFrame=0; routeMotion=null;
    html.removeAttribute("data-nasapunk-route");
    for(const node of routeSurfaces) node.removeAttribute("data-nasapunk-route-surface");
    routeSurfaces.clear();
  }
  function beginRouteMotion() {
    if(disposed || themeScene || config.pageTransitions===false || reducedMotion.matches || html.dataset.nasapunkPage === "manage" || document.getElementById("nasapunk-boot") || routeMotion) return;
    clearTimeout(routeTimer);
    const root=document.getElementById("root"),surface=root?.querySelector(".body")||root;
    if(!surface)return;
    surface.setAttribute("data-nasapunk-route-surface", "");routeSurfaces.add(surface);
    routeMotion={};html.dataset.nasapunkRoute="leaving";
    // 只播放出场和进场，不检测资源、不等待 spinner；加载完全由 OpenList 的 LOADING 负责。
    routeTimer=setTimeout(()=>{
      if(disposed)return;
      const currentRoot=document.getElementById("root"),current=currentRoot?.querySelector(".body")||currentRoot;
      if(current){current.setAttribute("data-nasapunk-route-surface", "");routeSurfaces.add(current);}
      html.dataset.nasapunkRoute="entering";
      routeTimer=setTimeout(endRouteMotion,360);
    },180);
  }
  function navigationClick(event) {
    if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor=event.target instanceof Element ? event.target.closest('a[href]') : null;
    if(!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target!=="_self")) return;
    let url;
    try { url=new URL(anchor.href,location.href); } catch { return; }
    if(url.origin!==location.origin || !/^https?:$/.test(url.protocol) || url.pathname+url.search===location.pathname+location.search || /\/@(?:manage|init)(?:\/|$)/.test(url.pathname)) return;
    beginRouteMotion(location.pathname+location.search);
  }
  function navigationChanged() {
    const current=location.pathname+location.search;
    if(current!==knownRoute) { beginRouteMotion(knownRoute);knownRoute=current; }
    schedule();
  }
  const savedPush=history.pushState, savedReplace=history.replaceState;
  function motionPush(...args) { const result=Reflect.apply(savedPush,this,args);navigationChanged();return result; }
  function motionReplace(...args) { const result=Reflect.apply(savedReplace,this,args);navigationChanged();return result; }
  history.pushState=motionPush;history.replaceState=motionReplace;
  document.addEventListener("click",navigationClick,true);
  window.addEventListener("popstate",navigationChanged);
  function visibilityMotion() { if(document.hidden) { finishTheme(true);endRouteMotion(); } }
  function preferenceMotion() { if(reducedMotion.matches) { finishTheme(true);endRouteMotion(); } }
  document.addEventListener("visibilitychange",visibilityMotion);
  reducedMotion.addEventListener("change",preferenceMotion);

  /* 图形 Logo 与 favicon；清理时还原宿主属性。 */
  const brandingNodes = new Map();
  let themeFavicon = null;
  function brandingAttribute(node, name, value) {
    let original = brandingNodes.get(node);
    if (!original) { original = new Map(); brandingNodes.set(node, original); }
    if (!original.has(name)) original.set(name, node.getAttribute(name));
    if (value === null) { if (node.hasAttribute(name)) node.removeAttribute(name); }
    else if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function restoreBranding() {
    for (const [node, attrs] of brandingNodes) for (const [name, value] of attrs) {
      if (value === null) node.removeAttribute(name); else node.setAttribute(name, value);
    }
    brandingNodes.clear(); themeFavicon?.remove(); themeFavicon = null;
  }
  function syncBranding(root, login) {
    const value = config.logoUrl === undefined ? "nasapunk-icon.svg" : config.logoUrl;
    if (!value) { if (brandingNodes.size) restoreBranding(); return; }
    let url;
    try {
      const base = new URL((config.assetBase || "").replace(/\/$/, "") + "/", document.baseURI);
      url = new URL(value, base);
      if (!/^https?:$/.test(url.protocol)) return;
    } catch { return; }
    const images = new Set(root.querySelectorAll(".header .header-left img"));
    if (login) root.querySelectorAll(".hope-heading img").forEach(image => images.add(image));
    const footer = document.querySelector(".nasapunk-footer-symbol");
    if (footer) images.add(footer);
    for (const image of images) {
      brandingAttribute(image, "src", url.href);
      brandingAttribute(image, "srcset", null);
      if (image === footer) brandingAttribute(image, "hidden", null);
    }
    let icons = Array.from(document.head.querySelectorAll('link[rel~="icon"]'));
    if (!icons.length) {
      themeFavicon = document.createElement("link"); themeFavicon.rel = "icon";
      document.head.append(themeFavicon); icons = [themeFavicon];
    }
    for (const icon of icons) {
      brandingAttribute(icon, "href", url.href);
      brandingAttribute(icon, "type", url.pathname.endsWith(".svg") ? "image/svg+xml" : null);
      brandingAttribute(icon, "sizes", url.pathname.endsWith(".svg") ? "any" : null);
    }
    for (const node of brandingNodes.keys()) if (!node.isConnected) brandingNodes.delete(node);
  }

  function syncHeaderHome(header) {
    // 为顶栏 Logo 添加当前站点首页链接。
    const image = header.querySelector(".header-left img");
    if (!image) return;
    let anchor=image.closest("a");
    if (!anchor) {
      anchor=document.createElement("a");anchor.className="nasapunk-header-home";
      image.before(anchor);anchor.append(image);
      headerLinks.set(anchor,{image,created:true});
    } else if(!headerLinks.has(anchor)) {
      headerLinks.set(anchor,{image,created:false,href:anchor.getAttribute("href"),label:anchor.getAttribute("aria-label")});
    }
    const home="/";
    if(anchor.getAttribute("href")!==home)anchor.setAttribute("href",home);
    if(anchor.getAttribute("aria-label")!=="返回首页")anchor.setAttribute("aria-label","返回首页");
    for(const [link] of headerLinks) if(!link.isConnected)headerLinks.delete(link);
  }

  // 用户信息沿用 OpenList /api/me；只在打开菜单时查询，不读取记住账号/密码字段。
  let userButton = null, accountMenu = null, accountRequest = null, accountIconProbe = null;
  let accountSerial = 0;
  let accountAnimation = null;
  const retiringAccounts = new Map();
  /* 账户菜单 */
  const accountIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>';
  function loginURL() {
    const base = String(window.OPENLIST_CONFIG?.base_path || "").replace(/[/]$/, "");
    return new URL(base + "/@login", location.origin).href;
  }
  function closeAccount(focus = false, immediate = false) {
    const menu = accountMenu; accountMenu = null;
    userButton?.setAttribute("aria-expanded", "false");
    if (menu) {
      const style = getComputedStyle(menu), opacity = style.opacity, transform = style.transform;
      accountAnimation?.cancel(); accountAnimation = null;
      if (immediate || disposed || reducedMotion.matches || !menu.isConnected) menu.remove();
      else {
        menu.removeAttribute("id"); menu.classList.add("nasapunk-account-menu-retiring");
        menu.setAttribute("aria-hidden", "true"); menu.inert = true; menu.style.pointerEvents = "none";
        const animation = menu.animate([
          { opacity, transform }, { opacity: 0, transform: "translateY(-6px) scale(.96)" }
        ], { duration: 150, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
        retiringAccounts.set(menu, animation);
        const remove = () => { menu.remove(); retiringAccounts.delete(menu); };
        animation.onfinish = animation.oncancel = remove;
      }
    }
    if (focus) userButton?.focus();
  }
  function positionAccount() {
    if (!accountMenu || !userButton?.isConnected) { closeAccount(); return; }
    const r = userButton.getBoundingClientRect(), menu = accountMenu.getBoundingClientRect();
    accountMenu.style.left = Math.max(12, Math.min(r.right - menu.width, innerWidth - menu.width - 12)) + "px";
    accountMenu.style.top = Math.max(12, Math.min(r.bottom + 8, innerHeight - menu.height - 12)) + "px";
  }
  function exitAccount(switchUser) {
    // 官方 changeToken() 将 token 置空；刷新后原生请求实例会重新读取它。
    try { localStorage.setItem("token", ""); }
    catch { showAccount("无法清除登录状态，请检查浏览器存储权限", false); return; }
    accountRequest?.abort(); closeAccount();
    if (switchUser) location.replace(loginURL()); else location.reload();
  }
  function showAccount(name, authenticated) {
    closeAccount(false, true);
    const menu = document.createElement("div"); accountMenu = menu;
    menu.id = "nasapunk-account-menu"; menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "账户");
    const heading = document.createElement("div"); heading.className = "nasapunk-account-name"; heading.textContent = name; menu.append(heading);
    const actions = authenticated ? [["更换账户", () => exitAccount(true), 'M7 7h14m-4-4 4 4-4 4M17 17H3m4-4-4 4 4 4'], ["退出登录", () => exitAccount(false), 'M9 5H4v14h5m5-14 7 7-7 7m-7-7h14']] : [["重试", () => { closeAccount(); openAccount(); }, 'M20 7a8 8 0 1 0 1 8m-1-8V3m0 4h-4']];
    for (const [label, action, path] of actions) {
      const button = document.createElement("button"); button.type = "button"; button.setAttribute("role", "menuitem");
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
      button.append(document.createTextNode(label)); button.addEventListener("click", action); menu.append(button);
    }
    menu.addEventListener("keydown", event => {
      const items = Array.from(menu.querySelectorAll("button")), index = items.indexOf(document.activeElement);
      if (event.key === "Escape") { event.preventDefault(); closeAccount(true); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? items.length-1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items[next].focus();
      }
    });
    document.body.append(menu); userButton?.setAttribute("aria-expanded", "true"); positionAccount();
    if (!reducedMotion.matches) {
      accountAnimation = menu.animate([
        { opacity: 0, transform: "translateY(-6px) scale(.96)" }, { opacity: 1, transform: "translateY(0) scale(1)" }
      ], { duration: 200, easing: "cubic-bezier(.2,.7,.2,1)" });
    }
    menu.querySelector("button")?.focus();
  }
  async function openAccount() {
    if (accountMenu) { closeAccount(); return; }
    if (accountRequest) return;
    let token;
    try { token = localStorage.getItem("token") || ""; }
    catch { showAccount("无法读取登录状态", false); return; }
    if (!token) { location.assign(loginURL()); return; }
    const request = new AbortController(), serial = ++accountSerial; accountRequest = request;
    userButton?.setAttribute("aria-busy", "true");
    const timeout = setTimeout(() => request.abort(), 10000);
    try {
      const base = String(window.OPENLIST_CONFIG?.base_path || "").replace(/[/]$/, "");
      const configured = window.OPENLIST_CONFIG?.api;
      const api = new URL(configured && configured !== "/" ? configured : location.origin + base, location.origin).href.replace(/[/]$/, "");
      const response = await fetch(api + "/api/me", { headers: { Authorization: token }, credentials: "omit", cache: "no-store", signal: request.signal });
      const payload = await response.json();
      if (disposed || !userButton?.isConnected || serial !== accountSerial || localStorage.getItem("token") !== token) return;
      if (response.status === 401 || payload.code === 401 || (payload.code === 200 && payload.data?.role === 1)) { location.assign(loginURL()); return; }
      if (!response.ok || payload.code !== 200 || typeof payload.data?.username !== "string" || ![0,2].includes(payload.data.role)) throw new Error("invalid user response");
      showAccount(payload.data.username, true);
    } catch {
      if (!disposed && serial === accountSerial) showAccount("账户信息读取失败", false);
    } finally { clearTimeout(timeout); if (accountRequest === request) accountRequest = null; userButton?.removeAttribute("aria-busy"); }
  }
  function ensureUserButton(anchor, controls) {
    if (!userButton) {
      userButton = document.createElement("button"); userButton.id = "nasapunk-user-button"; userButton.type = "button";
      userButton.setAttribute("aria-label", "账户"); userButton.setAttribute("aria-haspopup", "menu"); userButton.setAttribute("aria-expanded", "false"); userButton.setAttribute("aria-controls", "nasapunk-account-menu");
      const icon = document.createElement("span"); icon.className = "nasapunk-user-icon"; icon.innerHTML = accountIcon; userButton.append(icon);
      userButton.addEventListener("click", openAccount);
      if (config.userIconUrl) {
        const url = String(config.userIconUrl); accountIconProbe = new Image(); accountIconProbe.crossOrigin = "anonymous";
        accountIconProbe.onload = () => { if (!disposed) { icon.style.setProperty("--nasapunk-user-icon-url", "url(" + JSON.stringify(url) + ")"); icon.setAttribute("data-cdn-ready", ""); } };
        accountIconProbe.onerror = () => { icon.removeAttribute("data-cdn-ready"); };
        accountIconProbe.src = url;
      }
    }
    if (anchor && anchor.nextElementSibling !== userButton) anchor.after(userButton);
    else if (!anchor && userButton.parentElement !== controls) controls.append(userButton);
  }
  function outsideAccount(event) { if (accountMenu && !accountMenu.contains(event.target) && !userButton?.contains(event.target)) closeAccount(); }
  function accountStorage(event) { if (event.key === "token") { ++accountSerial; accountRequest?.abort(); closeAccount(); } }
  document.addEventListener("pointerdown", outsideAccount);
  document.addEventListener("focusin", outsideAccount);
  window.addEventListener("resize", positionAccount);
  window.addEventListener("scroll", positionAccount, true);
  window.addEventListener("storage", accountStorage);

  function syncHeader(root) {
    const header = root.querySelector(".header");
    if (!header) { themeButton?.remove(); userButton?.remove(); if (accountRequest) { ++accountSerial; accountRequest.abort(); } closeAccount(); return; }
    syncHeaderHome(header);
    if (getComputedStyle(header).position === "static") header.setAttribute("data-nasapunk-header-static", "");
    if (!header.querySelector(":scope > .nasapunk-header-ribbon")) {
      const ribbon = document.createElement("div");
      ribbon.className = "nasapunk-header-ribbon"; ribbon.setAttribute("aria-hidden", "true");
      ribbon.innerHTML = "<i></i><i></i><i></i>"; header.append(ribbon);
    }
    const buttons = Array.from(header.querySelectorAll('button, .hope-icon-button, [role="button"]')).filter(button => button !== themeButton && button !== userButton && button.getClientRects().length);
    const anchor = buttons[buttons.length - 1];
    const controls = header.querySelector(".header-right");
    if (!controls) return;
    if (!themeButton) {
      themeButton = document.createElement("button");
      themeButton.id = "nasapunk-theme-toggle"; themeButton.type = "button";
      themeButton.innerHTML = '<svg class="nasapunk-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg><svg class="nasapunk-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20.5 15.5A9 9 0 0 1 8.5 3.5a9 9 0 1 0 12 12Z"/></svg>';
      themeButton.addEventListener("click", toggleMode);
    }
    if (anchor) { if (themeButton.parentElement !== anchor.parentElement || themeButton.nextElementSibling !== anchor) anchor.before(themeButton); }
    else if (themeButton.parentElement !== controls) controls.append(themeButton);
    ensureUserButton(anchor || themeButton, controls);
    for (const button of [themeButton, anchor, userButton]) if (button) mark(button, "data-nasapunk-header-control");
    syncMode();
  }

  // 展开沿用原生点击；收起先播放按钮区动画，再交还给原生组件卸载。
  const toolbarStates = new Map();
  let replayingToolbar = false;
  function positionToolbarLabel(box) {
    const panel = box.querySelector(":scope > .left-toolbar");
    const toggle = panel?.querySelector(':scope > [tips="more"]');
    if (!panel || !toggle) return;
    const r = box.getBoundingClientRect();
    const length = parseFloat(getComputedStyle(box, "::after").width) || 134;
    const bottom = toggle.getBoundingClientRect().top - r.top - 10;
    const center = Math.min(r.height * .1 + length / 2, bottom - length / 2);
    const value = center.toFixed(2) + "px";
    if (box.style.getPropertyValue("--nasapunk-settings-center") !== value) box.style.setProperty("--nasapunk-settings-center", value);
  }
  const toolbarResize = typeof ResizeObserver === "function" ? new ResizeObserver(entries => {
    for (const {target} of entries) positionToolbarLabel(target);
  }) : null;
  function syncToolbars() {
    for (const [box, state] of toolbarStates) {
      if (!box.isConnected) { state.animation?.cancel(); toolbarResize?.unobserve(box); toolbarStates.delete(box); }
    }
    // Solid Portal 将工具栏挂在 body 下，不属于 #root。
    document.querySelectorAll(".left-toolbar-box").forEach(box => {
      let state = toolbarStates.get(box);
      if (!state) { state = { panel: null, animation: null, closing: false }; toolbarStates.set(box, state); toolbarResize?.observe(box); }
      const panel = box.querySelector(":scope > .left-toolbar");
      positionToolbarLabel(box);
      if (panel === state.panel || state.closing) return;
      state.animation?.cancel(); state.panel = panel;
      box.toggleAttribute("data-nasapunk-toolbar-open", !!panel);
      const items = panel?.querySelector(".left-toolbar-in");
      if (items && !reducedMotion.matches) {
        const height = items.getBoundingClientRect().height;
        state.animation = items.animate([
          { height: "0px", opacity: 0, overflow: "hidden" },
          { height: height + "px", opacity: 1, overflow: "hidden" }
        ], { duration: 300, easing: "cubic-bezier(.2,.7,.2,1)" });
      }
    });
  }
  function toolbarClick(event) {
    if (replayingToolbar || disposed || reducedMotion.matches) return;
    const toggle = event.target.closest?.('.toolbar-toggle, .left-toolbar > [tips="more"]');
    const box = toggle?.closest(".left-toolbar-box");
    const panel = box?.querySelector(":scope > .left-toolbar");
    if (!panel || !html.hasAttribute("data-nasapunk-theme")) return;
    const state = toolbarStates.get(box);
    if (!state) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (state.closing) return;
    state.closing = true;
    // 只收缩工具项，底部的“更多”按钮始终留在原位。
    const items = panel.querySelector(".left-toolbar-in");
    if (!items) { state.closing = false; return; }
    const height = items.getBoundingClientRect().height;
    state.animation?.cancel();
    box.removeAttribute("data-nasapunk-toolbar-open");
    const animation = items.animate([
      { height: height + "px", opacity: 1, overflow: "hidden" },
      { height: "0px", opacity: 0, overflow: "hidden" }
    ], { duration: 260, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
    state.animation = animation;
    animation.finished.then(() => {
      if (disposed || !toggle.isConnected) return;
      replayingToolbar = true;
      try { toggle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); }
      finally { replayingToolbar = false; }
    }).catch(() => {}).finally(() => {
      state.closing = false; animation.cancel(); schedule();
    });
  }
  document.addEventListener("click", toolbarClick, true);

  // 独立绘制悬停框，避免给 Solid 管理的 SVG 图标包裹元素或改动点击绑定。
  const readySelector = '.header button, .header [role="button"], .header svg.hope-icon, .left-toolbar-box svg.hope-icon, #nasapunk-footer .nasapunk-footer-links a, #nasapunk-footer .nasapunk-footer-copy a';
  let readyTarget = null, readyOutline = null, readyFrame = 0, readyGeometry = "";
  let readyHoldTimer = 0, readyJoinTimer = 0;
  const retiringReady = new Map();
  function clearReady(immediate = false) {
    cancelAnimationFrame(readyFrame); readyFrame = 0;
    clearTimeout(readyHoldTimer); clearTimeout(readyJoinTimer);
    readyTarget?.removeAttribute("data-nasapunk-ready"); readyTarget = null;
    const old = readyOutline; readyOutline = null; readyGeometry = "";
    if (old) {
      old.removeAttribute("id"); old.removeAttribute("data-visible");
      if (immediate || reducedMotion.matches) old.remove();
      else retiringReady.set(old, setTimeout(() => { old.remove(); retiringReady.delete(old); }, 200));
    }
    if (immediate) {
      for (const [node, timer] of retiringReady) { clearTimeout(timer); node.remove(); }
      retiringReady.clear();
    }
  }
  function drawReady() {
    if (disposed || !readyTarget?.isConnected || !html.hasAttribute("data-nasapunk-theme")) { clearReady(); return; }
    const r = readyTarget.getBoundingClientRect();
    if (!r.width || !r.height) { clearReady(); return; }
    const geometry = [r.left - 3, r.top - 3, r.width + 6, r.height + 6].join(",");
    if (geometry !== readyGeometry) {
      readyGeometry = geometry;
      readyOutline.style.cssText = "left:" + (r.left-3) + "px;top:" + (r.top-3) + "px;width:" + (r.width+6) + "px;height:" + (r.height+6) + "px";
    }
    readyFrame = requestAnimationFrame(drawReady);
  }
  function enterReady(event) {
    if (event.pointerType === "touch") return;
    const candidate = event.target.closest?.(readySelector);
    const target = candidate?.closest('button, [role="button"]') || candidate;
    if (!target || target.disabled || readyTarget === target) return;
    clearReady(); readyTarget = target; target.setAttribute("data-nasapunk-ready", "");
    const outline = document.createElement("div"); readyOutline = outline;
    outline.id = "nasapunk-ready-outline"; outline.className = "nasapunk-ready-outline";
    outline.setAttribute("aria-hidden", "true");
    outline.innerHTML = '<i class="nasapunk-ready-corner"></i>'.repeat(4) + '<span class="nasapunk-ready-caption" data-nasapunk-keep-font>READY</span>';
    document.body.append(outline); drawReady();
    // 先提交透明的首帧，再淡入四角线段。
    outline.getBoundingClientRect();
    requestAnimationFrame(() => { if (readyOutline === outline) outline.setAttribute("data-visible", ""); });
    readyHoldTimer = setTimeout(() => {
      if (readyOutline !== outline) return;
      outline.setAttribute("data-joined", "");
      readyJoinTimer = setTimeout(() => {
        if (readyOutline === outline) outline.setAttribute("data-ready", "");
      }, reducedMotion.matches ? 0 : 600);
    }, 5000);
  }
  function leaveReady(event) { if (readyTarget && !readyTarget.contains(event.relatedTarget)) clearReady(); }
  document.addEventListener("pointerover", enterReady);
  document.addEventListener("pointerout", leaveReady);
  document.addEventListener("focusin", enterReady);
  document.addEventListener("focusout", leaveReady);

  /* Markdown 区域与文章标题 */
  const markdownRegions = new Map();
  const markdownTitles = new Map();
  const markdownResize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  function clearMarkdownTitle(markdown, entry) {
    // 不替换正文 HTML；只还原标题内部包装，链接等原节点及事件仍保留。
    if (entry.text.parentNode === entry.title) entry.text.replaceWith(...entry.text.childNodes);
    entry.title.removeAttribute("data-nasapunk-md-title");
    entry.title.style.removeProperty("--nasapunk-md-title-size");
    markdownResize?.unobserve(markdown);
    markdownTitles.delete(markdown);
  }
  function syncMarkdownTitle(markdown) {
    const title = Array.from(markdown.querySelectorAll("h1")).find(node => node.textContent.trim() && !node.closest("[hidden]"));
    let entry = markdownTitles.get(markdown);
    if (entry && (entry.title !== title || !entry.title.contains(entry.text))) { clearMarkdownTitle(markdown, entry); entry = null; }
    if (!title) return;
    if (!entry) {
      // 只有文章的首个 H1 使用标题装饰；普通首段、H2 和注释保持原样。
      const text = document.createElement("span"); text.className = "nasapunk-md-title-text";
      text.append(...title.childNodes); title.append(text); title.setAttribute("data-nasapunk-md-title", "");
      entry = { title, text, key: "" }; markdownTitles.set(markdown, entry);
      markdownResize?.observe(markdown);
    }
    const width = entry.title.clientWidth;
    const key = width + ":" + entry.text.textContent;
    if (!width || entry.key === key) return;
    entry.key = key;
    const max = Math.min(72, Math.max(28, width * .052));
    entry.title.style.setProperty("--nasapunk-md-title-size", max + "px");
    const style = getComputedStyle(entry.title);
    const band = parseFloat(getComputedStyle(entry.title, "::before").minWidth) || 16;
    const available = Math.max(1, width - band * 2 - parseFloat(style.columnGap) * 2);
    const natural = entry.text.getBoundingClientRect().width;
    const size = natural > available ? max * available / natural : max;
    entry.title.style.setProperty("--nasapunk-md-title-size", size.toFixed(2) + "px");
  }
  function syncMarkdown(root) {
    const panels = new Set(), surfaces = new Set(), bodies = new Set();
    root.querySelectorAll(".markdown-body").forEach(markdown => {
      if (markdown.closest('.hope-notification__list, [role="dialog"], [role="alertdialog"]')) return;
      bodies.add(markdown);
      let panel = markdown, parent = markdown.parentElement;
      // 选择仅包围当前 Markdown 的外壳；不能把文件列表或整个页面当成文件夹。
      for (let depth = 0; parent && depth < 5; depth++, parent = parent.parentElement) {
        if (parent === root || parent.matches("body, main, .body, .header") || parent.querySelector(".list-item, .grid-item, .hope-breadcrumb") || parent.querySelectorAll(".markdown-body").length > 1) break;
        const background = getComputedStyle(parent).backgroundColor;
        if (parent.matches(".readme, .readme-box, .markdown-preview, .obj-box") || (background !== "transparent" && !/rgba\([^)]*,\s*0\s*\)/.test(background))) panel = parent;
      }
      panels.add(panel); mark(panel, "data-nasapunk-md-panel");
      let region = markdownRegions.get(panel);
      if (!region?.isConnected) {
        region = document.createElement("div"); region.className = "nasapunk-md-region-heading";
        region.textContent = "DOCUMENTATION"; region.setAttribute("aria-hidden", "true");
        panel.prepend(region); markdownRegions.set(panel, region);
      }
      // 原生 .markdown 是内层设备外壳；其 .markdown-body 是屏幕正文，外层 panel 保留文件夹结构。
      const device = markdown.closest(".markdown");
      if (device && device !== panel) {
        mark(device, "data-nasapunk-md-device");
        if (!device.querySelector(":scope > .nasapunk-md-device-hardware")) {
          const hardware = document.createElement("div"); hardware.className = "nasapunk-md-device-hardware";
          hardware.setAttribute("aria-hidden", "true");
          hardware.innerHTML = '<span class="nasapunk-md-status"><i></i><i></i><i></i></span><span class="nasapunk-md-equipment-label">FLIGHT CHECKLIST / 01</span><span class="nasapunk-md-hardware-keys"><i></i><i></i></span>';
          device.prepend(hardware);
        }
      }
      mark(panel, "data-nasapunk-md-region");
      syncMarkdownTitle(markdown);
      panel.querySelectorAll(".markdown > div > .hope-select__trigger").forEach(trigger => {
        mark(trigger.parentElement, "data-nasapunk-md-encoding");
        const menu = document.getElementById(trigger.getAttribute("aria-controls"));
        if (menu) mark(menu, "data-nasapunk-md-encoding-menu");
      });
      for (let node = markdown; node && node !== panel; node = node.parentElement) {
        surfaces.add(node); mark(node, "data-nasapunk-md-surface");
      }
      if (!panel.querySelector(":scope > .nasapunk-folder-tabs")) {
        const tabs = document.createElement("div"); tabs.className = "nasapunk-folder-tabs"; tabs.setAttribute("aria-hidden", "true");
        tabs.innerHTML = '<i class="nasapunk-tab-red"></i><i class="nasapunk-tab-ochre"></i><i class="nasapunk-tab-mint"></i><i class="nasapunk-tab-cover"></i>';
        panel.prepend(tabs);
      }
    });
    for (const [body, entry] of markdownTitles) if (!bodies.has(body)) clearMarkdownTitle(body, entry);
    for (const [panel, region] of markdownRegions) if (!panels.has(panel)) { region.remove(); panel.removeAttribute("data-nasapunk-md-region"); markdownRegions.delete(panel); }
    for (const old of markdownPanels) if (!panels.has(old)) { old.removeAttribute("data-nasapunk-md-panel"); old.querySelector(":scope > .nasapunk-folder-tabs")?.remove(); }
    for (const old of markdownSurfaces) if (!surfaces.has(old)) { old.removeAttribute("data-nasapunk-md-surface"); old.removeAttribute("data-nasapunk-md-device"); old.querySelector(":scope > .nasapunk-md-device-hardware")?.remove(); }
    markdownPanels.clear(); panels.forEach(panel => markdownPanels.add(panel));
    markdownSurfaces.clear(); surfaces.forEach(surface => markdownSurfaces.add(surface));
  }
  /* 导航与文件区域标题 */
  const sectionHeadings = new Map();
  function syncSectionHeadings(root) {
    const nav = root.querySelector(".hope-breadcrumb");
    const file = Array.from(root.querySelectorAll(".obj-box")).find(box => box.querySelector(".list-item, .grid-item")) || root.querySelector(".obj-box");
    const desired = new Map(html.dataset.nasapunkPage === "home" ? [[nav, "NAVIGATION"], [file, "ARCHIVE"]].filter(([node]) => node) : []);
    for (const [panel, label] of sectionHeadings) if (!panel.isConnected || !desired.has(panel)) {
      label.remove(); panel.removeAttribute("data-nasapunk-section-panel"); sectionHeadings.delete(panel);
    }
    const logoWidth = root.querySelector(".header-left img")?.getBoundingClientRect().width || 44;
    for (const [panel, title] of desired) {
      let label = sectionHeadings.get(panel);
      if (!label) {
        label = document.createElement("div"); label.className = "nasapunk-section-heading";
        label.textContent = title; label.setAttribute("aria-hidden", "true"); sectionHeadings.set(panel, label);
      }
      if (panel.previousElementSibling !== label) panel.before(label);
      mark(panel, "data-nasapunk-section-panel");
      const layout = getComputedStyle(panel.parentElement);
      const gap = layout.display.includes("flex") || layout.display.includes("grid") ? parseFloat(layout.rowGap) || 0 : 0;
      const set = (name, value) => { if (label.style.getPropertyValue(name) !== value) label.style.setProperty(name, value); };
      set("--nasapunk-section-gap", gap + "px"); set("--nasapunk-section-inset", (logoWidth * 1.5).toFixed(2) + "px");
    }
  }
  function clearSectionHeadings() {
    for (const [panel, label] of sectionHeadings) { label.remove(); panel.removeAttribute("data-nasapunk-section-panel"); }
    sectionHeadings.clear();
  }
  /* 页脚尺寸与内容间距 */
  function syncFooter(root) {
    const footer = document.getElementById("nasapunk-footer");
    if (!footer) return;
    const brand = footer.querySelector(".nasapunk-footer-brand");
    const row = footer.querySelector(".nasapunk-footer-brand-row");
    // 图形外框预留 SVG 内部留白，通过 symbol-scale 可进一步调整可见尺寸。
    if (brand && row) {
      const size = (brand.getBoundingClientRect().height * 1.41).toFixed(2) + "px";
      if (row.style.getPropertyValue("--nasapunk-footer-symbol-measured") !== size) row.style.setProperty("--nasapunk-footer-symbol-measured", size);
    }
    const boxes = Array.from(root.querySelectorAll(".obj-box"));
    const target = boxes.find(box => box.querySelector(".list-item, .grid-item")) || boxes[0] || root.querySelector(".hope-breadcrumb");
    if (target !== footerTarget) {
      footerResize?.disconnect(); footerTarget = target;
      if (target) footerResize?.observe(target);
      const region = document.getElementById("nasapunk-footer-region");
      if (region) footerResize?.observe(region);
    }
    const width = target?.getBoundingClientRect().width;
    if (width > 0) {
      const value = width.toFixed(2) + "px";
      if (footer.style.getPropertyValue("--nasapunk-footer-width") !== value) footer.style.setProperty("--nasapunk-footer-width", value);
    } else footer.style.removeProperty("--nasapunk-footer-width");
  }
  function syncContentFooterGap(root) {
    const footer = document.getElementById("nasapunk-footer-region");
    const cards = Array.from(root.querySelectorAll(".obj-box, [data-nasapunk-md-panel]"))
      .map(node => ({ node, rect: node.getBoundingClientRect() }))
      .filter(card => card.rect.width > 0 && card.rect.height > 0);
    if (!footer || html.dataset.nasapunkPage !== "home" || !cards.length) {
      setVariable("--nasapunk-content-footer-gap", ""); return;
    }
    const last = cards.reduce((lowest, card) => card.rect.bottom > lowest.rect.bottom ? card : lowest);
    const file = root.querySelector(".obj-box");
    const fileBottom = file?.getBoundingClientRect().bottom;
    const panels = cards.filter(card => card.node.hasAttribute("data-nasapunk-md-panel"));
    const following = panels.find(card => card.node !== file && card.rect.top >= fileBottom);
    const tabs = following?.node.querySelector(":scope > .nasapunk-folder-tabs");
    // 无 Markdown 时也保留相同的卡片间距；有页签时沿用其实际可见间距。
    const desired = tabs ? Math.max(0, tabs.getBoundingClientRect().top - fileBottom) : 43;
    const actual = footer.getBoundingClientRect().top - last.rect.bottom;
    const margin = parseFloat(getComputedStyle(footer).marginTop) || 0;
    // 只补足间距，不改变短页面原有的弹性留白和底栏布局。
    setVariable("--nasapunk-content-footer-gap", Math.max(0, margin + desired - actual).toFixed(2) + "px");
  }
  /* 页面三色带 */
  let pageRibbon = null, ribbonFold = null, ribbonRoot = null;
  const ribbonObserved = new Set();
  const ribbonResize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  function removePageRibbon() {
    pageRibbon?.remove(); pageRibbon = null;
    ribbonFold?.remove(); ribbonFold = null;
    ribbonRoot?.removeAttribute("data-nasapunk-ribbon-root"); ribbonRoot = null;
    ribbonResize?.disconnect(); ribbonObserved.clear();
  }
  function syncPageRibbon(root) {
    if (config.pageRibbon !== true || html.dataset.nasapunkPage !== "home") { removePageRibbon(); return; }
    const nav = root.querySelector(".hope-breadcrumb");
    const file = Array.from(root.querySelectorAll(".obj-box")).find(box => box.querySelector(".list-item, .grid-item")) || root.querySelector(".obj-box");
    if (!nav || !file) { removePageRibbon(); return; }
    if (!pageRibbon?.isConnected || !ribbonFold?.isConnected || ribbonRoot !== root || ribbonFold.parentElement !== nav) {
      removePageRibbon(); ribbonRoot = root; root.setAttribute("data-nasapunk-ribbon-root", "");
      const make = id => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = id; svg.setAttribute("aria-hidden", "true"); svg.setAttribute("preserveAspectRatio", "none");
        svg.innerHTML = [0,1,2].map(i => '<path data-band="'+i+'"/>').join(""); return svg;
      };
      pageRibbon = make("nasapunk-page-ribbon"); root.prepend(pageRibbon);
      ribbonFold = make("nasapunk-page-ribbon-fold"); nav.append(ribbonFold);
    }
    const footer = document.getElementById("nasapunk-footer-region");
    const observed = new Set([root, nav, file, footer].filter(Boolean));
    for (const node of ribbonObserved) if (!observed.has(node)) { ribbonResize?.unobserve(node); ribbonObserved.delete(node); }
    for (const node of observed) if (!ribbonObserved.has(node)) { ribbonResize?.observe(node); ribbonObserved.add(node); }
    const r = root.getBoundingClientRect(), n = nav.getBoundingClientRect(), f = file.getBoundingClientRect();
    const navStyle = getComputedStyle(nav), bandStyle = getComputedStyle(nav, "::after");
    const width = Math.min(n.width, parseFloat(bandStyle.width) || 0);
    if (!width || !r.width || !r.height) { pageRibbon.style.display = ribbonFold.style.display = "none"; return; }
    for (const svg of [pageRibbon, ribbonFold]) if (svg.style.display) svg.style.removeProperty("display");
    const borderRight = parseFloat(navStyle.borderRightWidth) || 0;
    const borderLeft = parseFloat(navStyle.borderLeftWidth) || 0;
    const x = n.right - r.left - borderRight - width;
    const y = n.bottom - r.top - (parseFloat(navStyle.borderBottomWidth) || 0);
    const foldY = Math.max(y, f.top - r.top);
    const shift = Math.min(width * .42, Math.max(0, x - (f.left-r.left)));
    // 页脚可能是 #root 的兄弟节点；不能用 root.height 作为竖带终点。
    const end = Math.max(foldY, footer ? footer.getBoundingClientRect().top - r.top + 1 : r.height);
    const step = width / 3, foldHeight = foldY-y;
    const ribbonHeight = end.toFixed(2) + "px";
    if (pageRibbon.style.height !== ribbonHeight) pageRibbon.style.height = ribbonHeight;
    const foldWidth = n.width-borderLeft-borderRight, foldX = foldWidth-width;
    const set = (node, name, value) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
    set(pageRibbon, "viewBox", '0 0 '+r.width+' '+end);
    set(ribbonFold, "viewBox", '0 0 '+foldWidth+' '+Math.max(1,foldHeight));
    const height = foldHeight + "px";
    if (ribbonFold.style.height !== height) ribbonFold.style.height = height;
    for (let i=0; i<3; i++) {
      const dest = x+i*step-shift, left = foldX+i*step, right = left+step;
      set(pageRibbon.children[i], "d", 'M'+dest+' '+foldY+'h'+step+'V'+end+'H'+dest+'Z');
      set(ribbonFold.children[i], "d", 'M'+left+' 0H'+right+'L'+(right-shift)+' '+foldHeight+'H'+(left-shift)+'Z');
    }
  }
  function setVariable(name, value) {
    if (value) { if (html.style.getPropertyValue(name) !== value) html.style.setProperty(name, value); }
    else if (html.style.getPropertyValue(name)) html.style.removeProperty(name);
  }
  function syncBackgrounds() {
    for (const section of ["main", "footer"]) {
      const setting = config.backgrounds?.[section] || {};
      const prefix = "--nasapunk-" + section;
      setVariable(prefix + "-color", setting.color && CSS.supports("color", setting.color) ? setting.color : "");
      setVariable(prefix + "-image-size", CSS.supports("background-size", setting.size || "") ? setting.size : "cover");
      setVariable(prefix + "-image-position", CSS.supports("background-position", setting.position || "") ? setting.position : "center");
      let url = "";
      try {
        if (setting.url?.trim()) {
          const parsed = new URL(setting.url.trim(), location.href);
          if (/^https?:$/.test(parsed.protocol) || parsed.href.toLowerCase().startsWith("data:image/")) url = parsed.href;
        }
      } catch {}
      if (backgroundLoads.get(section)?.url === url) continue;
      const previous = backgroundLoads.get(section);
      if (previous?.probe) previous.probe.onload = previous.probe.onerror = null;
      setVariable(prefix + "-image", "");
      const state = { url, probe: null };
      backgroundLoads.set(section, state);
      if (!url) continue;
      const probe = new Image(); state.probe = probe;
      probe.onload = () => {
        if (!disposed && backgroundLoads.get(section) === state && probe.naturalWidth > 0) setVariable(prefix + "-image", "url(" + JSON.stringify(url) + ")");
      };
      probe.onerror = () => {
        if (!disposed && backgroundLoads.get(section) === state) setVariable(prefix + "-image", "");
      };
      probe.src = url;
    }
  }
  function textValue(node, text) {
    if (!node || node.textContent === text) return;
    if (node.firstChild?.nodeType === Node.TEXT_NODE && node.childNodes.length === 1) node.firstChild.nodeValue = text;
    else node.textContent = text;
  }
  function tickClock() {
    clearTimeout(clockTimer);
    if (disposed) return;
    const now = Date.now();
    textValue(document.getElementById("nasapunk-copyright-year"), String(new Date(now).getFullYear()));
    const uptime = document.getElementById("nasapunk-uptime");
    const start = Date.parse(config.startedAt || "");
    if (uptime) {
      uptime.hidden = !Number.isFinite(start);
      if (Number.isFinite(start)) {
        const seconds = Math.max(0, Math.floor((now - start) / 1000));
        const days = Math.floor(seconds / 86400);
        const hours = String(Math.floor(seconds / 3600) % 24).padStart(2, "0");
        const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
        const remain = String(seconds % 60).padStart(2, "0");
        textValue(uptime, "系统已运行 " + days + " 天 " + hours + " 时 " + minutes + " 分 " + remain + " 秒");
      }
    }
    if (!document.hidden) clockTimer = setTimeout(tickClock, 1000 - Date.now() % 1000);
  }
  function syncSiteAccent() {
    // OpenList 由服务端注入的配置：直接使用 main_color 原值。
    // 不读取 HopeUI 色板、不从图标取色，也不覆盖 OpenList 的配置。
    const mainColor = window.OPENLIST_CONFIG?.main_color;
    const value = typeof mainColor === "string" ? mainColor.trim() : "";
    setVariable("--nasapunk-site-accent", value && CSS.supports("color", value) ? value : "");
  }
  function syncFlow(root) {
    const region = document.getElementById("nasapunk-footer-region");
    const target = footerTarget;
    const next = new Map();
    const add = (node, name) => { if (!next.has(node)) next.set(node, new Set()); next.get(node).add(name); mark(node, name); };
    if (region && target && html.dataset.nasapunkPage === "home") {
      let common = target.parentElement;
      while (common && !common.contains(region)) common = common.parentElement;
      if (common && common !== html) {
        add(common, "data-nasapunk-flow-root");
        const top = Math.max(0, common.getBoundingClientRect().top + window.scrollY);
        // 只将品牌行纳入首屏：三色条底边贴合视口底部，信息行保留在正常滚动流中。
        // 尾部高度包含链接、版权、运行时间及底部留白；窄屏换行时重新测量。
        const brand = region.querySelector(".nasapunk-footer-brand-row");
        const tail = brand ? Math.max(0, region.getBoundingClientRect().bottom - brand.getBoundingClientRect().bottom) : 0;
        setVariable("--nasapunk-flow-min-height", "calc(100svh - " + top.toFixed(2) + "px + " + tail.toFixed(2) + "px)");
        let main = target;
        while (main.parentElement && main.parentElement !== common) { main = main.parentElement; add(main, "data-nasapunk-flow-shell"); }
        let footerBranch = region;
        while (footerBranch.parentElement && footerBranch.parentElement !== common) footerBranch = footerBranch.parentElement;
        if (main !== footerBranch) { add(main, "data-nasapunk-flow-main"); add(footerBranch, "data-nasapunk-flow-footer"); }
      }
    }
    for (const [node, names] of flowNodes) for (const name of names) if (!next.get(node)?.has(name)) node.removeAttribute(name);
    flowNodes.clear(); next.forEach((names, node) => flowNodes.set(node, names));
  }
  function syncLoginDecor(root, login) {
    if (!login) { loginDecor?.remove(); loginDecor = null; return; }
    if (!loginDecor?.isConnected) {
      loginDecor = document.createElement("div"); loginDecor.id = "nasapunk-login-decor"; loginDecor.setAttribute("aria-hidden", "true");
      loginDecor.innerHTML = '<div class="nasapunk-cross-grid">' + '<i></i>'.repeat(15) + '</div><div class="nasapunk-login-stripes"><i></i><i></i><i></i></div>';
      root.prepend(loginDecor);
    }
  }
  /* 页面同步与生命周期 */
  function refresh() {
    frame = 0;
    if (disposed) return;
    syncMode();
    const manage = /\/@(?:manage|init)(?:\/|$)/.test(location.pathname);
    const login = /\/@login(?:\/|$)/.test(location.pathname);
    html.dataset.nasapunkPage = manage ? "manage" : login ? "login" : "home";
    if (manage) {
      restoreBranding();
      clearSectionHeadings();
      removePageRibbon();
      loginDecor?.remove();
      loginDecor = null;
      for (const [node, names] of flowNodes) for (const name of names) node.removeAttribute(name);
      flowNodes.clear();
      themeButton?.remove(); userButton?.remove(); closeAccount();
      footerResize?.disconnect();
      footerTarget = null;
      html.removeAttribute("data-nasapunk-theme");
      window.__nasapunkBoot?.finish(true);
      return;
    }
    html.setAttribute("data-nasapunk-theme", "01");
    const root = document.getElementById("root");
    if (!root) return;
    syncBranding(root, login);
    syncSiteAccent();
    html.dataset.nasapunkSelection = config.selectionUnderline === false ? "native" : "underline";
    syncBackgrounds();
    syncHeader(root);
    syncToolbars();
    syncMarkdown(root);
    syncSectionHeadings(root);
    syncFooter(root);
    syncFlow(root);
    syncContentFooterGap(root);
    syncPageRibbon(root);
    syncLoginDecor(root, login);

    // 官方登录页的 VStack 直接包含 username / otp 输入，不依赖 form 标签。
    if (login) {
      const input = root.querySelector('input[name="username"], input[name="otp"], #totp');
      const card = input?.closest(".hope-stack") || input?.parentElement;
      if (card && card.querySelector(".hope-heading")) {
        mark(card, "data-nasapunk-login-card");
        const titleLeft = card.getBoundingClientRect().left.toFixed(2) + "px";
        if (loginDecor?.style.getPropertyValue("--nasapunk-login-card-left") !== titleLeft) loginDecor?.style.setProperty("--nasapunk-login-card-left", titleLeft);
        const shell = card.parentElement;
        mark(shell, "data-nasapunk-login-shell");
        // 登录按钮是与「清空」同组的最后一个按钮，仍由原组件处理认证。
        const group = Array.from(card.children).find(child => child.matches(".hope-stack") && child.querySelector(":scope > button"));
        const buttons = group?.querySelectorAll(":scope > button");
        if (buttons?.length) mark(buttons[buttons.length - 1], "data-nasapunk-login-action");
        Array.from(shell.children).forEach(child => {
          if (child !== card && getComputedStyle(child).position === "fixed" && child.querySelector("svg")) mark(child, "data-nasapunk-login-background");
        });
      }
    }

    // 左侧目录面板是 folder-tree-box 的 fixed 父容器；弹窗内目录不误标。
    root.querySelectorAll(".folder-tree-box").forEach(tree => {
      const parent = tree.parentElement;
      if (parent && !tree.closest('[role="dialog"], [role="alertdialog"]') && getComputedStyle(parent).position === "fixed") mark(parent, "data-nasapunk-sidebar");
    });

    // 只替换「单独一个大 spinner」的 Center，按钮/通知里的 spinner 不受影响。
    for (const element of localLoading) {
      if (!element.isConnected || !element.querySelector(":scope > .hope-spinner:only-child")) {
        element.removeAttribute("data-nasapunk-local-loading");
        localLoading.delete(element);
      }
    }
    root.querySelectorAll(".hope-spinner").forEach(spinner => {
      if (spinner.closest('button, [role="button"], .folder-tree-box, [role="dialog"]')) return;
      const parent = spinner.parentElement;
      if (!parent || parent.children.length !== 1 || spinner.getBoundingClientRect().width < 28) return;
      mark(parent, "data-nasapunk-local-loading");
      localLoading.add(parent);
    });
    // 清除离开页面的引用，避免长时间浏览目录时累计 DOM。
    for (const element of marked) if (!element.isConnected) marked.delete(element);
  }
  function schedule() { if (!disposed && !frame) frame = requestAnimationFrame(refresh); }
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  const modeObserver = new MutationObserver(records => {
    if (records.some(record => record.target === html || record.target === document.body || record.target.matches("#root, .hope-ui-light, .hope-ui-dark"))) schedule();
  });
  modeObserver.observe(html, { attributes: true, attributeFilter: ["class", "style"] });
  modeObserver.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["class", "style"] });
  document.addEventListener("visibilitychange", tickClock);
  window.addEventListener("resize", schedule);
  window.addEventListener("popstate", schedule);
  window.addEventListener("hashchange", schedule);
  systemMode.addEventListener("change", schedule);
  window.__nasapunkSkin = {
    refresh: schedule,
    destroy() {
      disposed = true;
      clearSectionHeadings();
      removePageRibbon();
      ++accountSerial; accountRequest?.abort(); closeAccount(false, true);
      for (const [menu, animation] of retiringAccounts) { animation.cancel(); menu.remove(); }
      retiringAccounts.clear();
      userButton?.removeEventListener("click", openAccount); userButton?.remove();
      if (accountIconProbe) accountIconProbe.onload = accountIconProbe.onerror = null;
      document.removeEventListener("pointerdown", outsideAccount);
      document.removeEventListener("focusin", outsideAccount);
      window.removeEventListener("resize", positionAccount);
      window.removeEventListener("scroll", positionAccount, true);
      window.removeEventListener("storage", accountStorage);
      clearReady(true);
      document.removeEventListener("pointerover", enterReady);
      document.removeEventListener("pointerout", leaveReady);
      document.removeEventListener("focusin", enterReady);
      document.removeEventListener("focusout", leaveReady);
      finishTheme(false); endRouteMotion();
      if(history.pushState===motionPush) history.pushState=savedPush;
      if(history.replaceState===motionReplace) history.replaceState=savedReplace;
      document.removeEventListener("click",navigationClick,true);
      window.removeEventListener("popstate",navigationChanged);
      document.removeEventListener("visibilitychange",visibilityMotion);
      reducedMotion.removeEventListener("change",preferenceMotion);
      clearTimeout(clockTimer);
      document.removeEventListener("visibilitychange", tickClock);
      loginDecor?.remove();
      for (const state of backgroundLoads.values()) if (state.probe) state.probe.onload = state.probe.onerror = null;
      for (const section of ["main", "footer"]) for (const suffix of ["color", "image", "image-size", "image-position"]) html.style.removeProperty("--nasapunk-" + section + "-" + suffix);
      for (const [node, names] of flowNodes) for (const name of names) node.removeAttribute(name);
      flowNodes.clear();
      backgroundLoads.clear();
      html.style.removeProperty("--nasapunk-site-accent");
      html.removeAttribute("data-nasapunk-selection");
      html.style.removeProperty("--nasapunk-flow-min-height");
      html.style.removeProperty("--nasapunk-content-footer-gap");
      observer.disconnect();
      modeObserver.disconnect();
      footerResize?.disconnect();
      themeButton?.removeEventListener("click", toggleMode);
      themeButton?.remove();
      for(const [anchor,state] of headerLinks) {
        if(state.created) { if(state.image.parentElement===anchor)anchor.before(state.image);anchor.remove(); }
        else { for(const [attr,value] of [["href",state.href],["aria-label",state.label]]) { if(value===null)anchor.removeAttribute(attr);else anchor.setAttribute(attr,value); } }
      }
      headerLinks.clear();
      restoreBranding();
      document.removeEventListener("click", toolbarClick, true);
      for (const [box, state] of toolbarStates) { state.animation?.cancel(); box.removeAttribute("data-nasapunk-toolbar-open"); }
      toolbarResize?.disconnect();
      for (const box of toolbarStates.keys()) box.style.removeProperty("--nasapunk-settings-center");
      toolbarStates.clear();
      document.querySelectorAll(".nasapunk-header-ribbon").forEach(node => node.remove());
      document.querySelectorAll("[data-nasapunk-header-static]").forEach(node => node.removeAttribute("data-nasapunk-header-static"));
      for (const [panel, region] of markdownRegions) { region.remove(); panel.removeAttribute("data-nasapunk-md-region"); }
      markdownRegions.clear();
      document.querySelectorAll(".nasapunk-md-device-hardware").forEach(node => node.remove());
      markdownResize?.disconnect();
      for (const [body, entry] of markdownTitles) clearMarkdownTitle(body, entry);
      for (const panel of markdownPanels) panel.querySelector(":scope > .nasapunk-folder-tabs")?.remove();
      document.getElementById("nasapunk-footer")?.style.removeProperty("--nasapunk-footer-width");
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
      window.removeEventListener("popstate", schedule);
      window.removeEventListener("hashchange", schedule);
      systemMode.removeEventListener("change", schedule);
      for (const element of marked) {
        for (const name of ["data-nasapunk-login-card", "data-nasapunk-login-shell", "data-nasapunk-login-action", "data-nasapunk-login-background", "data-nasapunk-sidebar", "data-nasapunk-local-loading", "data-nasapunk-md-panel", "data-nasapunk-md-surface", "data-nasapunk-md-encoding", "data-nasapunk-md-encoding-menu", "data-nasapunk-md-device", "data-nasapunk-flow-root", "data-nasapunk-flow-main", "data-nasapunk-flow-footer", "data-nasapunk-flow-shell", "data-nasapunk-header-control", "data-nasapunk-section-panel"]) element.removeAttribute(name);
      }
      marked.clear();
      localLoading.clear();
      markdownPanels.clear();
      markdownSurfaces.clear();
    }
  };
  tickClock();
  refresh();
})();
