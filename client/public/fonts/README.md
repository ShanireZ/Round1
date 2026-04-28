# Self-Hosted Fonts

These `.woff2` files are kept as a local cache, but the active Round1 frontend
loads fonts through the same-origin `/font/` path. In dev and production that
path must proxy to the public R2 origin configured by `R2_PUBLIC_BASE_URL`.
With the current local `.env`, the upstream font objects live at:

```
https://r2.round1.cc/font/<font-file>.woff2
```

## Required Font Files

| File Name                         | Font                      | Download Source                                           |
| --------------------------------- | ------------------------- | --------------------------------------------------------- |
| `GeistVF.woff2`                   | Geist Sans (Variable)     | https://github.com/vercel/geist-font/releases             |
| `GeistMonoVF.woff2`               | Geist Mono (Variable)     | https://github.com/vercel/geist-font/releases             |
| `Fraunces-Variable.woff2`         | Fraunces (Variable)       | https://github.com/googlefonts/Fraunces/releases          |
| `HarmonyOS_Sans_SC_Regular.woff2` | HarmonyOS Sans SC 400     | https://developer.huawei.com/consumer/cn/design/resource/ |
| `HarmonyOS_Sans_SC_Medium.woff2`  | HarmonyOS Sans SC 500     | https://developer.huawei.com/consumer/cn/design/resource/ |
| `HarmonyOS_Sans_SC_Bold.woff2`    | HarmonyOS Sans SC 700     | https://developer.huawei.com/consumer/cn/design/resource/ |
| `SourceHanSerifSC-Heavy.woff2`    | Source Han Serif SC Heavy | https://github.com/adobe-fonts/source-han-serif/releases  |

## Cloudflare R2 Hosting

After downloading the fonts, upload them to your R2 bucket under `/font/` and
keep the same-origin `/font/` proxy aligned with the public
`R2_PUBLIC_BASE_URL` value. Direct cross-origin font URLs require R2 CORS
headers, so Round1 uses the proxy path to avoid browser font CORS errors.

Example R2 URL format:

```
https://<your-r2-domain>/font/GeistVF.woff2
```
