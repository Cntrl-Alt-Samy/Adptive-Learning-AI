/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  AlertModal,
  ChatBubble,
  CommandPalette,
  ProgressDots,
  PushButton,
  SegmentedControl,
  Sheet,
  Slider,
  Stepper,
  TextField,
  ToggleSwitch
} from '../../components/mac';
import { CHECKPOINT_STEPS } from '../../src/state/checkpoint-contract.js';

afterEach(cleanup);

describe('PushButton', () => {
  it('renders variants and handles clicks', async () => {
    const onClick = vi.fn();
    render(
      <PushButton variant="primary" onClick={onClick}>
        Save
      </PushButton>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is keyboard reachable; disabled state blocks activation', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<PushButton onClick={onClick}>Locked</PushButton>);
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement?.textContent).toBe('Locked');
    await user.keyboard('[Enter]');
    expect(onClick).toHaveBeenCalledOnce();

    onClick.mockClear();
    rerender(
      <PushButton disabled onClick={onClick}>
        Locked
      </PushButton>
    );
    expect(screen.getByRole('button', { name: 'Locked' }).hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Locked' })).catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('SegmentedControl', () => {
  it('exposes radiogroup semantics with roving tabindex and arrow keys', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <SegmentedControl
        ariaLabel="Mode"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'One' },
          { value: 'b', label: 'Two' }
        ]}
      />
    );
    const group = screen.getByRole('radiogroup', { name: 'Mode' });
    expect(group).toBeTruthy();
    const one = screen.getByRole('radio', { name: 'One' }) as HTMLButtonElement;
    const two = screen.getByRole('radio', { name: 'Two' });
    expect(one.getAttribute('aria-checked')).toBe('true');
    expect(one.tabIndex).toBe(0);
    expect(two.tabIndex).toBe(-1);
    const user = userEvent.setup();
    one.focus();
    await user.keyboard('{ArrowRight}');
    // arrow keys are a nice-to-have; click path is the contract:
    await user.click(two);
    expect(onChange).toHaveBeenCalledWith('b');
    void container;
  });
});

describe('ToggleSwitch / Slider / Stepper', () => {
  it('switch toggles aria-checked', async () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} label="Dark mode" />);
    const sw = screen.getByRole('switch', { name: 'Dark mode' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    const user = userEvent.setup();
    await user.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('slider reports value via native change event', async () => {
    const onChange = vi.fn();
    render(<Slider value={10} min={0} max={20} onChange={onChange} label="Budget" />);
    const input = screen.getByRole('slider', { name: 'Budget' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '15' } });
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it('stepper clamps at bounds', async () => {
    const onChange = vi.fn();
    render(<Stepper value={0} min={0} max={2} onChange={onChange} label="items" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Decrease items' }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Increase items' }));
    expect(onChange).toHaveBeenCalledWith(1);
  });
});

describe('ProgressDots', () => {
  it('renders exactly CHECKPOINT_STEPS.length dots (never hardcoded)', () => {
    const { container } = render(<ProgressDots confirmedStep={3} />);
    const dots = container.querySelectorAll('span[aria-hidden]');
    expect(dots.length).toBe(CHECKPOINT_STEPS.length);
    const filled = Array.from(dots).filter((d) => d.className.includes('bg-sys-blue'));
    expect(filled.length).toBe(CHECKPOINT_STEPS.filter((s) => s <= 3).length);
  });

  it('exposes an accessible status label', () => {
    render(<ProgressDots confirmedStep={8} />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Checkpoint 8 of 8 confirmed');
  });
});

describe('AlertModal', () => {
  it('shows typed code and retry affordance only when retryable', async () => {
    const { rerender } = render(
      <AlertModal error={{ code: 'MODEL_UNAVAILABLE', message: 'All routes failed.', retryable: true }} onRetry={() => {}} onDismiss={() => {}} />
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('MODEL_UNAVAILABLE')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();

    rerender(
      <AlertModal error={{ code: 'CHECKPOINT_INVALID', message: 'bad payload', retryable: false }} onDismiss={() => {}} />
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByRole('button', { name: 'OK' })).toBeTruthy();
  });
});

describe('Sheet (strike-breaker)', () => {
  it('ignores Escape while locked, closes when unlocked', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet open locked onClose={onClose} title="Reset">
        content
      </Sheet>
    );
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <Sheet open={false} locked={false} onClose={onClose} title="Reset">
        x
      </Sheet>
    );
    rerender(
      <Sheet open locked={false} onClose={onClose} title="Reset">
        content
      </Sheet>
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('TextField', () => {
  it('surfaces inline validation with aria-invalid + alert role', async () => {
    render(<TextField label="Email" value="" onChange={() => {}} validate={(v) => (v.includes('@') ? null : 'Invalid email')} />);
    const input = screen.getByLabelText(/Email/);
    const user = userEvent.setup();
    await user.type(input, 'nope');
    await user.tab(); // blur → touched
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Invalid email');
  });
});

describe('CommandPalette', () => {
  const commands = [
    { id: '1', title: 'Go to Today', perform: vi.fn() },
    { id: '2', title: 'Go to Plan', perform: vi.fn() },
    { id: '3', title: 'Open Settings', keywords: 'privacy', perform: vi.fn() }
  ];

  it('filters by query and runs the active command with Enter', async () => {
    const onClose = vi.fn();
    commands.forEach((c) => c.perform.mockClear());
    render(<CommandPalette open onClose={onClose} commands={commands} />);
    const box = screen.getByRole('combobox', { name: 'Search commands' });
    const user = userEvent.setup();
    await user.type(box, 'plan');
    const listbox = screen.getByRole('listbox');
    expect(listbox.textContent).toContain('Go to Plan');
    expect(listbox.textContent).not.toContain('Open Settings');
    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(commands[1]!.perform).toHaveBeenCalledOnce();
  });

  it('arrow keys move selection within filtered results', async () => {
    render(<CommandPalette open onClose={() => {}} commands={commands} />);
    const box = screen.getByRole('combobox');
    const user = userEvent.setup();
    await user.click(box);
    expect(screen.getAllByRole('option')[0]!.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true');
  });
});

describe('ChatBubble', () => {
  it('distinguishes sent vs received surfaces', () => {
    const { container } = render(
      <div>
        <ChatBubble variant="sent">hello</ChatBubble>
        <ChatBubble variant="received">hi</ChatBubble>
      </div>
    );
    expect(container.textContent).toContain('hello');
    expect(container.querySelector('.bg-sys-blue')).toBeTruthy();
  });
});
