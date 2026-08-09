/**
 * useAnnounceOnOpen has to fire exactly once, on the closed -> open edge.
 * Announcing on every render would talk over the user; announcing on mount
 * would speak sheets that were already open before the screen appeared.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Text } from 'react-native';
import { useAnnounceOnOpen, announce } from '../utils/a11y';

function Probe({ visible, message }) {
  useAnnounceOnOpen(visible, message, 10);
  return <Text>probe</Text>;
}

describe('a11y announcements', () => {
  let spy;
  beforeEach(() => {
    jest.useFakeTimers();
    spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
    jest.useRealTimers();
  });

  it('does not announce a sheet that is already open on mount', () => {
    act(() => { renderer.create(<Probe visible message="Filters" />); });
    act(() => { jest.advanceTimersByTime(50); });
    expect(spy).not.toHaveBeenCalled();
  });

  it('announces once when a closed sheet opens', () => {
    let tree;
    act(() => { tree = renderer.create(<Probe visible={false} message="Filters" />); });
    act(() => { tree.update(<Probe visible message="Filters" />); });
    act(() => { jest.advanceTimersByTime(50); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('Filters');
  });

  it('does not re-announce while it stays open', () => {
    let tree;
    act(() => { tree = renderer.create(<Probe visible={false} message="Filters" />); });
    act(() => { tree.update(<Probe visible message="Filters" />); });
    act(() => { jest.advanceTimersByTime(50); });
    act(() => { tree.update(<Probe visible message="Filters" />); });
    act(() => { jest.advanceTimersByTime(50); });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('announces again after a close/open cycle', () => {
    let tree;
    act(() => { tree = renderer.create(<Probe visible={false} message="Filters" />); });
    act(() => { tree.update(<Probe visible message="Filters" />); });
    act(() => { jest.advanceTimersByTime(50); });
    act(() => { tree.update(<Probe visible={false} message="Filters" />); });
    act(() => { tree.update(<Probe visible message="Filters" />); });
    act(() => { jest.advanceTimersByTime(50); });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('stays silent for an empty message and never throws', () => {
    expect(() => announce(null)).not.toThrow();
    expect(() => announce('')).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
