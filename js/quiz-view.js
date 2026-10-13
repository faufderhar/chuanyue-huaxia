import { gradeChoice, gradeMatch, gradeOrder, moveItem } from "./logic.js";
import { el, say } from "./dom.js";

const TYPE_LABEL = { choice: "单选题", match: "连连看", order: "时间排序" };

function feedbackBox(correct, explain, source) {
  return el("div", { class: correct ? "feedback is-right" : "feedback is-wrong", role: "status" }, [
    el("p", { class: "feedback-title", text: correct ? "答对了" : "这题再看看" }),
    el("p", { class: "explain", text: explain }),
    el("p", { class: "source", text: `来源：${source}` }),
  ]);
}

function nextButton(label, onNext) {
  return el("button", {
    class: "btn btn-primary next-btn",
    type: "button",
    "data-action": "next",
    text: label,
    onClick: (event) => {
      event.currentTarget.disabled = true;
      onNext();
    },
  });
}

export function renderQuestion(parent, question, { index, total, isLast, prior, onGraded, onNext, nextLabel }) {
  parent.replaceChildren();
  const article = el("article", { class: "question", "data-question-id": question.id });
  article.append(
    el("p", { class: "q-type", text: TYPE_LABEL[question.type] || "题目" }),
    el("h2", { class: "prompt", id: "prompt", text: question.prompt }),
    el("p", { class: "q-count", text: `第 ${index + 1} 题，共 ${total} 题` })
  );
  const body = el("div", { class: "q-body" });
  const foot = el("div", { class: "q-foot" });
  article.append(body, foot);
  parent.append(article);

  const finishLabel = nextLabel || (isLast ? "看成绩" : "下一题");
  if (prior) {
    reveal(question, body, foot, prior, finishLabel, onNext);
    return;
  }
  if (question.type === "choice") mountChoice(question, body, foot, finishLabel, onGraded, onNext);
  else if (question.type === "match") mountMatch(question, body, foot, finishLabel, onGraded, onNext);
  else mountOrder(question, body, foot, finishLabel, onGraded, onNext);
}

function reveal(question, body, foot, prior, finishLabel, onNext) {
  if (question.type === "choice") {
    const options = el("div", { class: "options" });
    question.options.forEach((text, optionIndex) => {
      const chosen = prior.detail.selected === optionIndex;
      const right = optionIndex === question.answer;
      options.append(el("button", {
        type: "button",
        class: `option${right ? " is-correct" : ""}${chosen && !right ? " is-wrong" : ""}`,
        disabled: "disabled",
        text: `${String.fromCharCode(65 + optionIndex)}. ${text}`,
      }));
    });
    body.append(options);
  } else if (question.type === "match") {
    body.append(matchReview(question, prior.detail.mapping));
  } else {
    body.append(orderReview(question, prior.detail.ids));
  }
  foot.append(feedbackBox(prior.correct, question.explain, question.source));
  foot.append(nextButton(finishLabel, onNext));
}

function mountChoice(question, body, foot, finishLabel, onGraded, onNext) {
  let locked = false;
  const options = el("div", { class: "options" });
  question.options.forEach((text, optionIndex) => {
    const button = el("button", {
      type: "button",
      class: "option",
      "data-action": "choice",
      "data-index": String(optionIndex),
      text: `${String.fromCharCode(65 + optionIndex)}. ${text}`,
    });
    button.addEventListener("click", () => {
      if (locked) return;
      locked = true;
      const correct = gradeChoice(question, optionIndex);
      options.querySelectorAll("button").forEach((node, index) => {
        node.disabled = true;
        if (index === question.answer) node.classList.add("is-correct");
        if (index === optionIndex && !correct) node.classList.add("is-wrong");
      });
      const payload = { correct, detail: { selected: optionIndex } };
      onGraded(payload);
      foot.append(feedbackBox(correct, question.explain, question.source));
      foot.append(nextButton(finishLabel, onNext));
      say(correct ? "答对了" : "这题再看看");
    });
    options.append(button);
  });
  body.append(options);
}

function pairMap(question) {
  const map = new Map();
  question.pairs.forEach((pair) => map.set(pair.id, pair));
  return map;
}

