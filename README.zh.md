# DeepSeek Harness

[English](README.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它采用**一切皆插件**的架构，并由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

## 开发者预览

DeepSeek Harness 目前处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

## 运行

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令会启动 Web UI，默认地址为 `http://127.0.0.1:3080`。详见 [Web UI 指南](docs/user/guide/index.md)。

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

## 使用方法

### 使用前准备

- Node.js `^22.19.0` 或 `>=24.0.0`
- pnpm `11.7.0`
- `DEEPSEEK_API_KEY`，可以通过环境变量或 `.env` 文件提供

```sh
export DEEPSEEK_API_KEY="your-api-key"
```

### 运行 headless 任务

执行一次任务，输出最终 assistant 回复后退出：

```sh
pnpm dsh --profile headless "Inspect the current repository"
```

headless profile 会创建持久化会话，但不会启动 HTTP 服务器。

### 运行 Web UI

使用默认地址启动 Web UI，或指定其他端口：

```sh
pnpm dsh web
pnpm dsh web --port 8080
```

打开 `http://127.0.0.1:3080`，或访问启动器输出的端口。使用 `pnpm dsh web --help` 查看 Web 参数。

### 配置权限和组合

新会话默认使用 `workspace-write` 权限并在写入前请求批准。如果不允许 agent 修改文件，可以使用 `read-only`：

```sh
DSH_PERMISSION_MODE=read-only pnpm dsh web
```

查看组合后的 profile 配置，或临时应用一个 patch：

```sh
pnpm dsh web --dump-default-config
pnpm dsh web --patch examples/web-schedule/cordis.yml
```

### 安装插件

将本地插件或 Git 仓库中的插件安装到 profile，然后运行该 profile：

```sh
pnpm dsh plugin --profile demo add ./my-plugin
pnpm dsh --profile demo
```

插件需要提供 profile loader 所需的 Cordis 配置和包元数据。扩展细节参见[插件实操手册](docs/user/develop/basic/index.md)和 [CLI 参考](apps/cli/reference/README.md)。

### 使用自动化接口

ACP 示例会启动一个供程序化客户端使用的 JSON-RPC 自动化服务器：

```sh
pnpm run demo:acp
```

客户端相关用法参见 [Web UI 指南](docs/user/guide/index.md)、[ACP 示例](examples/acp-agent/README.md)和 [Python SDK 指南](docs/user/guide/python-sdk.md)。

## 社区与支持

- 欢迎通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

<table>
  <thead>
    <tr>
      <th align="center">企微小助手</th>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="assets/community-wecom-assistant.png" alt="DeepSeek Harness 企微小助手二维码" width="180" height="180"></td>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="assets/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="assets/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发

请先阅读[开发指南](docs/development.md)与[架构文档](docs/architecture.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
