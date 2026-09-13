function renderMessageBody(container, text, useMarkdown = false) {
  const available =
    typeof window.marked?.parse === "function" &&
    typeof window.DOMPurify?.sanitize === "function" &&
    window.DOMPurify.isSupported;

  // User messages, notices, and missing-library cases remain plain text.
  if (!useMarkdown || !available) {
    container.classList.remove("markdown");
    container.textContent = text;
    return;
  }

  try {
    const html = window.marked.parse(text, {
      gfm: true,
      breaks: false,
      async: false
    });

    const fragment = window.DOMPurify.sanitize(html, {
      RETURN_DOM_FRAGMENT: true,

      ALLOWED_TAGS: [
        "p", "br", "strong", "em", "del",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "ul", "ol", "li", "blockquote",
        "pre", "code", "hr", "a",
        "table", "thead", "tbody", "tr", "th", "td"
      ],

      ALLOWED_ATTR: ["href", "title", "start"],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      ALLOWED_URI_REGEXP: /^https?:\/\//i
    });

    // Allow only explicit HTTP(S) links.
    for (const link of fragment.querySelectorAll("a")) {
      const href = link.getAttribute("href");

      if (!href || !/^https?:\/\//i.test(href)) {
        link.replaceWith(...link.childNodes);
        continue;
      }

      try {
        const url = new URL(href);

        if (!["http:", "https:"].includes(url.protocol)) {
          link.replaceWith(...link.childNodes);
          continue;
        }
      } catch {
        link.replaceWith(...link.childNodes);
        continue;
      }

      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
      link.setAttribute("referrerpolicy", "no-referrer");
    }

    // Wide tables scroll inside the bubble.
    for (const table of fragment.querySelectorAll("table")) {
      const wrapper = document.createElement("div");
      wrapper.className = "table-scroll";
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "region");
      wrapper.setAttribute("aria-label", "Scrollable table");

      table.replaceWith(wrapper);
      wrapper.append(table);
    }

    container.classList.add("markdown");
    container.replaceChildren(fragment);
  } catch (error) {
    // A formatting problem should never break the conversation.
    console.warn("Markdown rendering failed; showing plain text.", error);
    container.classList.remove("markdown");
    container.textContent = text;
  }
}