function mountMatch(question, body, foot, finishLabel, onGraded, onNext) {
  const pairs = pairMap(question);
  const leftOrder = question.leftOrder || question.pairs.map((pair) => pair.id);
  const rightOrder = question.rightOrder || fisherOrder(question.pairs.map((pair) => pair.id), leftOrder);
  let selected = null;
  const mapping = {};

  const columns = el("div", { class: "match-grid" });
  const leftCol = el("div", { class: "match-col" }, [el("p", { class: "col-label", text: "人物" })]);
  const rightCol = el("div", { class: "match-col" }, [el("p", { class: "col-label", text: "事迹或句子" })]);
  const linked = el("div", { class: "linked", "aria-live": "polite" });
  const submit = el("button", {
    type: "button",
    class: "btn btn-primary",
    "data-action": "submit",
    text: "提交这题",
    disabled: "disabled",
  });

  function paint() {
    leftCol.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.id === selected);
      button.classList.toggle("is-linked", Boolean(mapping[button.dataset.id]));
    });
    rightCol.querySelectorAll("button").forEach((button) => {
      const used = Object.values(mapping).includes(button.dataset.id);
      button.classList.toggle("is-linked", used);
    });
    linked.replaceChildren();
    Object.entries(mapping).forEach(([leftId, rightId], index) => {
      const row = el("p", { class: "link-row" }, [
        el("span", { text: `${index + 1}. ${pairs.get(leftId).left} → ${pairs.get(rightId).right}` }),
        el("button", {
          type: "button",
          class: "btn btn-ghost tiny",
          text: "撤销",
          onClick: () => {
            delete mapping[leftId];
            paint();
          },
        }),
      ]);
      linked.append(row);
    });
    submit.disabled = Object.keys(mapping).length !== question.pairs.length;
  }

  leftOrder.forEach((id) => {
    leftCol.append(el("button", {
      type: "button",
      class: "option match-btn",
      "data-id": id,
      text: pairs.get(id).left,
      onClick: () => {
        selected = id;
        paint();
      },
    }));
  });
  rightOrder.forEach((id) => {
    rightCol.append(el("button", {
      type: "button",
      class: "option match-btn",
      "data-id": id,
      text: pairs.get(id).right,
      onClick: () => {
        if (!selected) {
          say("先点左边的人物");
          return;
        }
        Object.keys(mapping).forEach((leftId) => {
          if (mapping[leftId] === id) delete mapping[leftId];
        });
        mapping[selected] = id;
        selected = null;
        paint();
      },
    }));
  });

  submit.addEventListener("click", () => {
    if (submit.disabled) return;
    const correct = gradeMatch(question, mapping);
    submit.disabled = true;
    const payload = { correct, detail: { mapping: { ...mapping } } };
    onGraded(payload);
    foot.replaceChildren(
      feedbackBox(correct, question.explain, question.source),
      correct ? el("p", { class: "answer-key", text: "连线全部正确。" }) : matchAnswerKey(question),
      nextButton(finishLabel, onNext)
    );
    say(correct ? "答对了" : "这题再看看");
  });

  columns.append(leftCol, rightCol);
  body.append(
    el("p", { class: "hint", text: "先点左边的人物，再点右边对应的一项。连错了可以撤销。" }),
    columns,
    linked
  );
  foot.append(submit);
}

function matchAnswerKey(question) {
  const list = el("ol", { class: "answer-key" });
  question.pairs.forEach((pair) => {
    list.append(el("li", { text: `${pair.left} → ${pair.right}` }));
  });
  return el("div", {}, [el("p", { class: "key-title", text: "正确连线" }), list]);
}

function matchReview(question, mapping) {
  const wrap = el("div");
  const list = el("ol", { class: "answer-key" });
  question.pairs.forEach((pair) => {
    const picked = mapping[pair.id];
    const pickedText = question.pairs.find((item) => item.id === picked);
    const ok = picked === pair.id;
    list.append(el("li", {
      text: `${pair.left}：你连的是「${pickedText ? pickedText.right : "未连"}」${ok ? "，对了" : `，应连「${pair.right}」`}`,
    }));
  });
  wrap.append(list);
  return wrap;
}

