import { createAvatar } from "./avatar.js";
import { el, say } from "./dom.js";
import {
  applyAttempt,
  chapterRecord,
  formatPercent,
  isChapterUnlocked,
  isPass,
  pickQuiz,
  presentQuestion,
  starsFor,
  totalStars,
} from "./logic.js";
import { clearProgress, loadProgress, loadSession, saveProgress, saveSession } from "./storage.js";
import { renderQuestion } from "./quiz-view.js";

const SVG = "http://www.w3.org/2000/svg";
const DIFF_LABEL = { primary: "小学", junior: "初中" };

let rules;
let chapters = [];
let characters = [];
let questions = [];
let progress;

const app = document.getElementById("app");
const cardDialog = el("dialog", { class: "sheet", id: "card-dialog" });
const confirmDialog = el("dialog", { class: "sheet", id: "confirm-dialog" });
document.body.append(cardDialog, confirmDialog);

function loadJson(path) {
  return fetch(path).then((response) => {
    if (!response.ok) throw new Error(path);
    return response.json();
  });
}

function chapterById(id) {
  return chapters.find((chapter) => chapter.id === id);
}

function peopleOf(chapterId) {
  return characters.filter((person) => person.chapterId === chapterId);
}

function go(hash) {
  if (location.hash === hash) draw();
  else location.hash = hash;
}

function parseRoute() {
  const parts = (location.hash || "#/").replace(/^#/, "").split("/").filter(Boolean);
  return { name: parts[0] || "home", arg: parts[1] || "" };
}

function applyFont() {
  if (progress && progress.difficulty === "junior") {
    document.documentElement.dataset.difficulty = "junior";
  } else {
    delete document.documentElement.dataset.difficulty;
  }
}

function persist() {
  saveProgress(rules.storageKey, progress);
}

function setDifficulty(difficulty) {
  progress.difficulty = difficulty;
  persist();
  applyFont();
  draw();
}

function starIcon(on) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", on ? "star on" : "star");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", "M12 2.6l2.7 5.6 6.2.9-4.5 4.3 1.1 6.1L12 16.8 6.5 19.5l1.1-6.1L3.1 9.1l6.2-.9L12 2.6z");
  svg.append(path);
  return svg;
}

function starRow(count) {
  const wrap = el("div", { class: "stars", role: "img", "aria-label": count ? `${count}颗星` : "还没有星星" });
  for (let i = 0; i < 3; i += 1) wrap.append(starIcon(i < count));
  return wrap;
}

function seal(text, color) {
  const style = /^#[0-9a-fA-F]{6}$/.test(color || "") ? `--seal:${color}` : "";
  return el("span", { class: "seal", style, text });
}

