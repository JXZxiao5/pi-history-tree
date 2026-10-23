# pi-history-tree

独立的 pi Extension：从 **User-only 历史树** 打开只读对话阅读器。不修改 pi 核心，也不接管原生 `/tree`。

已在 `@earendil-works/pi-coding-agent@1.4.0` / `pi-tui@1.4.0` 验证。使用公开模块导出，没有访问宿主私有组件、原型补丁或绝对安装路径。

## 临时加载（不修改配置）

从你希望工作的目录启动：

```bash
pi -e /home/mi/Projects/pi-history-tree/src/index.js
```

然后输入：

```text
/history-tree
```

这只对该次 pi 进程生效。**当前已经运行的 pi 不会因为创建了仓库而自动加载扩展**。若要继续原来的 Session，请使用 pi 原有的 resume 功能；扩展本身不自动选择或修改 Session。

如需以后持久安装，可以自行运行 `pi install /home/mi/Projects/pi-history-tree`，但它会修改 pi 配置。本项目开发过程中没有运行此命令。

## 交互

- History Tree 默认且始终只显示 User 消息。连续对话保持同一层，完整 Session 树中出现分叉才增加一层；分叉发生在 Assistant 或工具节点上也能识别。保留分支连接线，`*` 表示打开时的当前分支。
- 直接输入搜索，多个词按 AND 匹配，支持消息 ID；Backspace 编辑搜索。
- ↑/↓ 移动选择，PgUp/PgDn 翻页，Enter 阅读。
- 选中消息在当前分支上时，直接阅读当前分支。
- 选中消息不在当前分支，且有多个后续分支时，先选择分支末端。提示含末端 ID、时间及最近的 User/Assistant 文本；Esc 取消选择。
- Tree、分支选择和 Reader 居中显示，高度约为终端的三分之二，随窗口大小自动调整；边框使用与原生 Tree 相同的 `border` 主题色（当前主题为蓝色），不再使用紫色 accent。
- 标题、快捷键提示、搜索框集中在顶部独立框中；下面另一个框显示列表或对话内容，滚动时顶部提示保持固定。
- Reader 默认只显示根到所选分支末端的 **User 输入 + 每轮最后的成功文本回复**，自动定位到所选 User；不混入其它分支。
- Thinking、工具调用和工具结果默认完全隐藏，不再显示折叠摘要；过程说明和元数据也默认隐藏。
- Reader 中 ↑/↓ 滚动，PgUp/PgDn 翻页，Home/End 到开头/结尾。
- 仅用 `Ctrl+P` 切换“最终回复 / 完整过程”。完整过程包含工具调用、工具结果、Thinking 和元数据；切回最终回复时全部隐藏。不再提供工具或 Thinking 的单独开关。
- Reader 的 Esc 返回同一个 History Tree，保留搜索、选中位置。
- History Tree 的 Esc **直接退出**，即使有搜索词也不会先清搜索。
- Ctrl+C 等同当前页面的 Esc。

阅读器是一个临时 Overlay，不是主聊天跳转，也不是新 Session。主聊天和编辑器草稿不被替换。

## 只读约束

命令仅从 `ctx.sessionManager` 读取 `getEntries()`、`getLeafId()`，随后创建独立深拷贝快照。UI 不持有 SessionManager 或 AgentSession。

不调用 prompt、sendMessage、branch、navigateTree、appendEntry、工具执行或模型 API。不打开工具输出中引用的外部文件；不调用任意第三方 renderer。Session shutdown 时关闭自己的 Overlay，避免悬挂视图。

如果打开时模型仍在运行，阅读器不会中止它；快照不会跟随后续输出更新，后台会话仍可能正常追加数据。关闭后重新打开可以刷新快照。

## 内容支持与限制

**最终回复判定是保守启发式，不是 provider channel 识别。** 每两条 User 消息之间，最后一个对话事件必须是 `stopReason: stop`、`endTurn` 不为 false、没有 toolCall 且有文本的 Assistant 消息，才作为最终回复。中断、错误、截断、只有工具或缺失结束状态时显示简短提示，可用 Ctrl+P 查看原记录。Pi 历史没有统一的 final/commentary 字段，因此无法保证语义上的最终答案判定百分之百准确；不修改或丢弃任何原记录。