function mountOrder(question, body, foot, finishLabel, onGraded, onNext) {
  let ids = (question.initialOrder || question.items.map((item) => item.id)).slice();
  const texts = new Map(question.items.map((item) => [item.id, item.text]));
  const list = el("ol", { class: "order-list" });

  function paint() {
    ids.forEach((id, index) => {
      let row = list.querySelector(`[data-id="${id}"]`);
      if (!row) {
        row = buildRow(id, texts.get(id));
        list.append(row);
      }
      row.querySelector(".idx").textContent = String(index + 1);
      list.append(row);
    });
  }

  function buildRow(id, text) {
    const row = el("li", { class: "order-item", "data-id": id });
    const handle = el("span", {
      class: "handle",
      role: "button",
      tabindex: "0",
      "aria-label": "拖动调整顺序",
      text: "拖",
    });
    row.append(
      handle,
      el("span", { class: "idx", text: "1" }),
      el("span", { class: "order-text", text }),
      el("button", { type: "button", class: "btn btn-ghost move", "data-move": "-1", text: "上", "aria-label": "上移一项" }),
      el("button", { type: "button", class: "btn btn-ghost move", "data-move": "1", text: "下", "aria-label": "下移一项" })
    );
    bindDrag(handle, row);
    return row;
  }

  function bindDrag(handle) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const pointerId = event.pointerId;
      const dragId = handle.closest("[data-id]").dataset.id;
      const onMove = (ev) => {
        if (ev.pointerId !== pointerId) return;
        if (ev.cancelable) ev.preventDefault();
        const to = targetIndex(list, ids, dragId, ev.clientY);
        const from = ids.indexOf(dragId);
        if (to === from) return;
        ids = moveItem(ids, from, to);
        paint();
        // paint() 会把正在拖的那一行 append 到新位置。捕获如果设在手柄上，
        // 节点一移动浏览器就会丢掉捕获，后面的 pointermove 到不了，一次拖拽只能挪一格。
        holdPointer(pointerId);
      };
      const onEnd = (ev) => {
        if (ev.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
      holdPointer(pointerId);
      event.preventDefault();
    });
  }

  function holdPointer(pointerId) {
    if (typeof list.setPointerCapture !== "function") return;
    try {
      list.setPointerCapture(pointerId);
    } catch (err) {
      /* 指针已经松开时再捕获会抛错，忽略即可 */
    }
  }

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-move]");
    if (!button) return;
    const id = button.closest("[data-id]").dataset.id;
    const from = ids.indexOf(id);
    const to = from + Number(button.dataset.move);
    ids = moveItem(ids, from, to);
    paint();
  });

  const submit = el("button", {
    type: "button",
    class: "btn btn-primary",
    "data-action": "submit",
    text: "就按这个顺序",
    onClick: (event) => {
      event.currentTarget.disabled = true;
      const correct = gradeOrder(question, ids);
      const payload = { correct, detail: { ids: ids.slice() } };
      onGraded(payload);
      foot.replaceChildren(
        feedbackBox(correct, question.explain, question.source),
        correct ? el("p", { class: "answer-key", text: "顺序完全正确。" }) : orderAnswerKey(question),
        nextButton(finishLabel, onNext)
      );
      say(correct ? "答对了" : "这题再看看");
    },
  });

  paint();
  body.append(
    el("p", { class: "hint", text: "按住“拖”上下移动，也可以点“上”“下”。排好后提交。" }),
    list
  );
  foot.append(submit);
}

function targetIndex(list, ids, dragId, y) {
  const from = ids.indexOf(dragId);
  let to = from;
  ids.forEach((id, index) => {
    if (index === from) return;
    const row = list.querySelector(`[data-id="${id}"]`);
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (index > from && y > mid && index > to) to = index;
    if (index < from && y < mid && index < to) to = index;
  });
  return to;
}

function orderAnswerKey(question) {
  const texts = new Map(question.items.map((item) => [item.id, item.text]));
  const list = el("ol", { class: "answer-key" });
  question.answer.forEach((id) => list.append(el("li", { text: texts.get(id) })));
  return el("div", {}, [el("p", { class: "key-title", text: "正确顺序" }), list]);
}

function orderReview(question, ids) {
  const texts = new Map(question.items.map((item) => [item.id, item.text]));
  const wrap = el("div");
  wrap.append(el("p", { class: "key-title", text: "你的顺序" }));
  const yours = el("ol", { class: "answer-key" });
  ids.forEach((id) => yours.append(el("li", { text: texts.get(id) })));
  wrap.append(yours);
  if (!gradeOrder(question, ids)) wrap.append(orderAnswerKey(question));
  return wrap;
}

function fisherOrder(ids, avoid) {
  const copy = ids.slice();
  if (copy.join() === avoid.join() && copy.length > 1) {
    const first = copy.shift();
    copy.push(first);
  }
  return copy;
}
