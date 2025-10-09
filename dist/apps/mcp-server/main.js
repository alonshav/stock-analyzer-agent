#!/usr/bin/env node
const Module = require("module");
const path = require("path");
const fs = require("fs");
const originalResolveFilename = Module._resolveFilename;
const distPath = __dirname;
const manifest = [{ "module": "@stock-analyzer/shared/config", "exactMatch": "libs/shared/config/src/index.js", "pattern": "libs/shared/config/src/index.ts" }, { "module": "@stock-analyzer/shared/schemas", "exactMatch": "libs/shared/schemas/src/index.js", "pattern": "libs/shared/schemas/src/index.ts" }, { "module": "@stock-analyzer/shared/types", "exactMatch": "libs/shared/types/src/index.js", "pattern": "libs/shared/types/src/index.ts" }, { "module": "@stock-analyzer/shared/utils", "exactMatch": "libs/shared/utils/src/index.js", "pattern": "libs/shared/utils/src/index.ts" }, { "module": "@stock-analyzer/agent/api", "exactMatch": "libs/agent/api/src/index.js", "pattern": "libs/agent/api/src/index.ts" }, { "module": "@stock-analyzer/agent/core", "exactMatch": "libs/agent/core/src/index.js", "pattern": "libs/agent/core/src/index.ts" }, { "module": "@stock-analyzer/bot/common", "exactMatch": "libs/bot/common/src/index.js", "pattern": "libs/bot/common/src/index.ts" }, { "module": "@stock-analyzer/bot/telegram", "exactMatch": "libs/bot/telegram/src/index.js", "pattern": "libs/bot/telegram/src/index.ts" }, { "module": "@stock-analyzer/mcp/integrations", "exactMatch": "libs/mcp/integrations/src/index.js", "pattern": "libs/mcp/integrations/src/index.ts" }, { "module": "@stock-analyzer/mcp/server", "exactMatch": "libs/mcp/server/src/index.js", "pattern": "libs/mcp/server/src/index.ts" }, { "module": "@stock-analyzer/mcp/tools", "exactMatch": "libs/mcp/tools/src/index.js", "pattern": "libs/mcp/tools/src/index.ts" }];
Module._resolveFilename = function(request, parent) {
  let found;
  for (const entry of manifest) {
    if (request === entry.module && entry.exactMatch) {
      const entry2 = manifest.find((x) => request === x.module || request.startsWith(x.module + "/"));
      const candidate = path.join(distPath, entry2.exactMatch);
      if (isFile(candidate)) {
        found = candidate;
        break;
      }
    } else {
      const re = new RegExp(entry.module.replace(/\*$/, "(?<rest>.*)"));
      const match = request.match(re);
      if (match?.groups) {
        const candidate = path.join(distPath, entry.pattern.replace("*", ""), match.groups.rest);
        if (isFile(candidate)) {
          found = candidate;
        }
      }
    }
  }
  if (found) {
    const modifiedArguments = [found, ...[].slice.call(arguments, 1)];
    return originalResolveFilename.apply(this, modifiedArguments);
  } else {
    return originalResolveFilename.apply(this, arguments);
  }
};
function isFile(s) {
  try {
    require.resolve(s);
    return true;
  } catch (_e) {
    return false;
  }
}
module.exports = require("./apps/mcp-server/src/main.js");
