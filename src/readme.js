const ROOT_README_NAMES = [
  "readme.md",
  "readme.mdx",
  "readme.rst",
  "readme.adoc",
  "readme.txt",
  "readme"
];

export function selectRootReadme(items) {
  for (const name of ROOT_README_NAMES) {
    const match = items.find((item) => {
      const itemPath = String(item?.path || "").replaceAll("\\", "/");
      return !itemPath.includes("/") && itemPath.toLowerCase() === name;
    });
    if (match) {
      return match;
    }
  }
  return null;
}
