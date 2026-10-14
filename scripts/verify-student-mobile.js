const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const elements = new Map();
const listeners = {};
const media = { matches: true, addEventListener(_event, handler) { this.change = handler; } };
function element(id) {
  const classes = new Set();
  const item = { id, dataset: {}, attributes: {}, children: [], events: {}, hidden: false,
    classList: { contains: name => classes.has(name), toggle(name, enabled) {
      if (enabled) classes.add(name); else classes.delete(name);
    } },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, handler) { this.events[name] = handler; },
    appendChild(child) { this.children.push(child); if (child.id) elements.set(child.id, child); },
    prepend(child) { this.children.unshift(child); },
    querySelector() { return this.children[0]; },
    querySelectorAll() { return this.children; },
    getClientRects() { return [{}]; },
    focus() { document.activeElement = this; },
  };
  if (id) elements.set(id, item);
  return item;
}
const document = { body: element('body'), activeElement: null,
  getElementById: id => elements.get(id),
  createElement: () => element(),
  addEventListener(name, handler) { listeners[name] = handler; },
};
const sidebar = element('sidebar');
const menu = element('mobileMenuButton');
sidebar.appendChild(element('navigationLink'));
const source = fs.readFileSync('public/js/shared/layout.js', 'utf8');
const functions = source.slice(source.indexOf('function setStudentMobileMenu('), source.indexOf('function shell('));
const context = vm.createContext({ document, window: { matchMedia: () => media } });
vm.runInContext(functions, context);
context.setupStudentMobileMenu();
assert.equal(sidebar.inert, true);
assert.equal(menu.attributes['aria-expanded'], 'false');
context.setupStudentMobileMenu();
assert.equal(document.body.children.length, 1, 'setup must not duplicate the backdrop');
menu.events.click();
assert.equal(sidebar.inert, false);
assert(sidebar.classList.contains('open'));
assert(document.body.classList.contains('student-menu-open'));
assert.equal(elements.get('studentMenuBackdrop').hidden, false);
assert.equal(document.activeElement, sidebar.children[0]);
const last = sidebar.children.at(-1);
last.focus();
let prevented = false;
listeners.keydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
assert(prevented);
assert.equal(document.activeElement, sidebar.children[0]);
listeners.keydown({ key: 'Escape' });
assert.equal(document.activeElement, menu);
assert.equal(sidebar.inert, true);
assert.equal(elements.get('studentMenuBackdrop').hidden, true);
menu.events.click();
elements.get('studentMenuBackdrop').events.click();
assert.equal(menu.attributes['aria-expanded'], 'false');
menu.events.click();
sidebar.children[0].events.click();
assert.equal(sidebar.inert, true);
menu.events.click();
media.matches = false;
media.change();
assert.equal(sidebar.inert, false, 'desktop navigation must remain accessible');
assert.equal(document.body.classList.contains('student-menu-open'), false);
media.matches = true;
media.change();
assert.equal(sidebar.inert, true);

for (const name of fs.readdirSync('views/student').filter(name => name.endsWith('.html'))) {
  const html = fs.readFileSync(`views/student/${name}`, 'utf8');
  assert.match(html, /student-mobile\.css\?v=20261014/);
  assert.match(html, /name="viewport"/);
}
console.log('PASS: mobile menu opening, closing, focus, resize, duplicate setup, and all student stylesheet links.');
