/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Real data of the Novus releases, recorded for the offline checks of the Novus SDK (check-novus-sdk.ts). */

const BASE = 'https://github.com/ezTxmMC/novus/releases/download';

/** `gh release view v0.1.0-pre.alpha.8 -R ezTxmMC/novus --json assets`: names, sizes and digests as GitHub returned them. */
export const ALPHA_8 = {
  tag_name: 'v0.1.0-pre.alpha.8', prerelease: true, draft: false,
  assets: [
    { name: 'novus-lsp-aarch64-linux-gnu', size: 3066296, digest: 'sha256:cd437f4bdacf20834a72f635cbafa4129e1b411f55971cee419782312a8f7ec2', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novus-lsp-aarch64-linux-gnu` },
    { name: 'novus-lsp-aarch64-macos', size: 3110328, digest: 'sha256:bf7f2142ebc7eae746f078319362d9f1942e79c7d8d1c88acda24951b2baf0a3', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novus-lsp-aarch64-macos` },
    { name: 'novus-lsp-aarch64-windows-gnu.exe', size: 3005952, digest: 'sha256:e58dc283adac248f84f916de35f82b4559c7b2a12e2e1320f198db4729d248d8', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novus-lsp-aarch64-windows-gnu.exe` },
    { name: 'novus-lsp-linux-x86_64', size: 1927960, digest: 'sha256:84398bc3513c66373eeaa91eb5cef3aa75fce2a26a6a9cf1e60c3f1dce3ea925', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novus-lsp-linux-x86_64` },
    { name: 'novus-lsp-macos-arm64', size: 3180088, digest: 'sha256:0fab93a34ba72c4fc65baca6d358a915058b5632dc59c65ea401fd5ce076ed92', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novus-lsp-macos-arm64` },
    { name: 'novus-lsp-x86_64-linux-gnu', size: 3111424, digest: 'sha256:086ac3f232311b7efc5d50d912cd6b8ed1e3810e820c3efec711ae79c5896f32', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novus-lsp-x86_64-linux-gnu` },
    { name: 'novus-lsp-x86_64-linux-musl', size: 3090432, digest: 'sha256:c9fa577fd1b577f821b590546475cdf677a000d1562970941a537e740c598597', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novus-lsp-x86_64-linux-musl` },
    { name: 'novus-lsp-x86_64-macos', size: 2977063, digest: 'sha256:2d4b0944489a96aaa86f4b13b274be6b951f30ea7fec73e7aa7d05fb8c94bb0c', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novus-lsp-x86_64-macos` },
    { name: 'novus-lsp-x86_64-windows-gnu.exe', size: 3125248, digest: 'sha256:37e335038a0306d437d931259bf1b20f2085c818853f2a8feddade9e6db978ef', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novus-lsp-x86_64-windows-gnu.exe` },
    { name: 'novusc-aarch64-linux-gnu', size: 1410360, digest: 'sha256:4f642bec21ba6457ba377c7d0235ab1e4c0fd2fd8a3d124413e7e579be220b67', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novusc-aarch64-linux-gnu` },
    { name: 'novusc-aarch64-macos', size: 1310680, digest: 'sha256:e85edb31909729306cf2df439bb751ffe0b2219d7286ae5c55d3ab9e36b8ca6a', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novusc-aarch64-macos` },
    { name: 'novusc-aarch64-windows-gnu.exe', size: 1520128, digest: 'sha256:ae663fed88eae359059bf0dc4aeeb20e7915c637d574e36af0a358b3b2ac7fcb', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novusc-aarch64-windows-gnu.exe` },
    { name: 'novusc-linux-x86_64', size: 1034376, digest: 'sha256:316e353b8b5ffae765e96a7bb8ad50bfb255f58f3b1f29e87a6ba21e76be946b', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novusc-linux-x86_64` },
    { name: 'novusc-macos-arm64', size: 1432712, digest: 'sha256:a272415de6122c0d2da3679e0e9319b7eacb9a23a92d948bd1c4140f38446199', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novusc-macos-arm64` },
    { name: 'novusc-windows-x86_64.exe', size: 1188580, digest: 'sha256:d4f58c0fcf745fe7fffe6b2f3a2fcdb37f315188ecc81f45f67b36ab4324d86c', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novusc-windows-x86_64.exe` },
    { name: 'novusc-x86_64-linux-gnu', size: 1435016, digest: 'sha256:604193b5d6335c01f9666ecd7ddd42ce75ec174763d00c1f0468dfa11772c352', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novusc-x86_64-linux-gnu` },
    { name: 'novusc-x86_64-linux-musl', size: 1462752, digest: 'sha256:aaa5e9c20f0265e1417fb2baef7b9cce90b33bf408127b0b506a83d953c61b46', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novusc-x86_64-linux-musl` },
    { name: 'novusc-x86_64-macos', size: 1274016, digest: 'sha256:4cf6fd78d8113f4c8cd32e7c0586cd592b48b376ecfb15e005f6468baac45d15', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novusc-x86_64-macos` },
    { name: 'novusc-x86_64-windows-gnu.exe', size: 1569280, digest: 'sha256:3b0d89a4bb27cc383eff5d9fa8a659fb7abbd86930d3888982ca2d13fbbefd59', browser_download_url: `${BASE}/v0.1.0-pre.alpha.8/novusc-x86_64-windows-gnu.exe` },
  ],
};

