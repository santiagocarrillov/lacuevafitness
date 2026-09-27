// Recipe videos live on La Cueva's YouTube channel; a recipe points to one via
// `Recipe.sourceUrl`. Pure helpers — no network.

const ID = /^[A-Za-z0-9_-]{11}$/;

/** The 11-char video id of a YouTube link (watch, youtu.be, shorts, embed), else null. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
      id = m?.[1] ?? null;
    }
  }
  return id && ID.test(id) ? id : null;
}

export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const youtubeEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
export const youtubeWatch = (id: string) => `https://youtu.be/${id}`;
