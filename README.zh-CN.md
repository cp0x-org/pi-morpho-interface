# cp0x 无许可 Morpho 界面

[English](./README.md) | **中文**

一个面向 Morpho 协议的开源无许可界面，完全无需许可，可与智能合约直接、无限制地交互。

## 界面语言

界面支持 **英文** 和 **中文（简体）**。点击页面顶部导航栏中的语言按钮即可切换语言，所选语言会保存在浏览器中，下次访问时自动沿用。

请注意：仅界面文本会被翻译。来自 API 和智能合约的数据（代币代号、金库与策展人名称、地址、金额、收益率等）均按原样显示。

## 界面板块

| 板块 | 网址 | 可进行的操作 |
| --- | --- | --- |
| 金库 | `/vaults`、`/vault/{address}?chainId=` | Morpho Vaults V1：存入与提取 |
| 浮动利率 | `/variable`、`/variable/{marketId}?chainId=` | Morpho Blue 市场：存入抵押品、借款、还款，以及按浮动利率存入和提取借款资产 |
| 固定利率 | `/fixed`、`/fixed/{marketId}` | Morpho Midnight 固定利率、固定期限市场：订单簿、按固定年化利率出借与借款、按面值还款、追加或提取抵押品、到期后赎回以及提前退出 |
| 投资组合 | `/portfolio` | 您在各网络上的仓位，包含固定利率仓位 |

固定利率市场运行于 [Morpho Midnight](https://docs.morpho.org/learn/concepts/midnight/) 协议。其市场 id 本身已包含链信息，因此这些网址不需要 `?chainId=`。旧链接（`/dashboard`、`/earn`、`/earn/vault/...`、`/borrow`、`/borrow/market/...`）会重定向到新地址，并保留原有查询参数。

## 应用链接

- 官网：[pi.cp0x.com](https://pi.cp0x.com/)
- 界面：[morpho.cp0x.com](https://morpho.cp0x.com)
- Twitter：[@cp0xdotcom](https://x.com/cp0xdotcom)
- Telegram：[@cp0xdotcom](https://t.me/cp0xdotcom)

## 协议文档

- 文档：[docs.morpho.org](https://docs.morpho.org/)

## 参与贡献

关于本地部署、开发以及代码贡献的步骤，请参阅 [CONTRIBUTING](./CONTRIBUTING.md)。

### 添加或修改翻译

所有界面文本都集中存放在 `src/i18n/locales/` 目录下：

- `en.json` — 英文
- `zh.json` — 中文（简体）

这两个文件采用嵌套的 JSON 结构，在运行时会被展平为 `some.nested.key` 形式的键。修改文案时，请同时更新两个文件，并保持键名与占位符（例如 `{symbol}`、`{network}`）完全一致。

如需新增语言，请在 `src/i18n/index.ts` 中的 `SUPPORTED_LOCALES` 添加对应条目，在 `src/types/config.ts` 的 `I18n` 类型中加入新的语言代码，并在 `src/i18n/locales/` 中创建相应的语言文件。