/** `gh release view v0.1.0-pre.alpha.6 -R ezTxmMC/novus --json assets`: names, sizes and digests as GitHub returned them. */
export const ALPHA_6 = {
  tag_name: 'v0.1.0-pre.alpha.6', prerelease: true, draft: false,
  assets: [
    { name: 'novusc-aarch64-linux-gnu', size: 664488, digest: 'sha256:2d7b15f147203d6c6610d68b31638f1dc1f65f706598b33ffb3b72918b036d63', browser_download_url: `${BASE}/v0.1.0-pre.alpha.6/novusc-aarch64-linux-gnu` },
    { name: 'novusc-aarch64-macos', size: 621912, digest: 'sha256:53d549a119e4dad21cbf7a15976e13304dc330b0c9948ebe7e04be9d5a2eb91d', browser_download_url: `${BASE}/v0.1.0-pre.alpha.6/novusc-aarch64-macos` },
    { name: 'novusc-aarch64-windows-gnu.exe', size: 768000, digest: 'sha256:b270dec2027980601a5f9ad63ee22f97c51a986760558d10668b496aaf29eda4', browser_download_url: `${BASE}/v0.1.0-pre.alpha.6/novusc-aarch64-windows-gnu.exe` },
    { name: 'novusc-linux-x86_64', size: 600176, digest: 'sha256:82e2fe64235a485339f61826c19c447d65a9fe6161f0c40b4bcf0452e5f78fa8', browser_download_url: `${BASE}/v0.1.0-pre.alpha.6/novusc-linux-x86_64` },
    { name: 'novusc-macos-arm64', size: 691848, digest: 'sha256:d19ad374f02784b3669ba71b412ee744df2e3f69e1ae10a1e0b7278611fcccb7', browser_download_url: `${BASE}/v0.1.0-pre.alpha.6/novusc-macos-arm64` },
    { name: 'novusc-windows-x86_64.exe', size: 963401, digest: 'sha256:53ff978b3a5860d07060ae7777f9db0c505be3e854ff93df3e3dae6851fd24d6', browser_download_url: `${BASE}/v0.1.0-pre.alpha.6/novusc-windows-x86_64.exe` },
    { name: 'novusc-x86_64-linux-gnu', size: 669544, digest: 'sha256:a6a15e82939496aabf42a32b2550b46495e593ab43bf1323aeb350f9dea40afc', browser_download_url: `${BASE}/v0.1.0-pre.alpha.6/novusc-x86_64-linux-gnu` },
    { name: 'novusc-x86_64-linux-musl', size: 706912, digest: 'sha256:9f9161b5cf1645b61fc32b5b51156f9bc7a8c9a6201cf536955239ab80d14ccd', browser_download_url: `${BASE}/v0.1.0-pre.alpha.6/novusc-x86_64-linux-musl` },
    { name: 'novusc-x86_64-macos', size: 602939, digest: 'sha256:eff8fdfa8a24836e1145b3859cefe42dcb7fc6c48bdb13917facc7e175d8d50e', browser_download_url: `${BASE}/v0.1.0-pre.alpha.6/novusc-x86_64-macos` },
    { name: 'novusc-x86_64-windows-gnu.exe', size: 787968, digest: 'sha256:2e290c10c1aa39eef06f8e6dca9e7c8a5a38181ea496d374260e9661c3f4d612', browser_download_url: `${BASE}/v0.1.0-pre.alpha.6/novusc-x86_64-windows-gnu.exe` },
  ],
};
