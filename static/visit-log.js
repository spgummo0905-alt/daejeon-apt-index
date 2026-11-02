// 방문마다 독립된 기록을 남깁니다. 단지 공통 메모·사진과 기존 코스는 바꾸지 않습니다.
(function () {
  const PREFIX = "visitlog:";
  const idOK = s => typeof s === "string" && /^[a-z0-9-]{1,64}$/.test(s);
  const slugOK = s => typeof s === "string" && /^[\w.-]{1,80}$/.test(s);
  const periods = ["", "아침", "낮", "저녁", "밤"];
  const checksOK = c => c === null || c && Array.isArray(c.c) && c.c.length <= 100 && c.c.every(v => typeof v === "boolean")
    && c.x && typeof c.x === "object" && !Array.isArray(c.x) && Object.keys(c.x).length <= 100
    && Object.values(c.x).every(v => typeof v === "boolean") && Array.isArray(c.labels) && c.labels.length <= 200
    && c.labels.every(item => item && typeof item.label === "string" && item.label.length <= 200 && typeof item.on === "boolean");
  function dateOK(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + "T12:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s && s <= DJ.today();
  }
  function read(id) {
    if (!idOK(id)) return null;
    const v = DJ.load(PREFIX + id, null);
    return v && v.version === 1 && v.id === id && !v.deleted && slugOK(v.slug) && typeof v.region === "string"
      && dateOK(v.date) && periods.includes(v.period) && typeof v.memo === "string" && v.memo.length <= 2000
      && (!v.projectId || idOK(v.projectId)) && Number.isFinite(v.created) && v.created > 0 && checksOK(v.checks) ? v : null;
  }
  function list({ region, slug, projectId } = {}) {
    return DJ.records.keys().filter(k => k.startsWith(PREFIX)).map(k => read(k.slice(PREFIX.length)))
      .filter(v => v && (!region || v.region === region) && (!slug || v.slug === slug) && (!projectId || v.projectId === projectId))
      .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created || b.id.localeCompare(a.id));
  }
  function save(v) {
    if (DJ.locked() || !DJ.save(PREFIX + v.id, v)) throw new Error("save");
    return v;
  }
  function create({ region, slug, projectId = "", date, period = "", memo = "", snapshot }) {
    memo = String(memo).trim();
    if (!region || !slugOK(slug) || !dateOK(date) || !periods.includes(period) || memo.length > 2000) throw new Error("fields");
    if (projectId) {
      const p = window.DJProjects?.read(projectId);
      if (!p || p.region !== region || p.archived || !p.slugs.includes(slug)) throw new Error("project");
    }
    // 사진 참조는 복제하지 않습니다. 사진을 지운 뒤에도 날짜별 기록이 깨지지 않게 합니다.
    const checks = snapshot ? {
      c: (Array.isArray(snapshot.c) ? snapshot.c : []).slice(0, 100).map(Boolean),
      x: Object.fromEntries(Object.entries(snapshot.x || {}).filter(([k]) => /^[\w.-]{1,80}$/.test(k)).slice(0, 100).map(([k, v]) => [k, !!v])),
      labels: (Array.isArray(snapshot.labels) ? snapshot.labels : []).slice(0, 200).map(item => ({ label: String(item.label).slice(0, 200), on: !!item.on })),
    } : null;
    if (!memo && !checks) throw new Error("empty");
    const id = crypto.randomUUID();
    if (DJ.load(PREFIX + id, null) !== null) throw new Error("conflict");
    return save({ version: 1, id, region, slug, projectId, date, period, memo, checks, created: Date.now() });
  }
  function remove(id, expected) {
    const v = read(id);
    if (!v || v.created !== expected) throw new Error("conflict");
    // 삭제 표시를 동기화해 다른 기기에서 이전 기록이 살아나지 않게 합니다.
    return save({ version: 1, id, deleted: true, created: v.created });
  }
  window.DJVisitLog = { list, read, create, remove, periods };
})();
