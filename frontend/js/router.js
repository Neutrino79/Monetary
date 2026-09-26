(function (global) {
  "use strict";

  const routes = []; // { pattern: RegExp, keys: [...], page }

  function register(path, page) {
    const keys = [];
    const pattern = new RegExp("^" + path.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return "([^/]+)"; }) + "$");
    routes.push({ pattern, keys, page });
  }

  function currentPath() {
    return (location.hash || "#/dashboard").slice(1);
  }

  function match(path) {
    for (const r of routes) {
      const m = path.match(r.pattern);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { page: r.page, params };
      }
    }
    return null;
  }

  let mountEl = null;
  let current = null;
  let generation = 0;

  // A page whose render() schedules delayed work (e.g. a fake-loading
  // setTimeout) should call Router.isCurrent(token) before applying that
  // work, so a stale timer can't clobber whatever page the user has since
  // navigated to — the physical mount element is reused across routes, so
  // without this guard a slow-loading page can "win" a race against
  // whatever the user navigated to next.
  function beginRender() { return ++generation; }
  function isCurrent(token) { return token === generation; }

  function render() {
    const path = currentPath();
    const found = match(path) || match("/dashboard");
    if (!mountEl) return;
    current = found;
    generation++;
    mountEl.innerHTML = "";
    global.App.setActiveRoute(path);
    found.page.render(mountEl, found.params);
  }

  function rerenderCurrent() {
    if (current && mountEl) {
      generation++;
      mountEl.innerHTML = "";
      current.page.render(mountEl, current.params);
    }
  }

  function init(el) {
    mountEl = el;
    window.addEventListener("hashchange", render);
    render();
  }

  function go(path) { location.hash = "#" + path; }

  global.Router = { register, init, go, rerenderCurrent, currentPath, beginRender, isCurrent };
})(window);
