import browser from 'webextension-polyfill';
import { validateLaunch } from './types';

/** Only this extension's own readers/pages can create workspace snapshots. */
export function registerAlloyExplorer(): void {
  browser.runtime.onMessage.addListener(async (message: unknown, sender: browser.Runtime.MessageSender) => {
    if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'alloy-explore') return undefined;
    if (sender.id !== browser.runtime.id) throw new Error('Unknown sender');
    const launch = 'launch' in message ? validateLaunch(message.launch) : null;
    if (!launch) throw new Error('Invalid model snapshot');
    const token = crypto.randomUUID();
    await browser.storage.local.set({ [`alloy-launch:${token}`]: { ...launch, capturedAt: Date.now() } });
    const all = await browser.storage.local.get(null);
    const keys = Object.keys(all).filter((key) => key.startsWith('alloy-launch:'));
    keys.sort((a, b) => Number((all[a] as { capturedAt?: number })?.capturedAt ?? 0) - Number((all[b] as { capturedAt?: number })?.capturedAt ?? 0));
    if (keys.length > 20) await browser.storage.local.remove(keys.filter((key) => key !== `alloy-launch:${token}`).slice(0, keys.length - 20));
    await browser.tabs.create({ url: browser.runtime.getURL(`alloy.html#${token}`) });
    return { token };
  });
}