以下摘要、元数据和自定义内容在完整过程视图查看：

- User / Assistant：复用原生消息组件，支持 Markdown、代码块、长文本及 Thinking。
- Tool Call：显示工具名、调用 ID 和参数；Tool Result 按原始事件顺序显示，复用原生 ToolExecutionComponent 的安全通用 renderer，附上调用参数、details 和 nestedCalls 元数据。缺失调用也不会丢弃结果。
- 工具结果可展开全部**已保存**文本，但无法恢复工具在持久化前已经截断的输出。临时文件路径只是文本提示，不会自动读取。
- 图片只显示 MIME 类型和占位信息，不渲染图片协议、不显示 base64。
- Compaction：压缩前原文仍显示，摘要在实际 compaction 边界展示。
- Branch Summary：显示摘要及来源 ID，不将来源分支的完整记录混入当前分支。
- Context Edit：保留历史原文，同时显示上下文修改记录。
- Custom / 未知 Entry：使用安全 JSON fallback；`display: false` 的 Custom Message 正文不显示。
- 不调用第三方 tool/entry renderers 或 Markdown transformers，所以扩展专属 UI、Mermaid 等不保证与主聊天完全一致。文本、details 仍可查看。
- 搜索树使用独立 Input 和只读列表，避免带入原生 Tree 的标签编辑、过滤切换和会话分支导航操作。
- 存储的终端控制字符被转义，原生消息生成的 OSC133 标记在滚动裁剪前移除。

首次打开 Reader、resize 或切换展开状态会重新排版该分支；普通滚动复用缓存。**首版不是虚拟化阅读器**，超大 Session / 多 MB 代码块可能有首次排版延迟；整个 Session 深拷贝也会增加内存用量。

## 仓库结构

- `src/index.js`：扩展入口、单实例及生命周期。
- `src/history.js`：独立快照、User-only 树、分支路径选择。
- `src/browser.js`：Tree / 分支选择 / Reader 状态机。
- `src/reader.js`：有界滚动视口、定位锚点与布局缓存。
- `src/render.js`：历史 Entry → 原生组件及安全 fallback。
- `src/presentation.js`：最终回复筛选和完整彩色边框。
- `test/*.test.js`：数据、交互和只读接口测试。
- `test/cli-smoke.py`：真实 pi CLI 的隔离 PTY 冒烟测试。

## 开发与验证

pi 自己提供两个 peer dependencies，正常加载无需打包它们。Node 单测需要能在本仓库解析对应版本；当前本机 `node_modules/` 仅包含指向已安装 pi 包的符号链接，已被 Git 忽略。

其它机器可在仓库中安装固定测试版本（不会改全局配置）：

```bash
npm install --no-save --ignore-scripts @earendil-works/pi-coding-agent@1.4.0 @earendil-works/pi-tui@1.4.0
npm test
npm run check
```

Linux/macOS 上可运行 PTY 测试（需要 `python3`、`node`、PATH 中的 `pi`）：

```bash
python3 test/cli-smoke.py regular
python3 test/cli-smoke.py fullscreen
```

PTY 测试创建临时 HOME、配置目录与合成 Session；禁用资源发现、MCP、工具与自动联网，不发送模型 prompt，不读取真实凭据或 Session。它从真实 bundled CLI 打开 Tree，搜索旧消息，选择分支，打开 Reader，切换完整过程、翻页，再 Esc 返回和退出；验证浏览前后临时 Session 的 SHA256 与 mtime 不变。失败时仅保存合成内容的 `cli-smoke-*.log`。

本机已通过 Node 自动测试和 regular/fullscreen 两种真实 CLI PTY 测试。PTY 验证不等于人工视觉验收；不同实体终端、IME、主题和特殊字符布局仍建议实际体验。
