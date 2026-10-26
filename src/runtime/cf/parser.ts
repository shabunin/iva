export interface CFProject {
    properties: CFProperties;
    themes: Record<string, CFTheme>;
    pages: Record<string, CFPage>;
    subpages: Record<string, CFSubpage>;
    startPage: string;
    macros: CFNode[];
    systems: CFNode[];
    sounds: CFNode[];
    scripts: CFNode[];
    tokens: CFNode[];
    commands: Record<string, CFNode>;
}

export interface CFProperties {
    landscape?: { width: number; height: number };
    portrait?: { width: number; height: number };
    [key: string]: any;
}

export interface CFTheme {
    type: string;
    name: string;
    states: Record<string, Record<string, string>>;
    cssTexts: Record<string, string>;
}

export interface CFPage {
    name: string;
    start: boolean;
    attributes: Record<string, string>;
    landscapeTheme?: string;
    portraitTheme?: string;
    landscape?: CFNode[];
    portrait?: CFNode[];
    landscapeAttributes?: Record<string, string>;
    portraitAttributes?: Record<string, string>;
}

export interface CFSubpage {
    name: string;
    w: number;
    h: number;
    theme?: string;
    attributes: Record<string, string>;
    nodes: CFNode[];
}

export interface CFNode {
    type: string;
    attributes: Record<string, string>;
    children: CFNode[];
    text?: string;
    
    // For backwards compatibility:
    id?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    j?: string;
    s?: string;
    a?: string;
    d?: string;
    t?: string;
    v?: string;
    flip?: string;
    sim?: string;
    headerSub?: string;
    titleSub?: string;
    contentSub?: string;
    footerSub?: string;
    orientation?: string;
    inactiveText?: string;
    activeText?: string;
    inactive_s?: string;
    active_s?: string;
    content?: string;
    js?: string;
    repeatdelay?: number;
    name?: string;
    dragCmd?: string;
    cmd?: string;
    pressCmd?: string;
    releaseCmd?: string;
    scrollCmd?: string;
}

export function parseCSS(cssString: string): Record<string, string> {
    const result: Record<string, string> = {};
    const declarations = cssString.split(';');
    for (const decl of declarations) {
        const colonIndex = decl.indexOf(':');
        if (colonIndex !== -1) {
            const property = decl.substring(0, colonIndex).trim();
            const value = decl.substring(colonIndex + 1).trim();
            result[property] = value;
        }
    }
    return result;
}

export function parseThemeName(rawName: string): { name: string; state: string } {
    let name = rawName;
    let state = "0";
    if (name.startsWith(".")) name = name.substring(1);
    const bracketIndex = name.indexOf("[");
    if (bracketIndex !== -1) {
        const statePart = name.substring(bracketIndex);
        name = name.substring(0, bracketIndex);
        const match = statePart.match(/state='(\d+)'/);
        if (match) state = match[1];
    }
    return { name, state };
}

/**
 * A .gui element as the runtime reads it, its children too - at once: an
 * await a node (tens of thousands in a big GUI) and a pause every 50 cost a
 * slow phone seconds (a Nexus 5: 3.9 s for the gallery's 700 KB .gui).
 */
