/*
 * 新增工具里适合全局搜索直达的输入模式。宿主会先把查询转成小写。
 */
import { createToolSearchFeed } from "../searchFeed";

export const PUNYCODE_SEARCH_FEED = createToolSearchFeed(/xn--[a-z0-9-]+/);
export const ULID_SEARCH_FEED = createToolSearchFeed(/^[0-9a-hjkmnp-tv-z]{26}$/);
export const MAC_SEARCH_FEED = createToolSearchFeed(
  /^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$|^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/,
);
export const CURL_SEARCH_FEED = createToolSearchFeed(/^curl\s+\S/);
export const IPV6_SEARCH_FEED = createToolSearchFeed(/^(?=.*[a-f]|.*::)(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/);
