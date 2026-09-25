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
 * The general types of SDK management. Java is the first implementation of
 * `SdkProvider`; Node, Python or Go could serve the same interface later —
 * catalogue, installation, detection, environment.
 */

export type {
  DetectedJdk, InstallPhase, InstallProgress, InstallRequest, SdkEnvironment,
} from '../../../electron/features/sdk';

/** A downloadable package from the catalogue. */
export interface SdkPackage {
  /** Package id at the source; foojay, in Java's case. */
  id: string;
  providerId: string;
  /** Identifier of the distribution, such as `temurin`. */
  distribution: string;
  /** Full version, such as `21.0.12.1+1`. */
  version: string;
  major: number;
  lts: boolean;
  /** A prerelease (early access). */
  earlyAccess: boolean;
  /** Carries extra parts — JavaFX, for Java. */
  bundled: boolean;
  /** Bytes; 0 when unknown. */
  size: number;
  filename: string;
  archiveType: string;
}

/** An installed SDK — either found on the machine or downloaded by Lumen. */
export interface InstalledSdk {
  providerId: string;
  /** Root folder (JAVA_HOME), which doubles as the id. */
  home: string;
  version: string;
  major: number;
  /** Distribution where recognisable (`temurin`, `corretto` …), otherwise empty. */
  distribution: string;
  vendor: string;
  sources: string[];
  /** Installed by Lumen, and therefore removable. */
  managed: boolean;
  /** A runtime only, with no compiler. */
  runtimeOnly: boolean;
}

export interface CatalogOptions {
  earlyAccess: boolean;
}

/** Description of a distribution, for filters and colours. */
export interface SdkDistribution {
  id: string;
  name: string;
  vendor: string;
  color: string;
  /** Sorted towards the front of the catalogue. */
  featured?: boolean;
  /** Downloadable through the catalogue; otherwise only shown for detected JDKs. */
  downloadable: boolean;
}

export interface SdkProvider {
  id: string;
  name: string;
  distributions: SdkDistribution[];
  /** Packages downloadable for this platform. */
  catalog(options: CatalogOptions): Promise<SdkPackage[]>;
  /** Installs a package; `jobId` ties the progress messages together. */
  install(pkg: SdkPackage, jobId: string): Promise<string>;
  /** SDKs installed on this machine. */
  detect(): Promise<InstalledSdk[]>;
  /** Environment variables for an SDK, excluding PATH. */
  variables(sdk: Pick<InstalledSdk, 'home'>): Record<string, string>;
  /** The folder with the executables, when it is not `<home>/bin`. */
  binDir?(home: string, platform: string): string;
}
