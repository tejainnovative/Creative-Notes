import { test, expect, onboard, a11y } from './fixtures';

// G-1 / G-2: every screen passes axe, and Tab reaches every control with a visible focus ring.
const screens: [string, string][] = [
  ['S02 Home', '/#/'],
  ['S06 History', '/#/history'],
  ['S07 Ask', '/#/ask'],
  ['S08 Settings', '/#/settings'],
  ['S10 Mic help', '/#/mic-help'],
  ['S12 Quick note', '/#/quick'],
  ['S13 Offline', '/#/settings/offline'],
  ['S14 Install', '/#/install'],
];

test('G-1 axe and G-2 keyboard focus on every screen', async ({ page }) => {
  test.setTimeout(180_000); // 8 screens x (axe + 40 Tab presses)
  await onboard(page, { samples: true });
  for (const [name, path] of screens) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await a11y(page, name);

    // Tab through up to 40 stops: each focused element must show an outline or ring.
    const unfocusable: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const visible = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
        return { visible, label: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"` };
      });
      if (info && !info.visible) unfocusable.push(info.label);
    }
    expect(unfocusable, `${name}: focused without a visible focus style`).toEqual([]);
  }
});
