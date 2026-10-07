# 验证记录

## 1.0.1 公司品牌版（2026-10-07）

- 从用户提供的名片中提取原始 Seekin Logo，实际软件资产仅包含公司标识。
- 48 项单元测试通过，包括新增的品牌 SVG/PNG 导出、自包含图片资源和小画布署名空间检查。
- 16 项 Chromium 交互测试通过，包括侧栏折叠、离线加载、两种画布切换、操作弹窗及 1024×700 窗口下 Logo 与公司全称可见性。
- Electron 实际运行验证通过：窗口标题、原生“关于知图”的公司信息和图片、断网后的 Logo 加载，以及原有文件读写和导出。
- `app.getName()` 保持“知图 ZhiTu”，应用 ID 与工作区存储格式保持不变。
- Windows 免安装 EXE 与 ZIP 交叉打包成功，ZIP 完整性与内含 `app.asar` 一致性检查通过。
- 实际 `ZhiTu.exe` 和 Portable EXE 的公司名称、1.0.1 版本及版权信息正确，7 种尺寸的内嵌图标与公司 ICO 图像逐一匹配。
- 使用 Linux Electron 启动 Windows 包中的 `app.asar`，13 个节点正常显示；断网重载后侧栏、画布和底栏的公司名称与 Logo 均可用。

运行环境仍为 Linux，Windows 实机启动与安装未在本环境验证。

## 1.0.0（2026-10-06）

本记录对应 2026-10-06 的 Linux 云环境验证。目标发行平台是 Windows 10 / 11 x64；本机不是 Windows，未执行 Windows 实机启动、系统提示或安装向导测试。

已完成：

- TypeScript 类型检查和 Vite 生产构建。
- 44 项模型与存储单元测试：导图布局、纵向流程布局、环路、节点不重叠、大图、文件往返与输入校验，以及部分损坏数据恢复和备份失败保护。
- 13 项真实 Chromium 交互测试：中文编辑、撤销重做、添加子主题和同级主题、删除、拖动、连线、调整节点尺寸、多画布、文件保存与导入、离线图片导出，以及刷新恢复。
- Linux Electron 桌面实际启动：从本地 `file://` 加载应用、断网后重载、上下文隔离、文件桥接，以及 `.zhitu`、SVG、PNG 保存。系统对话框由测试桩提供选定路径。
- 原子保存故障注入：模拟临时文件写入中途磁盘满，已有文件保持完整，没有残留临时文件。

Windows 默认交叉打包目标为免安装 EXE 和 ZIP。带安装向导的 NSIS 目标另有构建脚本与 Windows GitHub Actions 工作流；Linux 构建 NSIS 安装向导需要 Wine。

复验命令：

```sh
npm run build
npm test
npm run test:e2e
npm run test:desktop
npm run dist:win
```

Linux 桌面测试需要显示服务器（X11 或 Xvfb），浏览器测试需要 Chromium。当前云环境使用系统 Chromium。Windows 分发文件未做商业代码签名。
