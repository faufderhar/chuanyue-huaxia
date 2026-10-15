import { createAvatar } from "./avatar.js";
import { el, say } from "./dom.js";
import {
  ACHIEVEMENTS,
  STREAK_BADGES,
  applyAttempt,
  applyCheckin,
  cardTier,
  chapterRecord,
  evaluateAchievements,
  formatPercent,
  frameTier,
  isChapterUnlocked,
  isPass,
  linkedQuestions,
  noteAnswer,
  personCorrectCount,
  pickDailyQuestion,
  pickQuiz,
  pickReview,
  presentQuestion,
  starsFor,
  tierProgressText,
  todayKey,
  totalStars,
  visibleStreak,
} from "./logic.js";
import { clearProgress, loadProgress, loadSession, saveProgress, saveSession } from "./storage.js";
import { renderQuestion } from "./quiz-view.js";

const SVG = "http://www.w3.org/2000/svg";
const DIFF_LABEL = { primary: "小学", junior: "初中" };

let rules;
let chapters = [];
let characters = [];
let stories = [];
let questions = [];
let progress;

const app = document.getElementById("app");
const cardDialog = el("dialog", { class: "sheet", id: "card-dialog" });
const confirmDialog = el("dialog", { class: "sheet", id: "confirm-dialog" });
const awardDialog = el("dialog", { class: "sheet", id: "award-dialog" });
document.body.append(cardDialog, confirmDialog, awardDialog);

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
  if (!progress.difficulty && !["home", "atlas", "wrong", "achieve"].includes(route.name)) {
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
  else if (route.name === "daily") renderDaily();
  else if (route.name === "wrong") renderWrong();
  else if (route.name === "review") renderReview();
  else if (route.name === "achieve") renderAchieve();
  else renderHome();
}

