# 参数与开发指南

## 文件与加载顺序

| 文件 | 职责 |
| --- | --- |
| `nasapunk_head.html` | 配置、字体和颜色变量、内联首屏样式与控制器、资源加载器 |
| `nasapunk_body.html` | 可编辑页脚 HTML、页面脚本入口 |
| `src/nasapunk.css` | 固定布局、外观和动画 |
| `src/nasapunk-head.js` | 公告与提示适配 |
| `src/nasapunk-main.js` | DOM、主题、账户、Markdown、底栏和色带适配 |
| `src/nasapunk-icon.svg` | 默认页脚图形 Logo |

无需打包。首屏必需样式与控制器直接内联在 HTML head 中，在任何 CDN 请求完成前挂载遮罩。外部 CSS、通知脚本、页面脚本加载成功且页面资源就绪后才揭幕。body 入口等待 `window.__nasapunkAssetsReady` 后加载 main，成功时通知首屏控制器；资源错误或超时会解除遮罩。首屏开关关闭时仍暂时隐藏未就绪的正文，避免无样式内容闪现。文件统一使用 UTF-8、CRLF。

## JavaScript 配置

在 head 的 `window.NASAPUNK_CONFIG` 中编辑。表中列出默认配置，升级时请保留自己的设置。

| 参数 | 初始值 | 说明 |
| --- | --- | --- |
| `assetBase` | 本仓库 main 的 src CDN URL | 不含文件名，末尾斜杠可省略；留空跳过加载 |
| `logoUrl` | 空字符串 | 留空沿用 OpenList 顶栏、登录页 Logo 与 favicon；也可填写相对 assetBase 的路径或完整 HTTP(S) URL |
| `footerLogoUrl` | `nasapunk-icon.svg` | 独立页脚图形；相对 assetBase 或完整 HTTP(S) URL；留空隐藏 |
| `terrainBackground` | `true` | 纯色主页面的动态等高线背景；false 关闭 |
| `pageTransitions` | `true` | 页面切换过渡 |
| `themeTransitions` | `true` | 明暗主题切换过渡 |
| `pageRibbon` | `true` | 导航三色带贯穿内容区并连接底栏 |
| `selectionUnderline` | `true` | false 恢复原生选区色块 |
| `userIconUrl` | Tabler 3.35.0 user.svg | CDN 账户图标，失败使用内联兜底 |
| `startedAt` | 空字符串 | 留空隐藏运行时间；填写时需包含时区 |
| `backgrounds.main` | 对象 | 主内容区背景 |
| `backgrounds.footer` | 对象 | 独立页脚背景 |

两个背景对象的字段相同：

| 字段 | 初始值／示例 | 说明 |
| --- | --- | --- |
| `url` | 图片 URL / 空字符串 | 默认留空；空值或失败回退纯色 |
| `color` | 空字符串 | 留空跟随主题，也可填写 CSS 颜色 |
| `size` | `cover` | CSS background-size，例如 contain |
| `position` | `center` | CSS background-position，例如 center top |

`loading` 的时间单位为毫秒：

| 字段 | 初始值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 首屏动画开关 |
| `minimumMs` | `1800` | 最低展示时间，不是强制完成时间 |
| `stableMs` | `180` | 资源就绪后等待布局稳定 |
| `completeHoldMs` | `180` | 到达 100% 后的停留 |
| `stalledMs` | `40000` | 无进展时撤下遮罩的异常兜底 |

使用布尔值和非负有限数字，不要把数字写成字符串。进度根据资源就绪情况推进，不等待屏幕外所有懒加载图片。


### 完整填写示例

修改 head 中已有的配置对象，不要重复添加第二个对象。下面的仓库、图片和日期仅作示例，应替换成自己的资源；未准备背景图时保留空字符串。

