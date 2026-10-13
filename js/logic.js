/**
 * 闯关纯函数：洗牌、抽题、判分、星级。
 * 星级阈值只读 data/rules.json，改配置即可，不必改这里的数字。
 */

/** Fisher–Yates 洗牌，返回新数组。 */
export function fisherYates(list, random = Math.random) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const current = copy[i];
    copy[i] = copy[j];
    copy[j] = current;
  }
  return copy;
}

export function moveItem(list, from, to) {
  const next = list.slice();
  if (from < 0 || to < 0 || from >= next.length || to >= next.length || from === to) {
    return next;
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * 从本章本题库抽 8–10 题。先保证选择、连连看、排序各至少 1 题，再用 Fisher–Yates 打乱。
 */
export function pickQuiz(questions, rules, random = Math.random) {
  const min = rules.questionsPerRun.min;
  const max = rules.questionsPerRun.max;
  const count = min + Math.floor(random() * (max - min + 1));
  const groups = { choice: [], match: [], order: [] };
  questions.forEach((question) => {
    if (groups[question.type]) groups[question.type].push(question);
  });
  Object.keys(groups).forEach((type) => {
    groups[type] = fisherYates(groups[type], random);
  });
  const picked = [];
  ["choice", "match", "order"].forEach((type) => {
    if (!groups[type].length) {
      throw new Error(`题库缺少题型：${type}`);
    }
    picked.push(groups[type].pop());
  });
  const rest = fisherYates(
    [...groups.choice, ...groups.match, ...groups.order],
    random
  );
  while (picked.length < count && rest.length) picked.push(rest.pop());
  return fisherYates(picked, random);
}

/** 把题目整理成这一次闯关要展示的样子，并打乱选项或顺序。 */
export function presentQuestion(question, random = Math.random) {
  const copy = structuredClone(question);
  if (copy.type === "choice") {
    const paired = copy.options.map((text, index) => ({ text, index }));
    const shuffled = fisherYates(paired, random);
    copy.options = shuffled.map((item) => item.text);
    copy.answer = shuffled.findIndex((item) => item.index === question.answer);
    return copy;
  }
  if (copy.type === "match") {
    const ids = copy.pairs.map((pair) => pair.id);
    copy.leftOrder = fisherYates(ids, random);
    copy.rightOrder = shuffleAvoiding(
      ids,
      (order) => order.join("|") === copy.leftOrder.join("|"),
      random
    );
    return copy;
  }
  if (copy.type === "order") {
    copy.initialOrder = shuffleAvoiding(
      copy.items.map((item) => item.id),
      (order) => gradeOrder(copy, order),
      random
    );
  }
  return copy;
}

export function shuffleAvoiding(list, sameAs, random = Math.random) {
  let current = fisherYates(list, random);
  let guard = 0;
  while (sameAs(current) && guard < 8) {
    current = fisherYates(list, random);
    guard += 1;
  }
  return current;
}

export function gradeChoice(question, index) {
  return index === question.answer;
}

export function gradeMatch(question, mapping) {
  return question.pairs.every((pair) => mapping[pair.id] === pair.id);
}

export function gradeOrder(question, ids) {
  return (
    question.answer.length === ids.length &&
    question.answer.every((id, index) => id === ids[index])
  );
}

/**
 * 100% 为 3 星；其余按 starBands 从高到低比较。
 * 用整数交叉相乘，避免小数误差。minPercent >= 100 的档必须全对。
 */
export function starsFor(correct, total, rules) {
  if (total <= 0 || correct < 0) return 0;
  const bands = rules.starBands.slice().sort((a, b) => b.minPercent - a.minPercent);
  for (let i = 0; i < bands.length; i += 1) {
    const band = bands[i];
    if (band.minPercent >= 100) {
      if (correct >= total) return band.stars;
      continue;
    }
    if (correct * 100 >= total * band.minPercent) return band.stars;
  }
  return 0;
}

export function isPass(correct, total, rules) {
  if (total <= 0) return false;
  return correct * 100 >= total * rules.passPercent;
}

export function formatPercent(correct, total) {
  if (total <= 0) return "0";
  const tenths = Math.round((correct * 1000) / total);
  const whole = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return decimal === 0 ? String(whole) : `${whole}.${decimal}`;
}

export function emptyProgress() {
  return { v: 1, difficulty: null, chapters: {} };
}

export function chapterRecord(progress, chapterId, difficulty) {
  const chapter = progress.chapters[chapterId] || {};
  return (
    chapter[difficulty] || {
      bestStars: 0,
      bestCorrect: 0,
      bestTotal: 0,
      passed: false,
      attempts: 0,
    }
  );
}

export function isChapterUnlocked(progress, chapterId) {
  const chapter = progress.chapters[chapterId] || {};
  return ["primary", "junior"].some((difficulty) => chapter[difficulty] && chapter[difficulty].passed);
}

export function applyAttempt(progress, chapterId, difficulty, attempt) {
  const next = structuredClone(progress);
  const wasUnlocked = isChapterUnlocked(next, chapterId);
  if (!next.chapters[chapterId]) next.chapters[chapterId] = {};
  const previous = chapterRecord(next, chapterId, difficulty);
  const previousScore =
    previous.bestStars * 1000 +
    (previous.bestTotal ? Math.round((previous.bestCorrect * 100) / previous.bestTotal) : 0);
  const nextScore = attempt.stars * 1000 + Math.round((attempt.correct * 100) / attempt.total);
  const record = {
    bestStars: previous.bestStars,
    bestCorrect: previous.bestCorrect,
    bestTotal: previous.bestTotal,
    passed: previous.passed || attempt.passed,
    attempts: previous.attempts + 1,
  };
  if (nextScore >= previousScore) {
    record.bestStars = attempt.stars;
    record.bestCorrect = attempt.correct;
    record.bestTotal = attempt.total;
  }
  next.chapters[chapterId][difficulty] = record;
  return {
    progress: next,
    newlyUnlocked: !wasUnlocked && isChapterUnlocked(next, chapterId),
    improved: nextScore > previousScore,
  };
}

export function totalStars(progress, difficulty) {
  return Object.values(progress.chapters).reduce((sum, chapter) => {
    const record = chapter[difficulty];
    return sum + (record ? record.bestStars : 0);
  }, 0);
}
