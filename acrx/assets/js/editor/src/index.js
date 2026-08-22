// src/index.js - Main entry point

import { createEditor, registerBuiltinModule } from "./engine.js";
import { basicMarks } from "./modules/basicMarks.js";
import { link } from "./modules/link.js";
import { history } from "./modules/history.js";
import { tables } from "./modules/tables.js";
import { lists } from "./modules/lists.js";
import { markdown } from "./modules/markdown.js";
import { paste } from "./modules/paste.js";
import { contextMenu } from "./modules/contextMenu.js";
import { blocks } from "./modules/blocks.js";
import { gestures } from "./modules/gestures.js";

// Register built-in modules
registerBuiltinModule("basicMarks", basicMarks);
registerBuiltinModule("link", link);
registerBuiltinModule("history", history);
registerBuiltinModule("tables", tables);
registerBuiltinModule("lists", lists);
registerBuiltinModule("markdown", markdown);
registerBuiltinModule("paste", paste);
registerBuiltinModule("contextMenu", contextMenu);
registerBuiltinModule("blocks", blocks);
registerBuiltinModule("gestures", gestures);

export { createEditor, registerBuiltinModule, registerAtomicTypes };
export { basicMarks } from "./modules/basicMarks.js";
export { link } from "./modules/link.js";
export { history } from "./modules/history.js";
export { tables } from "./modules/tables.js";
export { lists } from "./modules/lists.js";
export { markdown } from "./modules/markdown.js";
export { paste } from "./modules/paste.js";
export { contextMenu } from "./modules/contextMenu.js";
export { blocks } from "./modules/blocks.js";
export { gestures } from "./modules/gestures.js";
