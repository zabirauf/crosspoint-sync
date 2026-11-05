import assert from 'node:assert/strict';
import { test } from 'node:test';
import Module from 'node:module';
import React, { useEffect, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { fitCropFrame, getSourceCrop } from '../utils/crop-geometry';
import { isExpandedWidth } from '../constants/Layout';

// Exercise real presentation and draft components across live window changes.
// Only the native view/metrics boundary is replaced.
let windowSize = { width: 466, height: 678, fontScale: 1, scale: 3 };
let safeArea = { top: 0, bottom: 24, left: 0, right: 0 };
type Loader = (id: string, parent: unknown, isMain: boolean) => unknown;
const loader = Module as unknown as { _load: Loader };
const originalLoad = loader._load;
loader._load = function (id, parent, isMain) {
  if (id === 'react-native') return {
    useWindowDimensions: () => windowSize, useColorScheme: () => 'light', Platform: { OS: 'ios' },
    StyleSheet: { create: (value: unknown) => value, absoluteFillObject: {} },
    View: 'View', Pressable: 'Pressable', KeyboardAvoidingView: 'KeyboardAvoidingView', Modal: 'Modal',
    TextInput: 'TextInput', ScrollView: 'ScrollView',
  };
  if (id === 'react-native-safe-area-context') return {
    useSafeAreaInsets: () => safeArea, SafeAreaView: 'SafeAreaView', SafeAreaProvider: 'SafeAreaProvider',
  };
  if (id === 'tamagui') return { XStack: 'XStack', YStack: 'YStack', Button: 'Button', Input: 'Input', Text: 'Text', H4: 'H4' };
  return originalLoad.call(this, id, parent, isMain);
};
const { AdaptiveSheet } = require('../components/AdaptiveSheet') as typeof import('../components/AdaptiveSheet');
const { PromptDialog } = require('../components/PromptDialog') as typeof import('../components/PromptDialog');
loader._load = originalLoad;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).React = React;

function styles(node: any) { return Object.assign({}, ...node.props.style); }

test('an open task retains its draft and mounts once through outer, inner, tablet and split windows', async () => {
  let mounts = 0;
  function Draft() {
    const [text, setText] = useState('');
    useEffect(() => { mounts++; }, []);
    return React.createElement('DraftInput', { value: text, onChangeText: setText });
  }
  const content = () => React.createElement(AdaptiveSheet, {
    open: true, onOpenChange: () => {}, testID: 'Test.Sheet', height: 640,
    children: React.createElement(Draft),
  });
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(content()); });
  await act(async () => { tree.root.findByType('DraftInput' as any).props.onChangeText('Keep my destination'); });
  for (const [width, height, right] of [[890, 626, 48], [1194, 834, 0], [375, 834, 0], [466, 678, 0]]) {
    windowSize = { ...windowSize, width, height };
    safeArea = { ...safeArea, right };
    await act(async () => tree.update(content()));
    assert.equal(tree.root.findByType('DraftInput' as any).props.value, 'Keep my destination');
    const surface = tree.root.findAllByProps({ testID: 'Test.Sheet' }).find((node) => node.type === ('View' as any))!;
    assert.ok(styles(surface).height <= height - safeArea.bottom - 24);
    assert.equal(styles(surface).width, width - right >= 760 ? 560 : '100%');
  }
  assert.equal(mounts, 1, 'folding must not replace the task tree');
  await act(async () => tree.unmount());
});

test('rename input and submitted draft survive resizing while the prompt is open', async () => {
  let submitted = '';
  const content = () => React.createElement(PromptDialog, {
    open: true, onOpenChange: () => {}, title: 'Rename File', message: 'Enter a new name',
    defaultValue: 'original.epub', onSubmit: (text: string) => { submitted = text; },
  });
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(content()); });
  const input = tree.root.findByProps({ testID: 'PromptDialog.Input' });
  await act(async () => input.props.onChangeText('A thoughtful new title.epub'));
  windowSize = { ...windowSize, width: 890, height: 626 };
  await act(async () => tree.update(content()));
  assert.equal(tree.root.findByProps({ testID: 'PromptDialog.Input' }), input, 'keep native input identity/focus');
  await act(async () => tree.root.findByProps({ testID: 'PromptDialog.SubmitButton' }).props.onPress());
  assert.equal(submitted, 'A thoughtful new title.epub');
  await act(async () => tree.unmount());
});

test('crop keeps the same source region across window shapes and clamps to image bounds', () => {
  const canvases = [{ width: 466, height: 460 }, { width: 794, height: 420 }, { width: 1100, height: 660 }, { width: 320, height: 160 }];
  for (const image of [{ width: 4000, height: 3000 }, { width: 1200, height: 2400 }]) {
    for (const zoom of [1, 2.5, 5]) {
      for (const offset of [{ x: 0, y: 0 }, { x: 0.31, y: -0.14 }, { x: 100, y: -100 }]) {
        const crops = canvases.map((canvas) => {
          const frame = fitCropFrame(canvas, 0.6);
          assert.ok(frame.width <= canvas.width && frame.height <= canvas.height);
          const crop = getSourceCrop(image, frame, zoom, offset);
          assert.ok(crop.originX >= 0 && crop.originY >= 0);
          assert.ok(crop.originX + crop.width <= image.width + 1e-8);
          assert.ok(crop.originY + crop.height <= image.height + 1e-8);
          return crop;
        });
        for (const crop of crops.slice(1)) {
          for (const key of ['originX', 'originY', 'width', 'height'] as const) {
            assert.ok(Math.abs(crop[key] - crops[0][key]) < 1e-8, `${key} changes after resizing`);
          }
        }
      }
    }
  }
});

test('large text and narrow split views use the compact layout', () => {
  assert.equal(isExpandedWidth(466), false);
  assert.equal(isExpandedWidth(890 - 48), true);
  assert.equal(isExpandedWidth(744), false);
  assert.equal(isExpandedWidth(842, 1.4), false);
});
