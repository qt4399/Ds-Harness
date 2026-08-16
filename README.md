# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It uses an architecture where **everything is a plugin**, and is powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## Developer preview

DeepSeek Harness is currently in _developer preview_ and is iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI, served at `http://127.0.0.1:3080` by default. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

## Usage

### Prerequisites

- Node.js `^22.19.0` or `>=24.0.0`
- pnpm `11.7.0`
- A `DEEPSEEK_API_KEY`, provided in the environment or a `.env` file

```sh
export DEEPSEEK_API_KEY="your-api-key"
```

### Run a headless task

Run one task, print the final assistant response, and exit:

```sh
pnpm dsh --profile headless "Inspect the current repository"
```

The headless profile creates a persisted session and does not start an HTTP server.

### Run the Web UI

Start the Web UI on the default address or choose another port:

```sh
pnpm dsh web
pnpm dsh web --port 8080
```

Open `http://127.0.0.1:3080` or the port printed by the launcher. Use `pnpm dsh web --help` to list Web options.

### Configure permissions and composition

New sessions use `workspace-write` with approval by default. Use `read-only` when the agent must not modify files:

```sh
DSH_PERMISSION_MODE=read-only pnpm dsh web
```

Inspect the composed profile or apply a temporary patch:

```sh
pnpm dsh web --dump-default-config
pnpm dsh web --patch examples/web-schedule/cordis.yml
```

### Install a plugin

Install a local or Git-hosted plugin into a profile, then run that profile:

```sh
pnpm dsh plugin --profile demo add ./my-plugin
pnpm dsh --profile demo
```

The plugin must provide the Cordis configuration and package metadata expected by the profile loader. See the [plugin tutorial](docs/user/develop/basic/index.md) and [CLI reference](apps/cli/reference/README.md) for extension details.

### Use automation interfaces

The ACP example starts a JSON-RPC automation server for programmatic clients:

```sh
pnpm run demo:acp
```

See the [Web UI guide](docs/user/guide/index.md), [ACP example](examples/acp-agent/README.md), and [Python SDK guide](docs/user/guide/python-sdk.md) for client-specific usage.

## Community and support

- Feel free to submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
