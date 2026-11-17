import { describe, it, expect } from "vitest";
import {
  invisibles,
  multipleSpaces,
  trailingSpaces,
  multipleLineBreaks,
  typography,
  markdown,
  html,
  urls,
  emojis,
  clean,
  DEFAULT_RULES,
  titleCase,
  lowercase,
  uppercase,
} from "../clean/rules.js";

describe("invisibles", () => {
  it("removes zero-width chars and BOM", () => {
    expect(invisibles("a​b‌c‍d﻿e")).toBe("abcde");
  });
  it("turns no-break and narrow no-break spaces into normal spaces", () => {
    expect(invisibles("10 € y 5 %")).toBe("10 € y 5 %");
  });
});

describe("multipleSpaces", () => {
  it("collapses spaces and tabs between words", () => {
    expect(multipleSpaces("a    b\t\tc")).toBe("a b c");
  });
  it("keeps leading indentation", () => {
    expect(multipleSpaces("    code  here")).toBe("    code here");
  });
});

describe("trailingSpaces", () => {
  it("removes spaces at end of each line", () => {
    expect(trailingSpaces("a  \nb\t\nc")).toBe("a\nb\nc");
  });
});

describe("multipleLineBreaks", () => {
  it("keeps one blank line between paragraphs", () => {
    expect(multipleLineBreaks("a\n\n\n\nb")).toBe("a\n\nb");
  });
  it("treats lines with only spaces as blank", () => {
    expect(multipleLineBreaks("a\n  \n\t\n\nb")).toBe("a\n\nb");
  });
  it("leaves single line breaks and single blank lines alone", () => {
    expect(multipleLineBreaks("a\nb\n\nc")).toBe("a\nb\n\nc");
  });
});

describe("typography", () => {
  it("converts dashes, quotes and ellipsis", () => {
    expect(typography("“Hola” — dijo ‘él’ – «ya»…")).toBe(`"Hola" - dijo 'él' - "ya"...`);
  });
});

describe("markdown", () => {
  it("removes bold markers", () => {
    expect(markdown("This is **very** important and __this__ too")).toBe("This is very important and this too");
  });
  it("removes heading hashes", () => {
    expect(markdown("# Title\n## Sub\ntext #hashtag")).toBe("Title\nSub\ntext #hashtag");
  });
  it("converts * and + bullets to -", () => {
    expect(markdown("* one\n  + two\n- three")).toBe("- one\n  - two\n- three");
  });
  it("does not touch math or snake_case", () => {
    expect(markdown("2 * 3 = 6 and my_var_name")).toBe("2 * 3 = 6 and my_var_name");
  });
});

describe("html", () => {
  it("strips tags, scripts and decodes entities", () => {
    expect(html("<p>Hola &amp; <b>adiós</b></p><script>x()</script><div>fin&nbsp;ok</div>")).toBe(
      "Hola & adiós\nfin ok\n"
    );
  });
  it("keeps text that only looks like comparisons", () => {
    expect(html("a < b and c > d")).toBe("a < b and c > d");
  });
});

describe("urls", () => {
  it("removes http, https and www links", () => {
    expect(urls("see https://a.com/x?y=1 and www.b.es now")).toBe("see  and  now");
  });
});

describe("emojis", () => {
  it("removes emojis but keeps digits, # and *", () => {
    expect(emojis("I have 3 cats 🐱 #tag *note* 👍🏽")).toBe("I have 3 cats  #tag *note* ");
  });
  it("removes flags, keycaps and ZWJ sequences", () => {
    expect(emojis("a🇪🇸b1️⃣c👨‍👩‍👧d❤️e")).toBe("abcde");
  });
});

describe("clean (default rule set)", () => {
  it("uses the documented defaults", () => {
    expect(DEFAULT_RULES).toEqual({
      invisibles: true,
      html: false,
      urls: false,
      emojis: false,
      markdown: true,
      typography: false,
      multipleSpaces: true,
      trailingSpaces: true,
      multipleLineBreaks: true,
    });
  });

  it("cleans text pasted from an AI chat", () => {
    const input = "## Resumen\r\n\r\n\r\nEsto es  **importante**: ​\n\n\n* punto uno   \n* punto “dos”\n";
    expect(clean(input)).toBe("Resumen\n\nEsto es importante:\n\n- punto uno\n- punto “dos”");
  });

  it("applies optional rules when enabled and tidies the gaps", () => {
    const input = "Mira 👉 https://x.com/a ahora — “ya”";
    expect(clean(input, { urls: true, emojis: true, typography: true })).toBe(`Mira ahora - "ya"`);
  });

  it("can disable default rules", () => {
    expect(clean("**a**  b", { markdown: false, multipleSpaces: false })).toBe("**a**  b");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(clean("\n\n  \n")).toBe("");
  });
});

describe("case transforms", () => {
  it("title-cases accented words and keeps apostrophes", () => {
    expect(titleCase("élan ñandú DON'T stop l’ultimo hello-world")).toBe("Élan Ñandú Don't Stop L’ultimo Hello-World");
  });
  it("lower and upper", () => {
    expect(lowercase("ÀBC")).toBe("àbc");
    expect(uppercase("àbc")).toBe("ÀBC");
  });
});
