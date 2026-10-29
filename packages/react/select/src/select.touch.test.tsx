import * as React from 'react';
import { createPortal } from 'react-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Select from './select';

// These are constructed event-sequence tests, not evidence of native Safari timing.
const layouts = ['plain', 'container', 'auto-container', 'portal-sheet'] as const;
type Layout = (typeof layouts)[number];

function Fixture({
  layout = 'plain',
  onOpenChange = vi.fn(),
}: {
  layout?: Layout;
  onOpenChange?: (open: boolean) => void;
}) {
  const select = (
    <Select.Root onOpenChange={onOpenChange}>
      <Select.Trigger aria-label="Choice">
        <Select.Value placeholder="Pick one" />
        <svg data-testid="icon" width="16" height="16">
          <path d="M0 0L8 8L16 0" />
        </svg>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper">
          <Select.Viewport>
            <Select.Item value="apple">
              <Select.ItemText>Apple</Select.ItemText>
            </Select.Item>
            <Select.Item value="banana">
              <Select.ItemText>Banana</Select.ItemText>
            </Select.Item>
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
  if (layout === 'portal-sheet') {
    return createPortal(
      <div style={{ transform: 'translateY(0)', pointerEvents: 'auto' }}>{select}</div>,
      document.body,
    );
  }
  if (layout === 'auto-container') {
    return <div style={{ pointerEvents: 'auto' }}>{select}</div>;
  }
  return layout === 'container' ? <div>{select}</div> : select;
}

function pointer(target: Element, type: string, pointerId = 7, pointerType = 'touch', detail = 1) {
  // jsdom has no pointer capture; scope the stub to the synthetic target.
  target.hasPointerCapture ??= () => false;
  fireEvent(
    target,
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType,
      button: 0,
      detail: type === 'click' ? detail : 0,
    }),
  );
}

