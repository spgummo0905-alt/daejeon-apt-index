const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
function setup() {
  class Node {
    constructor() { this.dataset = {}; this.listeners = {}; this.children = []; this.isConnected = true; this.value = ''; this.contentWindow = { DJ: {}, postMessage() {} }; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    append(n) { this.children.push(n); }
    replaceChildren(...nodes) { this.children = nodes; this.value = nodes[0]?.value || ''; }
    setAttribute(k, v) { this[k] = v; }
    removeAttribute(k) { delete this[k]; }
    focus() { this.focused = true; }
    remove() { this.removed = true; }
  }
  const names = ['data-pw-frames', 'data-pj-journal', 'data-pw-status', 'data-pw-apt', 'data-pw-add', 'data-pw-title', 'data-pw-close'];
  const nodes = Object.fromEntries(names.map(n => [n, new Node()]));
  const kinds = ['detail', 'field', 'compare', 'course', 'finder', 'history'];
  const tabs = kinds.map(kind => { const b = new Node(); b.dataset.pwTab = kind; return b; });
  const dialog = new Node(); dialog.querySelectorAll = () => tabs;
  dialog.querySelector = s => nodes[s.slice(1, -1)];
  dialog.showModal = () => { dialog.open = true; }; dialog.close = () => { dialog.open = false; };
  const focus = new Node(), events = {}, added = [];
  const c = { URLSearchParams, location: { origin: 'https://jipgam.test' }, document: { activeElement: focus },
    addEventListener: (name, fn) => { events[name] = fn; }, confirm: () => false, DJ: { el: () => new Node() } };
  c.window = c; vm.createContext(c);
  for (const file of ['project-flow.js', 'project-workspace.js']) vm.runInContext(readFileSync(join(__dirname, '../static', file), 'utf8'), c);
  const context = { project: { id: 'p-1', name: '내 집', slugs: ['a', 'b'], archived: false },
    selected: ['a', 'b'], data: { bySlug: { a: { s: 'a', n: 'A', la: 36, ln: 127 }, b: { s: 'b', n: 'B', la: 36, ln: 128 } } } };
  const W = c.DJProjectWorkspace({ dialog, context: () => context, onAdd: s => added.push(s) });
  return { W, nodes, tabs, dialog, focus, events, added, context };
}
test('tools open lazily without replacing the parent, and re-opening preserves each iframe and its state', () => {
  const { W, nodes, dialog, focus } = setup();
  assert.equal(nodes['data-pw-frames'].children.length, 0);
  assert.equal(W.open('compare'), true); const frame = nodes['data-pw-frames'].children[0]; frame.state = { scroll: 340 };
  W.open('history'); assert.equal(frame.hidden, true); assert.equal(nodes['data-pj-journal'].hidden, false);
  W.open('compare'); assert.equal(nodes['data-pw-frames'].children.length, 1); assert.equal(frame.state.scroll, 340);
  nodes['data-pw-close'].listeners.click(); assert.equal(dialog.open, false); assert.equal(frame.removed, undefined); assert.equal(focus.focused, true);
});
test('hidden visit drafts are retained across tools and closing, and switching apartments can be cancelled', () => {
  const { W, nodes } = setup(); W.open('field', 'a'); const frame = nodes['data-pw-frames'].children[0], before = frame.src;
  frame.contentWindow.DJ.hasVisitLogDraft = () => true;
  W.open('compare'); assert.equal(W.dirty(), true); assert.equal(frame.removed, undefined);
  assert.equal(W.open('field', 'b'), false); assert.equal(frame.src, before);
  W.open('field', 'a'); assert.equal(frame.hidden, false);
});
test('comparison and course eligibility is enforced in both controls and open requests', () => {
  const { W, tabs, context } = setup(); context.selected = ['a']; W.refresh();
  assert.equal(tabs.find(b => b.dataset.pwTab === 'compare').disabled, true);
  assert.equal(W.open('compare'), false); assert.equal(W.open('course'), false);
  assert.equal(W.open('detail', '__proto__'), false); assert.equal(W.open('detail', 'missing'), false);
});
test('messages require the exact same-origin iframe source and a real local apartment slug', () => {
  const { W, nodes, events, added } = setup(); W.open('finder'); const frame = nodes['data-pw-frames'].children[0];
  const data = { type: 'jipgam-workspace', action: 'add', slug: 'a' };
  events.message({ origin: 'https://evil.test', source: frame.contentWindow, data });
  events.message({ origin: 'https://jipgam.test', source: {}, data });
  events.message({ origin: 'https://jipgam.test', source: frame.contentWindow, data: { ...data, slug: '__proto__' } });
  assert.equal(added.length, 0);
  events.message({ origin: 'https://jipgam.test', source: frame.contentWindow, data }); assert.deepEqual(added, ['a']);
});
test('reset is explicit and clears only transient panels, not project or visit records', () => {
  const { W, nodes, context, dialog } = setup(); W.open('detail', 'a'); W.open('course');
  const frames = nodes['data-pw-frames'].children.slice(); W.reset();
  assert.equal(dialog.open, false); assert.equal(frames.every(f => f.removed), true);
  assert.deepEqual(context.project.slugs, ['a', 'b']);
});
