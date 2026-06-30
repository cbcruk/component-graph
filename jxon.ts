/**
 * JXON framework - Copyleft 2011 by Mozilla Developer Network
 *
 * A complete, bidirectional, JXON (lossless JavaScript XML Object Notation) library.
 * TypeScript rewrite of https://github.com/tyrasd/jxon
 *
 * This framework is released under the GNU Public License, version 3 or later.
 * http://www.gnu.org/licenses/gpl-3.0-standalone.html
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type VerbosityLevel = 0 | 1 | 2 | 3;

export interface JXONConfig {
  /** Key used for text content in the JS object (default: '_') */
  valueKey?: string;
  /** Key used for nested attributes when nestedAttributes is true (default: '$') */
  attrKey?: string;
  /** Prefix prepended to attribute names (default: '$') */
  attrPrefix?: string;
  /** Convert tag names to lower case (default: false) */
  lowerCaseTags?: boolean;
  /** Use `true` instead of empty string for empty nodes (default: false) */
  trueIsEmpty?: boolean;
  /** Auto-parse date strings into Date objects (default: false) */
  autoDate?: boolean;
  /** Ignore XML nodes with a namespace prefix (default: false) */
  ignorePrefixedNodes?: boolean;
  /** Parse text values into native types (boolean, number, null) (default: false) */
  parseValues?: boolean;
  /** Custom error handler for DOMParser (node/xmldom only) */
  parserErrorHandler?: DOMParserErrorHandler;
}

export interface DOMParserErrorHandler {
  warning?: (msg: string) => void;
  error?: (msg: string) => void;
  fatalError?: (msg: string) => void;
}

export type JXONValue =
  | string
  | number
  | boolean
  | null
  | Date
  | JXONObject
  | JXONValue[];

export interface JXONObject {
  [key: string]: JXONValue;
}

// ─── Internal State ──────────────────────────────────────────────────────────

const opts: Required<Omit<JXONConfig, 'parserErrorHandler'>> & {
  parserErrorHandler?: DOMParserErrorHandler;
} = {
  valueKey: '_',
  attrKey: '$',
  attrPrefix: '$',
  lowerCaseTags: false,
  trueIsEmpty: false,
  autoDate: false,
  ignorePrefixedNodes: false,
  parseValues: false,
  parserErrorHandler: undefined,
};

const rIsNull = /^\s*$/;
const rIsBool = /^(?:true|false)$/i;

let domParser: DOMParser | null = null;

// ─── Internal Helpers ────────────────────────────────────────────────────────

function parseText(sValue: string): string | number | boolean | null | Date {
  if (!opts.parseValues) {
    return sValue;
  }

  if (rIsNull.test(sValue)) {
    return null;
  }

  if (rIsBool.test(sValue)) {
    return sValue.toLowerCase() === 'true';
  }

  if (isFinite(sValue as unknown as number) && sValue.trim() !== '') {
    return parseFloat(sValue);
  }

  if (opts.autoDate && isFinite(Date.parse(sValue))) {
    return new Date(sValue);
  }

  return sValue;
}

/**
 * Sentinel class representing an empty XML node.
 * toString() returns 'null', valueOf() returns null.
 */
class EmptyTree {
  toString(): string {
    return 'null';
  }
  valueOf(): null {
    return null;
  }
}

function objectify(vValue: unknown): object {
  if (vValue === null) return new EmptyTree();
  if (vValue instanceof Object) return vValue as object;
  // Wrap primitive in its object wrapper
  return Object(vValue) as object;
}

// ─── Core: XML → JS ─────────────────────────────────────────────────────────