function renderHome() {
  const unlocked = characters.filter((person) => isChapterUnlocked(progress, person.chapterId)).length;
  const stars = progress.difficulty ? totalStars(progress, progress.difficulty) : 0;
  const today = todayKey(new Date());
  const streak = visibleStreak(progress.checkin, today);
  const done = Boolean(progress.dailyDone[today]);
  shell([
    el("section", { class: "daily-card" }, [
      el("div", {}, [
        el("p", { class: "eyebrow", text: "今日一题" }),
        el("h2", { text: done ? "今天已经打卡" : "今天的题还在等你" }),
        el("p", {
          class: "lede",
          text: progress.difficulty
            ? `${DIFF_LABEL[progress.difficulty]}难度 · 连续打卡 ${streak} 天 · 最好 ${progress.checkin.best || 0} 天`
            : "先选好难度，今天的题就会按日期定下来。",
        }),
        badgeRow(),
      ]),
      el("a", {
        class: "btn btn-primary",
        href: "#/daily",
        text: done ? "看今天的讲解" : "去做今日一题",
      }),
    ]),
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
      el("p", { class: "meta", text: progress.difficulty ? `当前${DIFF_LABEL[progress.difficulty]} · 星星 ${stars}/27 · 已收录 ${unlocked}/${characters.length}` : "星星按难度分开保存。过关后收录人物卡，答对关联题才分成铜卡、银卡或金卡。" }),
    ]),
    el("ol", { class: "steps" }, [
      el("li", {}, [el("strong", { text: "选章节" }), el("span", { text: "九章都能点。星星记在这一章上。" })]),
      el("li", {}, [el("strong", { text: "答一关" }), el("span", { text: "单选、连连看、时间排序都会出现。" })]),
      el("li", {}, [el("strong", { text: "收人物卡" }), el("span", { text: "过关后收录。答对 1 道关联题得到铜卡，再答对可以升到银卡和金卡。" })]),
    ]),
    el("div", { class: "home-links" }, [
      el("a", { class: "btn btn-ghost", href: "#/wrong", text: `错题本 ${Object.keys(progress.wrong).length}` }),
      el("a", { class: "btn btn-ghost", href: "#/achieve", text: `我的成就 ${progress.achievements.length}/${ACHIEVEMENTS.length}` }),
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

function personStats(person) {
  const linked = linkedQuestions(questions, person.id).length;
  const got = personCorrectCount(progress, person.id);
  const frame = frameTier(progress, person, linked);
  return {
    linked,
    got,
    tier: cardTier(got, linked),
    frame,
    label: tierProgressText(frame, got, linked),
  };
}

function badgeRow() {
  return el("div", { class: "badge-row" }, STREAK_BADGES.map((badge) => {
    const on = (progress.checkin.best || 0) >= badge.days;
    return el("span", {
      class: on ? "badge is-on" : "badge",
      text: on ? `${badge.name}徽章` : `${badge.days}天徽章`,
    });
  }));
}

function commitAnswer(question, correct, withCheckin) {
  progress = noteAnswer(progress, question, correct);
  if (withCheckin) {
    progress = applyCheckin(progress, todayKey(new Date()), {
      questionId: question.id,
      correct,
      difficulty: question.difficulty,
    }).progress;
  }
  const judged = evaluateAchievements(progress, {
    characters,
    questions,
    chapterIds: chapters.map((chapter) => chapter.id),
    today: todayKey(new Date()),
  });
  progress = judged.progress;
  persist();
  if (judged.fresh.length) celebrate(judged.fresh);
}

function celebrate(ids) {
  const items = ids.map((id) => ACHIEVEMENTS.find((item) => item.id === id)).filter(Boolean);
  if (!items.length) return;
  awardDialog.replaceChildren(
    el("h2", { text: "获得成就" }),
    el("ul", { class: "award-list" }, items.map((item) => el("li", {}, [
      el("strong", { text: item.name }),
      el("span", { text: item.detail }),
    ]))),
    el("button", { type: "button", class: "btn btn-primary", text: "收下", onClick: () => awardDialog.close() })
  );
  if (!awardDialog.open) awardDialog.showModal();
}

function personChip(person, unlocked) {
  const stats = personStats(person);
  const frame = unlocked ? stats.frame : "none";
  const button = el("button", {
    type: "button",
    class: unlocked ? `person-chip${frame === "none" ? "" : ` tier-${frame}`}` : "person-chip is-locked",
    onClick: () => {
      if (unlocked) openCard(person.id);
      else say("过关后才能打开这张人物卡");
    },
  });
  button.append(createAvatar(person, 72));
  button.append(el("span", { class: "person-name", text: person.name }));
  button.append(el("span", { class: "meta", text: unlocked ? stats.label : "过关后解锁" }));
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
      commitAnswer(question, payload.correct, false);
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
  const judged = evaluateAchievements(progress, {
    characters,
    questions,
    chapterIds: chapters.map((chapter) => chapter.id),
    today: todayKey(new Date()),
  });
  progress = judged.progress;
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
    freshAchievements: judged.fresh,
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
  if (result.freshAchievements && result.freshAchievements.length) {
    const fresh = result.freshAchievements.slice();
    result.freshAchievements = [];
    saveSession(rules.resultKey, result);
    queueMicrotask(() => celebrate(fresh));
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

function renderDaily() {
  if (!progress.difficulty) {
    shell([
      el("h1", { text: "先选难度" }),
      el("p", { class: "lede", text: "今日一题按难度从题库里定题。选好以后，同一天看到的是同一道。" }),
      el("a", { class: "btn btn-primary", href: "#/", text: "回首页" }),
    ]);
    return;
  }
  const today = todayKey(new Date());
  const done = progress.dailyDone[today];
  const streak = visibleStreak(progress.checkin, today);
  const stored = done ? questions.find((item) => item.id === done.questionId) : null;
  const question = stored || pickDailyQuestion(questions, progress.difficulty, today);
  if (!question) {
    shell([el("h1", { text: "今天没有抽到题" }), el("a", { class: "btn btn-primary", href: "#/", text: "回首页" })]);
    return;
  }
  const historic = question.anniversary === today.slice(5);
  const replay = (() => {
    const side = loadSession(rules.sideKey);
    if (side && side.kind === "daily" && side.date === today && side.difficulty === progress.difficulty && side.feedback) return side;
    return null;
  })();
  shell([
    el("p", { class: "eyebrow", text: historic ? "历史上的今天" : `${DIFF_LABEL[progress.difficulty]}难度` }),
    el("h1", { text: historic ? "历史上的今天" : "今日一题" }),
    el("p", { class: "lede", text: `连续 ${streak} 天，最好 ${progress.checkin.best || 0} 天。答错也算打卡，一天只记第一次。` }),
    badgeRow(),
    el("div", { id: "question-slot" }),
    done ? el("p", { class: "meta", text: done.correct ? "今天答对了。" : "今天这题答错了，已经放进错题本。" }) : null,
  ]);
  if (done) {
    const slot = document.getElementById("question-slot");
    if (replay) {
      renderQuestion(slot, replay.question, {
        index: 0,
        total: 1,
        isLast: true,
        prior: replay.feedback,
        nextLabel: "回首页",
        onGraded: () => {},
        onNext: () => go("#/"),
      });
    } else {
      slot.append(el("article", { class: "question" }, [
        el("h2", { class: "prompt", text: question.prompt }),
        el("div", { class: done.correct ? "feedback is-right" : "feedback is-wrong" }, [
          el("p", { class: "feedback-title", text: done.correct ? "答对了" : "这题再看看" }),
          el("p", { class: "explain", text: question.explain }),
          el("p", { class: "source", text: `来源：${question.source}` }),
        ]),
        el("button", { type: "button", class: "btn btn-primary", text: "回首页", onClick: () => go("#/") }),
      ]));
    }
    return;
  }
  let side = loadSession(rules.sideKey);
  if (!side || side.kind !== "daily" || side.date !== today || side.difficulty !== progress.difficulty) {
    side = {
      kind: "daily",
      date: today,
      difficulty: progress.difficulty,
      question: presentQuestion(question),
      phase: "ask",
      feedback: null,
    };
    saveSession(rules.sideKey, side);
  }
  renderQuestion(document.getElementById("question-slot"), side.question, {
    index: 0,
    total: 1,
    isLast: true,
    prior: side.phase === "feedback" ? side.feedback : null,
    nextLabel: "回首页",
    onGraded: (payload) => {
      const latest = loadSession(rules.sideKey);
      if (!latest || latest.phase === "feedback" || progress.dailyDone[today]) return;
      latest.phase = "feedback";
      latest.feedback = { id: latest.question.id, correct: payload.correct, detail: payload.detail };
      saveSession(rules.sideKey, latest);
      commitAnswer(latest.question, payload.correct, true);
    },
    onNext: () => go("#/"),
  });
}

function startReview(list) {
  if (!list.length) return;
  saveSession(rules.sideKey, {
    kind: "review",
    questions: list.map((item) => presentQuestion(item)),
    index: 0,
    phase: "ask",
    answers: [],
    feedback: null,
  });
  go("#/review");
}

function renderWrong() {
  const ids = Object.keys(progress.wrong);
  const groups = chapters.map((chapter) => ({
    chapter,
    items: ids
      .map((id) => ({ id, info: progress.wrong[id], question: questions.find((item) => item.id === id) }))
      .filter((row) => row.question && row.question.chapterId === chapter.id),
  })).filter((group) => group.items.length);
  shell([
    el("h1", { text: "错题本" }),
    el("p", { class: "lede", text: `还没收下的错题 ${ids.length} 道，累计已掌握 ${progress.mastered} 道。答对一次就会移出，并记入已掌握。` }),
    el("div", { class: "action-row" }, [
      el("button", {
        type: "button",
        class: "btn btn-primary",
        "data-action": "review-all",
        disabled: ids.length ? false : "disabled",
        text: ids.length ? `全部再挑战（${Math.min(10, ids.length)}题）` : "全部再挑战",
        onClick: () => startReview(pickReview(progress.wrong, questions, 10)),
      }),
      el("a", { class: "btn btn-ghost", href: "#/", text: "回首页" }),
    ]),
    ids.length === 0 ? el("p", { class: "empty", text: "错题本是空的。闯关或每日一题里答错的题，会出现在这里。" }) : null,
    ...groups.map((group) => el("section", { class: "atlas-chapter" }, [
      el("h2", { text: group.chapter.name }),
      el("ul", { class: "wrong-list" }, group.items.map((row) => el("li", { class: "wrong-item" }, [
        el("div", {}, [
          el("p", { text: row.question.prompt }),
          el("p", { class: "meta", text: `${DIFF_LABEL[row.info.difficulty] || ""} · 错过 ${row.info.misses} 次` }),
        ]),
        el("button", {
          type: "button",
          class: "btn btn-ghost",
          text: "再做这题",
          onClick: () => startReview([row.question]),
        }),
      ]))),
    ])),
  ]);
}

function renderReview() {
  const run = loadSession(rules.sideKey);
  if (!run || run.kind !== "review") {
    shell([
      el("h1", { text: "还没有再挑战" }),
      el("a", { class: "btn btn-primary", href: "#/wrong", text: "回错题本" }),
    ]);
    return;
  }
  if (run.index >= run.questions.length) {
    const correct = run.answers.filter((item) => item.correct).length;
    shell([
      el("p", { class: "eyebrow", text: "错题本" }),
      el("h1", { text: "再挑战结束" }),
      el("p", { class: "score-num", text: `${correct}/${run.questions.length}` }),
      el("p", { class: "lede", text: "答对的题已经移出错题本。这次不记星星，也不改变章节成绩。" }),
      el("a", { class: "btn btn-primary", href: "#/wrong", text: "回错题本" }),
    ]);
    return;
  }
  const question = run.questions[run.index];
  shell([
    el("div", { class: "quiz-head" }, [
      el("div", {}, [
        el("p", { class: "eyebrow", text: "错题再挑战" }),
        el("h1", { text: "再做一次" }),
      ]),
      el("a", { class: "btn btn-ghost", href: "#/wrong", text: "离开" }),
    ]),
    el("div", { id: "question-slot" }),
  ]);
  renderQuestion(document.getElementById("question-slot"), question, {
    index: run.index,
    total: run.questions.length,
    isLast: run.index === run.questions.length - 1,
    prior: run.phase === "feedback" && run.feedback && run.feedback.id === question.id ? run.feedback : null,
    nextLabel: run.index === run.questions.length - 1 ? "看结果" : "下一题",
    onGraded: (payload) => {
      const latest = loadSession(rules.sideKey);
      if (!latest || latest.phase === "feedback") return;
      latest.answers.push({ id: question.id, correct: payload.correct, detail: payload.detail });
      latest.phase = "feedback";
      latest.feedback = { id: question.id, correct: payload.correct, detail: payload.detail };
      saveSession(rules.sideKey, latest);
      commitAnswer(question, payload.correct, false);
    },
    onNext: () => {
      const latest = loadSession(rules.sideKey);
      if (!latest) return;
      latest.index += 1;
      latest.phase = "ask";
      latest.feedback = null;
      saveSession(rules.sideKey, latest);
      draw();
    },
  });
}

function renderAchieve() {
  const got = progress.achievements.length;
  shell([
    el("h1", { text: "我的成就" }),
    el("p", { class: "lede", text: got ? `已经获得 ${got} / ${ACHIEVEMENTS.length} 个。没点亮的，下面写着条件。` : "成就还是空的。闯关、打卡、订正错题，都会慢慢点亮。" }),
    el("ul", { class: "achieve-list" }, ACHIEVEMENTS.map((item) => {
      const on = progress.achievements.includes(item.id);
      return el("li", { class: on ? "achieve is-on" : "achieve" }, [
        el("strong", { text: item.name }),
        el("span", { text: on ? "已获得" : item.detail }),
      ]);
    })),
    el("a", { class: "btn btn-ghost", href: "#/", text: "回首页" }),
  ]);
}

function renderAtlas() {
  const unlockedPeople = characters.filter((person) => isChapterUnlocked(progress, person.chapterId));
  const stars = progress.difficulty ? totalStars(progress, progress.difficulty) : 0;
  shell([
    el("div", { class: "page-head" }, [
      el("div", {}, [
        el("h1", { text: "我的图鉴" }),
        el("p", { class: "lede", text: `已收录 ${unlockedPeople.length}/${characters.length} 张。答对 1 道关联题是铜卡，3 道升银卡，5 道或全部升金卡。${progress.difficulty ? `${DIFF_LABEL[progress.difficulty]}星星 ${stars}/27。` : ""}` }),
      ]),
      el("button", {
        type: "button",
        class: "btn btn-ghost",
        "data-action": "reset",
        text: "重置进度",
        onClick: () => askConfirm("重置后，这台设备上的星星、人物卡、打卡、错题本和成就都会清空。不会上传任何信息。", resetProgress),
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
  const stats = personStats(person);
  const story = stats.tier === "gold" ? stories.find((item) => item.id === person.id) : null;
  cardDialog.replaceChildren(
    el("div", { class: "card-top" }, [
      createAvatar(person, 96),
      el("div", {}, [
        el("h2", { id: "card-title", text: person.name }),
        el("p", { class: `tier-line tier-${stats.frame}`, text: stats.label }),
        el("p", { class: "meta", text: `${person.dynasty} · ${person.years}` }),
        el("p", { class: "role", text: person.role }),
      ]),
    ]),
    el("ul", { class: "deeds" }, person.deeds.map((deed) => el("li", { text: deed }))),
    person.quote ? el("blockquote", {}, [
      el("p", { text: person.quote }),
      person.quoteFrom ? el("cite", { text: person.quoteFrom }) : null,
    ]) : null,
    story ? el("div", { class: "story" }, [
      el("h3", { text: "小故事" }),
      el("p", { text: story.text }),
      el("p", { class: "source", text: `来源：${story.source}` }),
    ]) : el("p", { class: "hint", text: "金卡打开后可以读一小段故事。" }),
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
  saveSession(rules.sideKey, null);
  progress = loadProgress(rules.storageKey);
  applyFont();
  say("进度已重置");
  go("#/");
}

async function boot() {
  try {
    const [ruleDoc, chapterDoc, characterDoc, storyDoc] = await Promise.all([
      loadJson("data/rules.json"),
      loadJson("data/chapters.json"),
      loadJson("data/characters.json"),
      loadJson("data/stories.json"),
    ]);
    rules = ruleDoc;
    chapters = chapterDoc.chapters;
    characters = characterDoc.characters;
    stories = storyDoc.stories;
    const packs = await Promise.all(chapters.map((chapter) => loadJson(`data/questions/${chapter.id}.json`)));
    questions = packs.flatMap((pack) => pack.questions);
    progress = loadProgress(rules.storageKey);
    progress = evaluateAchievements(progress, {
      characters,
      questions,
      chapterIds: chapters.map((chapter) => chapter.id),
      today: todayKey(new Date()),
    }).progress;
    persist();
    window.addEventListener("hashchange", draw);
    draw();
  } catch (error) {
    renderFatal(error);
  }
}

boot();
