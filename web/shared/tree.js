// the pick list's rows (ui.js menu), apart from the page so that tests/test_tree.mjs can run them in node

export function tree(values, current) {
  // a list of files goes into folders ("dir\file.ext" on Windows); samplers, presets, seeds stay flat, in their order
  const files = values.length > 0 && values.every((v) => /\.\w{1,12}$/.test(v))
  const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare // emoji first, v2 < v10
  const split = (v) => (files ? String(v).split(/[\\/]/) : [String(v)])
  const items = values.map((v) => ({ value: String(v), parts: split(v) }))
  const cur = current == null ? null : String(current), onPath = cur == null ? [] : split(cur)
  const inside = (parts, path) => parts.length > path.length && path.every((x, i) => parts[i] === x)
  // dirs: the folders a search hit lies in; inside a folder they go without saying
  const file = ({ value, parts }, dirs) => ({ kind: "file", name: parts.at(-1), value, dirs, cur: value === cur })
  return {
    files,
    view(at, query) {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean)
      if (words.length) {
        const hits = items.filter(({ value }) => words.every((w) => value.toLowerCase().includes(w)))
        if (files) hits.sort((a, b) => byName(a.value, b.value))
        return hits.map((it) => file(it, it.parts.slice(0, -1)))
      }
      const dirs = new Map(), here = []
      for (const it of items.filter(({ parts }) => inside(parts, at))) {
        if (it.parts.length > at.length + 1) dirs.set(it.parts[at.length], (dirs.get(it.parts[at.length]) ?? 0) + 1)
        else here.push(it)
      }
      if (files) here.sort((a, b) => byName(a.parts.at(-1), b.parts.at(-1)))
      const lit = onPath.length > at.length + 1 && inside(onPath, at) ? onPath[at.length] : null
      return [
        ...(at.length ? [{ kind: "back", name: at.join(" › "), path: at.slice(0, -1) }] : []),
        ...[...dirs].sort(([a], [b]) => byName(a, b))
          .map(([name, count]) => ({ kind: "dir", name, path: [...at, name], count, cur: name === lit })),
        ...here.map((it) => file(it, [])),
      ]
    },
  }
}
