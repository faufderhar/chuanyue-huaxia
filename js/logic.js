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

export const ACHIEVEMENTS = [
  { id: "first-pass", name: "初过一关", detail: "任意一章第一次过关" },
  { id: "three-star", name: "三星章节", detail: "任意一章拿到 3 星" },
  { id: "all-pass", name: "长河走通", detail: "九个章节都至少过关一次" },
  { id: "all-three", name: "满天星", detail: "九个章节都拿到过 3 星" },
  { id: "row-ten", name: "十连对", detail: "连续答对 10 题" },
  { id: "master-twenty", name: "掌握二十", detail: "错题本里累计掌握 20 题" },
  { id: "gold-ten", name: "十张金卡", detail: "集齐 10 张金卡" },
  { id: "week-streak", name: "连续一周", detail: "连续打卡达到 7 天" },
];

export const STREAK_BADGES = [
  { days: 3, name: "三日" },
  { days: 7, name: "七日" },
  { days: 30, name: "三十日" },
];

const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((item) => item.id));

export function emptyProgress() {
  return {
    v: 2,
    difficulty: null,
    chapters: {},
    checkin: { lastDate: "", streak: 0, best: 0 },
    dailyDone: {},
    wrong: {},
    mastered: 0,
    persons: {},
    achievements: [],
    correctStreak: 0,
  };
}

function copyChapters(chapters) {
  if (!chapters || typeof chapters !== "object" || Array.isArray(chapters)) return {};
  return chapters;
}

function copyStringList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  value.forEach((item) => {
    if (typeof item === "string" && item) seen.add(item);
  });
  return [...seen];
}

/** 把 v1 旧存档补成 v2。星星和过关记录原样保留。 */
export function migrateProgress(raw) {
  const blank = emptyProgress();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return blank;
  if (raw.v !== 1 && raw.v !== 2) return blank;
  blank.difficulty = raw.difficulty === "primary" || raw.difficulty === "junior" ? raw.difficulty : null;
  blank.chapters = copyChapters(raw.chapters);
  if (raw.v !== 2) return blank;
  const checkin = raw.checkin && typeof raw.checkin === "object" ? raw.checkin : {};
  blank.checkin = {
    lastDate: typeof checkin.lastDate === "string" ? checkin.lastDate : "",
    streak: Number.isInteger(checkin.streak) && checkin.streak > 0 ? checkin.streak : 0,
    best: Number.isInteger(checkin.best) && checkin.best > 0 ? checkin.best : 0,
  };
  blank.dailyDone = raw.dailyDone && typeof raw.dailyDone === "object" && !Array.isArray(raw.dailyDone) ? raw.dailyDone : {};
  const wrong = {};
  if (raw.wrong && typeof raw.wrong === "object" && !Array.isArray(raw.wrong)) {
    Object.entries(raw.wrong).forEach(([id, info]) => {
      if (!info || typeof info !== "object") return;
      wrong[id] = {
        misses: Number.isInteger(info.misses) && info.misses > 0 ? info.misses : 1,
        chapterId: typeof info.chapterId === "string" ? info.chapterId : "",
        difficulty: info.difficulty === "junior" ? "junior" : "primary",
      };
    });
  }
  blank.wrong = wrong;
  blank.mastered = Number.isInteger(raw.mastered) && raw.mastered > 0 ? raw.mastered : 0;
  const persons = {};
  if (raw.persons && typeof raw.persons === "object" && !Array.isArray(raw.persons)) {
    Object.entries(raw.persons).forEach(([id, list]) => {
      const cleaned = copyStringList(list);
      if (cleaned.length) persons[id] = cleaned;
    });
  }
  blank.persons = persons;
  blank.achievements = copyStringList(raw.achievements).filter((id) => ACHIEVEMENT_IDS.has(id));
  blank.correctStreak = Number.isInteger(raw.correctStreak) && raw.correctStreak > 0 ? raw.correctStreak : 0;
  return blank;
}

export function todayKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function daysBetween(earlier, later) {
  const parse = (value) => {
    const [year, month, day] = String(value).split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(later) - parse(earlier)) / 86400000);
}

export function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function byId(a, b) {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/** 同一天、同一难度选出同一题。纪念日匹配时只在这些题里抽。 */
export function pickDailyQuestion(questions, difficulty, dateStr) {
  const pool = questions.filter((question) => question.difficulty === difficulty);
  if (!pool.length || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "")) return null;
  const monthDay = dateStr.slice(5);
  const anniversary = pool.filter((question) => question.anniversary === monthDay).sort(byId);
  const source = anniversary.length ? anniversary : pool.slice().sort(byId);
  return source[hashSeed(`${dateStr}|${difficulty}`) % source.length];
}

