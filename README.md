# dsh-open-file-viewer

Open File Viewer —— DeepSeek Harness（DSH）右侧边栏的通用文件预览插件。基于 [`@open-file-viewer/core`](https://www.npmjs.com/package/@open-file-viewer/core)，把图片、视频、PDF、Office 文档、压缩包、3D 模型、CAD 图纸、GIS 数据等上百种格式直接渲染在侧边栏里，不再需要下载到本地打开。

```bash
dsh plugin --profile web add https://github.com/wenhongquan/dsh-open-file-viewer.git
```

构建产物已随仓库提交，装完即用，无需本地构建。

## 支持的格式

| 分类 | 格式 |
|---|---|
| 图片 | png · jpg · jpeg · gif · webp · avif · svg · bmp · ico · tif/tiff · heic/heif |
| 视频 / 音频 | mp4 · webm · mov · m4v · avi · mkv · flv · wmv · m3u8 · m2ts · mp3 · wav · ogg · aac · m4a · flac · opus · mid · wma |
| 文档 | pdf · epub · xps · oxps · ofd · doc/docx/docm/dot · rtf · odt · xls/xlsx/xlsb/xlsm · csv · tsv · ods · fods · ppt/pps/pptx/pptm · odp · wps · et · dps |
| 文本 / 代码 | txt · md · json/json5 · yaml/yml · toml · ini · xml · log · sql · js/ts/jsx/tsx · vue · svelte · html · css/scss/less · py · go · rs · java · c/c++ · php · sh 等 50+ |
| 压缩包 | zip · rar · 7z · tar · gz · tgz · bz2 · xz |
| 邮件 | eml · msg · mbox |
| 绘图 / 脑图 | drawio · dio · excalidraw · tldraw · xmind |
| CAD / 工程 | dxf · dwg · dwf · step/stp · iges/igs · ifc · skp · gds/gdsii · oas/oasis |
| 3D 模型 | gltf · glb · obj · stl · fbx · dae · ply · 3mf · usd · usdz |
| GIS | geojson · topojson · kml · kmz · gpx · shp |
| 资源 | ttf · otf · woff/woff2 · psd · ai · eps |

预览工具栏支持缩放、旋转、全屏、下载；PDF 额外支持打印与全文搜索。本插件是**只读预览**——文本文件的编辑交给 dsh-better-sidebar 的编辑器（见下）。

## 安装

**方式一：从 GitHub 直接安装（推荐）**

```bash
dsh plugin --profile web add https://github.com/wenhongquan/dsh-open-file-viewer.git
```

**方式二：本地源码安装**

```bash
git clone https://github.com/wenhongquan/dsh-open-file-viewer.git
cd dsh-open-file-viewer && pnpm install && pnpm run build
dsh plugin --profile web add ./dsh-open-file-viewer
```

要求 DSH 0.1.7-rc.1+，Web（浏览器）侧栏环境。

## 与 dsh-better-sidebar 的协作

安装了 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 时，本插件通过其 `registerFileViewer` 扩展点把预览器注册进它的文件编辑器，分工如下：

- **3D 模型、CAD、GIS、媒体、压缩包、邮件、绘图**等二进制格式 —— 从 better-sidebar 的文件树打开时直接渲染在这里，而不是它的"无法预览 / 下载"兜底页；
- **图片 / PDF / 表格 / Office**（better-sidebar 的让渡清单）—— 走系统认领，仍由本插件的原生标签渲染；
- **文本 / 代码 / Markdown / HTML** —— 留给 better-sidebar 的可编辑编辑器（CodeMirror，可保存），本插件不抢。

未安装 better-sidebar 时，所有文件通过原生标签认领系统进入本插件，功能不受影响。

## 工作原理

- 通过 `dsh.client` 清单向客户端模块系统注册一个 `extension` 优先级的标签类型，认领 `dsh-resource://file/**` 地址，并挂载预览面板体；
- 文件字节经宿主的 `remote.workspaceFiles.readBytes` 分页读取（2 MiB 窗口），在浏览器内交给各格式插件渲染，pdfjs 打包内置、无 CDN 依赖；
- 等待 `remote.workspaceFiles` 命名空间服务就绪后再激活，避免与远端装配的激活竞态。

## 开发

```bash
pnpm install          # 安装依赖
pnpm run build        # rolldown 打包 lib/client.js + lib/index.js
pnpm run verify       # 独立契约自检（注册、认领、信封解包、better-sidebar 集成）
```

仓库结构：`src/client.tsx`（浏览器半边：认领 + 预览面板体 + better-sidebar 集成）、`src/index.ts`（宿主半边）、`scripts/`（资产生成与契约自检）、`lib/`（构建产物，随仓库提交以便直接安装）。

## 许可

[MIT](LICENSE)
