#!/usr/bin/env python3
"""Screenshot Today + Plan as Mathew in light and dark, collecting console
errors. Usage: verify.py <outdir>"""
import json, subprocess, sys, time, urllib.request, base64, os, signal

import websocket

PORT = 9333
APP = 'http://localhost:8081'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

subprocess.run(f'lsof -ti:{PORT} | xargs kill 2>/dev/null', shell=True)
time.sleep(0.5)
prof = os.path.join(OUT, 'profile')
chrome = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}',
    '--remote-allow-origins=*', f'--user-data-dir={prof}', '--no-first-run',
    '--autoplay-policy=no-user-gesture-required', 'about:blank'],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

ws = None
for _ in range(40):
    time.sleep(0.5)
    try:
        targets = json.load(urllib.request.urlopen(f'http://localhost:{PORT}/json'))
        page = next(t for t in targets if t['type'] == 'page')
        ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=30)
        break
    except Exception:
        continue
if not ws:
    print('FAIL: no CDP'); chrome.kill(); sys.exit(1)

mid = [0]
def cmd(method, params=None):
    mid[0] += 1
    ws.send(json.dumps({'id': mid[0], 'method': method, 'params': params or {}}))
    while True:
        m = json.loads(ws.recv())
        if m.get('id') == mid[0]:
            return m.get('result', {})

errors = []
def drain(secs):
    ws.settimeout(secs)
    try:
        while True:
            m = json.loads(ws.recv())
            if m.get('method') == 'Runtime.exceptionThrown':
                errors.append(m['params']['exceptionDetails'].get('text', '?'))
            if m.get('method') == 'Log.entryAdded' and m['params']['entry']['level'] == 'error':
                errors.append(m['params']['entry']['text'][:200])
    except Exception:
        pass
    ws.settimeout(30)

def ev(expr):
    return cmd('Runtime.evaluate', {'expression': expr, 'returnByValue': True}).get('result', {}).get('value')

def shot(name):
    r = cmd('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': True})
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(base64.b64decode(r['data']))
    print('SHOT', name)

miss = []
def imgcheck(label):
    m = ev("Array.from(document.images).filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src).join(',')")
    if m:
        miss.append(label + ': ' + m)

cmd('Page.enable'); cmd('Runtime.enable'); cmd('Log.enable')
cmd('Emulation.setDeviceMetricsOverride', {'width': 390, 'height': 844, 'deviceScaleFactor': 2, 'mobile': True})

cmd('Page.navigate', {'url': APP + '/index.html'}); drain(3)
ev("const s=JSON.parse(localStorage.getItem('haalving-demo-v1')); s.session='u-cl-mathew';"
   "localStorage.setItem('haalving-demo-v1', JSON.stringify(s)); 'ok'")
# full document reload so HV.boot() re-reads the primed session — a bare
# hash change leaves the running app's in-memory store logged out
cmd('Page.navigate', {'url': 'about:blank'}); drain(1)
cmd('Page.navigate', {'url': APP + '/index.html#/today'}); drain(3)

for mode in ('light', 'dark'):
    cmd('Emulation.setEmulatedMedia', {'features': [{'name': 'prefers-color-scheme', 'value': mode}]})
    drain(1)
    ev("document.querySelectorAll('details.tg').forEach(d=>d.open=true); scrollTo(0,0); 'ok'")
    drain(1)
    shot(f'today-{mode}.png')
    imgcheck(f'today-{mode}')

cmd('Emulation.setEmulatedMedia', {'features': [{'name': 'prefers-color-scheme', 'value': 'light'}]})
# Mathew's current day is a yoga day — the four fitness task plates only
# render on a strength day, so verify one of those too (day 4 of the cycle)
cmd('Page.navigate', {'url': APP + '/index.html#/today/4'}); drain(3)
ev("document.querySelectorAll('details.tg').forEach(d=>d.open=true); scrollTo(0,0); 'ok'")
drain(1)
shot('today-fitness-light.png')
imgcheck('today-fitness')

# the task sheets — a meal and an exercise, each opened from its card row
ev("document.querySelector('[data-topen^=\"culture:\"]').click(); 'ok'")
drain(1)
shot('sheet-meal-light.png')
imgcheck('sheet-meal')
ev("HV.closeSheet(); document.querySelector('[data-topen^=\"fitness:\"]').click(); 'ok'")
drain(1)
shot('sheet-exercise-light.png')
imgcheck('sheet-exercise')
ev("HV.closeSheet(); 'ok'")

cmd('Page.navigate', {'url': APP + '/index.html#/plan'}); drain(3)
shot('plan-light.png')
imgcheck('plan')

print('BROKEN-IMAGES:', '; '.join(miss) if miss else 'none')
print('CONSOLE-ERRORS:', errors if errors else 'none')
ws.close(); chrome.terminate()