export function parseNode(element: Element): CFNode {
    const type = element.tagName.toLowerCase();
    const attributes: Record<string, string> = {};
    for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        attributes[attr.name] = attr.value;
    }

    const children: CFNode[] = [];
    let hasElementChildren = false;
    for (let i = 0; i < element.children.length; i++) {
        hasElementChildren = true;
        children.push(parseNode(element.children[i]));
    }

    const node: CFNode = {
        type,
        attributes,
        children,
        x: parseInt(attributes["x"] || "0", 10),
        y: parseInt(attributes["y"] || "0", 10),
        w: parseInt(attributes["w"] || "0", 10),
        h: parseInt(attributes["h"] || "0", 10),
        j: attributes["j"],
        s: attributes["s"],
        a: attributes["a"],
        d: attributes["d"],
        t: attributes["t"],
        v: attributes["v"],
        flip: attributes["flip"],
        sim: attributes["sim"],
        headerSub: attributes["headerSub"],
        titleSub: attributes["titleSub"],
        contentSub: attributes["contentSub"],
        footerSub: attributes["footerSub"],
        orientation: attributes["orientation"],
        js: attributes["js"],
        repeatdelay: attributes["repeatdelay"] ? parseInt(attributes["repeatdelay"], 10) : undefined,
        name: attributes["name"],
        id: attributes["id"],
        dragCmd: attributes["dragCmd"],
        cmd: attributes["cmd"],
        pressCmd: attributes["pressCmd"],
        releaseCmd: attributes["releaseCmd"],
        scrollCmd: attributes["scrollCmd"],
    };

    const jsChild = children.find(c => c.type === "js");
    if (jsChild && jsChild.text) {
        node.js = jsChild.text;
    }

    if (type === "btn") {
        const inactive = children.find(c => c.type === "inactive");
        const active = children.find(c => c.type === "active");
        if (inactive) {
            const txtChild = inactive.children.find(c => c.type === "txt");
            if (txtChild) {
                node.inactiveText = txtChild.text !== "#" ? (txtChild.text || "") : "";
            } else {
                let txt = inactive.text || inactive.attributes["text"] || "";
                if (txt === "#") txt = "";
                node.inactiveText = txt;
            }
            if (inactive.attributes["s"]) {
                node.inactive_s = inactive.attributes["s"];
            }
        }
        if (active) {
            const txtChild = active.children.find(c => c.type === "txt");
            if (txtChild) {
                node.activeText = txtChild.text !== "#" ? (txtChild.text || "") : "";
            } else {
                let txt = active.text || active.attributes["text"] || "";
                if (txt === "#") txt = "";
                node.activeText = txt;
            }
            if (active.attributes["s"]) {
                node.active_s = active.attributes["s"];
            }
        }
    } else {
        let directText = "";
        for (let i = 0; i < element.childNodes.length; i++) {
            if (element.childNodes[i].nodeType === 3) { // Node.TEXT_NODE
                directText += element.childNodes[i].nodeValue || "";
            }
        }
        // a button state's text as iViewer keeps it: every character, newlines too (GUI Designer's
        // "\n\nUNLOCK<img>" puts it two lines down, under the icon)
        node.text = type === "inactive" || type === "active" ? directText : directText.trim();
        if ((type === "txt" || type === "img") && node.text !== "#") {
            node.content = node.text;
        }
    }

    return node;
}

/** An element's children as the runtime reads them. */
export function parseNodeList(element: Element): CFNode[] {
    const nodes: CFNode[] = [];
    for (let i = 0; i < element.children.length; i++) nodes.push(parseNode(element.children[i]));
    return nodes;
}

/** parseNode, as it was called before (async) */
export async function parseGenericNode(element: Element): Promise<CFNode> {
    return parseNode(element);
}

/** parseNodeList, as it was called before (async) */
export async function parseNodes(element: Element): Promise<CFNode[]> {
    return parseNodeList(element);
}

