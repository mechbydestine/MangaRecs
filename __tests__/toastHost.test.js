/**
 * ToastHost renders every user-facing toast in the app (42 showAppToast call
 * sites across 9 screens). It shipped for three commits with
 *
 *     const t = TYPE_STYLES[type];          // { icon, color }
 *     ...  accessibilityLabel={t('a11y.dismiss')}
 *
 * so every toast threw "t is not a function". The accessibility pass added the
 * label without noticing `t` was already taken, and nothing caught it: the key
 * resolved fine, and scripts/check-t-scope.js only asked whether *a* binding
 * named `t` existed.
 *
 * This mounts the host and actually fires a toast, which is the only way to
 * exercise the render path that broke.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import ToastHost from '../components/ToastHost';
import { showAppToast } from '../utils/appToast';

describe('ToastHost', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders a toast without throwing', () => {
    let tree;
    act(() => { tree = renderer.create(<ToastHost />); });
    expect(() => {
      act(() => { showAppToast('Saved to your library'); });
    }).not.toThrow();
    expect(JSON.stringify(tree.toJSON())).toContain('Saved to your library');
  });

  it('labels the dismiss control with a translated string, not an object', () => {
    let tree;
    act(() => { tree = renderer.create(<ToastHost />); });
    act(() => { showAppToast('Something went wrong', 'error'); });

    const json = tree.toJSON();
    const labels = [];
    (function walk(n) {
      if (!n || typeof n !== 'object') return;
      const label = n.props && n.props.accessibilityLabel;
      if (typeof label === 'string') labels.push(label);
      (n.children || []).forEach(walk);
    })(json);

    expect(labels.length).toBeGreaterThan(0);
    labels.forEach((l) => expect(typeof l).toBe('string'));
  });

  it('renders each toast type', () => {
    let tree;
    act(() => { tree = renderer.create(<ToastHost />); });
    ['error', 'success', 'info'].forEach((kind) => {
      expect(() => {
        act(() => { showAppToast(`a ${kind} message`, kind); });
      }).not.toThrow();
    });
  });
});
