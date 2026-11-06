// 프로젝트는 후보의 묶음입니다. 기존 관심 단지·코스·임장 노트는 옮기거나 지우지 않습니다.
(function () {
  const PREFIX = "project:", MAX = 100;
  const idOK = id => typeof id === "string" && /^[a-z0-9-]{1,64}$/.test(id);
  const slugOK = s => typeof s === "string" && /^[\w.-]{1,80}$/.test(s);
  // 방문 예정일(선택): 'YYYY-MM-DD' 또는 빈 값. 새 칸을 선택 항목으로만 더하고 버전은 1 그대로(버전을 올리면 옛 화면을 가진 기기에서 프로젝트가 통째로 안 보임).
  // 이 칸이 없는 기존 프로젝트는 예정일 없음으로 읽히고 한 글자도 바뀌지 않음. 실제 방문 기록(visitlog:)과는 따로 두고 날짜로만 견줌.
  const dateShape = s => { if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + "T12:00:00Z"); return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s; };
  const plannedOf = v => (dateShape(v) ? v : "");
  const KNOWN = new Set(["version", "id", "name", "goal", "region", "slugs", "archived", "created", "updated", "planned"]);
  const clean = value => {
    if (!value || value.version !== 1 || !idOK(value.id) || typeof value.name !== "string" || !value.name.trim()
      || typeof value.region !== "string" || !value.region || !Array.isArray(value.slugs)) return null;
    // 앞으로 더해질 칸(이 코드가 아직 모르는 칸)도 읽고 다시 저장할 때 지우지 않고 그대로 이어 줌: 새 칸을 만든 기기의 값을 옛 화면이 수정하며 잃는 일을 막기 위함
    // (실제로 4-B3 의 planned 가 옛 코드의 수정에서 사라지는 것을 시험으로 재현함). 알려진 칸은 아래에서 다시 검사한 값으로 덮고, 모르는 칸은 단순 값·최대 20개까지만
    const extra = {};
    Object.keys(value).filter(k => !KNOWN.has(k) && /^[a-z][a-zA-Z0-9]{0,23}$/.test(k)).slice(0, 20).forEach(k => {
      const v = value[k]; if (v === null || ["string", "number", "boolean"].includes(typeof v) && String(v).length <= 400) extra[k] = v;
    });
    return { ...extra, version: 1, id: value.id, name: value.name.slice(0, 50), goal: String(value.goal || "").slice(0, 200),
      region: value.region, slugs: [...new Set(value.slugs.filter(slugOK))].slice(0, MAX), archived: !!value.archived,
      created: Number(value.created) || 0, updated: Number(value.updated) || 0, planned: plannedOf(value.planned) };
  };
  function read(id) {
    if (!idOK(id)) return null;
    const p = clean(DJ.load(PREFIX + id, null));
    return p && p.id === id ? p : null;
  }
  function list(region) {
    return DJ.records.keys().filter(k => k.startsWith(PREFIX)).map(k => read(k.slice(PREFIX.length))).filter(p => p && (!region || p.region === region))
      .sort((a, b) => Number(a.archived) - Number(b.archived) || b.updated - a.updated);
  }
  function fields(name, goal) {
    name = String(name || "").trim(); goal = String(goal || "").trim();
    if (!name || name.length > 50 || goal.length > 200) throw new Error("fields");
    return { name, goal };
  }
  function save(p) {
    if (DJ.locked() || !DJ.save(PREFIX + p.id, p)) throw new Error("save");
    return p;
  }
  function create(name, goal, region) {
    if (!region || list().filter(p => !p.archived).length >= MAX) throw new Error("limit");
    const id = crypto.randomUUID();
    if (DJ.load(PREFIX + id, null) !== null) throw new Error("conflict");
    const now = Date.now();
    return save({ version: 1, id, ...fields(name, goal), region, slugs: [], archived: false, created: now, updated: now, planned: "" });
  }
  function update(id, region, expected, patch) {
    const p = read(id);
    if (!p || p.region !== region) throw new Error("missing");
    if (p.updated !== expected) throw new Error("conflict");
    const next = { ...p, ...fields(patch.name ?? p.name, patch.goal ?? p.goal) };
    if (patch.slugs !== undefined) {
      if (!Array.isArray(patch.slugs) || patch.slugs.length > MAX || !patch.slugs.every(slugOK)) throw new Error("limit");
      next.slugs = [...new Set(patch.slugs)];
    }
    if (typeof patch.archived === "boolean") {
      if (p.archived && !patch.archived && list().filter(x => !x.archived).length >= MAX) throw new Error("limit");
      next.archived = patch.archived;
    }
    if (patch.planned !== undefined && patch.planned !== p.planned) {
      // 비우기는 언제든, 새 날짜는 오늘 이후만(이미 저장된 지난 날짜는 그대로 둘 수 있음)
      if (patch.planned !== "" && !(dateShape(patch.planned) && patch.planned >= DJ.today())) throw new Error("fields");
      next.planned = patch.planned;
    }
    next.updated = Math.max(Date.now(), p.updated + 1);
    return save(next);
  }
  window.DJProjects = { list, read, create, update, MAX };
})();
