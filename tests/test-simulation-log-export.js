"use strict";

const assert = require("assert");

const {
  createExportSnapshot,
  buildSequentialLogLayout
} = require("../simulation-log-export.js");

function createFakeElement(name) {
  return {
    name,
    style: {},
    children: [],
    scrollTop: 99,
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
    },
    remove() {
      if (!this.parentNode) {
        return;
      }
      this.parentNode.children = this.parentNode.children.filter((item) => item !== this);
      this.parentNode = null;
    }
  };
}

const fakeBody = createFakeElement("body");
const fakeDocument = {
  body: fakeBody,
  createElement(tagName) {
    return {
      tagName,
      style: {},
      children: [],
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
      },
      remove() {
        if (!this.parentNode) {
          return;
        }
        this.parentNode.children = this.parentNode.children.filter((item) => item !== this);
        this.parentNode = null;
      }
    };
  }
};

const clonedOutput = createFakeElement("logOutput");
const clonedHead = createFakeElement("logHead");
const clonedTitle = createFakeElement("logHeadTitle");
clonedTitle.textContent = "Tam Gunluk";
const clonedPanel = createFakeElement("panelClone");
clonedPanel.querySelector = (selector) => {
  if (selector === "#logOutput") {
    return clonedOutput;
  }
  if (selector === ".log-head") {
    return clonedHead;
  }
  if (selector === ".log-head-title") {
    return clonedTitle;
  }
  return null;
};

const livePanel = {
  ownerDocument: fakeDocument,
  getBoundingClientRect() {
    return { width: 357.2 };
  },
  cloneNode() {
    return clonedPanel;
  }
};

const snapshot = createExportSnapshot(livePanel);

assert.strictEqual(snapshot.panel, clonedPanel);
assert.strictEqual(snapshot.logOutput, clonedOutput);
assert.strictEqual(snapshot.panelWidth, 358);
assert.strictEqual(fakeBody.children.length, 1);
assert.strictEqual(clonedPanel.style.width, "358px");
assert.strictEqual(clonedPanel.style.height, "auto");
assert.strictEqual(clonedPanel.style.maxHeight, "none");
assert.strictEqual(clonedPanel.style.overflow, "visible");
assert.strictEqual(clonedOutput.style.minHeight, "0");
assert.strictEqual(clonedOutput.style.height, "auto");
assert.strictEqual(clonedOutput.style.maxHeight, "none");
assert.strictEqual(clonedOutput.style.overflow, "visible");
assert.strictEqual(clonedOutput.scrollTop, 0);

snapshot.dispose();

assert.strictEqual(fakeBody.children.length, 0);

const layout = buildSequentialLogLayout(
  [
    {
      offsetTop: 5000,
      offsetHeight: 900,
      style: {
        fontSize: "12px",
        lineHeight: "18px",
        paddingTop: "1px",
        paddingBottom: "1px"
      }
    },
    {
      offsetTop: 9000,
      offsetHeight: 1200,
      style: {
        fontSize: "13px",
        lineHeight: "20px",
        paddingTop: "3px",
        paddingBottom: "2px"
      }
    }
  ],
  40
);

assert.deepStrictEqual(
  layout.rows.map((row) => ({ top: row.top, height: row.height })),
  [
    { top: 40, height: 20 },
    { top: 60, height: 25 }
  ]
);
assert.strictEqual(layout.totalHeight, 85);

console.log("Simulation log export snapshot checks passed.");
