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
 * Commands that make themselves at home on a machine (persistence), switch off
 * its defences (tampering) or reach for more rights than they need (privilege).
 *
 * Writing to `~/.bashrc` is normal; writing a `curl` or `base64` payload into
 * it is not — those rules therefore confirm that a payload word is on the line.
 */

import { PAYLOAD_WORDS, commandRule } from './define.js';

const HOME = String.raw`(?:~|\$HOME|\$\{HOME\}|\/home\/[\w.-]+|\/root|\/Users\/[\w.-]+)`;
const payloadOnLine = (_match, line) => PAYLOAD_WORDS.test(line);

export const PERSISTENCE_RULES = [
  commandRule('SEC-CMD-042', 'high', 'persistence', 'Payload appended to a shell startup file',
    'A download, decoder or `eval` written into `.bashrc`/`.zshrc`/`.profile` runs again at every login.',
    new RegExp(String.raw`(?:>>?|\btee\s+(?:-a\s+)?)\s*["']?${HOME}\/\.(?:bashrc|bash_profile|bash_login|zshrc|zprofile|zshenv|profile|zlogin|config\/fish\/config\.fish)\b`),
    { hint: String.raw`\.(?:bashrc|bash_profile|bash_login|zshrc|zprofile|zshenv|profile|zlogin|fish)\b`, confirm: payloadOnLine }),
  commandRule('SEC-CMD-043', 'high', 'persistence', 'Crontab loaded with a network payload',
    'Installing a cron job that downloads or decodes code makes the payload come back on a schedule.',
    /(?<![\w.-])crontab\s+-(?=\s|$)/,
    { hint: String.raw`\bcrontab\b`, confirm: payloadOnLine }),
  commandRule('SEC-CMD-044', 'high', 'persistence', 'Payload written into a cron folder',
    'A downloader or encoded command written under `/etc/cron*` or `/var/spool/cron` runs on a schedule.',
    /(?:>>?|\btee\s+(?:-a\s+)?)\s*\/(?:etc\/cron(?:\.d|tab|\.hourly|\.daily|\.weekly|\.monthly)?|var\/spool\/cron)\b/,
    { hint: String.raw`\/(?:etc\/cron|var\/spool\/cron)`, confirm: payloadOnLine }),
  commandRule('SEC-CMD-045', 'high', 'persistence', 'systemd unit created and enabled in one command',
    'Writing a unit file and enabling it straight away installs a service that survives reboots.',
    /(?:>>?|\btee\s+(?:-\w+\s+)*)\s*\S*\/systemd\/(?:system|user)\/[\w@.-]+\.service\b[^\n]*\bsystemctl\s+(?:--user\s+)?(?:enable|daemon-reload)\b/,
    { hint: String.raw`\bsystemd\b` }),
  commandRule('SEC-CMD-046', 'medium', 'persistence', 'launchd agent installed',
    'Loading a LaunchAgent or LaunchDaemon makes a program start at every login or boot on macOS.',
    /(?:(?<![\w.-])launchctl\s+(?:load|bootstrap)\b|>>?\s*\S*\/Library\/Launch(?:Agents|Daemons)\/)/,
    { hint: String.raw`\b(?:launchctl|Launch(?:Agents|Daemons))\b` }),
  commandRule('SEC-CMD-047', 'high', 'persistence', 'Scheduled task running a shell or a download',
    '`schtasks /create` with PowerShell, `cmd`, `mshta` or a URL plants a task that runs repeatedly.',
    /(?<![\w.-])schtasks(?:\.exe)?\s+\/create\b(?=[^\n]*(?:powershell|pwsh|cmd(?:\.exe)?\s+\/c|mshta|wscript|cscript|https?:|rundll32|regsvr32))/i,
    { hint: String.raw`\bschtasks\b` }),
  commandRule('SEC-CMD-048', 'high', 'persistence', 'Autorun registry key written',
    'A value under `…\\CurrentVersion\\Run` or `Winlogon` starts a program at every logon.',
    /(?<![\w.-])(?:reg(?:\.exe)?\s+add\s+["']?HK(?:LM|CU|EY_LOCAL_MACHINE|EY_CURRENT_USER)\\[^\n]*\\(?:Run|RunOnce|RunServices|Winlogon|Image File Execution Options)\b|New-ItemProperty\b[^\n]*CurrentVersion\\Run)/i,
    { hint: String.raw`\b(?:reg|New-ItemProperty)\b` }),
  commandRule('SEC-CMD-049', 'high', 'persistence', 'SSH key appended to authorized_keys',
    'Adding a key to `authorized_keys` gives its owner permanent remote login.',
    /(?:>>?\s*["']?\S*\.ssh\/authorized_keys2?\b|\btee\s+(?:-a\s+)?\S*authorized_keys2?\b)/,
    { hint: 'authorized_keys' }),
  commandRule('SEC-CMD-050', 'high', 'persistence', 'sudoers modified',
    'Granting `NOPASSWD` or editing `/etc/sudoers` gives a user or script root without a password.',
    /\bNOPASSWD\s*:|>>?\s*\/etc\/sudoers(?:\.d\/\S+)?|\btee\s+(?:-a\s+)?\/etc\/sudoers/,
    { hint: String.raw`NOPASSWD|sudoers` }),
  commandRule('SEC-CMD-051', 'medium', 'persistence', 'User account created',
    'Creating a user account from a script can plant a login the owner does not know about.',
    /(?<![\w.-])(?:useradd|adduser)\s+(?!--help|-h\b)\S/,
    { hint: String.raw`\b(?:useradd|adduser)\b` }),
  commandRule('SEC-CMD-052', 'high', 'persistence', 'Windows user or admin account added',
    '`net user … /add` or `net localgroup administrators … /add` creates an account or grants admin rights.',
    /(?<![\w.-])net1?\s+(?:user|localgroup)\b[^\n]*\/add\b/i,
    { hint: String.raw`\bnet1?\b` }),
];

export const TAMPER_RULES = [
  commandRule('SEC-CMD-053', 'high', 'tamper', 'Firewall disabled or flushed',
    'Flushing the firewall rules or disabling it removes the machine\'s network protection.',
    /(?<![\w.-])(?:iptables|ip6tables)\s+(?:-t\s+\w+\s+)?(?:-F|--flush|-X|-P\s+(?:INPUT|FORWARD|OUTPUT)\s+ACCEPT)\b|(?<![\w.-])ufw\s+disable\b|(?<![\w.-])nft\s+flush\s+ruleset\b|(?<![\w.-])systemctl\s+(?:stop|disable|mask)\s+(?:firewalld|ufw|iptables)\b/,
    { hint: String.raw`\b(?:iptables|ip6tables|ufw|nft|systemctl)\b` }),
  commandRule('SEC-CMD-054', 'high', 'tamper', 'Mandatory access control switched off',
    'Setting SELinux to permissive or stopping AppArmor removes a layer that limits what compromised programs can do.',
    /(?<![\w.-])setenforce\s+(?:0|permissive)\b|\bSELINUX=(?:disabled|permissive)\b|(?<![\w.-])systemctl\s+(?:stop|disable)\s+apparmor\b|(?<![\w.-])aa-teardown\b/i,
    { hint: String.raw`\b(?:setenforce|SELINUX|apparmor|aa-teardown)\b` }),
  commandRule('SEC-CMD-055', 'critical', 'tamper', 'Windows Defender protection disabled',
    'Turning off real-time monitoring or Defender itself clears the way for malware.',
    /\bSet-MpPreference\b[^\n]*-Disable\w+\s+\$?(?:true|1)\b|(?<![\w.-])sc(?:\.exe)?\s+(?:stop|config)\s+(?:WinDefend|wscsvc|SecurityHealthService)\b|\bDisableAntiSpyware\b/i,
    { hint: String.raw`\b(?:Set-MpPreference|WinDefend|wscsvc|SecurityHealthService|DisableAntiSpyware)\b` }),
  commandRule('SEC-CMD-056', 'high', 'tamper', 'Windows Defender exclusion added',
    'Excluding a path, process or extension from Defender lets malware run unscanned there.',
    /\bAdd-MpPreference\b[^\n]*-Exclusion(?:Path|Process|Extension)\b/i,
    { hint: String.raw`\bAdd-MpPreference\b` }),
  commandRule('SEC-CMD-057', 'high', 'tamper', 'Windows firewall switched off',
    '`netsh advfirewall … state off` turns off the Windows firewall.',
    /(?<![\w.-])netsh(?:\.exe)?\s+advfirewall\s+set\s+\S+\s+state\s+off\b|\bSet-NetFirewallProfile\b[^\n]*-Enabled\s+(?:False|0)\b/i,
    { hint: String.raw`\b(?:netsh|Set-NetFirewallProfile)\b` }),
  commandRule('SEC-CMD-058', 'high', 'tamper', 'macOS Gatekeeper or SIP disabled',
    '`spctl --master-disable` and `csrutil disable` turn off the checks that stop unsigned software.',
    /(?<![\w.-])spctl\s+--master-disable\b|(?<![\w.-])csrutil\s+disable\b/,
    { hint: String.raw`\b(?:spctl|csrutil)\b` }),
  commandRule('SEC-CMD-059', 'high', 'tamper', 'Quarantine flag stripped from a download',
    'Removing `com.apple.quarantine` from something just downloaded lets it run without Gatekeeper\'s check.',
    /(?<![\w.-])xattr\b[^\n]*com\.apple\.quarantine/,
    { hint: 'quarantine', confirm: (_match, line) => /\b(?:curl|wget)\b|https?:\/\//i.test(line) }),
  commandRule('SEC-CMD-060', 'medium', 'tamper', 'Shell history erased',
    'Clearing or disabling the history hides what was run — a step after intrusions.',
    /(?<![\w.-])history\s+-c\b|(?<![\w.-])unset\s+HISTFILE\b|\bHISTFILE=\/dev\/null\b|(?<![\w.-])export\s+HISTSIZE=0\b|(?<![\w.-])set\s+\+o\s+history\b|(?<![\w.-])Clear-History\b|(?<![\w.-])rm\b[^\n]*\.\w*_history\b|>\s*~\/\.\w*history\b/,
    { hint: String.raw`history|HISTFILE|HISTSIZE` }),
  commandRule('SEC-CMD-061', 'medium', 'tamper', 'File made immutable',
    '`chattr +i` makes a file impossible to change or delete, even for root — malware uses it to protect itself.',
    /(?<![\w.-])chattr\s+\+\w*i\w*\s/,
    { hint: String.raw`\bchattr\b` }),
  commandRule('SEC-CMD-062', 'high', 'tamper', 'All processes killed',
    '`kill -9 -1` and `killall5` terminate every process the user may signal.',
    /(?<![\w.-])kill\s+-(?:9|KILL|SIGKILL)\s+-1\b|(?<![\w.-])killall5\b/,
    { hint: String.raw`\b(?:kill|killall5)\b` }),
  commandRule('SEC-CMD-063', 'high', 'tamper', 'System logs wiped',
    'Truncating or deleting the system logs, or clearing Windows event logs, destroys evidence.',
    /(?<![\w>])(?::|true|cat\s+\/dev\/null)\s*>\s*\/var\/log\/|(?<![\w.-])rm\s+(?:-\w+\s+)*\/var\/log\/(?:\*|\S*(?:auth|syslog|secure|wtmp|btmp|lastlog|messages|audit)\S*)|(?<![\w.-])wevtutil(?:\.exe)?\s+cl\b|\bClear-EventLog\b/i,
    { hint: String.raw`\/var\/log|\bwevtutil\b|\bClear-EventLog\b` }),
];

export const PRIVILEGE_RULES = [
  commandRule('SEC-CMD-064', 'critical', 'privilege', 'Remote script run as root',
    '`sudo curl … | sh` and `curl … | sudo sh` run unread remote code with full system rights.',
    /(?<![\w.-])sudo\s+(?:-\S+\s+)*(?:curl|wget)\b[^|;]*\|\s*(?:sudo\s+)?(?:\S*\/)?(?:ba|z|da)?sh\b|\|\s*sudo\s+(?:-\S+\s+)*(?:\S*\/)?(?:ba|z|da)?sh\b/,
    { hint: String.raw`\bsudo\b` }),
  commandRule('SEC-CMD-065', 'high', 'privilege', 'setuid or setgid bit set',
    'A setuid program runs as its owner whoever starts it — a way to keep a root shell.',
    /(?<![\w.-])chmod\s+(?:-\w+\s+)*(?:[ugoa]*\+[rwxXt]*s|[2-7][0-7]{3})(?=\s)/,
    { hint: String.raw`\bchmod\b` }),
  commandRule('SEC-CMD-066', 'high', 'privilege', 'Dangerous file capabilities granted',
    '`setcap` with `cap_setuid`, `cap_sys_admin` or similar lets an ordinary binary act as root.',
    /(?<![\w.-])setcap\s+(?:-\w+\s+)*\S*cap_(?:setuid|setgid|sys_admin|dac_override|dac_read_search|sys_ptrace|sys_module|chown|fowner)\w*/,
    { hint: String.raw`\bsetcap\b` }),
  commandRule('SEC-CMD-067', 'medium', 'privilege', 'Privilege escalation helper used',
    '`pkexec` or adding a user to the `sudo`/`wheel` group raises rights beyond what a normal task needs.',
    /(?<![\w.-])pkexec\b|(?<![\w.-])usermod\s+-\w*[aG]\w*\s+(?:sudo|wheel|root|adm)\b/,
    { hint: String.raw`\b(?:pkexec|usermod)\b` }),
  commandRule('SEC-CMD-068', 'high', 'privilege', 'Privileged container with the host mounted',
    'A `--privileged` container that mounts the host root (or shares its PID or network space) can take over the host.',
    /(?<![\w.-])docker\s+(?:container\s+)?run\b(?=[^|;]*\s--privileged\b)(?=[^|;]*(?:\s(?:-v|--volume)[ =]\/(?::|etc|root|home)|--pid[ =]host|--net(?:work)?[ =]host))/,
    { hint: String.raw`\bdocker\b` }),
  commandRule('SEC-CMD-069', 'medium', 'privilege', 'Docker socket mounted into a container',
    'A container with `/var/run/docker.sock` can start containers of its own and so control the host.',
    /(?<![\w.-])docker\s+(?:container\s+)?run\b[^|;]*(?:-v|--volume)[ =]\S*\/var\/run\/docker\.sock/,
    { hint: String.raw`docker\.sock` }),
];