async function open() {
  fireEvent.click(screen.getByRole('combobox', { hidden: true }));
  await screen.findByRole('listbox');
  // DismissableLayer deliberately installs its document listener in a later task.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('touching the open Select trigger', () => {
  for (const layout of layouts) {
    for (const delay of [5, 11]) {
      it(`does not reopen from a delayed mouse-typed click (${layout}, ${delay}ms)`, async () => {
        const changes = vi.fn();
        render(<Fixture layout={layout} onOpenChange={changes} />);
        await open();
        const icon = screen.getByTestId('icon');
        pointer(icon, 'pointerdown');
        pointer(icon, 'pointerup');
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, delay));
        });
        await act(async () => {
          pointer(icon, 'click', 7, 'mouse');
        });
        expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute(
          'aria-expanded',
          'false',
        );
        expect(changes.mock.calls.map(([value]) => value)).toEqual([true, false]);
        pointer(icon, 'pointerdown', 8);
        pointer(icon, 'pointerup', 8);
        pointer(icon, 'click', 8);
        expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute(
          'aria-expanded',
          'true',
        );
      });
    }
  }

  it.each([5, 11])(
    'does not reopen when hit testing retargets the click from HTML to the trigger (%dms)',
    async (delay) => {
      const changes = vi.fn();
      render(<Fixture onOpenChange={changes} />);
      await open();
      const icon = screen.getByTestId('icon');
      pointer(document.documentElement, 'pointerdown');
      pointer(document.documentElement, 'pointerup');
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
      });
      pointer(icon, 'click', 7, 'mouse');
      expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      expect(changes.mock.calls.map(([value]) => value)).toEqual([true, false]);
    },
  );

  for (const target of ['html', 'svg'] as const) {
    for (const delay of [5, 11]) {
      for (const detail of [1, 2]) {
        it(`consumes native-shaped changed-ID mouse click (${target}, ${delay}ms, detail=${detail})`, async () => {
          const changes = vi.fn();
          render(<Fixture onOpenChange={changes} />);
          await open();
          const icon = screen.getByTestId('icon');
          const downTarget = target === 'html' ? document.documentElement : icon;
          pointer(downTarget, 'pointerdown', -1501397847);
          pointer(downTarget, 'pointerup', -1501397847);
          await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, delay));
          });
          pointer(icon, 'click', 1, 'mouse', detail);
          expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute(
            'aria-expanded',
            'false',
          );
          expect(changes.mock.calls.map(([value]) => value)).toEqual([true, false]);
        });
      }
    }
  }

  it.each(['html', 'svg'])(
    'also supports the negative same-ID native form (%s)',
    async (target) => {
      render(<Fixture />);
      await open();
      const icon = screen.getByTestId('icon');
      const downTarget = target === 'html' ? document.documentElement : icon;
      pointer(downTarget, 'pointerdown', -1501397839);
      pointer(downTarget, 'pointerup', -1501397839);
      pointer(icon, 'click', -1501397839, 'mouse');
      expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    },
  );

  it('allows detail=0 activation while a touch dismissal is still pending', async () => {
    render(<Fixture />);
    await open();
    const icon = screen.getByTestId('icon');
    pointer(document.documentElement, 'pointerdown');
    pointer(document.documentElement, 'pointerup');
    fireEvent.click(icon, { detail: 0 });
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute('aria-expanded', 'true');
  });

  it('clears the pending dismissal on a new pointerdown outside the trigger', async () => {
    render(<Fixture />);
    await open();
    const icon = screen.getByTestId('icon');
    pointer(document.documentElement, 'pointerdown');
    pointer(document.documentElement, 'pointerup');
    pointer(document.body, 'pointerdown', 8);
    pointer(document.body, 'pointerup', 8);
    pointer(icon, 'click', 8, 'mouse');
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not retain a dismissal after a click elsewhere stops propagation', async () => {
    render(
      <>
        <Fixture />
        <button onClick={(event) => event.stopPropagation()}>Elsewhere</button>
      </>,
    );
    await open();
    const icon = screen.getByTestId('icon');
    pointer(document.documentElement, 'pointerdown');
    pointer(document.documentElement, 'pointerup');
    pointer(screen.getByText('Elsewhere'), 'click');
    pointer(icon, 'click');
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute('aria-expanded', 'true');
  });

  it.each(['Enter', ' '])(
    'clears a pending dismissal on fresh keyboard input (%j)',
    async (key) => {
      render(<Fixture />);
      await open();
      const icon = screen.getByTestId('icon');
      pointer(document.documentElement, 'pointerdown');
      pointer(document.documentElement, 'pointerup');
      fireEvent.keyDown(screen.getByRole('combobox'), { key });
      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
      pointer(icon, 'click');
      expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    },
  );

  it('clears a pending dismissal on pointercancel before a later click activation', async () => {
    render(<Fixture />);
    await open();
    const icon = screen.getByTestId('icon');
    pointer(document.documentElement, 'pointerdown');
    pointer(document.documentElement, 'pointercancel');
    pointer(icon, 'click');
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute('aria-expanded', 'true');
  });

  it.each([-1501397839, 1])(
    'handles HTML down followed by SVG up and path click (click ID %d)',
    async (clickId) => {
      render(<Fixture />);
      await open();
      const icon = screen.getByTestId('icon');
      pointer(document.documentElement, 'pointerdown', -1501397839);
      pointer(icon, 'pointerup', -1501397839);
      pointer(icon.querySelector('path')!, 'click', clickId, 'mouse');
      expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    },
  );

  it.each(['touch', 'pen'])('consumes the matching %s click only once', async (pointerType) => {
    render(<Fixture />);
    await open();
    const icon = screen.getByTestId('icon');
    pointer(icon, 'pointerdown', 7, pointerType);
    pointer(icon, 'pointerup', 7, pointerType);
    pointer(icon, 'click', 7, pointerType);
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // Non-pointer activation must still work without a fresh pointerdown.
    fireEvent.click(icon, { detail: 0 });
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute('aria-expanded', 'true');
  });

  it('consumes the pending gesture click even when it is a MouseEvent without a pointerId', async () => {
    render(<Fixture />);
    await open();
    const icon = screen.getByTestId('icon');
    pointer(icon, 'pointerdown');
    pointer(icon, 'pointerup');
    fireEvent(icon, new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('consumes a changed-ID click when no new pointerdown occurred', async () => {
    render(<Fixture />);
    await open();
    const icon = screen.getByTestId('icon');
    pointer(icon, 'pointerdown', 7);
    pointer(icon, 'pointerup', 7);
    pointer(icon, 'click', 8, 'touch');
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('allows non-pointer activation when the pending touch did not produce a click', async () => {
    render(<Fixture />);
    await open();
    const icon = screen.getByTestId('icon');
    pointer(icon, 'pointerdown');
    pointer(icon, 'pointercancel');
    fireEvent.click(icon, { detail: 0 });
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not open a closed select when a scroll gesture is cancelled', () => {
    render(<Fixture />);
    const icon = screen.getByTestId('icon');
    pointer(icon, 'pointerdown');
    pointer(icon, 'pointermove');
    pointer(icon, 'pointercancel');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
    pointer(icon, 'pointerdown');
    pointer(icon, 'pointerup');
    pointer(icon, 'click');
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute('aria-expanded', 'true');
  });

  it('allows a new touch reusing the same pointerId after an abandoned gesture', async () => {
    render(<Fixture />);
    await open();
    const icon = screen.getByTestId('icon');
    pointer(icon, 'pointerdown');
    pointer(icon, 'pointermove');
    pointer(icon, 'pointercancel');
    pointer(icon, 'pointerdown');
    pointer(icon, 'pointerup');
    pointer(icon, 'click');
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute('aria-expanded', 'true');
  });

  it('allows a mouse interaction after a touch with no click', async () => {
    render(<Fixture />);
    await open();
    const icon = screen.getByTestId('icon');
    pointer(icon, 'pointerdown');
    pointer(icon, 'pointercancel');
    pointer(icon, 'pointerdown', 1, 'mouse');
    pointer(icon, 'pointerup', 1, 'mouse');
    pointer(icon, 'click', 1, 'mouse');
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute('aria-expanded', 'true');
  });

  it.each(['Enter', ' '])('preserves %j and Escape after a touch dismissal', async (key) => {
    render(<Fixture />);
    await open();
    const icon = screen.getByTestId('icon');
    pointer(icon, 'pointerdown');
    pointer(icon, 'pointerup');
    pointer(icon, 'click', 7, 'mouse');
    fireEvent.keyDown(screen.getByRole('combobox', { hidden: true }), { key });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('preserves item selection and outside touch dismissal', async () => {
    render(<Fixture />);
    await open();
    const item = screen.getByRole('option', { name: 'Banana' });
    pointer(item, 'pointerdown');
    pointer(item, 'pointerup');
    pointer(item, 'click');
    expect(screen.getByRole('combobox', { hidden: true })).toHaveTextContent('Banana');
    await open();
    pointer(document.body, 'pointerdown', 8);
    pointer(document.body, 'pointerup', 8);
    pointer(document.body, 'click', 8);
    expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
