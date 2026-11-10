#!/usr/bin/env python3
"""Check cold launch on an explicitly selected Duo simulator's active display.

Requires the hinge/rotation and complete XCTest tree APIs in idb. Install the
app and boot a disposable simulator first; this terminates the app between cases.
"""
import argparse
import json
import os
from pathlib import Path
import plistlib
import subprocess
import time

BUNDLE = 'com.crosspointsync.app'
TABS = ('Library', 'Reader', 'Settings')
POSES = {'outer': (0, 'PORTRAIT'), 'inner-wide': (180, 'PORTRAIT'),
         'inner-tall': (180, 'LANDSCAPE_LEFT')}


def flatten(elements):
    for element in elements:
        yield element
        yield from flatten(element.get('children', []))


def find(state, identifier):
    matches = [e for e in flatten(state['elements']) if e.get('identifier') == identifier]
    assert len(matches) == 1, f'{identifier}: expected one element, found {len(matches)}'
    return matches[0]


def tab_frame(state, label):
    matches = [e for e in flatten(state['elements'])
               if e.get('type') == 'RadioButton' and e.get('label') == label]
    assert len(matches) == 1, f'{label}: expected one native tab, found {len(matches)}'
    return matches[0]['frame']


def check_layout(state, pose, tab):
    """Check observed iOS 27.1 placement and on-screen control geometry."""
    screen = state['screen']
    assert (screen['width'] > screen['height']) == (pose == 'inner-wide'), f'{pose}: active display has the wrong pose: {screen}'
    frames = {name: tab_frame(state, name) for name in TABS}
    library, reader, settings = frames.values()
    rail = abs(library['x'] - reader['x']) < 2
    assert rail == (pose != 'inner-tall'), f'{pose}: unexpected native tab placement: {frames}'
    bottom = any(e.get('identifier') == 'Reader.BottomNavigation'
                 for e in flatten(state['elements']))
    assert bottom != rail, f'{pose}: bottom companion does not match system placement'
    if rail:
        assert library['y'] < reader['y'] < settings['y']
        assert library['x'] > screen['width'] * .75, 'Rail is clipped at an outer-display width'
    else:
        assert library['x'] < reader['x'] < settings['x']
        center = (library['x'] + settings['x'] + settings['width']) / 2
        assert abs(center - screen['width'] / 2) < 80, 'Bottom navigation is off-center'
    controls = dict(frames)
    if tab == 'Library':
        for identifier in ('Library.FAB', 'Library.OpenQueue'):
            controls[identifier] = find(state, identifier)['frame']
    for name, frame in controls.items():
        assert frame['width'] > 0 and frame['height'] > 0, f'{name}: empty frame'
        assert (frame['x'] >= 0 and frame['y'] >= 0
                and frame['x'] + frame['width'] <= screen['width'] + 1
                and frame['y'] + frame['height'] <= screen['height'] + 1), f'{name}: outside active display'
    return {'placement': 'system-rail' if rail else 'bottom-companion', 'controls': controls}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--udid', required=True, help='Booted, disposable Duo simulator')
    parser.add_argument('--idb', default='idb', help='Active-display-aware idb executable')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--poses', nargs='+', choices=POSES, default=list(POSES))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    assert not (args.output / 'results.json').exists(), 'Use a fresh output directory'
    os.environ.setdefault('AI_AGENT', 'Codex/duo-cold-launch-validation')

    def sim(*command, check=True):
        return subprocess.run(['xcrun', 'simctl', *command], check=check,
                              capture_output=True, text=True).stdout.strip()

    inventory = json.loads(sim('list', 'devices', 'available', '--json'))
    target = next(d for group in inventory['devices'].values() for d in group
                  if d['udid'] == args.udid)
    assert target['state'] == 'Booted', 'Boot the selected simulator first'
    app = Path(sim('get_app_container', args.udid, BUNDLE, 'app'))
    info = plistlib.loads((app / 'Info.plist').read_bytes())
    result = {'passed': False, 'version': info['CFBundleShortVersionString'],
              'build': info['CFBundleVersion'], 'records': []}

    def save():
        (args.output / 'results.json').write_text(json.dumps(result, indent=2) + '\n')

    def idb(*command):
        return subprocess.check_output([args.idb, *map(str, command), '--udid', args.udid], text=True)

    def tree():
        return json.loads(idb('ui', 'describe-all', '--format', 'complete',
                              '--client-type', 'xctest', '--json'))

    def wait(identifier):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            state = tree()
            if any(e.get('identifier') == identifier for e in flatten(state['elements'])):
                return state
            time.sleep(.5)
        raise AssertionError(f'App did not expose {identifier} on the active display')

    # AX must stay enabled across process termination. Maestro's runner instead
    # binds to the default (inactive outer) display when launched on inner wide.
    preferences = {}
    for key in ('ApplicationAccessibilityEnabled', 'AutomationEnabled'):
        preferences[key] = sim('spawn', args.udid, 'defaults', 'read',
                               'com.apple.Accessibility', key, check=False)
        sim('spawn', args.udid, 'defaults', 'write', 'com.apple.Accessibility', key, '-bool', 'true')
    save()
    try:
        for style in ('dark', 'light'):
            sim('ui', args.udid, 'appearance', style)
            for pose in args.poses:
                # Prepare the physical display before launching; no resize may
                # repair the controller between launch and the first assertion.
                sim('terminate', args.udid, BUNDLE, check=False)
                hinge, rotation = POSES[pose]
                idb('hinge', 0, '--json')
                idb('rotation', 'PORTRAIT')
                if hinge:
                    idb('hinge', hinge, '--json')
                if rotation != 'PORTRAIT':
                    idb('rotation', rotation)
                sim('launch', args.udid, BUNDLE)
                wait('NativeTab.Library')
                for tab in TABS:
                    if tab != 'Library':
                        frame = tab_frame(tree(), tab)
                        idb('ui', 'tap', round(frame['x'] + frame['width'] / 2),
                            round(frame['y'] + frame['height'] / 2), '--reason',
                            'Select the native destination from its current active-display frame')
                    wait('NativeTab.' + tab)
                    state = tree()
                    name = f'native-surface-{style}-cold-{pose}-{tab.lower()}'
                    (args.output / (name + '.json')).write_text(json.dumps(state, indent=2) + '\n')
                    idb('screenshot', args.output / (name + '.png'), '--reason',
                        'Record cold-launch layout on the active Duo display')
                    geometry = check_layout(state, pose, tab)
                    result['records'].append({'pose': pose, 'appearance': style, 'tab': tab,
                                              'screen': state['screen'], **geometry})
                    save()
                    print(f'Passed {style} {pose} {tab}', flush=True)
        result['passed'] = True
        save()
    finally:
        for key, value in preferences.items():
            if value:
                sim('spawn', args.udid, 'defaults', 'write', 'com.apple.Accessibility', key, '-bool',
                    'true' if value in ('1', 'true') else 'false')
            else:
                sim('spawn', args.udid, 'defaults', 'delete', 'com.apple.Accessibility', key, check=False)


if __name__ == '__main__':
    main()
