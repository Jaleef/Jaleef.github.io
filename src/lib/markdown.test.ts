import { describe, expect, it } from "vitest";
import { extractMath, restoreMath } from "./markdown";

describe("extractMath", () => {
  it("识别行内公式并替换成占位符", () => {
    const { markdown, expressions } = extractMath("质能方程 $E = mc^2$ 很简洁。");
    expect(expressions).toEqual([{ latex: "E = mc^2", display: false }]);
    expect(markdown).not.toContain("$");
    expect(markdown).toContain("质能方程 ");
  });

  it("识别块级公式", () => {
    const { expressions } = extractMath("$$\n\\int_0^1 x^2 dx\n$$");
    expect(expressions).toHaveLength(1);
    expect(expressions[0].display).toBe(true);
    expect(expressions[0].latex).toContain("\\int_0^1");
  });

  it("代码块里的美元符号不会被当成公式", () => {
    const source = "```bash\necho $HOME $PATH\n```";
    const { expressions, markdown } = extractMath(source);
    expect(expressions).toEqual([]);
    expect(markdown).toBe(source);
  });

  it("多行正文里按出现顺序编号", () => {
    const { expressions } = extractMath("$a$ 与 $b$");
    expect(expressions.map((item) => item.latex)).toEqual(["a", "b"]);
  });

  it("纯文本原样返回", () => {
    const source = "没有公式的一行文字";
    expect(extractMath(source)).toEqual({ markdown: source, expressions: [] });
  });
});

describe("restoreMath", () => {
  it("把占位符换回包好的渲染结果", () => {
    const html = '<p>行内 \uE000math:0\uE001 与块级</p><p>\uE000math:1\uE001</p>';
    const restored = restoreMath(html, [
      { latex: "a^2", display: false },
      { latex: "b^2", display: true },
    ]);
    expect(restored).toContain('<span class="math-inline">');
    expect(restored).toContain('<div class="math-block">');
    expect(restored).toContain("katex");
    expect(restored).not.toContain("math:0");
  });

  it("没有公式时原样返回", () => {
    expect(restoreMath("<p>hi</p>", [])).toBe("<p>hi</p>");
  });
});
