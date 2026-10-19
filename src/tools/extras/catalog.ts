/*
 * HTTP 状态码与常见 MIME 对照表。纯数据，供查询工具过滤。
 */

export interface HttpStatus {
  code: number;
  name: string;
  category: string;
  desc: string;
}

export const HTTP_STATUSES: HttpStatus[] = [
  { code: 100, name: "Continue", category: "信息", desc: "已收到请求头，客户端可以继续发送请求体" },
  { code: 101, name: "Switching Protocols", category: "信息", desc: "服务器将按 Upgrade 头切换协议" },
  { code: 200, name: "OK", category: "成功", desc: "请求成功，响应体里是结果" },
  { code: 201, name: "Created", category: "成功", desc: "资源已创建，常带 Location" },
  { code: 202, name: "Accepted", category: "成功", desc: "已接受，但尚未处理完" },
  { code: 204, name: "No Content", category: "成功", desc: "成功，且没有响应体" },
  { code: 206, name: "Partial Content", category: "成功", desc: "返回了 Range 请求的部分内容" },
  { code: 301, name: "Moved Permanently", category: "重定向", desc: "资源永久搬到 Location" },
  { code: 302, name: "Found", category: "重定向", desc: "临时位于 Location，历史客户端可能把方法改成 GET" },
  { code: 303, name: "See Other", category: "重定向", desc: "用 GET 去 Location 取结果" },
  { code: 304, name: "Not Modified", category: "重定向", desc: "缓存仍有效，没有响应体" },
  { code: 307, name: "Temporary Redirect", category: "重定向", desc: "临时重定向，且必须保持原方法" },
  { code: 308, name: "Permanent Redirect", category: "重定向", desc: "永久重定向，且必须保持原方法" },
  { code: 400, name: "Bad Request", category: "客户端错误", desc: "请求语法错误或参数无效" },
  { code: 401, name: "Unauthorized", category: "客户端错误", desc: "未认证或凭证无效" },
  { code: 403, name: "Forbidden", category: "客户端错误", desc: "已认证，但没有权限" },
  { code: 404, name: "Not Found", category: "客户端错误", desc: "资源不存在" },
  { code: 405, name: "Method Not Allowed", category: "客户端错误", desc: "该 URL 不支持这个方法" },
  { code: 408, name: "Request Timeout", category: "客户端错误", desc: "服务器等请求体超时" },
  { code: 409, name: "Conflict", category: "客户端错误", desc: "与当前资源状态冲突，例如版本不一致" },
  { code: 410, name: "Gone", category: "客户端错误", desc: "资源曾经存在，现已永久删除" },
  { code: 411, name: "Length Required", category: "客户端错误", desc: "需要 Content-Length" },
  { code: 413, name: "Content Too Large", category: "客户端错误", desc: "请求体超过限制" },
  { code: 414, name: "URI Too Long", category: "客户端错误", desc: "请求 URI 过长" },
  { code: 415, name: "Unsupported Media Type", category: "客户端错误", desc: "不支持该 Content-Type" },
  { code: 416, name: "Range Not Satisfiable", category: "客户端错误", desc: "Range 超出资源长度" },
  { code: 418, name: "I'm a teapot", category: "客户端错误", desc: "愚人节彩蛋，表示拒绝煮咖啡" },
  { code: 422, name: "Unprocessable Content", category: "客户端错误", desc: "语法正确，但语义无法处理，常见于校验失败" },
  { code: 429, name: "Too Many Requests", category: "客户端错误", desc: "请求过于频繁，应稍后重试" },
  { code: 500, name: "Internal Server Error", category: "服务端错误", desc: "服务器内部未处理的异常" },
  { code: 501, name: "Not Implemented", category: "服务端错误", desc: "服务器不支持该功能" },
  { code: 502, name: "Bad Gateway", category: "服务端错误", desc: "网关从上游拿到了无效响应" },
  { code: 503, name: "Service Unavailable", category: "服务端错误", desc: "服务暂不可用，可能在过载或维护" },
  { code: 504, name: "Gateway Timeout", category: "服务端错误", desc: "网关等待上游超时" },
];

