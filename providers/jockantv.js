
/*
 * JockanTV Nuvio provider (0.7.0).
 * Finds a movie page from its TMDB ID, then offers direct media links found
 * on that page and in its embedded player. HTML share/player pages are never
 * passed to ExoPlayer as if they were video files.
 */
var PROVIDER = "JockanTV HR/SR";
var BASE_URL = "https://jockantv.com";
var EU_URL = "https://jockantv.eu";
var TMDB_URL = "https://api.themoviedb.org/3";
var USER_AGENT = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36";
var MAX_CANDIDATE_PAGES = 6;
var MAX_PLAYER_PAGES = 2;
var MAX_MEDIA_PROBES = 4;
// Optional: paste your own free TMDB API key here if Nuvio does not inject TMDB_API_KEY.
var FALLBACK_TMDB_API_KEY = "";
var sitemapCache = {};
var PIKPAK_CLIENT_ID = "YUMx5nI8ZU8Ap8pm";
var PIKPAK_CLIENT_VERSION = "2.0.0";
var PIKPAK_PACKAGE_NAME = "mypikpak.com";
var PIKPAK_CAPTCHA_SALTS = [
  "C9qPpZLN8ucRTaTiUMWYS9cQvWOE", "+r6CQVxjzJV6LCV", "F", "pFJRC",
  "9WXYIDGrwTCz2OiVlgZa90qpECPD6olt", "/750aCr4lm/Sly/c", "RB+DT/gZCrbV",
  "", "CyLsf7hdkIRxRm215hl", "7xHvLi2tOYP0Y92b", "ZGTXXxu8E/MIWaEDB+Sm/",
  "1UI3", "E7fP5Pfijd+7K+t6Tg/NhuLq0eEUVChpJSkrKxpO", "ihtqpG6FMt65+Xk+tWUH2",
  "NhXXU9rg4XXdzo7u5o"
];
var CryptoJS;
try { CryptoJS = require("crypto-js"); } catch (cryptoError) {
  try { if (typeof globalThis !== "undefined") CryptoJS = globalThis.CryptoJS || null; } catch (globalCryptoError) { CryptoJS = null; }
}

function tmdbKey() {
  try {
    if (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) return String(TMDB_API_KEY);
    if (typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY) return String(globalThis.TMDB_API_KEY);
  } catch (e) {}
  return FALLBACK_TMDB_API_KEY;
}

