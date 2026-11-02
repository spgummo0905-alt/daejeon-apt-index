// 프로젝트 작업 화면의 검색·선택·패널 주소 규칙. UI와 분리해 검증합니다.
(function () {
  const kinds = ["detail", "field", "compare", "course", "finder", "history"];
  function search(complexes, { query = "", district = "", maxPrice = "" } = {}) {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const budget = maxPrice === "" ? null : Number(maxPrice);
    if (budget !== null && (!Number.isFinite(budget) || budget <= 0)) return [];
    return complexes.filter(c => (!district || c.gu === district)
      && (budget === null || c.p != null && c.p <= budget * 10000)
      && words.every(w => [c.n, c.gu, c.d, c.stn || ""].join(" ").toLocaleLowerCase().includes(w)));
  }
  function selection(slugs, bySlug) {
    const list = [...new Set(slugs)].filter(s => typeof s === "string" && Object.hasOwn(bySlug, s));
    return { list, compare: list.length >= 2 && list.length <= 4,
      course: list.length >= 2 && list.length <= 8 && list.every(s => Number.isFinite(bySlug[s].la) && Number.isFinite(bySlug[s].ln)) };
  }
  function url(kind, { slug, slugs = [], projectId = "" } = {}) {
    if (!kinds.includes(kind) || kind === "history") return null;
    const q = new URLSearchParams({ workspace: "1", project: projectId });
    let path = kind + ".html", hash = "";
    if (kind === "detail" || kind === "field") {
      if (typeof slug !== "string" || !/^[\w.-]{1,80}$/.test(slug)) return null;
      path = "apt/" + encodeURIComponent(slug) + ".html";
      if (kind === "field") { q.set("view", "field"); hash = "#field"; }
    }
    if (kind === "compare") q.set("s", slugs.join(","));
    if (kind === "course") { q.set("c", slugs.join(",")); q.set("m", "walk"); q.set("from", "project"); }
    return path + "?" + q + hash;
  }
  window.DJProjectFlow = { search, selection, url, kinds };
})();