function createObjTree(
  oParentNode: Node,
  nVerb: number,
  bFreeze: boolean,
  bNesteAttr: boolean,
): JXONValue {
  const CDATA = 4;
  const TEXT = 3;
  const ELEMENT = 1;

  const aCache: Element[] = [];

  const bChildren = oParentNode.hasChildNodes();
  const bAttributes =
    oParentNode.nodeType === ELEMENT &&
    (oParentNode as Element).hasAttributes?.();
  const bHighVerb = Boolean(nVerb & 2);

  let nLength = 0;
  let sCollectedTxt = '';
  let vResult: JXONValue = bHighVerb
    ? {}
    : opts.trueIsEmpty
      ? true
      : '';

  if (bChildren) {
    for (let nItem = 0; nItem < oParentNode.childNodes.length; nItem++) {
      const oNode = oParentNode.childNodes.item(nItem)!;

      if (oNode.nodeType === CDATA) {
        sCollectedTxt += oNode.nodeValue ?? '';
      } else if (oNode.nodeType === TEXT) {
        sCollectedTxt += (oNode.nodeValue ?? '').trim();
      } else if (
        oNode.nodeType === ELEMENT &&
        !(opts.ignorePrefixedNodes && (oNode as Element).prefix)
      ) {
        aCache.push(oNode as Element);
      }
    }
  }

  const vBuiltVal = parseText(sCollectedTxt);

  if (!bHighVerb && (bChildren || bAttributes)) {
    vResult = nVerb === 0 ? (objectify(vBuiltVal) as JXONValue) : {};
  }

  for (let nElId = 0; nElId < aCache.length; nElId++) {
    let sProp: string = aCache[nElId].nodeName;
    if (opts.lowerCaseTags) {
      sProp = sProp.toLowerCase();
    }

    const vContent = createObjTree(aCache[nElId], nVerb, bFreeze, bNesteAttr);
    const result = vResult as JXONObject;

    if (Object.prototype.hasOwnProperty.call(result, sProp)) {
      if (!Array.isArray(result[sProp])) {
        result[sProp] = [result[sProp] as JXONValue];
      }
      (result[sProp] as JXONValue[]).push(vContent);
    } else {
      result[sProp] = vContent;
      nLength++;
    }
  }

  if (bAttributes) {
    const element = oParentNode as Element;
    const nAttrLen = element.attributes.length;
    const sAPrefix = bNesteAttr ? '' : opts.attrPrefix;
    const oAttrParent: JXONObject = bNesteAttr ? {} : (vResult as JXONObject);

    for (let nAttrib = 0; nAttrib < nAttrLen; nLength++, nAttrib++) {
      const oAttrib = element.attributes.item(nAttrib)!;
      let oAttribName = oAttrib.name;
      if (opts.lowerCaseTags) {
        oAttribName = oAttribName.toLowerCase();
      }
      oAttrParent[sAPrefix + oAttribName] = parseText(oAttrib.value.trim());
    }

    if (bNesteAttr) {
      if (bFreeze) {
        Object.freeze(oAttrParent);
      }
      (vResult as JXONObject)[opts.attrKey] = oAttrParent as JXONValue;
      nLength -= nAttrLen - 1;
    }
  }

  if (
    nVerb === 3 ||
    ((nVerb === 2 || (nVerb === 1 && nLength > 0)) && sCollectedTxt)
  ) {
    (vResult as JXONObject)[opts.valueKey] = vBuiltVal;
  } else if (!bHighVerb && nLength === 0 && sCollectedTxt) {
    vResult = vBuiltVal;
  }

  if (bFreeze && (bHighVerb || nLength > 0)) {
    Object.freeze(vResult);
  }

  return vResult;
}

// ─── Core: JS → XML ─────────────────────────────────────────────────────────