function decodeText(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&").replace(/&#038;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); })
    .replace(/&#(\d+);/g, function (_, dec) { return String.fromCharCode(parseInt(dec, 10)); });
}

function normalize(value) {
  var text = decodeText(value).toLowerCase();
  var from = "čćžšđáàäâéèëêíìïîóòöôúùüûýÿñ";
  var to   = "cczsdaaaaeeeeiiiioooouuuuyyn";
  for (var i = 0; i < from.length; i += 1) {
    text = text.split(from.charAt(i)).join(to.charAt(i));
  }
  return text.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function absoluteUrl(value, base) {
  var url = decodeText(String(value || "").trim()).replace(/\\\//g, "/");
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^\/\//.test(url)) return "https:" + url;
  if (url.charAt(0) === "/") {
    var origin = String(base || BASE_URL).match(/^(https?:\/\/[^/]+)/i);
    return (origin ? origin[1] : BASE_URL) + url;
  }
  return String(base || BASE_URL).replace(/\/+$/, "") + "/" + url.replace(/^\/+/, "");
}

function getAttribute(attributes, name) {
  var expression = new RegExp("\\b" + name + "\\s*=\\s*([\\\"'])(.*?)\\1", "i");
  var match = String(attributes || "").match(expression);
  return match ? decodeText(match[2]) : "";
}

function requestText(url, referer) {
  var headers = {
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "User-Agent": USER_AGENT
  };
  if (referer) headers.Referer = referer;
  return fetch(url, { method: "GET", headers: headers }).then(function (response) {
    if (!response.ok) throw new Error("HTTP " + response.status + " for " + url);
    return response.text().then(function (text) {
      return { text: text, url: response.url || url };
    });
  });
}

function requestJson(url) {
  return requestText(url).then(function (result) {
    return JSON.parse(result.text);
  });
}

function titleVariants(metadata) {
  var values = [metadata.title, metadata.original_title, metadata.original_name, metadata.episode_title, metadata.original_episode_title];
  var result = [];
  values.forEach(function (value) {
    var clean = String(value || "").trim();
    if (clean && result.indexOf(clean) < 0) result.push(clean);
  });
  return result;
}

function getContentMetadata(tmdbId, mediaType, season, episode) {
  var key = tmdbKey();
  if (!key) {
    if (String(mediaType) === "movie" && String(tmdbId) === "920") {
      return Promise.resolve({
        id: "920", media_type: "movie", title: "Auti", original_title: "Cars", release_date: "2006-06-09",
        genres: [{ id: 16, name: "Animation" }, { id: 10751, name: "Family" }]
      });
    }
    return Promise.resolve(null);
  }
  var isTv = mediaType === "tv" || mediaType === "series" || mediaType === "show";
  var endpoint = isTv ? "/tv/" : "/movie/";
  var url = TMDB_URL + endpoint + encodeURIComponent(String(tmdbId)) + "?api_key=" + encodeURIComponent(key) + "&language=hr-HR";
  return requestJson(url).then(function (metadata) {
    metadata.media_type = isTv ? "tv" : "movie";
    if (!isTv) return metadata;
    metadata.series_title = metadata.name || metadata.original_name || "";
    metadata.series_original_title = metadata.original_name || metadata.name || "";
    metadata.title = metadata.name || metadata.original_name || "";
    metadata.original_title = metadata.original_name || metadata.name || "";
    metadata.release_date = metadata.first_air_date || "";
    metadata.season_number = Number(season) || 1;
    metadata.episode_number = Number(episode) || 1;
    var episodeUrl = TMDB_URL + "/tv/" + encodeURIComponent(String(tmdbId)) +
      "/season/" + metadata.season_number + "/episode/" + metadata.episode_number +
      "?api_key=" + encodeURIComponent(key) + "&language=hr-HR";
    return requestJson(episodeUrl).then(function (episodeData) {
      metadata.episode_title = episodeData.name || "";
      metadata.original_episode_title = episodeData.name || "";
      metadata.episode_air_date = episodeData.air_date || "";
      metadata.release_date = episodeData.air_date || metadata.release_date;
      return metadata;
    }).catch(function (error) {
      console.warn("[JockanTV] TMDB episode lookup failed: " + (error.message || error));
      return metadata;
    });
  }).catch(function (error) {
    console.error("[JockanTV] TMDB lookup failed: " + (error.message || error));
    return null;
  });
}

function slugOf(url) {
  var path = String(url || "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  var slug = path.substring(path.lastIndexOf("/") + 1);
  try { slug = decodeURIComponent(slug); } catch (e) {}
  return slug.replace(/[⁠-⁯​-‏﻿]/g, "");
}

function extractLocs(xml) {
  var locs = [];
  var pattern = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  var match;
  while ((match = pattern.exec(String(xml || "")))) locs.push(decodeText(match[1]));
  return locs;
}

// jockantv.eu has no usable search, but its WordPress sitemaps list every movie and show.
function sitemapUrls(type) {
  if (sitemapCache[type]) return Promise.resolve(sitemapCache[type]);
  var defaultMaps = [EU_URL + "/wp-sitemap-posts-" + type + "-1.xml"];
  return requestText(EU_URL + "/wp-sitemap.xml").then(function (index) {
    var maps = extractLocs(index.text).filter(function (loc) {
      return new RegExp("wp-sitemap-posts-" + type + "-\\d+\\.xml", "i").test(loc);
    });
    return maps.length ? maps : defaultMaps;
  }).catch(function () {
    return defaultMaps;
  }).then(function (maps) {
    return Promise.all(maps.slice(0, 5).map(function (map) {
      return requestText(map).then(function (result) { return extractLocs(result.text); })
        .catch(function () { return []; });
    }));
  }).then(function (lists) {
    var all = [];
    lists.forEach(function (list) { all = all.concat(list); });
    if (all.length) sitemapCache[type] = all;
    return all;
  });
}

function rankByTitle(urls, titles, year) {
  var cleanTitles = titles.map(normalize).filter(function (title) { return title.length > 1; });
  var scored = [];
  urls.forEach(function (url) {
    var slugText = normalize(slugOf(url).replace(/-/g, " "));
    var slugYear = "";
    var yearMatch = slugText.match(/^(.*) ((?:19|20)\d\d)$/);
    if (yearMatch) { slugText = yearMatch[1]; slugYear = yearMatch[2]; }
    var best = 0;
    cleanTitles.forEach(function (title) {
      if (slugText === title) best = Math.max(best, 100);
      else if (slugText.indexOf(title + " ") === 0) best = Math.max(best, 40);
      else {
        var words = title.split(" ").filter(function (word) { return word.length > 2; });
        var slugWords = slugText.split(" ");
        if (words.length && words.every(function (word) { return slugWords.indexOf(word) >= 0; })) best = Math.max(best, 30);
      }
    });
    if (!best) return;
    if (year && slugYear) best += slugYear === year ? 20 : -50;
    if (best > 0) scored.push({ url: url, score: best });
  });
  scored.sort(function (a, b) { return b.score - a.score; });
  return scored.map(function (item) { return item.url; });
}

function movieCandidatesFromSitemap(metadata) {
  var year = String(metadata.release_date || "").slice(0, 4);
  return sitemapUrls("movies").then(function (urls) {
    return rankByTitle(urls, titleVariants(metadata), year).slice(0, 3);
  });
}

function episodeCode(metadata) {
  return "s" + String(metadata.season_number).padStart(2, "0") + "e" + String(metadata.episode_number).padStart(2, "0");
}

// Episode slugs are "s01e05-<episode title>" without the show name, so take them from the show page.
function episodeCandidatesFromShows(metadata) {
  var titles = [metadata.series_title, metadata.series_original_title].filter(Boolean);
  var code = episodeCode(metadata);
  return sitemapUrls("tv_shows").then(function (urls) {
    var shows = rankByTitle(urls, titles, "").slice(0, 2);
    function tryShow(index) {
      if (index >= shows.length) return Promise.resolve([]);
      return requestText(shows[index], EU_URL + "/").then(function (page) {
        var links = String(page.text).match(/https?:\/\/(?:www\.)?jockantv\.eu\/episodes\/[^"'\s<>]+/gi) || [];
        var found = [];
        links.forEach(function (link) {
          var url = link.replace(/\/?$/, "/");
          var slug = slugOf(url).toLowerCase();
          if ((slug === code || slug.indexOf(code + "-") === 0) && found.indexOf(url) < 0) found.push(url);
        });
        return found.length ? found : tryShow(index + 1);
      }).catch(function () { return tryShow(index + 1); });
    }
    return tryShow(0);
  }).then(function (found) {
    metadata.trusted_pages = (metadata.trusted_pages || []).concat(found);
    return found;
  });
}

function searchJockanPages(metadata) {
  var fallback = prioritizedFallbackCandidates(metadata, fallbackPageCandidates(metadata));
  var lookup = metadata.media_type === "tv" ? episodeCandidatesFromShows(metadata) : movieCandidatesFromSitemap(metadata);
  return lookup.catch(function (error) {
    console.error("[JockanTV] Sitemap lookup failed: " + (error.message || error));
    return [];
  }).then(function (found) {
    return found.concat(fallback.filter(function (candidate) { return found.indexOf(candidate) < 0; }))
      .slice(0, MAX_CANDIDATE_PAGES);
  });
}

function fallbackPageCandidates(metadata) {
  var year = String(metadata.release_date || "").slice(0, 4);
  var variants = titleVariants(metadata);
  var result = [];
  variants.forEach(function (title) {
    var slug = normalize(title).replace(/\s+/g, ".");
    if (!slug) return;
    var names = [slug + ".html"];
    if (year) {
      names.push(slug + "-" + year + ".html");
      names.push(slug + "." + year + ".html");
      names.push(slug + "." + year + ".HR.html");
      names.push(slug + "." + year + ".SR.html");
    }
    names.forEach(function (name) {
      var url = BASE_URL + "/sinkronizirani-crtici/" + name;
      if (metadata.media_type === "tv") {
        var episodeCode = "S" + String(metadata.season_number).padStart(2, "0") + "E" + String(metadata.episode_number).padStart(2, "0");
        var episodeSlug = normalize(metadata.episode_title || "").replace(/\s+/g, ".");
        [slug + "." + episodeCode + ".html", slug + "." + String(metadata.season_number) + "x" + String(metadata.episode_number).padStart(2, "0") + ".html"]
          .concat(episodeSlug ? [slug + "." + episodeSlug + ".html"] : [])
          .forEach(function (episodeName) {
            var episodeUrl = BASE_URL + "/sinkronizirani-crtici/" + episodeName;
            if (result.indexOf(episodeUrl) < 0) result.push(episodeUrl);
          });
      }
      if (result.indexOf(url) < 0) result.push(url);
    });
    var euSlug = normalize(title).replace(/\s+/g, "-");
    if (metadata.media_type === "tv") {
      var seasonCode = "s" + String(metadata.season_number).padStart(2, "0") + "e" + String(metadata.episode_number).padStart(2, "0");
      var episodeSlug = normalize(metadata.episode_title || "").replace(/\s+/g, "-");
      var episodeNames = [seasonCode + "-" + euSlug];
      if (episodeSlug) episodeNames.unshift(seasonCode + "-" + episodeSlug);
      episodeNames.forEach(function (episodeName) {
        var episodeUrl = "https://jockantv.eu/episodes/" + episodeName + "/";
        if (result.indexOf(episodeUrl) < 0) result.push(episodeUrl);
      });
      var showUrl = "https://jockantv.eu/tv_shows/" + euSlug + "/";
      if (result.indexOf(showUrl) < 0) result.push(showUrl);
    } else {
      var movieUrl = "https://jockantv.eu/movie/" + euSlug + (year ? "-" + year : "") + "/";
      if (result.indexOf(movieUrl) < 0) result.push(movieUrl);
      var movieUrlWithoutYear = "https://jockantv.eu/movie/" + euSlug + "/";
      if (result.indexOf(movieUrlWithoutYear) < 0) result.push(movieUrlWithoutYear);
    }
  });
  return result;
}

function prioritizedFallbackCandidates(metadata, candidates) {
  var current = candidates.filter(function (url) { return /^https?:\/\/(?:www\.)?jockantv\.eu\//i.test(url); });
  var legacy = candidates.filter(function (url) { return /^https?:\/\/(?:www\.)?jockantv\.com\//i.test(url); });
  var genres = metadata.genres || [];
  var isAnimation = String(metadata.id || "") === "920" || genres.some(function (genre) {
    return Number(genre && genre.id) === 16 || normalize(genre && genre.name || "") === "animation";
  });
  var preferLegacy = metadata.media_type === "movie" && isAnimation;
  var first = preferLegacy ? legacy : current;
  var second = preferLegacy ? current : legacy;
  var result = [];
  for (var i = 0; result.length < MAX_CANDIDATE_PAGES && (i < first.length || i < second.length); i += 1) {
    if (i < first.length && result.indexOf(first[i]) < 0) result.push(first[i]);
    if (result.length < MAX_CANDIDATE_PAGES && i < second.length && result.indexOf(second[i]) < 0) result.push(second[i]);
  }
  return result;
}

function extractPageTitle(html) {
  var match = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (match) return decodeText(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  match = String(html || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? decodeText(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) : "";
}

function titleMatchesPage(html, metadata) {
  var pageTitle = normalize(extractPageTitle(html));
  if (!pageTitle) return false;
  if (metadata.media_type === "tv") {
    var seriesVariants = [metadata.series_title, metadata.series_original_title].filter(Boolean).map(normalize);
    var hasSeries = seriesVariants.some(function (title) { return title.length > 2 && pageTitle.indexOf(title) >= 0; });
    if (!hasSeries) return false;
    var season = String(metadata.season_number);
    var episode = String(metadata.episode_number).padStart(2, "0");
    var markers = [
      "s" + season.padStart(2, "0") + "e" + episode,
      season + "x" + episode,
      "season " + season + " episode " + episode
    ];
    var hasMarker = markers.some(function (marker) { return pageTitle.indexOf(normalize(marker)) >= 0; });
    var episodeTitle = normalize(metadata.episode_title || "");
    return hasMarker || (episodeTitle.length > 2 && pageTitle.indexOf(episodeTitle) >= 0);
  }
  var variants = titleVariants(metadata);
  for (var i = 0; i < variants.length; i += 1) {
    var title = normalize(variants[i]);
    if (title.length > 2 && (pageTitle.indexOf(title) >= 0 || title.indexOf(pageTitle) >= 0)) return true;
  }
  return false;
}

function findContentPage(metadata, candidates) {
  function tryAt(index) {
    if (index >= candidates.length) return Promise.resolve(null);
    return requestText(candidates[index], BASE_URL + "/").then(function (page) {
      var trusted = (metadata.trusted_pages || []).indexOf(candidates[index]) >= 0;
      if (trusted || titleMatchesPage(page.text, metadata)) return page;
      return tryAt(index + 1);
    }).catch(function () {
      return tryAt(index + 1);
    });
  }
  return tryAt(0);
}

function addMediaUrl(list, value, pageUrl, label, referer) {
  var url = absoluteUrl(value, pageUrl)
    .replace(/\\\\u0026/gi, "&")
    .replace(/\\u0026/gi, "&");
  if (!/^https?:\/\//i.test(url)) return;
  if (!/\.(?:mp4|m3u8|m4v|webm)(?:[?#]|$)/i.test(url)) return;
  if (list.some(function (item) { return item.url === url; })) return;
  list.push({ url: url, label: label || "Direct video", referer: referer || pageUrl });
}

function extractMedia(html, pageUrl, label, referer) {
  var source = String(html || "")
    .replace(/&amp;/gi, "&")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/\\x3a/gi, ":")
    .replace(/\\x2f/gi, "/");
  var found = [];
  var tagPattern = /<(?:a|video|source|iframe)\b([^>]*)>/gi;
  var tag;
  while ((tag = tagPattern.exec(source))) {
    var attrs = tag[1];
    var href = getAttribute(attrs, "href");
    var src = getAttribute(attrs, "src");
    var id = getAttribute(attrs, "id").toLowerCase();
    var title = getAttribute(attrs, "title");
    var textLabel = id === "download" || /download/i.test(title) ? "Download" : label;
    addMediaUrl(found, href || src, pageUrl, textLabel, referer || pageUrl);
  }

  var directPattern = /https?:\\?\/\\?\/[^\s"'<>\\]+?\.(?:mp4|m3u8|m4v|webm)(?:[?#][^\s"'<>\\]*)?/gi;
  var direct;
  while ((direct = directPattern.exec(source))) {
    addMediaUrl(found, direct[0], pageUrl, label, referer || pageUrl);
  }

  var assignmentPattern = /(?:file|src|source|contentUrl|videoUrl|hls|mp4)\s*["']?\s*[:=]\s*["']([^"']+)["']/gi;
  var assignment;
  while ((assignment = assignmentPattern.exec(source))) {
    addMediaUrl(found, assignment[1], pageUrl, label, referer || pageUrl);
  }
  return found;
}

function isPlayerUrl(url) {
  return /^https?:\/\//i.test(url) &&
    !/(?:adskeeper|adsterra|doubleclick|googleadservices|facebook|twitter)/i.test(url) &&
    !/^https?:\/\/(?:www\.)?jockantv\.eu\/(?:videos|pricing|login)/i.test(url) &&
    (/(?:upbolt\.to\/e\/|\/embed\/|\/player\/|mypikpak\.(?:com|net)\/s\/|torbox\.(?:app|com)\/)/i.test(url) ||
      /^https?:\/\/(?:www\.)?jockantv\.eu\/(?:movie|episodes)\/[^?#]+\/play\/?(?:[?#].*)?$/i.test(url));
}

function pageLinks(html, baseUrl) {
  var links = [];
  var source = String(html || "");
  var tagPattern = /<(?:iframe|source|video|button|a)\b([^>]*)>/gi;
  var match;
  while ((match = tagPattern.exec(source))) {
    var attrs = match[1];
    ["src", "data-src", "data-url", "data-link", "data-embed", "href", "onclick"].forEach(function (name) {
      var value = getAttribute(attrs, name);
      if (!value) return;
      var urlMatch = value.match(/(?:https?:)?\\?\/\\?\/[^\s"'<>\\)]+|\/(?:movie\/[^\s"'<>\\)]+|dl(?:\/[^\s"'<>\\)]*)?)/i);
      if (!urlMatch) return;
      var url = absoluteUrl(urlMatch[0].replace(/\\\//g, "/"), baseUrl);
      if (url && links.indexOf(url) < 0) links.push(url);
    });
  }
  var anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  while ((match = anchorPattern.exec(source))) {
    var href = absoluteUrl(getAttribute(match[1], "href"), baseUrl);
    var label = decodeText((getAttribute(match[1], "title") + " " + match[2]).replace(/<[^>]+>/g, " "));
    if (href && (/\bpikpak\b|\btorbox\b|\bplayer\b|\bwatch\b|\bplay\b|\blink\s*\d+\b/i.test(label) || /upbolt\.to\/e\//i.test(href)) &&
        links.indexOf(href) < 0) links.push(href);
  }
  // Some JockanTV pages keep alternate Link 1/2/3 player URLs in inline scripts.
  var embedded = source.match(/(?:https?:)?\\?\/\\?\/(?:[^\s"'<>\\]+\.)?(?:mypikpak\.(?:com|net)\/s\/[A-Za-z0-9_-]+|torbox\.(?:app|com)\/[^\s"'<>\\]+)/gi) || [];
  embedded.forEach(function (value) {
    var url = absoluteUrl(value.replace(/\\\//g, "/"), baseUrl);
    if (url && links.indexOf(url) < 0) links.push(url);
  });
  return links.filter(isPlayerUrl);
}

function playerLabel(url) {
  if (/mypikpak\.(?:com|net)\/s\//i.test(url)) return "PikPak";
  if (/torbox\.(?:app|com)\//i.test(url)) return "TorBox";
  return "Built-in player";
}

function isPikPakShare(url) {
  return /^https?:\/\/(?:www\.)?mypikpak\.(?:com|net)\/s\/[A-Za-z0-9_-]+(?:[/?#]|$)/i.test(url);
}

function pikpakDeviceId(shareId) {
  if (!CryptoJS || !CryptoJS.MD5) throw new Error("PikPak share resolution needs Nuvio's crypto-js module");
  return CryptoJS.MD5("nuvio-pikpak-" + shareId).toString();
}

function pikpakCaptchaSign(deviceId, timestamp) {
  var value = PIKPAK_CLIENT_ID + PIKPAK_CLIENT_VERSION + PIKPAK_PACKAGE_NAME + deviceId + timestamp;
  PIKPAK_CAPTCHA_SALTS.forEach(function (salt) {
    value = CryptoJS.MD5(value + salt).toString();
  });
  return "1." + value;
}

function pikpakJson(url, method, headers, body) {
  return fetch(url, {
    method: method || "GET",
    headers: headers || {},
    body: body ? JSON.stringify(body) : undefined
  }).then(function (response) {
    return response.text().then(function (text) {
      var data;
      try { data = JSON.parse(text); } catch (e) { throw new Error("PikPak returned a non-JSON response"); }
      if (!response.ok || data.error_code || data.error) {
        throw new Error(data.error_description || data.error || ("PikPak HTTP " + response.status));
      }
      return data;
    });
  });
}

function pikpakApiRequest(path, query, action, deviceId) {
  var timestamp = String(Date.now());
  var meta = {
    captcha_sign: pikpakCaptchaSign(deviceId, timestamp),
    client_version: PIKPAK_CLIENT_VERSION,
    package_name: PIKPAK_PACKAGE_NAME,
    timestamp: timestamp,
    user_id: ""
  };
  var captchaBody = {
    action: action,
    captcha_token: "",
    client_id: PIKPAK_CLIENT_ID,
    device_id: deviceId,
    meta: meta,
    redirect_uri: "xlaccsdk01://xbase.cloud/callback?state=harbor"
  };
  var captchaHeaders = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    "X-Client-ID": PIKPAK_CLIENT_ID,
    "X-Device-ID": deviceId
  };
  var captchaUrl = "https://user.mypikpak.com/v1/shield/captcha/init?client_id=" + encodeURIComponent(PIKPAK_CLIENT_ID);
  return pikpakJson(captchaUrl, "POST", captchaHeaders, captchaBody).then(function (captcha) {
    if (!captcha.captcha_token) throw new Error(captcha.url ? "PikPak requested browser verification" : "PikPak did not provide a share token");
    var parts = [];
    Object.keys(query).forEach(function (key) {
      if (query[key] === undefined || query[key] === null || query[key] === "") return;
      parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(query[key])));
    });
    var apiHeaders = {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "X-Client-ID": PIKPAK_CLIENT_ID,
      "X-Device-ID": deviceId,
      "X-Captcha-Token": captcha.captcha_token
    };
    var apiUrl = "https://api-drive.mypikpak.com" + path + (parts.length ? "?" + parts.join("&") : "");
    return pikpakJson(apiUrl, "GET", apiHeaders);
  });
}

function pikpakFileMatches(file, metadata) {
  var name = normalize(file && file.name || "");
  if (!/\.(?:mp4|m4v|mov|mkv|webm|m3u8)$/i.test(String(file && file.name || ""))) return false;
  var variants = titleVariants(metadata);
  for (var i = 0; i < variants.length; i += 1) {
    var normalizedTitle = normalize(variants[i]);
    if (normalizedTitle.length > 2 && name.indexOf(normalizedTitle) >= 0) return true;
    var words = normalizedTitle.split(" ").filter(function (word) { return word.length > 2; });
    if (words.length && words.every(function (word) { return name.indexOf(word) >= 0; })) return true;
  }
  return false;
}

function resolvePikPakShare(shareUrl, metadata) {
  var match = String(shareUrl || "").match(/mypikpak\.(?:com|net)\/s\/([A-Za-z0-9_-]+)/i);
  if (!match) return Promise.resolve([]);
  if (!CryptoJS || !CryptoJS.MD5) return Promise.resolve([]);
  var shareId = match[1];
  var deviceId;
  try { deviceId = pikpakDeviceId(shareId); } catch (e) { return Promise.resolve([]); }
  var detailQuery = {
    share_id: shareId,
    parent_id: "",
    pass_code_token: "",
    thumbnail_size: "SIZE_LARGE",
    with_audit: "true",
    limit: "100",
    page_token: "",
    filters: '{"phase":{"eq":"PHASE_TYPE_COMPLETE"},"trashed":{"eq":false}}'
  };
  return pikpakApiRequest("/drive/v1/share/detail", detailQuery, "GET:/drive/v1/share/detail", deviceId)
    .then(function (detail) {
      if (detail.share_status && detail.share_status !== "OK") throw new Error(detail.share_status_text || detail.share_status);
      var files = (detail.files || []).filter(function (file) { return pikpakFileMatches(file, metadata); });
      if (!files.length) throw new Error("No matching video file in the PikPak share");
      var file = files[0];
      var infoQuery = { share_id: shareId, file_id: file.id, pass_code_token: detail.pass_code_token || "" };
      return pikpakApiRequest("/drive/v1/share/file_info", infoQuery, "GET:/drive/v1/share/file_info", deviceId)
        .then(function (info) {
          var fileInfo = info.file_info || info;
          var results = [];
          if (fileInfo.web_content_link) {
            results.push({ url: fileInfo.web_content_link, label: "PikPak", referer: shareUrl });
          }
          (fileInfo.medias || []).forEach(function (media) {
            var url = media && media.link && media.link.url;
            if (!url || results.some(function (item) { return item.url === url; })) return;
            var resolution = media.resolution_name || (media.video && media.video.height ? media.video.height + "p" : "");
            results.push({ url: url, label: "PikPak" + (resolution ? " " + resolution : ""), referer: shareUrl });
          });
          return results;
        });
    }).catch(function (error) {
      console.warn("[JockanTV] PikPak resolution failed: " + (error.message || error));
      return [];
    });
}

function playerFollowups(html, playerUrl) {
  var followups = [];
  var source = String(html || "");
  var attrPattern = /(?:href|src|action|data-url)\s*=\s*["']([^"']+)["']/gi;
  var match;
  while ((match = attrPattern.exec(source))) {
    var url = absoluteUrl(match[1], playerUrl);
    if (url && !isPlayerUrl(url) && /\/dl(?:[/?#]|$)|\.(?:mp4|m3u8|m4v|webm)(?:[?#]|$)/i.test(url) &&
        followups.indexOf(url) < 0) followups.push(url);
  }
  var inline = source.match(/["'](\/dl(?:[/?#][^"']*)?)["']/gi) || [];
  inline.forEach(function (value) {
    var path = value.substring(1, value.length - 1);
    var url = absoluteUrl(path, playerUrl);
    if (followups.indexOf(url) < 0) followups.push(url);
  });
  if (/upbolt\.to\/e\//i.test(playerUrl)) {
    var origin = playerUrl.match(/^(https?:\/\/[^/]+)/i);
    var dl = (origin ? origin[1] : "https://upbolt.to") + "/dl";
    if (followups.indexOf(dl) < 0) followups.push(dl);
  }
  return followups.slice(0, MAX_PLAYER_PAGES);
}

function expandPlayer(url, pageUrl, depth, label, metadata) {
  if (depth > 2) return Promise.resolve([]);
  return requestText(url, pageUrl).then(function (result) {
    var media = extractMedia(result.text, result.url, label, result.url);
    if (media.length) return media;
    var links = pageLinks(result.text, result.url);
    var shares = links.filter(isPikPakShare);
    function tryShares(index) {
      if (index >= shares.length) return Promise.resolve([]);
      return resolvePikPakShare(shares[index], metadata).then(function (resolved) {
        return resolved.length ? resolved : tryShares(index + 1);
      });
    }
    var next = links.filter(function (link) { return link !== url && !isPikPakShare(link); })
      .concat(playerFollowups(result.text, result.url));
    next = next.filter(function (link, index) { return next.indexOf(link) === index; }).slice(0, MAX_PLAYER_PAGES);
    function tryNext(index) {
      if (index >= next.length) return Promise.resolve([]);
      return requestText(next[index], result.url).then(function (child) {
        var nestedMedia = extractMedia(child.text, child.url, label, child.url);
        if (nestedMedia.length) return nestedMedia;
        if (depth < 2) {
          var nested = pageLinks(child.text, child.url);
          if (nested.length) {
            return expandPlayer(nested[0], child.url, depth + 1, label, metadata).then(function (deepMedia) {
              return deepMedia.length ? deepMedia : tryNext(index + 1);
            });
          }
        }
        return tryNext(index + 1);
      }).catch(function () {
        return tryNext(index + 1);
      });
    }
    return tryShares(0).then(function (shareMedia) {
      return shareMedia.length ? shareMedia : tryNext(0);
    });
  }).catch(function (error) {
    console.error("[JockanTV] Player page failed: " + (error.message || error));
    return [];
  });
}

function sourceResults(page, metadata) {
  var direct = extractMedia(page.text, page.url, "Direct download", page.url);
  var pageSources = pageLinks(page.text, page.url);
  var pikpakLinks = pageSources.filter(isPikPakShare);
  var players = pageSources.filter(function (url) { return !isPikPakShare(url); });
  function tryPlayers(index, collected) {
    if (index >= players.length || collected.length >= 2) {
      return Promise.resolve(collected);
    }
    return expandPlayer(players[index], page.url, 0, playerLabel(players[index]), metadata).then(function (media) {
      return tryPlayers(index + 1, collected.concat(media));
    });
  }
  function tryPikPak(index, collected) {
    if (index >= pikpakLinks.length || collected.length >= 2) return Promise.resolve(collected);
    return resolvePikPakShare(pikpakLinks[index], metadata).then(function (media) {
      return tryPikPak(index + 1, collected.concat(media));
    });
  }
  return tryPikPak(0, []).then(function (pikpakMedia) {
    return tryPlayers(0, []).then(function (playerMedia) {
      // Put resolved PikPak URLs before page filenames that may still point to HTML wrappers.
      return pikpakMedia.concat(playerMedia, direct).slice(0, MAX_MEDIA_PROBES);
    });
  });
}

function qualityFromUrl(url) {
  var match = String(url || "").match(/(?:^|[^0-9])(2160|1440|1080|720|480|360)p?(?:[^0-9]|$)/i);
  return match ? match[1] + "p" : "Auto";
}

function toNuvioStreams(items, metadata) {
  var year = String(metadata.release_date || "").slice(0, 4);
  var title = metadata.title || metadata.original_title || "JockanTV";
  var used = [];
  var result = [];
  items.forEach(function (item) {
    if (result.length >= 2 || used.indexOf(item.url) >= 0) return;
    used.push(item.url);
    var quality = qualityFromUrl(item.url);
    var label = item.label || "Direct video";
    result.push({
      name: PROVIDER,
      title: title + (year ? " (" + year + ")" : "") + " • " + label + " • " + quality,
      url: item.url,
      quality: quality,
      headers: {
        "Referer": item.referer || item.pageUrl || BASE_URL + "/",
        "User-Agent": USER_AGENT
      }
    });
  });
  return result;
}

function mediaContentType(response) {
  try { return String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(); }
  catch (e) { return ""; }
}

function isPlayableContentType(contentType) {
  return /^video\//i.test(contentType) ||
    /^(?:application\/(?:vnd\.apple\.mpegurl|x-mpegurl|mpegurl|octet-stream)|binary\/octet-stream)$/i.test(contentType);
}

function probeMedia(item) {
  function check(response) {
    if (!response || !response.ok) return Promise.resolve(null);
    var contentType = mediaContentType(response);
    // Send.now share/view URLs end in .mp4 but return text/html with a web player.
    if (/^(?:text\/html|application\/xhtml\+xml)$/i.test(contentType)) return Promise.resolve(null);
    if (!isPlayableContentType(contentType)) return Promise.resolve(null);
    return Promise.resolve({
      url: response.url || item.url,
      label: item.label,
      referer: item.referer
    });
  }

  return fetch(item.url, {
    method: "HEAD",
    headers: { "User-Agent": USER_AGENT, "Referer": item.referer || BASE_URL + "/" }
  }).then(function (response) {
    var contentType = mediaContentType(response);
    if (response.ok && /^(?:text\/html|application\/xhtml\+xml)$/i.test(contentType)) return null;
    return check(response).then(function (valid) {
      if (valid) return valid;
      // Some media hosts reject HEAD; retry with a one-byte range and inspect headers only.
      if (response.status === 405 || response.status === 501 || !contentType) {
        return fetch(item.url, {
          method: "GET",
          headers: {
            "User-Agent": USER_AGENT,
            "Referer": item.referer || BASE_URL + "/",
            "Range": "bytes=0-0"
          }
        }).then(check).catch(function () { return null; });
      }
      return null;
    });
  }).catch(function () {
    return fetch(item.url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": item.referer || BASE_URL + "/",
        "Range": "bytes=0-0"
      }
    }).then(check).catch(function () { return null; });
  });
}

function keepPlayableMedia(items) {
  var candidates = items.slice(0, MAX_MEDIA_PROBES);
  function next(index, playable) {
    if (index >= candidates.length || playable.length >= 2) return Promise.resolve(playable);
    return probeMedia(candidates[index]).then(function (item) {
      return next(index + 1, item ? playable.concat([item]) : playable);
    });
  }
  return next(0, []);
}

function getStreams(tmdbId, mediaType, season, episode) {
  var normalizedType = String(mediaType || "movie").toLowerCase();
  if (["movie", "tv", "series", "show"].indexOf(normalizedType) < 0) return Promise.resolve([]);
  return getContentMetadata(tmdbId, normalizedType, season, episode).then(function (metadata) {
    if (!metadata) return [];
    return searchJockanPages(metadata).then(function (candidates) {
      return findContentPage(metadata, candidates).then(function (page) {
        if (!page) {
          console.warn("[JockanTV] No matching page found for " + (metadata.title || tmdbId));
          return [];
        }
        return sourceResults(page, metadata).then(function (items) {
          return keepPlayableMedia(items).then(function (playable) {
            if (!playable.length) {
              console.warn("[JockanTV] Page links did not resolve to direct media for " + (metadata.title || tmdbId));
            }
            return toNuvioStreams(playable, metadata);
          });
        });
      });
    });
  }).catch(function (error) {
    console.error("[JockanTV] Scrape failed: " + (error.message || error));
    return [];
  });
}

module.exports = { getStreams: getStreams };
