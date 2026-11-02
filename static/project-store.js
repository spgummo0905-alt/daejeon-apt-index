// 프로젝트는 후보의 묶음입니다. 기존 관심 단지·코스·임장 노트는 옮기거나 지우지 않습니다.
(function () {
  const PREFIX = "project:", MAX = 100;
  const idOK = id => typeof id === "string" && /^[a-z0-9-]{1,64}$/.test(id);
  const slugOK = s => typeof s === "string" && /^[\w.-]{1,80}$/.test(s);
  const clean = value => {
    if (!value || value.version !== 1 || !idOK(value.id) || typeof value.name !== "string" || !value.name.trim()
      || typeof value.region !== "string" || !value.region || !Array.isArray(value.slugs)) return null;
    return { version: 1, id: value.id, name: value.name.slice(0, 50), goal: String(value.goal || "").slice(0, 200),
      region: value.region, slugs: [...new Set(value.slugs.filter(slugOK))].slice(0, MAX), archived: !!value.archived,
      created: Number(value.created) || 0, updated: Number(value.updated) || 0 };
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
    return save({ version: 1, id, ...fields(name, goal), region, slugs: [], archived: false, created: now, updated: now });
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
    next.updated = Math.max(Date.now(), p.updated + 1);
    return save(next);
  }
  window.DJProjects = { list, read, create, update, MAX };
})();
