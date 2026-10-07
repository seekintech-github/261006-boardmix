# 1.0.0 验证记录

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
