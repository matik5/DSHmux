# DSHmux

[English](README.md) | **中文**

[![License](https://img.shields.io/github/license/matik5/DSHmux)](LICENSE)
[![CI](https://github.com/matik5/DSHmux/actions/workflows/ci.yml/badge.svg)](https://github.com/matik5/DSHmux/actions)
[![GitHub Release](https://img.shields.io/github/v/release/matik5/DSHmux)](https://github.com/matik5/DSHmux/releases/latest)
[![Open VSX Version](https://img.shields.io/open-vsx/v/matik5/dshmux)](https://open-vsx.org/extension/matik5/dshmux)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-latest-blue)](https://marketplace.visualstudio.com/items?itemName=matik5.dshmux)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/matik5/dshmux)](https://open-vsx.org/extension/matik5/dshmux)

**DSHmux** 一键启动 DeepSeek Harness，并把完整 Web UI 内嵌进 VS Code（及 Antigravity）——在同一个窗口里运行 DSH Agent、编写代码，并与浏览器 UI 共享状态。

## Screenshot / 截图

![DSHmux 在 VS Code 中内嵌 DeepSeek Harness](media/vscode-screenshot.png)

## 功能

- **在编辑器里完成一切**：在 **VS Code 或 Antigravity** 中边写代码边用 DeepSeek Harness，无需在 IDE 与浏览器标签页之间来回切换就能看到 Agent 工作。
- **Agent 生态中的一员**：VS Code / Antigravity 可安装多个 coding agent 扩展，各自由不同 LLM 驱动（如 Claude Code、ChatGPT…）；本扩展就是其中之一——**DeepSeek Harness Agent**，与其它 Agent 在同一 IDE 里并存，可让多个 Agent 同时跑同一任务、**交叉评审，规避单一 LLM 的短板**。
- **一键启动 / 停止**：扩展托管 `dsh web` 子进程（端口自动分配）。入口：活动栏 DSH 图标（侧边栏启动器）、状态栏按钮、命令面板。
- **侧边栏对话**：完整 DSH 前端位于紧凑启动器与会话列表下方，是默认对话界面。
- **可选编辑器视图**：需要更大空间时，点击 **在编辑器中打开**。
- **与浏览器共享实例**：默认使用你的 `~/.dsh`，会话与设置和浏览器 UI 互通。
- **当前文件夹即工作区**：DSH 默认项目目录 = 你打开的文件夹。
- **工作区对齐**：DSH workspace 跟随 IDE 工作区，内嵌 UI 默认选择当前文件夹而非最近活跃目录。
- **会话管理器**：侧边栏列出活跃会话（标题 + 相对时间），支持重命名、归档，并在单一主对话视图中切换会话。
- **点图标自动启动**：点击活动栏图标，dsh 未运行时自动启动。
- **dsh 版本检查 + 一键升级**：启动器显示 "有新版本：x.y.z →"（有新版时，文案随界面语言本地化）；点击后按你的安装方式（npx / npm 全局 / nvm）给出对应升级命令，预填进终端（24 小时检查门、离线静默）。
- **剪贴板可用**：内嵌 UI 的复制/粘贴走传输桥（VS Code webview 会屏蔽 iframe 内的剪贴板；桥通过 `vscode.env.clipboard` 转发）。
- **事件提示音**：任务开始、完成及需要用户输入时播放不同提示音（`dshmux.completionSound`，默认 `true`）。
- **紧凑侧边栏字号**：侧边栏 DSH frame 的根字号为 80%；编辑器标签页保留上游字号。
- **主题跟随 VS Code**：内嵌 UI 跟随编辑器颜色主题（深/浅），切换即时生效（`dshmux.themeSync`，默认 `follow`）。
- **跨平台**：macOS / Linux / Windows 三平台，由 CI 端到端验证（单测 + 真实 `dsh` 冒烟）。
- **多语言界面**：扩展壳层（启动器、覆盖层、状态栏、命令提示）跟随 VS Code 显示语言，共 9 种：English、中文、日本語、한국어、Русский、Español、Português、Français、Deutsch。
- **安全优先**：服务仅绑定回环；扩展以纯 Node 请求代发，不弱化 DSH 的 `/api` 信任围栏。（注：内嵌页面及其插件视为受信——剪贴板读写桥接到系统剪贴板，无浏览器授权弹窗，与扩展本身的信任等级一致。）

## 环境要求

- 已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：`npm i -g @deepseek-ai/dsh`
- VS Code ≥ 1.90（通过 Open VSX 亦可用于 Antigravity）

## 安装

- **VS Code**：[Visual Studio Marketplace](https://marketplace.visualstudio.com/) 搜索 *DSHmux*
- **Antigravity / Open VSX**：[Open VSX](https://open-vsx.org/) 搜索 *DSHmux*

## 使用

1. 点击活动栏 **DSHmux** 图标；需要时 DSH 会自动启动。
2. 在侧边栏对话，通过启动器选择或创建会话；需要更大空间时点击 **在编辑器中打开**。
3. 按需使用 **停止 DSH**、**在浏览器打开**或版本更新提示。

想让 DSH 以你的项目为默认工作区，先在窗口里打开该文件夹。

## 配置

| 设置项 | 默认 | 说明 |
|---|---|---|
| `dshmux.dshPath` | 空 | DSH 可执行文件的绝对路径；留空时自动查找。若使用源码检出，请指向构建后的 `apps/cli/lib/bin.js`。修改后需重启 DSH。 |
| `dshmux.themeSync` | `follow` | 将 VS Code 颜色主题同步到内嵌 DSH 界面；`off` 尊重 DSH 自身外观设置。 |
| `dshmux.completionSound` | `true` | 为任务开始、完成及用户输入请求播放提示音。 |
| `dshmux.frameFontScale` | `0.9` | 内嵌 DSH 界面内容的缩放（1 = 默认大小）；数值越小，界面越紧凑。范围 0.5–1.5。 |

## 开发

```sh
npm install --cache .npm-cache
npm run compile     # tsc
npm test            # node:test 单元测试
npm run package     # vsce package -> vsix
```

在 VS Code 中按 `F5` 启动扩展开发宿主。

## 架构

扩展 spawn `dsh web --port 0`，将 DSH 前端作为同源 webview 资源加载，并通过 `postMessage` 桥把 `fetch` / WebSocket / 剪贴板转发到扩展宿主，由宿主以纯 Node 请求执行真实调用（通过 DSH 的 `/api` 信任围栏）。设计与验证记录：

- 架构提案：[`doc/architecture/proposal-by-deepseek.md`](doc/architecture/proposal-by-deepseek.md)
- 特性流程：[`doc/feature/00-dsh-vscode/`](doc/feature/00-dsh-vscode/)

## 变更日志

见 [CHANGELOG.md](CHANGELOG.md) / [CHANGELOG.zh.md](CHANGELOG.zh.md)。
## License

MIT — 见 [LICENSE](LICENSE)。Copyright © 2026 Liming Xie, Mati Kosemäe。