export async function parseGUI(xmlString: string): Promise<CFProject> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");

    const project: CFProject = {
        properties: {},
        themes: {},
        pages: {},
        subpages: {},
        startPage: "",
        macros: [],
        systems: [],
        sounds: [],
        scripts: [],
        tokens: [],
        commands: {}
    };

    const root = doc.querySelector("gui") || doc.documentElement;

    // Collect ALL <cmd> nodes — they can be at the root level OR
    // nested inside <system> nodes. Use the full document querySelectorAll
    // so we don't miss system-embedded commands.
    const cmdElements = Array.from(root.querySelectorAll("cmd"));
    for (const cmdNode of cmdElements) {
        const cmdName = cmdNode.getAttribute("name");
        if (cmdName) {
            project.commands[cmdName] = parseNode(cmdNode);
        }
    }


    const propertiesNode = root.querySelector("properties");
    if (propertiesNode) {
        const landscapeNode = propertiesNode.querySelector("size > landscape");
        if (landscapeNode) {
            project.properties.landscape = {
                width: parseInt(landscapeNode.getAttribute("width") || "0", 10),
                height: parseInt(landscapeNode.getAttribute("height") || "0", 10)
            };
        }
        const portraitNode = propertiesNode.querySelector("size > portrait");
        if (portraitNode) {
            project.properties.portrait = {
                width: parseInt(portraitNode.getAttribute("width") || "0", 10),
                height: parseInt(portraitNode.getAttribute("height") || "0", 10)
            };
        }
        // Save generic properties
        project.properties.raw = parseNode(propertiesNode);
    }

    const themesNode = root.querySelector("themes");
    if (themesNode) {
        const themeElements = Array.from(themesNode.querySelectorAll("theme"));
        for (const themeNode of themeElements) {
            const rawName = themeNode.getAttribute("name") || "";
            const type = themeNode.getAttribute("type") || "";
            const cssText = themeNode.textContent || "";
            const { name, state } = parseThemeName(rawName);
            const cssProps = parseCSS(cssText);

            if (!project.themes[name]) {
                project.themes[name] = { type, name, states: {}, cssTexts: {} };
            }
            project.themes[name].states[state] = cssProps;
            project.themes[name].cssTexts[state] = cssText;
        }
    }

    const pageElements = Array.from(root.querySelectorAll("page"));
    for (const pageNode of pageElements) {
        const name = pageNode.getAttribute("name") || "";
        const start = pageNode.getAttribute("start") === "1";
        if (start && !project.startPage) project.startPage = name;

        const attributes: Record<string, string> = {};
        for (let i = 0; i < pageNode.attributes.length; i++) {
            attributes[pageNode.attributes[i].name] = pageNode.attributes[i].value;
        }

        const page: CFPage = { name, start, attributes };

        const portrait = pageNode.querySelector("portrait");
        if (portrait) {
            page.portraitTheme = portrait.getAttribute("t") || undefined;
            page.portraitAttributes = {};
            for (let i = 0; i < portrait.attributes.length; i++) {
                page.portraitAttributes[portrait.attributes[i].name] = portrait.attributes[i].value;
            }
            page.portrait = parseNodeList(portrait);
        }

        const landscape = pageNode.querySelector("landscape");
        if (landscape) {
            page.landscapeTheme = landscape.getAttribute("t") || undefined;
            page.landscapeAttributes = {};
            for (let i = 0; i < landscape.attributes.length; i++) {
                page.landscapeAttributes[landscape.attributes[i].name] = landscape.attributes[i].value;
            }
            page.landscape = parseNodeList(landscape);
        }

        project.pages[name] = page;
    }

    const subpageElements = Array.from(root.querySelectorAll("gui > subpage"));
    for (const subpageNode of subpageElements) {
        const name = subpageNode.getAttribute("name") || "";
        const attributes: Record<string, string> = {};
        for (let i = 0; i < subpageNode.attributes.length; i++) {
            attributes[subpageNode.attributes[i].name] = subpageNode.attributes[i].value;
        }
        
        project.subpages[name] = {
            name,
            w: parseInt(attributes["w"] || "0", 10),
            h: parseInt(attributes["h"] || "0", 10),
            theme: attributes["t"],
            attributes,
            nodes: parseNodeList(subpageNode)
        };
    }

    const macrosNode = root.querySelector("gui > macros");
    if (macrosNode) project.macros = parseNodeList(macrosNode);

    const systemsNode = root.querySelector("gui > systems");
    if (systemsNode) project.systems = parseNodeList(systemsNode);

    const soundsNode = root.querySelector("gui > sounds");
    if (soundsNode) project.sounds = parseNodeList(soundsNode);

    const scriptsNode = root.querySelector("gui > scripts");
    if (scriptsNode) project.scripts = parseNodeList(scriptsNode);

    const tokensNode = root.querySelector("gui > tokens");
    if (tokensNode) project.tokens = parseNodeList(tokensNode);

    return project;
}
