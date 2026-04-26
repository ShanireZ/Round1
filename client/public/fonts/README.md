# Self-Hosted Fonts

Place the following `.woff2` font files in this directory.
They are referenced by `src/styles/globals.css` via relative path `/fonts/`.

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

After downloading the fonts, upload them to your R2 bucket and update the
`@font-face` URLs in `src/styles/globals.css` if you want to serve from CDN
instead of the local `public/fonts/` directory.

Example R2 URL format:
```
https://<your-r2-domain>/font/GeistVF.woff2
```
