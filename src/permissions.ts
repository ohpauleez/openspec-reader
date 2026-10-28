import browser from 'webextension-polyfill';

/** Host access is user-granted in Firefox MV3, even when declared in host_permissions. */
export function attachLocalPermission(): void {
  const control = document.querySelector<HTMLButtonElement>('#local-files')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  let needsFileSetting = false;
  void Promise.all([
    browser.permissions.contains({ origins: ['file:///*'] }),
    browser.runtime.getBrowserInfo(), browser.extension.isAllowedFileSchemeAccess(),
  ]).then(([granted, info, fileAllowed]) => {
    // Older Firefox historically returned false even though file access was allowed.
    needsFileSetting = Number.parseInt(info.version, 10) >= 153 && !fileAllowed;
    control.textContent = needsFileSetting ? 'Open Firefox file-access settings' : granted ? 'Local file access enabled' : 'Enable local files';
    control.disabled = granted && !needsFileSetting;
    if (needsFileSetting) status.textContent = fileSettingHelp();
  }).catch(() => { status.textContent = 'Local file permissions could not be checked.'; });
  control.addEventListener('click', () => {
    // Keep request directly inside the user gesture, before any asynchronous work.
    void browser.permissions.request({ origins: ['file:///*'] }).then(async (granted) => {
      status.textContent = needsFileSetting ? fileSettingHelp() : granted ? 'Local file access enabled. Refresh your document tab.' : 'Local file access was not granted.';
      control.disabled = granted && !needsFileSetting;
      if (granted && needsFileSetting) { await browser.tabs.create({ url: 'about:addons' }); return; }
      if (granted) {
        control.textContent = 'Local file access enabled';
        const tabs = await browser.tabs.query({ url: 'file:///*' });
        for (const tab of tabs) if (tab.id) await browser.tabs.reload(tab.id);
      }
    }).catch(() => { status.textContent = 'Local file access could not be enabled.'; });
  });
}

/** Firefox 153 added a separate browser-owned file-scheme opt-in, outside permissions.request. */
function fileSettingHelp(): string {
  return 'In about:addons, select OpenSpec Markdown Reader → Permissions → Allow access to file URLs, then refresh your document tab.';
}
