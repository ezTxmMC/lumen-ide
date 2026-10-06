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
 * Commands that destroy data: wiping the disk, the home folder, backups.
 *
 * A recursive delete only counts when the target is the root, the home folder
 * or a system folder itself — `rm -rf /tmp/x`, `rm -rf ./build` and
 * `rm -rf "$DIR/"` are everyday commands. The target must be followed by a
 * space, the end or an operator; that is what the lookaheads say.
 */

import { commandRule } from './define.js';

/** A device a script has no business overwriting. */
const DISK = String.raw`\/dev\/(?:sd[a-z]|hd[a-z]|vd[a-z]|xvd[a-z]|nvme\d|mmcblk\d|disk\d|rdisk\d)`;
const WINDOWS_ROOT = String.raw`(?:[a-z]:\\|%(?:systemroot|windir|userprofile|systemdrive|homedrive)%\\?)`;

export const DESTRUCTIVE_RULES = [
  commandRule('SEC-CMD-001', 'critical', 'destructive', 'Recursive delete of the root or home folder',
    'Deleting `/`, `~` or `$HOME` recursively erases the whole system or every personal file.',
    /(?<![\w.-])rm\s+(?:[-\w=]+\s+)*?(?:-\w*[rR]\w*|--recursive)(?:\s+-[-\w=]+)*\s+(?:--\s+)?(?:\/\*?|~\/?\*?|\$HOME\/?\*?|\$\{HOME\}\/?\*?)(?=\s|$|[;&|)])/,
    { hint: String.raw`\brm\b` }),
  commandRule('SEC-CMD-002', 'critical', 'destructive', 'Recursive delete of a system folder',
    'Deleting `/etc`, `/usr`, `/home` and similar folders recursively leaves the machine unbootable.',
    /(?<![\w.-])rm\s+(?:[-\w=]+\s+)*?(?:-\w*[rR]\w*|--recursive)(?:\s+-[-\w=]+)*\s+(?:--\s+)?\/(?:etc|usr|var|bin|sbin|boot|lib\d*|opt|home|root|sys|dev|proc|System|Library|Users|Applications)\/?\*?(?=\s|$|[;&|)])/,
    { hint: String.raw`\brm\b` }),
  commandRule('SEC-CMD-003', 'critical', 'destructive', 'find deletes from the root or home folder',
    '`find / … -delete` removes every file it finds beneath the root or home folder.',
    /(?<![\w.-])find\s+(?:\/|~|\$HOME)\s(?:[^;|&]*\s)?(?:-delete\b|-exec\s+rm\b)/,
    { hint: String.raw`\bfind\b` }),
  commandRule('SEC-CMD-004', 'critical', 'destructive', 'dd writes to a disk device',
    'Writing with `dd` to `/dev/sdX` or `/dev/nvmeX` overwrites a whole disk, partitions included.',
    new RegExp(String.raw`(?<![\w.-])dd\s+(?:[^|;&]*\s)?of=${DISK}`),
    { hint: String.raw`\bdd\b` }),
  commandRule('SEC-CMD-005', 'critical', 'destructive', 'Filesystem created on a disk device',
    '`mkfs` on a device destroys everything stored on it.',
    new RegExp(String.raw`(?<![\w.-])mkfs(?:\.\w+)?\s+(?:[^|;&]*\s)?${DISK}`),
    { hint: String.raw`\bmkfs` }),
  commandRule('SEC-CMD-006', 'critical', 'destructive', 'Redirect into a disk device',
    'Redirecting output into `/dev/sdX` overwrites the disk with that output.',
    new RegExp(String.raw`>\s*${DISK}`),
    { hint: String.raw`\/dev\/` }),
  commandRule('SEC-CMD-007', 'critical', 'destructive', 'Disk device wiped',
    '`shred`, `wipefs` or `blkdiscard` on a device irrecoverably erases it.',
    new RegExp(String.raw`(?<![\w.-])(?:shred|wipefs|blkdiscard|sgdisk)\b[^|;&]*\s${DISK}`),
    { hint: String.raw`\b(?:shred|wipefs|blkdiscard|sgdisk)\b` }),
  commandRule('SEC-CMD-008', 'critical', 'destructive', 'Fork bomb',
    'A function that calls itself in the background twice exhausts the process table and freezes the machine.',
    /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:|(?<![\w.-])(\w+)\s*\(\s*\)\s*\{\s*\1\s*\|\s*\1\s*&\s*\}/,
    { hint: String.raw`\(\s*\)\s*\{` }),
  commandRule('SEC-CMD-009', 'high', 'destructive', 'Recursive chmod on the root or home folder',
    'Changing permissions recursively from `/` or `~` breaks the system and opens every file to everybody.',
    /(?<![\w.-])chmod\s+(?:[-\w=+]+\s+)*?(?:-\w*R\w*|--recursive)(?:\s+[-\w=+]+)*\s+(?:\/|\/\*|~|\$HOME)(?=\s|$|[;&|)])/,
    { hint: String.raw`\bchmod\b` }),
  commandRule('SEC-CMD-010', 'high', 'destructive', 'Recursive chown on the root or home folder',
    'Changing the owner recursively from `/` or `~` breaks the system and locks the user out of their own files.',
    /(?<![\w.-])chown\s+(?:[-\w=+:.]+\s+)*?(?:-\w*R\w*|--recursive)(?:\s+[-\w=+:.]+)*\s+(?:\/|\/\*|~|\$HOME)(?=\s|$|[;&|)])/,
    { hint: String.raw`\bchown\b` }),
  commandRule('SEC-CMD-011', 'critical', 'destructive', 'Windows drive formatted',
    '`format C:` erases an entire drive.',
    /(?<![\w.-])format(?:\.com)?\s+[a-z]:(?=\s|$|\/|[;&|])/i,
    { hint: String.raw`\bformat(?:\.com)?\s+[a-z]:` }),
  commandRule('SEC-CMD-012', 'critical', 'destructive', 'Recursive delete of a Windows drive root',
    '`del /s` on a drive root or the user profile deletes every file below it.',
    new RegExp(String.raw`(?<![\w.-])(?:del|erase)\s+(?=[^|&;]*\/s\b)(?:\/\w+\s+)*${WINDOWS_ROOT}\*?(?:\.\*)?(?=\s|$)`, 'i'),
    { hint: String.raw`\b(?:del|erase)\b` }),
  commandRule('SEC-CMD-013', 'critical', 'destructive', 'Recursive removal of a Windows drive root',
    '`rd /s` on a drive root or the user profile removes every folder below it.',
    new RegExp(String.raw`(?<![\w.-])(?:rd|rmdir)\s+(?=[^|&;]*\/s\b)(?:\/\w+\s+)*${WINDOWS_ROOT}\*?(?=\s|$)`, 'i'),
    { hint: String.raw`\b(?:rd|rmdir)\b` }),
  commandRule('SEC-CMD-014', 'critical', 'destructive', 'PowerShell removes a drive root recursively',
    '`Remove-Item -Recurse` on a drive root, the user profile or `~` wipes the machine.',
    /(?<![\w.-])(?:Remove-Item|ri|rm|del|rmdir)\b(?=[^|;&]*-Recurse)[^|;&]*\s(?:[a-z]:\\\*?|\$env:(?:userprofile|systemroot|windir|homepath|systemdrive)\\?\*?|~\\?\*?|\\)(?=\s|$)/i,
    { hint: '-Recurse' }),
  commandRule('SEC-CMD-015', 'high', 'destructive', 'Disk wiping tool run',
    '`diskpart /s` runs a script that can clean a disk and `cipher /w` overwrites all free space.',
    /(?<![\w.-])(?:diskpart(?:\.exe)?\s+\/s\b|cipher(?:\.exe)?\s+\/w\b)/i,
    { hint: String.raw`\b(?:diskpart|cipher)\b` }),
  commandRule('SEC-CMD-016', 'critical', 'ransomware', 'Shadow copies deleted',
    'Deleting volume shadow copies removes the Windows restore points — the signature step of ransomware.',
    /(?<![\w.-])(?:vssadmin(?:\.exe)?\s+(?:delete\s+shadows|resize\s+shadowstorage)|wmic(?:\.exe)?\s+shadowcopy\s+delete|Get-WmiObject\s+Win32_Shadowcopy[^|;]*\|\s*(?:Remove|ForEach)\w*)/i,
    { hint: String.raw`\b(?:vssadmin|wmic|Win32_Shadowcopy)\b` }),
  commandRule('SEC-CMD-017', 'critical', 'ransomware', 'Windows backups deleted',
    '`wbadmin delete` removes backup catalogs and system state backups so nothing can be restored.',
    /(?<![\w.-])wbadmin(?:\.exe)?\s+delete\s+(?:catalog|backup|systemstatebackup)/i,
    { hint: String.raw`\bwbadmin\b` }),
  commandRule('SEC-CMD-018', 'critical', 'ransomware', 'Windows recovery disabled',
    'Turning off the recovery environment stops the machine from repairing itself after tampering.',
    /(?<![\w.-])bcdedit(?:\.exe)?\b[^|;]*\s(?:recoveryenabled\s+no|bootstatuspolicy\s+ignoreallfailures)\b/i,
    { hint: String.raw`\bbcdedit\b` }),
];
