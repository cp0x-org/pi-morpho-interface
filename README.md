# Permissionless Morpho Interface by cp0x

**English** | [中文](./README.zh-CN.md)

An open-source, permissionless interface for the Morpho protocol designed to be fully permissionless and enable direct, unrestricted interaction with smart contracts.

## Interface Languages

The interface is available in **English** and **Chinese (Simplified)**. Use the language button in the top navigation bar to switch; the choice is stored in the browser and reused on the next visit.

Only interface text is translated. Data coming from the API and smart contracts (token symbols, vault and curator names, addresses, amounts, rates) is shown as-is.

## Sections

| Section | URL | What you can do |
| --- | --- | --- |
| Vaults | `/vaults`, `/vault/{address}?chainId=` | Morpho Vaults V1: deposit and withdraw |
| Variable Rate | `/variable`, `/variable/{marketId}?chainId=` | Morpho Blue markets: supply collateral, borrow, repay, supply and withdraw the loan asset at a floating rate |
| Fixed Rate | `/fixed`, `/fixed/{marketId}` | Morpho Midnight fixed-rate, fixed-term markets: order book, lend and borrow at a fixed APR, repay at par, add or withdraw collateral, redeem after maturity and exit early |
| Portfolio | `/portfolio` | Your positions across networks, fixed-rate ones included |

Fixed-rate markets run on the [Morpho Midnight](https://docs.morpho.org/learn/concepts/midnight/) protocol. Their market ids already commit to a chain, so those URLs need no `?chainId=`. Older links (`/dashboard`, `/earn`, `/earn/vault/...`, `/borrow`, `/borrow/market/...`) redirect to the new ones and keep their query parameters.

## Configuration (RPC endpoints)

RPC endpoints are not part of the build: `index.html` loads `/config.js` before the app bundle, so keys never end up in the bundle or in git.

```
cp public/config.example.js public/config.js   # git-ignored, put your own RPC URLs (with keys) here
```

`rpcUrls` maps a chain id to one URL or a list of URLs; a chain left out keeps the public endpoint from its viem definition. `walletConnectProjectId` is optional. Supported networks: Ethereum, Base, Polygon, Unichain, Arbitrum One, OP Mainnet, World Chain, HyperEVM, Katana, Monad, Stable, Tempo and Robinhood Chain.

### Docker

```
docker compose up -d --build
```

The image ships only `config.example.js` (public endpoints); `docker-compose.yml` mounts your `public/config.js` over `/app/dist/config.js`, so the file must exist before `up`. The interface listens on [http://localhost:4173].

## Application Links
- Website: [pi.cp0x.com](https://pi.cp0x.com/)
- Interface: [morpho.cp0x.com](https://morpho.cp0x.com)
- Twitter: [@cp0xdotcom](https://x.com/cp0xdotcom)
- Telegram: [@cp0xdotcom](https://t.me/cp0xdotcom)

## Protocol Docs

- Docs: [docs.morpho.org](https://docs.morpho.org/)

## Contributions

For steps on local deployment, development, and code contribution, please see [CONTRIBUTING](./CONTRIBUTING.md).

### Adding or changing translations

All interface strings live in `src/i18n/locales/`:

- `en.json` — English
- `zh.json` — Chinese (Simplified)

Both files use a nested JSON structure that is flattened into `some.nested.key` message ids at runtime. When you change a string, update both files and keep the keys and placeholders (for example `{symbol}`, `{network}`) identical.

To add another language, add an entry to `SUPPORTED_LOCALES` in `src/i18n/index.ts`, extend the `I18n` type in `src/types/config.ts`, and drop a matching file into `src/i18n/locales/`.