```js
window.NASAPUNK_CONFIG = {
  assetBase: "https://cdn.jsdelivr.net/gh/your-name/your-theme@main/src",
  logoUrl: "",
  footerLogoUrl: "nasapunk-icon.svg",
  terrainBackground: true,
  loading: {
    enabled: true,
    minimumMs: 1200,
    stableMs: 200,
    completeHoldMs: 250,
    stalledMs: 40000
  },
  pageTransitions: true,
  themeTransitions: false,
  pageRibbon: false,
  userIconUrl: "https://cdn.jsdelivr.net/npm/@tabler/icons@3.35.0/icons/outline/user.svg",
  selectionUnderline: true,
  startedAt: "2026-01-01T00:00:00+08:00",
  backgrounds: {
    main: {
      url: "https://cdn.jsdelivr.net/gh/your-name/your-theme@main/images/background.webp",
      color: "", size: "cover", position: "center top"
    },
    footer: { url: "", color: "#ece5d6", size: "cover", position: "center" }
  }
};
```

此例关闭主题切换动画和贯穿色带，开启页面过渡，背景图顶部对齐，页脚使用固定米白色。将 `startedAt` 改为 `""` 可隐藏运行时间；将背景 `color` 改为 `""` 可让颜色随明暗主题变化。`loading.enabled: false` 表示关闭首屏遮罩；`selectionUnderline: false` 表示使用原生选区色块。

## 字体与配色

字体位于 head 的 `nasapunk-font-config`，变量前缀为 `--nasapunk-font-`：

| 后缀 | 作用 |
| --- | --- |
| `fallback` | 全局兜底 |
| `ui` / `heading` | 普通控件／标题 |
| `files` / `metadata` | 文件名／日期和大小 |
| `preview` / `reading` / `code` | 预览／Markdown 正文／代码 |
| `login` / `popup` / `footer` | 登录／菜单弹窗／页脚 |
| `label` | 粗体装饰字及文章标题 |

未安装字体不会自动下载。统一设备字形时，可以在 head 中加入具有 Web 分发许可的 WOFF2 字体：

```css
@font-face {
  font-family: "MyDisplay";
  src: url("https://你的字体域名/display.woff2") format("woff2");
  font-weight: 900;
  font-style: normal;
  font-display: swap;
}
:root {
  --nasapunk-font-label: "MyDisplay", "Arial Black", "Microsoft YaHei", sans-serif;
}
```

为所用字重、斜体提供对应文件或可变字体范围。中文优先使用合法分片字体；不要把系统商业字体直接上传。跨域字体服务须支持 CORS。

加载画面 NASA/PUNK 和页脚字标是固定 SVG 路径，字体变量不会改变它们。其余标题使用 HTML/CSS；文章标题使用无附加描边的实心字形和正常字距，无需建立通用 SVG 字库。

颜色位于 head 的 `nasapunk-color-config`，变量前缀为 `--nasapunk-`：

| 后缀 | 作用 |
| --- | --- |
| `day-paper` / `night-paper` / `paper` | 日间／夜间／当前底色 |
| `panel` / `recess` / `hover` | 面板／凹槽／悬停背景 |
| `ink` / `muted` | 正文／次要文字 |
| `line` / `edge` / `shadow` / `radius` | 细线／边缘／阴影／圆角 |
| `mint` / `ochre` / `red` | 三色带 |
| `folder-cover` | Markdown 外部文件夹底色 |
| `reading-size` / `reading-leading` | 正文字号／行高，初始 16px / 1.8 |
| `selection-thickness` | 文字选区下划线厚度，初始 3.2px |
| `accent` / `selected` | OpenList 主色／选中背景 |

夜间配色在 `html[data-nasapunk-mode="dark"]` 中单独覆盖；改配色时同时检查该块。主色默认读取 OpenList main_color。

更细的布局参数在 CSS 的对应组件中，例如 `--nasapunk-footer-symbol-y`、`--nasapunk-md-region-size`、`--nasapunk-md-folder-inset` 和 `--nasapunk-md-controls-height`。需要个人覆盖时，在 head 添加具有足够选择器优先级的样式；外部 CSS 稍后加载，不能仅依赖书写顺序。


