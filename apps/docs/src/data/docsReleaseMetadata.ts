export type SdkLine = `${number}.${number}`;

export interface DocsRelease {
    versionName: "current" | string;
    sdkLine: SdkLine;
    label: string;
    npmRange: string;
    path?: string;
}

export const currentDocsRelease = {
    versionName: "current",
    sdkLine: "1.0",
    label: "v1.0 latest",
    npmRange: ">=1.0.0 <1.1.0",
} satisfies DocsRelease;

export const historicalDocsReleases = [] satisfies DocsRelease[];

export const docsReleases = [currentDocsRelease, ...historicalDocsReleases] satisfies DocsRelease[];

export function getDocsReleasePath(release: DocsRelease): string | undefined {
    if (release.versionName === "current") return release.path;
    return release.path ?? `v${release.sdkLine}`;
}
