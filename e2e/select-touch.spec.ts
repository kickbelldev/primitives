import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { visitStory } from './helpers';

test.afterEach(async ({ page }, testInfo) => {
  if (page.isClosed()) {
    return;
  }
  const trace = await page.evaluate(
    () => (window as unknown as { selectTouchTrace: unknown[] }).selectTouchTrace,
  );
  const path = testInfo.outputPath('events.json');
  await writeFile(path, JSON.stringify(trace, null, 2));
  await testInfo.attach('event-trace', { path, contentType: 'application/json' });
});

for (const variant of ['plain', 'container', 'auto', 'portal-sheet']) {
  test(`touch hit testing: ${variant}`, async ({ page }) => {
    await visitStory(page, 'select--trigger-touch-hit-testing');
    await page.evaluate(() => {
      const trace: unknown[] = [];
      Object.assign(window, { selectTouchTrace: trace });
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) {
        document.addEventListener(
          type,
          (event) => {
            const pointer = event as PointerEvent;
            const target = event.target as Element;
            const ancestors: unknown[] = [];
            for (let element: Element | null = target; element; element = element.parentElement) {
              ancestors.push({
                tag: element.tagName,
                testId: element.getAttribute('data-testid'),
                pointerEvents: getComputedStyle(element).pointerEvents,
              });
            }
            trace.push({
              type,
              pointerType: pointer.pointerType,
              pointerId: pointer.pointerId,
              detail: pointer.detail,
              trusted: event.isTrusted,
              time: performance.now(),
              bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
              ancestors,
            });
          },
          true,
        );
      }
    });
    const trigger = page.getByTestId(`touch-trigger-${variant}`);
    const icon = page.getByTestId(`touch-icon-${variant}`);
    await icon.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    // Coordinate input intentionally allows body hit testing to decide the target.
    // locator.tap() would wait for pointer-events:none to stop intercepting the trigger.
    const box = await icon.boundingBox();
    if (!box) throw new Error('Missing trigger icon');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false', { timeout: 1000 });
    await expect(trigger).toHaveAttribute('data-open-changes', 'true,false');
    // A fresh gesture must reopen even when the browser reuses pointer IDs.
    await icon.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
}
