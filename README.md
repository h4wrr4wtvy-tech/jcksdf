# JockanTV Nuvio provider (0.7.0)

This provider searches the JockanTV library for Nuvio movies and TV episodes, follows available player pages, resolves anonymous PikPak video shares, and returns verified media URLs for Nuvio's internal player.

## Library coverage

- Searches both the legacy `jockantv.com` cartoon pages and the current `jockantv.eu` movie, TV show, and episode sections.
- Finds titles through jockantv.eu's WordPress sitemaps (movies and TV shows), so it no longer depends on Google search.
- For TV, it finds the show in the sitemap, opens the show page, and picks the episode link with the matching `sXXeYY` code.
- For movies, it follows the page's Play link and inspects the available player choices and embedded links.
- Resolves matching PikPak video shares, checks direct and HLS media responses, and returns up to two distinct playable URLs. Cloud-share pages and HTML player wrappers are not passed to the video player as if they were media.

## Install / refresh

1. Push `manifest.json` and the `providers/` folder to a **public** GitHub repository.
2. In Nuvio, add the raw manifest URL in the repository/plugins screen:

   ```
   https://raw.githubusercontent.com/<your-user>/<your-repo>/refs/heads/main/manifest.json
   ```

3. After each change, raise `version` in `manifest.json` (both the top-level and scraper entry) and refresh the repository in Nuvio.

Full movie and TV matching needs a TMDB API key. If Nuvio does not inject `TMDB_API_KEY`, paste your own free key into `FALLBACK_TMDB_API_KEY` at the top of `providers/jockantv.js`. Without a key, only the built-in Cars fallback works.

## Changelog

- **0.7.0**: Replaced Google search (blocked or consent-walled for scripts) with the site's sitemaps; TV episodes are found through the show page; a failed TMDB episode lookup no longer drops the whole result; site pages like `/videos/` and `/pricing/` are no longer followed as players; added an optional TMDB key setting.

## Verification notes

JavaScript syntax, manifest structure, and package contents can be checked locally. End-to-end playback must be confirmed in Nuvio on the target device because site markup, PikPak access, and media-host restrictions can change. A source appears only when the provider resolves it to a video or HLS response.

The anonymous PikPak share request flow is based on the MIT-licensed [Gopeed PikPak share resolver](https://github.com/TeamBreakerr/gopeed-extension-pikpak). It requests video share metadata and media URLs without saving files to a PikPak account.