function loadObjTree(
  oXMLDoc: Document,
  oParentEl: Element | Document,
  oParentObj: JXONValue,
): void {
  if (oParentObj === null || oParentObj === undefined) return;

  // Primitive values → text node
  if (
    typeof oParentObj === 'string' ||
    typeof oParentObj === 'number' ||
    typeof oParentObj === 'boolean'
  ) {
    oParentEl.appendChild(oXMLDoc.createTextNode(String(oParentObj)));
    return;
  }

  if (oParentObj instanceof Date) {
    oParentEl.appendChild(oXMLDoc.createTextNode(oParentObj.toISOString()));
    return;
  }

  // EmptyTree: wrapped primitive with valueOf() !== itself
  if (oParentObj instanceof EmptyTree) {
    return;
  }

  const parentElement = oParentEl as Element;
  const obj = oParentObj as JXONObject;

  for (const sName of Object.keys(obj)) {
    let vValue: JXONValue = obj[sName];

    if (vValue === undefined) continue;
    if (vValue === null) vValue = {};

    if (!isNaN(Number(sName)) || typeof vValue === 'function') continue;

    // Text content key
    if (sName === opts.valueKey) {
      if (vValue !== null && vValue !== true) {
        const text =
          vValue instanceof Date ? vValue.toISOString() : String(vValue);
        oParentEl.appendChild(oXMLDoc.createTextNode(text));
      }
    }
    // Nested attributes key (verbosity 3)
    else if (sName === opts.attrKey) {
      const attrs = vValue as JXONObject;
      for (const sAttrib of Object.keys(attrs)) {
        parentElement.setAttribute(sAttrib, String(attrs[sAttrib]));
      }
    }
    // xmlns attribute
    else if (sName === opts.attrPrefix + 'xmlns') {
      // namespace handling is done via createElementNS
    }
    // Attribute (prefixed)
    else if (sName.charAt(0) === opts.attrPrefix) {
      parentElement.setAttribute(sName.slice(1), String(vValue));
    }
    // Array of child elements
    else if (Array.isArray(vValue)) {
      for (const item of vValue) {
        const elementNS =
          (item &&
            typeof item === 'object' &&
            !Array.isArray(item) &&
            !(item instanceof Date) &&
            (item as JXONObject)[opts.attrPrefix + 'xmlns']) ||
          parentElement.namespaceURI;

        const oChild: Element = elementNS
          ? oXMLDoc.createElementNS(String(elementNS), sName)
          : oXMLDoc.createElement(sName);

        loadObjTree(
          oXMLDoc,
          oChild,
          item !== null && item !== undefined ? item : {},
        );
        oParentEl.appendChild(oChild);
      }
    }
    // Single child element
    else {
      const valObj =
        vValue && typeof vValue === 'object' && !Array.isArray(vValue) && !(vValue instanceof Date)
          ? (vValue as JXONObject)
          : null;
      const elementNS =
        (valObj && valObj[opts.attrPrefix + 'xmlns']) ||
        parentElement.namespaceURI;

      const oChild: Element = elementNS
        ? oXMLDoc.createElementNS(String(elementNS), sName)
        : oXMLDoc.createElement(sName);

      if (vValue && typeof vValue === 'object' && !(vValue instanceof Date)) {
        loadObjTree(oXMLDoc, oChild, vValue);
      } else if (
        vValue !== null &&
        (vValue !== true || !opts.trueIsEmpty)
      ) {
        oChild.appendChild(oXMLDoc.createTextNode(String(vValue)));
      }

      oParentEl.appendChild(oChild);
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Update JXON configuration options.
 */
export function config(cfg: JXONConfig): void {
  for (const k of Object.keys(cfg) as Array<keyof JXONConfig>) {
    (opts as Record<string, unknown>)[k] = cfg[k];
  }
  // Reset DOMParser if a custom error handler is provided (relevant for xmldom in Node.js)
  if (cfg.parserErrorHandler) {
    domParser = null;
  }
}

/**
 * Convert an XML Document/Element to a JS object (JXON notation).
 * Alias: `build`
 *
 * @param oXMLParent      - XML node to convert
 * @param nVerbosity      - Verbosity level 0–3 (default: 1)
 * @param bFreeze         - Freeze the resulting object (default: false)
 * @param bNesteAttributes - Nest attributes under attrKey (default: auto based on verbosity)
 */
export function xmlToJs(
  oXMLParent: Node,
  nVerbosity?: VerbosityLevel,
  bFreeze?: boolean,
  bNesteAttributes?: boolean,
): JXONValue {
  const _nVerb: number =
    nVerbosity !== undefined ? nVerbosity & 3 : 1;
  return createObjTree(
    oXMLParent,
    _nVerb,
    bFreeze ?? false,
    bNesteAttributes !== undefined ? bNesteAttributes : _nVerb === 3,
  );
}

/** Alias for xmlToJs */
export const build = xmlToJs;

/**
 * Convert a JS object (JXON notation) to an XML Document.
 * Alias: `unbuild`
 *
 * @param oObjTree         - JS object to convert
 * @param sNamespaceURI    - Optional namespace URI
 * @param sQualifiedName   - Optional qualified name for root element
 * @param oDocumentType    - Optional DocumentType
 */
export function jsToXml(
  oObjTree: JXONObject,
  sNamespaceURI?: string | null,
  sQualifiedName?: string,
  oDocumentType?: DocumentType | null,
): Document {
  const impl = document.implementation;
  const oNewDoc = impl.createDocument(
    sNamespaceURI ?? null,
    sQualifiedName ?? '',
    oDocumentType ?? null,
  );
  loadObjTree(oNewDoc, oNewDoc.documentElement ?? oNewDoc, oObjTree);
  return oNewDoc;
}

/** Alias for jsToXml */
export const unbuild = jsToXml;

/**
 * Parse an XML string into an XML Document.
 */
export function stringToXml(xmlStr: string): Document {
  if (!domParser) {
    domParser = new DOMParser();
  }
  return domParser.parseFromString(xmlStr, 'application/xml');
}

/**
 * Serialize an XML Document/Node to a string.
 */
export function xmlToString(xmlObj: Document | Node): string {
  return new XMLSerializer().serializeToString(xmlObj);
}

/**
 * Convert an XML string directly to a JS object.
 */
export function stringToJs(str: string): JXONValue {
  const xmlObj = stringToXml(str);
  return xmlToJs(xmlObj);
}

/**
 * Convert a JS object directly to an XML string.
 * Alias: `stringify`
 */
export function jsToString(
  oObjTree: JXONObject,
  sNamespaceURI?: string | null,
  sQualifiedName?: string,
  oDocumentType?: DocumentType | null,
): string {
  return xmlToString(
    jsToXml(oObjTree, sNamespaceURI, sQualifiedName, oDocumentType),
  );
}

/** Alias for jsToString */
export const stringify = jsToString;

/**
 * Helper to iterate over node(s) as an array.
 * JXON returns a single object for one child, an array for multiple.
 * This normalizes iteration.
 */
export function each<T>(
  arr: T | T[],
  func: (value: T, index: number, array: T[]) => void,
  thisArg?: unknown,
): void {
  if (Array.isArray(arr)) {
    arr.forEach(func, thisArg);
  } else {
    [arr].forEach(func, thisArg);
  }
}

// ─── Default Export ──────────────────────────────────────────────────────────

const jxon = {
  config,
  xmlToJs,
  build,
  jsToXml,
  unbuild,
  stringToXml,
  xmlToString,
  stringToJs,
  jsToString,
  stringify,
  each,
};

export default jxon;