export function visibleStreak(checkin, today) {
  if (!checkin || !checkin.lastDate || !checkin.streak) return 0;
  const gap = daysBetween(checkin.lastDate, today);
  if (gap < 0 || gap > 1) return gap < 0 ? checkin.streak : 0;
  return checkin.streak;
}

export function applyCheckin(progress, today, record) {
  const next = structuredClone(progress);
  if (next.dailyDone[today]) return { progress: next, counted: false };
  const last = next.checkin.lastDate;
  let streak = 1;
  if (last) {
    const gap = daysBetween(last, today);
    if (gap === 1) streak = (next.checkin.streak || 0) + 1;
    else if (gap <= 0) streak = next.checkin.streak || 1;
  }
  next.checkin = {
    lastDate: today,
    streak,
    best: Math.max(next.checkin.best || 0, streak),
  };
  next.dailyDone[today] = {
    questionId: record.questionId,
    correct: Boolean(record.correct),
    difficulty: record.difficulty,
  };
  return { progress: next, counted: true };
}

/** 答错收录，答对移出。同一题只保留一条，多次答错累加次数。 */
export function noteAnswer(progress, question, correct) {
  const next = structuredClone(progress);
  const id = question.id;
  if (correct) {
    if (next.wrong[id]) {
      delete next.wrong[id];
      next.mastered += 1;
    }
    next.correctStreak += 1;
    const persons = Array.isArray(question.persons) ? question.persons : [];
    persons.forEach((personId) => {
      if (!next.persons[personId]) next.persons[personId] = [];
      if (!next.persons[personId].includes(id)) next.persons[personId].push(id);
    });
  } else {
    next.correctStreak = 0;
    const previous = next.wrong[id];
    next.wrong[id] = {
      misses: previous ? previous.misses + 1 : 1,
      chapterId: question.chapterId,
      difficulty: question.difficulty,
    };
  }
  return next;
}

export function pickReview(wrong, questions, limit = 10) {
  const rows = Object.keys(wrong || {})
    .map((id) => ({
      id,
      misses: wrong[id] && wrong[id].misses ? wrong[id].misses : 0,
      question: questions.find((item) => item.id === id),
    }))
    .filter((row) => row.question);
  rows.sort((a, b) => b.misses - a.misses || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return rows.slice(0, limit).map((row) => row.question);
}

export function linkedQuestions(questions, personId) {
  return questions.filter((question) => Array.isArray(question.persons) && question.persons.includes(personId));
}

export function personCorrectCount(progress, personId) {
  const list = progress.persons[personId];
  return Array.isArray(list) ? list.length : 0;
}

/** 1 铜，3 银，满 5 道或答完所有关联题为金。 */
export function cardTier(correctCount, linkedTotal) {
  if (linkedTotal <= 0 || correctCount <= 0) return "none";
  if (correctCount >= Math.min(5, linkedTotal)) return "gold";
  if (correctCount >= 3) return "silver";
  return "bronze";
}

export function frameTier(progress, person, linkedTotal) {
  const tier = cardTier(personCorrectCount(progress, person.id), linkedTotal);
  if (tier !== "none") return tier;
  if (isChapterUnlocked(progress, person.chapterId)) return "bronze";
  return "none";
}

export function evaluateAchievements(progress, { characters, questions, chapterIds, today }) {
  const earned = new Set(progress.achievements || []);
  const fresh = [];
  const grant = (id, ok) => {
    if (ok && !earned.has(id)) {
      earned.add(id);
      fresh.push(id);
    }
  };
  const recordOf = (chapterId, difficulty) => {
    const chapter = progress.chapters[chapterId] || {};
    return chapter[difficulty];
  };
  grant("first-pass", chapterIds.some((id) => isChapterUnlocked(progress, id)));
  grant("three-star", chapterIds.some((id) => ["primary", "junior"].some((difficulty) => {
    const record = recordOf(id, difficulty);
    return record && record.bestStars >= 3;
  })));
  grant("all-pass", chapterIds.length > 0 && chapterIds.every((id) => isChapterUnlocked(progress, id)));
  grant("all-three", chapterIds.length > 0 && chapterIds.every((id) => ["primary", "junior"].some((difficulty) => {
    const record = recordOf(id, difficulty);
    return record && record.bestStars >= 3;
  })));
  grant("row-ten", (progress.correctStreak || 0) >= 10);
  grant("master-twenty", (progress.mastered || 0) >= 20);
  const golds = characters.filter((person) => {
    const linked = linkedQuestions(questions, person.id).length;
    return cardTier(personCorrectCount(progress, person.id), linked) === "gold";
  }).length;
  grant("gold-ten", golds >= 10);
  const streak = Math.max(progress.checkin.best || 0, visibleStreak(progress.checkin, today));
  grant("week-streak", streak >= 7);
  const next = structuredClone(progress);
  next.achievements = ACHIEVEMENTS.map((item) => item.id).filter((id) => earned.has(id));
  return { progress: next, fresh };
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