### 本地字体、颜色和布局示例

以下变量可直接修改 head 内的对应声明，不需要新增字体下载：

```css
:root {
  --nasapunk-font-fallback: "Arial", "Microsoft YaHei", sans-serif;
  --nasapunk-font-reading: "Microsoft YaHei", sans-serif;
  --nasapunk-font-label: "Arial Black", "Microsoft YaHei", sans-serif;
  --nasapunk-reading-size: 18px;
  --nasapunk-reading-leading: 1.9;
  --nasapunk-mint: #87bdae;
  --nasapunk-ochre: #e4ab3c;
  --nasapunk-red: #a3372b;
  --nasapunk-panel: #f4efdf;
  --nasapunk-ink: #2b302e;
  --nasapunk-radius: 3px;
  --nasapunk-selection-thickness: 3px;
}
html[data-nasapunk-mode="dark"] {
  --nasapunk-panel: #2a302d;
  --nasapunk-ink: #ece5d6;
}
```

只微调布局时，可在 head 中另加样式；下面通过更具体的选择器覆盖组件变量：

```html
<style>
html[data-nasapunk-theme] .nasapunk-footer-brand-row {
  --nasapunk-footer-symbol-y: 2px;
}
html[data-nasapunk-theme] #root [data-nasapunk-md-panel] {
  --nasapunk-md-region-size: clamp(30px, 5vw, 88px);
  --nasapunk-md-folder-inset: 20px;
}
html[data-nasapunk-theme] #root [data-nasapunk-md-device] {
  --nasapunk-md-controls-height: 56px;
}
</style>
```

页脚链接直接修改 body 的 HTML，例如：

```html
<a href="https://example.com/" target="_blank" rel="noopener noreferrer">
  <span class="nasapunk-footer-link-text">我的主页</span>
</a>
```

## 行为与开发边界

- 默认跟随系统；手动选择存入 sessionStorage 的 `nasapunk-color-mode-session`。刷新保留，关闭会话后通常重置，浏览器会话恢复可能保留。删除该键并刷新可重新跟随系统。
- 首个非空 H1 使用单行自适应文章标题及三色带。DOCUMENTATION 是独立的外层区域装饰，普通首段和 H2 保持原样。
- 底栏与最后一张内容卡片保持间距；短页保留弹性留白。修改布局后检查有、无 Markdown 的页面及色带终点。
- 原生菜单来自 Hope UI 与 solid-contextmenu，菜单样式修改需要同时检查两套组件。
- 管理后台不属于目标范围；iframe、PDF 画布和封闭 Shadow DOM 不由宿主字体 CSS 控制。

MutationObserver 处理 SPA 和 Portal，ResizeObserver 处理尺寸变化。DOM 操作应可重复执行，保留宿主事件，不替换整个 Markdown innerHTML，不依赖 hope-c-xxxx 这类构建生成类名。

命名统一使用 nasapunk-、data-nasapunk-*、--nasapunk-* 和 window.__nasapunk*。本地调试可用 `window.__nasapunkSkin?.destroy()` 清理页面适配器；通知管理器为 `window.__nasapunkNotices`，首屏状态为 `window.__nasapunkBoot`。它们是内部接口，不承诺稳定。

## 验证与发布

本地修改不等于线上生效。可用浏览器请求拦截将 CSS、两个 JS 和 SVG 图标的 CDN 请求映射到本地资源，并向测试页面注入 head/body；不要直接修改生产配置来调试。

发布前检查：

1. 两个 HTML 内联脚本和两个 JS 语法正常，文件名与资源路径大小写一致。
2. 系统明暗变化、手动切换、刷新记忆以及新会话默认模式正常。
3. 右键、多选菜单、通知、账户弹窗对比度正常。
4. H1 前有普通段落、无 H1、中文和长标题正常；桌面与窄屏无横向溢出。
5. 有／无 Markdown、短／长页的间距、色带、底栏及加载退场正常。
6. 模拟资源加载失败，页面不被遮罩永久锁住。