export function searchHttpStatus(query: string): HttpStatus[] {
  const q = query.trim().toLowerCase();
  if (!q) return HTTP_STATUSES;
  return HTTP_STATUSES.filter(
    (item) =>
      String(item.code).includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.desc.toLowerCase().includes(q),
  );
}

export interface MimeEntry {
  ext: string;
  mime: string;
  kind: string;
}

export const MIME_TYPES: MimeEntry[] = [
  { ext: "txt", mime: "text/plain", kind: "文本" },
  { ext: "html", mime: "text/html", kind: "文本" },
  { ext: "css", mime: "text/css", kind: "文本" },
  { ext: "csv", mime: "text/csv", kind: "文本" },
  { ext: "md", mime: "text/markdown", kind: "文本" },
  { ext: "xml", mime: "application/xml", kind: "数据" },
  { ext: "json", mime: "application/json", kind: "数据" },
  { ext: "yaml", mime: "application/yaml", kind: "数据" },
  { ext: "yml", mime: "application/yaml", kind: "数据" },
  { ext: "toml", mime: "application/toml", kind: "数据" },
  { ext: "png", mime: "image/png", kind: "图片" },
  { ext: "jpg", mime: "image/jpeg", kind: "图片" },
  { ext: "jpeg", mime: "image/jpeg", kind: "图片" },
  { ext: "gif", mime: "image/gif", kind: "图片" },
  { ext: "webp", mime: "image/webp", kind: "图片" },
  { ext: "svg", mime: "image/svg+xml", kind: "图片" },
  { ext: "ico", mime: "image/x-icon", kind: "图片" },
  { ext: "avif", mime: "image/avif", kind: "图片" },
  { ext: "mp3", mime: "audio/mpeg", kind: "音频" },
  { ext: "wav", mime: "audio/wav", kind: "音频" },
  { ext: "ogg", mime: "audio/ogg", kind: "音频" },
  { ext: "flac", mime: "audio/flac", kind: "音频" },
  { ext: "m4a", mime: "audio/mp4", kind: "音频" },
  { ext: "mp4", mime: "video/mp4", kind: "视频" },
  { ext: "webm", mime: "video/webm", kind: "视频" },
  { ext: "mov", mime: "video/quicktime", kind: "视频" },
  { ext: "mkv", mime: "video/x-matroska", kind: "视频" },
  { ext: "woff2", mime: "font/woff2", kind: "字体" },
  { ext: "woff", mime: "font/woff", kind: "字体" },
  { ext: "ttf", mime: "font/ttf", kind: "字体" },
  { ext: "otf", mime: "font/otf", kind: "字体" },
  { ext: "pdf", mime: "application/pdf", kind: "文档" },
  { ext: "doc", mime: "application/msword", kind: "文档" },
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "文档" },
  { ext: "xls", mime: "application/vnd.ms-excel", kind: "文档" },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "文档" },
  { ext: "ppt", mime: "application/vnd.ms-powerpoint", kind: "文档" },
  { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "文档" },
  { ext: "zip", mime: "application/zip", kind: "压缩" },
  { ext: "gz", mime: "application/gzip", kind: "压缩" },
  { ext: "tar", mime: "application/x-tar", kind: "压缩" },
  { ext: "7z", mime: "application/x-7z-compressed", kind: "压缩" },
  { ext: "js", mime: "text/javascript", kind: "代码" },
  { ext: "mjs", mime: "text/javascript", kind: "代码" },
  { ext: "ts", mime: "text/typescript", kind: "代码" },
  { ext: "py", mime: "text/x-python", kind: "代码" },
  { ext: "wasm", mime: "application/wasm", kind: "程序" },
  { ext: "bin", mime: "application/octet-stream", kind: "程序" },
];

export function searchMime(query: string): MimeEntry[] {
  const q = query.trim().toLowerCase().replace(/^\./, "");
  if (!q) return MIME_TYPES;
  return MIME_TYPES.filter(
    (item) => item.ext.includes(q) || item.mime.toLowerCase().includes(q) || item.kind.toLowerCase().includes(q),
  );
}
