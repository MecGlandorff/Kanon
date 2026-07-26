import {
  add,
  byPath,
  finish,
  primaryEntrypoints,
  rootReadme
} from "./curate-common.js";

export function curateRust(ranked) {
  const selected = [];
  add(selected, rootReadme(ranked), "root usage contract");
  add(selected, byPath(ranked, "Cargo.toml"), "Cargo project contract");
  add(
    selected,
    primaryEntrypoints(ranked).find((item) => item.path.endsWith(".rs")),
    "primary Rust executable"
  );
  add(
    selected,
    byPath(ranked, "justfile") || byPath(ranked, "Justfile"),
    "Rust task contract"
  );
  return finish(selected, ranked);
}