直接使用主题时，从原仓库复制 head/body，无需自己上传资源。自定义时先 Fork 仓库，在 Fork 内修改 head/body 和 src 文件，提交后将 head 的 assetBase 指向自己的仓库；若仓库名也修改了，URL 中同步更改。随后将自己仓库的 head/body 粘贴到 OpenList。

```js
assetBase: "https://cdn.jsdelivr.net/gh/你的用户名/你的仓库@main/src"
```

默认 CDN 指向原仓库 main 分支。维护自己的 Fork 时，建议发布标签或使用提交 SHA，避免分支缓存导致新旧资源混用。原仓库版本地址的格式示例：

```text
https://cdn.jsdelivr.net/gh/Moonnne/openlist_nasapunk_theme@v1.0.0/src
```

v1.0.0 仅为示例，并非已创建版本；Fork 用户应同时替换用户名和仓库名。换版本后同步替换 head/body，确保 CSS、JS 和图标来自同次发布。Network 中检查返回 200 和正确的 CSS/JS/SVG 类型。实际 CDN 速度应在目标用户网络测试。

参考：[jsDelivr 官方文档](https://www.jsdelivr.com/documentation)。

## 品牌资源

顶栏、登录页 Logo 和 favicon 默认沿用 OpenList 的配置；站点名称与登录页标题仍由 OpenList 管理。页脚右侧大 Logo 独立使用 `src/nasapunk-icon.svg`；字标是内联 SVG。相对路径会与 `assetBase` 拼接。退出主题适配器或进入管理后台时还原原生图标属性。

默认配置示例：

```js
logoUrl: "",
footerLogoUrl: "nasapunk-icon.svg",
```

自定义示例（替换对应配置项）：

```js
logoUrl: "https://cdn.example.com/brand/logo.svg", // 顶栏、登录页与 favicon
footerLogoUrl: "https://cdn.example.com/brand/footer.svg", // 独立页脚图形
```

仅隐藏页脚图形时填写 `footerLogoUrl: ""`。路径应返回图像文件，不是 GitHub 预览页面；SVG 按 `image/svg+xml` 提供。同一 URL 替换图标会受缓存影响，建议使用新提交 SHA 或标签。

## 等高线背景

`terrainBackground: true` 在纯色主页面启用，`terrainBackground: false` 关闭。配置 `backgrounds.main.url` 后自动隐藏；登录页和管理页不显示。示例：

```js
terrainBackground: true,
backgrounds: {
  main: { url: "", color: "", size: "cover", position: "center" },
  footer: { url: "", color: "", size: "cover", position: "center" }
},
```

Canvas 绘制连续多山脊、峡谷和盆地的等高线，使用深度遮挡隐藏后方线段。它位于内容与色带下方，不占布局空间，不接受指针事件。首屏加载完成后由低到高逐层显示；空闲时每隔 8–14 秒扫描部分高度层。鼠标只改变整个地形的位移，最大水平 7px、垂直 5px，不改变局部形状。

系统开启减少动态效果时只显示静态地形；触屏不启用指针视差。几何路径只在视口尺寸变化时重建，画布像素倍率最高 1.5；空闲时不持续绘制，页面隐藏时暂停。适配器销毁时清理画布、定时器与事件监听。

## 视觉兼容

脱敏、资源拆分和实现优化应保持既有布局、字体大小、图层顺序和动画效果；文字内容替换时同步核对 SVG 显示框和定位类名。首屏样式与启动代码保持内联，不依赖 CDN 才开始执行。调整资源加载器时应检查慢速响应、缓存命中、请求失败和超时场景，确保页面不会先于遮罩出现，也不会被永久锁住。