function shell(nodes) {
  const route = parseRoute();
  const header = el("header", { class: "top" }, [
    el("a", { class: "brand", href: "#/", text: "穿越华夏" }),
    el("nav", { class: "nav", "aria-label": "主导航" }, [
      el("a", { class: route.name === "map" ? "nav-link is-on" : "nav-link", href: "#/map", text: "时间长河" }),
      el("a", { class: route.name === "atlas" ? "nav-link is-on" : "nav-link", href: "#/atlas", text: "图鉴" }),
      el("button", {
        type: "button",
        class: "nav-link diff-chip",
        text: progress.difficulty ? DIFF_LABEL[progress.difficulty] : "选难度",
        onClick: () => go("#/"),
      }),
    ]),
  ]);
  const main = el("main", { id: "main", class: "page" }, nodes);
  const footer = el("footer", { class: "foot" }, [
    el("p", { text: "内容依据统编《中国历史》整理，供学习使用。进度只存在这台设备上，不收集个人信息。" }),
  ]);
  app.replaceChildren(header, main, footer);
  const heading = main.querySelector("h1");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

function renderFatal(error) {
  app.replaceChildren(el("main", { id: "main", class: "page" }, [
    el("h1", { text: "卷轴没有打开" }),
    el("p", { class: "lede", text: "题库文件没有读到。请用本地服务器打开这个页面，不要直接双击 html 文件。" }),
    el("pre", { class: "code", text: "python3 -m http.server 47218" }),
    el("p", { class: "source", text: String(error && error.message ? error.message : error) }),
  ]));
}

function draw() {
  applyFont();
  const route = parseRoute();
  if (!progress.difficulty && !["home", "atlas"].includes(route.name)) {
    go("#/");
    return;
  }
  document.title = "穿越华夏 · 中国历史学习";
  if (route.name === "home") renderHome();
  else if (route.name === "map") renderMap();
  else if (route.name === "chapter") renderChapter(route.arg);
  else if (route.name === "quiz") renderQuiz(route.arg);
  else if (route.name === "result") renderResult();
  else if (route.name === "atlas") renderAtlas();
  else renderHome();
}

function renderHome() {
  const unlocked = characters.filter((person) => isChapterUnlocked(progress, person.chapterId)).length;
  const stars = progress.difficulty ? totalStars(progress, progress.difficulty) : 0;
  shell([
    el("section", { class: "hero" }, [
      seal("华", "#c23b2e"),
      el("div", {}, [
        el("p", { class: "eyebrow", text: "小学 · 初中历史闯关" }),
        el("h1", { text: "沿着时间长河，把历史读准确" }),
        el("p", { class: "lede", text: "九个章节，从先秦走到清朝。每关随机抽出 8 到 10 题，答完立刻看到对错和一句讲解。" }),
      ]),
    ]),
    el("section", { class: "panel" }, [
      el("h2", { text: "先选难度" }),
      el("div", { class: "diff-grid", role: "group", "aria-label": "难度" }, [
        difficultyCard("primary", "小学", "3–6 年级。句子短一些，多记人物和故事。"),
        difficultyCard("junior", "初中", "7–9 年级。会遇到年代、制度和前因后果。"),
      ]),
      el("button", {
        type: "button",
        class: "btn btn-primary btn-large",
        "data-action": "start-journey",
        disabled: progress.difficulty ? false : "disabled",
        text: progress.difficulty ? `以${DIFF_LABEL[progress.difficulty]}难度出发` : "请先选择难度",
        onClick: () => {
          if (progress.difficulty) go("#/map");
        },
      }),
      el("p", { class: "meta", text: progress.difficulty ? `当前${DIFF_LABEL[progress.difficulty]} · 星星 ${stars}/27 · 人物 ${unlocked}/${characters.length}` : "星星按难度分开保存。人物卡只要有一个难度过关就会解锁。" }),
    ]),
    el("ol", { class: "steps" }, [
      el("li", {}, [el("strong", { text: "选章节" }), el("span", { text: "九章都能点。星星记在这一章上。" })]),
      el("li", {}, [el("strong", { text: "答一关" }), el("span", { text: "单选、连连看、时间排序都会出现。" })]),
      el("li", {}, [el("strong", { text: "收人物卡" }), el("span", { text: "正确率达到 60% 过关，100% 是三星。" })]),
    ]),
  ]);
}

function difficultyCard(id, title, copy) {
  const on = progress.difficulty === id;
  return el("button", {
    type: "button",
    class: on ? "diff-card is-on" : "diff-card",
    "data-action": `choose-${id}`,
    "aria-pressed": on ? "true" : "false",
    onClick: () => setDifficulty(id),
  }, [
    el("span", { class: "diff-title", text: title }),
    el("span", { class: "diff-copy", text: copy }),
  ]);
}

function renderMap() {
  const stars = totalStars(progress, progress.difficulty);
  shell([
    el("div", { class: "page-head" }, [
      el("div", {}, [
        el("p", { class: "eyebrow", text: `${DIFF_LABEL[progress.difficulty]}难度` }),
        el("h1", { text: "时间长河" }),
        el("p", { class: "lede", text: "从远古走到近代前夜。点一章就开始。过关后，这一章的人物卡会收入图鉴。" }),
      ]),
      el("div", { class: "segment", role: "group", "aria-label": "切换难度" }, [
        segmentButton("primary"),
        segmentButton("junior"),
      ]),
    ]),
    el("p", { class: "meta", text: `本难度星星 ${stars}/27。未挑战的章节是空星。` }),
    el("div", { class: "timeline" }, chapters.map((chapter) => {
      const record = chapterRecord(progress, chapter.id, progress.difficulty);
      return el("button", {
        type: "button",
        class: "chapter-card",
        "data-action": "open-chapter",
        "data-chapter": chapter.id,
        onClick: () => go(`#/chapter/${chapter.id}`),
      }, [
        seal(chapter.seal, chapter.color),
        el("span", { class: "chapter-name", text: chapter.name }),
        el("span", { class: "era", text: chapter.era }),
        starRow(record.bestStars),
        el("span", { class: "meta", text: record.passed ? "已过关" : record.attempts ? "还没过关" : "未挑战" }),
      ]);
    })),
  ]);
}

function segmentButton(id) {
  const on = progress.difficulty === id;
  return el("button", {
    type: "button",
    class: on ? "is-on" : "",
    "aria-pressed": on ? "true" : "false",
    text: DIFF_LABEL[id],
    onClick: () => setDifficulty(id),
  });
}

function renderChapter(id) {
  const chapter = chapterById(id);
  if (!chapter) {
    shell([el("h1", { text: "没有这一章" }), el("a", { class: "btn btn-primary", href: "#/map", text: "回时间长河" })]);
    return;
  }
  const record = chapterRecord(progress, id, progress.difficulty);
  const unlocked = isChapterUnlocked(progress, id);
  const run = loadSession(rules.sessionKey);
  const canContinue = run && run.chapterId === id && run.difficulty === progress.difficulty;
  shell([
    el("p", { class: "eyebrow", text: chapter.era }),
    el("div", { class: "chapter-title" }, [seal(chapter.seal, chapter.color), el("h1", { text: chapter.name })]),
    el("p", { class: "lede", text: chapter.summary }),
    starRow(record.bestStars),
    el("p", { class: "meta", text: record.bestTotal ? `最好成绩 ${record.bestCorrect}/${record.bestTotal} · 挑战 ${record.attempts} 次` : "这一章还没有成绩。" }),
    el("h2", { text: "本章人物" }),
    el("div", { class: "cast" }, peopleOf(id).map((person) => personChip(person, unlocked))),
    el("div", { class: "action-row" }, [
      canContinue ? el("button", {
        type: "button",
        class: "btn btn-ghost",
        "data-action": "continue-quiz",
        text: "继续上次",
        onClick: () => go(`#/quiz/${id}`),
      }) : null,
      el("button", {
        type: "button",
        class: "btn btn-primary btn-large",
        "data-action": "start-quiz",
        text: canContinue ? "重新开始" : "开始闯关",
        onClick: () => startQuiz(id),
      }),
    ]),
    el("p", { class: "hint", text: "每次随机抽 8–10 题，单选、连连看、排序至少各 1 题。正确率达到 60% 过关。" }),
  ]);
}

function personChip(person, unlocked) {
  const button = el("button", {
    type: "button",
    class: unlocked ? "person-chip" : "person-chip is-locked",
    onClick: () => {
      if (unlocked) openCard(person.id);
      else say("过关后才能打开这张人物卡");
    },
  });
  button.append(createAvatar(person, 72));
  button.append(el("span", { class: "person-name", text: person.name }));
  button.append(el("span", { class: "meta", text: unlocked ? person.role : "过关后解锁" }));
  return button;
}

function startQuiz(chapterId) {
  const pool = questions.filter((item) => item.chapterId === chapterId && item.difficulty === progress.difficulty);
  let picked;
  try {
    picked = pickQuiz(pool, rules).map((item) => presentQuestion(item));
  } catch (error) {
    shell([
      el("h1", { text: "这一章的题还没备齐" }),
      el("p", { text: String(error.message || error) }),
    ]);
    return;
  }
  saveSession(rules.sessionKey, {
    chapterId,
    difficulty: progress.difficulty,
    questions: picked,
    index: 0,
    phase: "ask",
    answers: [],
    feedback: null,
  });
  go(`#/quiz/${chapterId}`);
}

function renderQuiz(chapterId) {
  const run = loadSession(rules.sessionKey);
  if (!run || run.chapterId !== chapterId || run.difficulty !== progress.difficulty) {
    shell([
      el("h1", { text: "这关还没有开始" }),
      el("button", { type: "button", class: "btn btn-primary", text: "回到章节", onClick: () => go(`#/chapter/${chapterId}`) }),
    ]);
    return;
  }
  const chapter = chapterById(chapterId);
  const question = run.questions[run.index];
  const correctSoFar = run.answers.filter((item) => item.correct).length;
  shell([
    el("div", { class: "quiz-head" }, [
      el("div", {}, [
        el("p", { class: "eyebrow", text: `${chapter ? chapter.name : ""} · ${DIFF_LABEL[run.difficulty]}` }),
        el("h1", { text: "闯关" }),
      ]),
      el("button", {
        type: "button",
        class: "btn btn-ghost",
        text: "离开",
        onClick: () => askConfirm("离开后，这次闯关会保存在当前标签页。关掉标签页就会丢掉未完成的题目。", () => go(`#/chapter/${chapterId}`)),
      }),
    ]),
    el("p", { class: "meta", text: `已答对 ${correctSoFar} 题` }),
    el("div", { class: "bar", style: `--p:${Math.round((run.index / run.questions.length) * 100)}%` }, [
      el("span", { class: "bar-fill" }),
    ]),
    el("div", { id: "question-slot" }),
  ]);
  const prior = run.phase === "feedback" && run.feedback && run.feedback.id === question.id ? run.feedback : null;
  renderQuestion(document.getElementById("question-slot"), question, {
    index: run.index,
    total: run.questions.length,
    isLast: run.index === run.questions.length - 1,
    prior,
    onGraded: (payload) => {
      const latest = loadSession(rules.sessionKey);
      if (!latest || latest.phase === "feedback") return;
      latest.answers.push({ id: question.id, correct: payload.correct, detail: payload.detail });
      latest.phase = "feedback";
      latest.feedback = { id: question.id, correct: payload.correct, detail: payload.detail };
      saveSession(rules.sessionKey, latest);
    },
    onNext: () => {
      const latest = loadSession(rules.sessionKey);
      if (!latest) return;
      latest.index += 1;
      latest.phase = "ask";
      latest.feedback = null;
      if (latest.index >= latest.questions.length) {
        finishRun(latest);
        return;
      }
      saveSession(rules.sessionKey, latest);
      draw();
    },
  });
}

function finishRun(run) {
  const correct = run.answers.filter((item) => item.correct).length;
  const total = run.questions.length;
  const stars = starsFor(correct, total, rules);
  const passed = isPass(correct, total, rules);
  const applied = applyAttempt(progress, run.chapterId, run.difficulty, { stars, correct, total, passed });
  progress = applied.progress;
  persist();
  saveSession(rules.resultKey, {
    chapterId: run.chapterId,
    difficulty: run.difficulty,
    correct,
    total,
    stars,
    passed,
    percent: formatPercent(correct, total),
    newlyUnlocked: applied.newlyUnlocked,
    improved: applied.improved,
    questions: run.questions,
    answers: run.answers,
  });
  saveSession(rules.sessionKey, null);
  go("#/result");
}

function renderResult() {
  const result = loadSession(rules.resultKey);
  if (!result) {
    shell([el("h1", { text: "还没有成绩" }), el("a", { class: "btn btn-primary", href: "#/map", text: "去时间长河" })]);
    return;
  }
  const chapter = chapterById(result.chapterId);
  const people = peopleOf(result.chapterId);
  const headline = result.passed
    ? (result.stars === 3 ? "全部答对" : "过关了")
    : "这次还没过关";
  const detail = result.passed
    ? (result.newlyUnlocked ? "人物卡已经放进图鉴。" : "这些人物卡你已经收藏过。")
    : `正确率要达到 ${rules.passPercent}% 才能过关。看看讲解，再试一次。`;
  shell([
    el("p", { class: "eyebrow", text: `${chapter ? chapter.name : ""} · ${DIFF_LABEL[result.difficulty]}` }),
    el("h1", { text: headline }),
    el("p", { class: "score-num", text: `${result.correct}/${result.total}` }),
    el("p", { class: "lede", text: `正确率 ${result.percent}%` }),
    starRow(result.stars),
    el("p", { text: detail }),
    result.passed ? el("h2", { text: "解锁的人物" }) : null,
    result.passed ? el("div", { class: "cast" }, people.map((person) => personChip(person, true))) : null,
    el("div", { class: "action-row" }, [
      el("button", { type: "button", class: "btn btn-primary", "data-action": "retry", text: "再挑战一次", onClick: () => startQuiz(result.chapterId) }),
      el("a", { class: "btn btn-ghost", href: "#/atlas", text: "打开图鉴" }),
      el("a", { class: "btn btn-ghost", href: "#/map", text: "回时间长河" }),
    ]),
    el("details", { class: "review" }, [
      el("summary", { text: "看看每题讲解" }),
      el("ol", { class: "review-list" }, result.questions.map((question, index) => {
        const answer = result.answers[index];
        const ok = answer && answer.correct;
        return el("li", {}, [
          el("p", { class: ok ? "review-ok" : "review-bad", text: `${ok ? "答对" : "答错"} · ${question.prompt}` }),
          el("p", { text: question.explain }),
        ]);
      })),
    ]),
  ]);
}

function renderAtlas() {
  const unlockedPeople = characters.filter((person) => isChapterUnlocked(progress, person.chapterId));
  const stars = progress.difficulty ? totalStars(progress, progress.difficulty) : 0;
  shell([
    el("div", { class: "page-head" }, [
      el("div", {}, [
        el("h1", { text: "我的图鉴" }),
        el("p", { class: "lede", text: `已收集 ${unlockedPeople.length}/${characters.length} 张人物卡${progress.difficulty ? ` · ${DIFF_LABEL[progress.difficulty]}星星 ${stars}/27` : ""}。` }),
      ]),
      el("button", {
        type: "button",
        class: "btn btn-ghost",
        "data-action": "reset",
        text: "重置进度",
        onClick: () => askConfirm("重置后，这台设备上的星星和人物卡都会清空。不会上传任何信息。", resetProgress),
      }),
    ]),
    unlockedPeople.length === 0
      ? el("p", { class: "empty", text: "还没有人物卡。去时间长河闯关，正确率达到 60% 就会解锁这一章。" })
      : null,
    el("div", { class: "atlas" }, chapters.map((chapter) => {
      const unlocked = isChapterUnlocked(progress, chapter.id);
      const record = progress.difficulty ? chapterRecord(progress, chapter.id, progress.difficulty) : null;
      return el("section", { class: "atlas-chapter" }, [
        el("div", { class: "atlas-head" }, [
          seal(chapter.seal, chapter.color),
          el("div", {}, [
            el("h2", { text: chapter.name }),
            record ? starRow(record.bestStars) : el("p", { class: "meta", text: "选择难度后显示星星" }),
          ]),
        ]),
        el("div", { class: "cast" }, peopleOf(chapter.id).map((person) => personChip(person, unlocked))),
      ]);
    })),
  ]);
}

function openCard(id) {
  const person = characters.find((item) => item.id === id);
  if (!person || !isChapterUnlocked(progress, person.chapterId)) return;
  cardDialog.replaceChildren(
    el("div", { class: "card-top" }, [
      createAvatar(person, 96),
      el("div", {}, [
        el("h2", { id: "card-title", text: person.name }),
        el("p", { class: "meta", text: `${person.dynasty} · ${person.years}` }),
        el("p", { class: "role", text: person.role }),
      ]),
    ]),
    el("ul", { class: "deeds" }, person.deeds.map((deed) => el("li", { text: deed }))),
    person.quote ? el("blockquote", {}, [
      el("p", { text: person.quote }),
      person.quoteFrom ? el("cite", { text: person.quoteFrom }) : null,
    ]) : null,
    el("p", { class: "source", text: `来源：${person.source}` }),
    el("button", { type: "button", class: "btn btn-primary", text: "合上卡片", onClick: () => cardDialog.close() })
  );
  cardDialog.setAttribute("aria-labelledby", "card-title");
  if (!cardDialog.open) cardDialog.showModal();
}

function askConfirm(message, onYes) {
  confirmDialog.replaceChildren(
    el("h2", { text: "请确认" }),
    el("p", { text: message }),
    el("div", { class: "action-row" }, [
      el("button", { type: "button", class: "btn btn-ghost", text: "取消", onClick: () => confirmDialog.close() }),
      el("button", {
        type: "button",
        class: "btn btn-primary",
        text: "确定",
        onClick: () => {
          confirmDialog.close();
          onYes();
        },
      }),
    ])
  );
  if (!confirmDialog.open) confirmDialog.showModal();
}

function resetProgress() {
  clearProgress(rules.storageKey, rules.sessionKey, rules.resultKey);
  progress = loadProgress(rules.storageKey);
  applyFont();
  say("进度已重置");
  go("#/");
}

async function boot() {
  try {
    const [ruleDoc, chapterDoc, characterDoc] = await Promise.all([
      loadJson("data/rules.json"),
      loadJson("data/chapters.json"),
      loadJson("data/characters.json"),
    ]);
    rules = ruleDoc;
    chapters = chapterDoc.chapters;
    characters = characterDoc.characters;
    const packs = await Promise.all(chapters.map((chapter) => loadJson(`data/questions/${chapter.id}.json`)));
    questions = packs.flatMap((pack) => pack.questions);
    progress = loadProgress(rules.storageKey);
    window.addEventListener("hashchange", draw);
    draw();
  } catch (error) {
    renderFatal(error);
  }
}

boot();
