(function () {
  var INDEX_URL = "/help/search-index.json";
  var MAX_RESULTS = 40;
  var idx = null;
  var loading = false;
  var widgets = [];

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ensureHeaderSearch() {
    if (document.getElementById("help-q")) return;
    var headerWrap = document.querySelector("header.site .wrap");
    if (!headerWrap) return;
    var wrap = document.createElement("div");
    wrap.className = "search search-header";
    wrap.innerHTML =
      '<input id="help-q" type="search" autocomplete="off" placeholder="Search all help articles" aria-label="Search all help articles">' +
      '<div id="help-results" class="search-results" hidden></div>';
    var nav = headerWrap.querySelector("nav");
    if (nav) headerWrap.insertBefore(wrap, nav);
    else headerWrap.appendChild(wrap);
  }

  function collectWidgets() {
    widgets = [];
    var pairs = [
      ["help-q", "help-results"],
      ["q", "results"],
    ];
    pairs.forEach(function (ids) {
      var input = document.getElementById(ids[0]);
      var box = document.getElementById(ids[1]);
      if (input && box) widgets.push({ input: input, box: box, active: -1 });
    });
  }

  function loadIndex() {
    if (idx || loading) return;
    loading = true;
    fetch(INDEX_URL)
      .then(function (response) {
        if (!response.ok) throw new Error("Search index missing");
        return response.json();
      })
      .then(function (data) {
        idx = Array.isArray(data) ? data : [];
        loading = false;
        widgets.forEach(function (widget) {
          if (widget.input.value) run(widget);
        });
      })
      .catch(function () {
        loading = false;
      });
  }

  function countMatches(hay, term) {
    var count = 0;
    var from = 0;
    while (term && hay.indexOf(term, from) !== -1) {
      count += 1;
      from = hay.indexOf(term, from) + term.length;
      if (count > 12) break;
    }
    return count;
  }

  function snippetFor(article, terms) {
    var source = article.b || article.s || "";
    var lower = source.toLowerCase();
    var at = -1;
    for (var i = 0; i < terms.length; i++) {
      at = lower.indexOf(terms[i]);
      if (at !== -1) break;
    }
    if (at < 0) at = 0;
    var start = Math.max(0, at - 72);
    var chunk = source.slice(start, start + 160).replace(/\s+/g, " ").trim();
    if (start > 0) chunk = "…" + chunk;
    if (start + 160 < source.length) chunk += "…";
    var safe = escapeHtml(chunk);
    terms.forEach(function (term) {
      if (term.length < 2) return;
      var re = new RegExp("(" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
      safe = safe.replace(re, "<mark>$1</mark>");
    });
    return safe;
  }

  function searchArticles(query) {
    var q = query.trim().toLowerCase().replace(/\s+/g, " ");
    if (!q || !idx) return [];
    var terms = q.split(" ").filter(function (term) {
      return term.length > 1;
    });
    if (!terms.length) terms = [q];

    return idx
      .map(function (article) {
        var title = (article.t || "").toLowerCase();
        var category = (article.c || "").toLowerCase();
        var keywords = (article.k || "").toLowerCase();
        var body = (article.b || article.s || "").toLowerCase();
        var hay = title + " " + category + " " + keywords + " " + body;
        var score = 0;

        for (var i = 0; i < terms.length; i++) {
          var term = terms[i];
          if (hay.indexOf(term) === -1) return null;
          if (title === term) score += 50;
          if (title.indexOf(term) !== -1) score += 20;
          if (keywords.indexOf(term) !== -1) score += 8;
          if (category.indexOf(term) !== -1) score += 5;
          score += Math.min(countMatches(body, term), 8);
        }

        return { article: article, score: score, terms: terms };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return b.score - a.score || a.article.t.localeCompare(b.article.t);
      })
      .slice(0, MAX_RESULTS);
  }

  function render(widget, hits, query) {
    var box = widget.box;
    widget.active = -1;
    if (!query) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    if (!idx) {
      box.innerHTML = '<div class="empty">Searching…</div>';
      box.hidden = false;
      return;
    }
    if (!hits.length) {
      box.innerHTML =
        '<div class="empty">No articles match “' +
        escapeHtml(query) +
        '”. Try a different word, or browse by topic.</div>';
      box.hidden = false;
      return;
    }
    box.innerHTML =
      '<div class="search-count">' +
      hits.length +
      (hits.length === MAX_RESULTS ? "+" : "") +
      " matching article" +
      (hits.length === 1 ? "" : "s") +
      "</div>" +
      hits
        .map(function (hit) {
          return (
            '<a href="' +
            escapeHtml(hit.article.u) +
            '"><div class="t">' +
            escapeHtml(hit.article.t) +
            '</div><div class="c">' +
            escapeHtml(hit.article.c) +
            '</div><div class="s">' +
            snippetFor(hit.article, hit.terms) +
            "</div></a>"
          );
        })
        .join("");
    box.hidden = false;
  }

  function run(widget) {
    var query = widget.input.value;
    render(widget, searchArticles(query), query.trim());
  }

  function moveActive(widget, delta) {
    var links = widget.box.querySelectorAll("a");
    if (!links.length) return;
    widget.active = (widget.active + delta + links.length) % links.length;
    links.forEach(function (link, index) {
      link.classList.toggle("is-active", index === widget.active);
    });
    links[widget.active].scrollIntoView({ block: "nearest" });
  }

  function bind(widget) {
    widget.input.addEventListener("focus", loadIndex);
    widget.input.addEventListener("input", function () {
      loadIndex();
      run(widget);
    });
    widget.input.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActive(widget, 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActive(widget, -1);
      } else if (event.key === "Enter") {
        var links = widget.box.querySelectorAll("a");
        var target = links[widget.active] || (links.length === 1 ? links[0] : null);
        if (target) {
          event.preventDefault();
          window.location.href = target.href;
        }
      } else if (event.key === "Escape") {
        widget.box.hidden = true;
        widget.input.blur();
      }
    });
  }

  function init() {
    ensureHeaderSearch();
    collectWidgets();
    widgets.forEach(function (widget) {
      widget.box.hidden = true;
      bind(widget);
    });
    loadIndex();
    document.addEventListener("click", function (event) {
      widgets.forEach(function (widget) {
        if (!widget.box.contains(event.target) && event.target !== widget.input) {
          widget.box.hidden = true;
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
