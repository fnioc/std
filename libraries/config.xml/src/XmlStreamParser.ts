// XmlStreamParser -- the XML text -> flat key/value pairs parser shared by
// XmlConfigProvider (file) and XmlStreamConfigProvider (in-memory
// payload); mirrors the reference `XmlStreamConfigProvider.Read` +
// `ProvideConfiguration`.
//
// A minimal, self-contained tokenizer + tree walk -- NO XML-parser dependency
// (a dep would violate the zero-ambient-types ethos, docs §39/§44). The grammar
// is closed and bounded:
//
//   - Recognizes elements, end tags, self-closing elements, text, and CDATA
//     (treated as text). Ignores the XML declaration, processing instructions,
//     comments, and whitespace-only text.
//   - Expands ONLY the five predefined entities (&lt; &gt; &amp; &quot; &apos;);
//     any other entity is a FormatError. A DTD (`<!DOCTYPE`) is prohibited.
//   - A namespaced element or attribute name (one containing `:`) is a
//     FormatError -- namespaces are not supported.
//
// Key construction (matching the reference): the root element contributes only
// its `Name` attribute to the prefix, never its element name. A descendant
// element pushes its element name; a case-insensitive `Name` attribute pushes
// an extra segment right after it AND is additionally emitted as an ordinary
// `elementPath:Name` attribute pair (the reference reads Name both for the
// prefix and as a normal attribute). Repeated sibling elements (same
// element-name[:Name]) each push a numeric index. Other attributes map to
// `elementPath:AttrName`, text maps to `elementPath`, and a duplicate resolved
// key is a FormatError.
//
// SIMPLIFICATION (flagged) from the reference: the reference's SingleChild /
// ChildrenBySiblingName perf optimization (skip the dictionary for one-child
// elements) is collapsed to a plain children array grouped at walk time --
// semantically identical, without the micro-optimization. XmlDocumentDecryptor
// / EncryptedData (DPAPI-encrypted config) is omitted entirely -- no analog.

import { configPath } from '@rhombus-std/config';
import { FormatError } from '@rhombus-std/config.file';

const NAME_ATTRIBUTE = 'Name';
const PREDEFINED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

interface XmlAttribute {
  name: string;
  value: string;
}

/** A parsed element node -- element name, optional `Name` attribute, attributes, text, children. */
class XmlElement {
  public readonly elementName: string;
  public readonly nameAttribute: string | undefined;
  public readonly siblingName: string;
  public readonly attributes: XmlAttribute[];
  public text: string | undefined;
  public readonly children: XmlElement[] = [];

  public constructor(elementName: string, nameAttribute: string | undefined, attributes: XmlAttribute[]) {
    this.elementName = elementName;
    this.nameAttribute = nameAttribute;
    this.attributes = attributes;
    this.siblingName = nameAttribute ? `${elementName}:${nameAttribute}` : elementName;
  }
}

export const XmlStreamParser = {
  /** Parses XML `content` into ordered `[key, value]` pairs. */
  parse(content: string): Array<[key: string, value: string]> {
    const root = buildTree(content);
    return provideConfig(root);
  },
};

// -- tokenize + build the element tree -------------------------------------

function buildTree(input: string): XmlElement | undefined {
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let previousWasElementStart = false;
  let i = 0;

  while (i < input.length) {
    if (input[i] !== '<') {
      // Text run up to the next '<'. A whitespace-ONLY run is ignored (like
      // the reference's IgnoreWhitespace); a run with any non-space content is
      // kept verbatim (whitespace preserved), matching the reference which
      // does not trim significant text.
      const end = input.indexOf('<', i);
      const rawText = input.slice(i, end < 0 ? input.length : end);
      if (rawText.trim()) {
        setText(stack, expandEntities(rawText));
        previousWasElementStart = false;
      }
      i = end < 0 ? input.length : end;
      continue;
    }

    if (startsWith(input, i, '<?')) {
      i = requireIndexOf(input, '?>', i + 2, 'unterminated processing instruction') + 2;
      continue;
    }
    if (startsWith(input, i, '<!--')) {
      i = requireIndexOf(input, '-->', i + 4, 'unterminated comment') + 3;
      continue;
    }
    if (startsWith(input, i, '<![CDATA[')) {
      const end = requireIndexOf(input, ']]>', i + 9, 'unterminated CDATA section');
      // CDATA is verbatim text (no entity expansion).
      setText(stack, input.slice(i + 9, end));
      previousWasElementStart = false;
      i = end + 3;
      continue;
    }
    if (startsWith(input, i, '<!')) {
      throw new FormatError('A DTD is prohibited in XML configuration.');
    }

    if (startsWith(input, i, '</')) {
      const end = requireIndexOf(input, '>', i + 2, 'unterminated end tag');
      const closed = stack.pop();
      // An end tag immediately after this element's start tag (no text between)
      // means an empty element like <a></a> -- contribute an empty-string value.
      if (closed && previousWasElementStart && closed.text === undefined) {
        closed.text = '';
      }
      previousWasElementStart = false;
      i = end + 1;
      continue;
    }

    // Start tag: read up to the matching '>' (attribute values can't contain
    // '>' unescaped, so a bare scan is safe for this grammar).
    const end = requireIndexOf(input, '>', i + 1, 'unterminated start tag');
    let inner = input.slice(i + 1, end);
    const selfClosing = inner.endsWith('/');
    if (selfClosing) {
      inner = inner.slice(0, -1);
    }

    const element = parseStartTag(inner);
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(element);
    } else if (root === undefined) {
      root = element;
    }

    if (selfClosing) {
      // A self-closing element completes immediately; per the reference it
      // gets NO text content (distinct from <a></a>). Treat as if an end tag
      // followed, so the next node isn't seen as "right after a start".
      previousWasElementStart = false;
    } else {
      stack.push(element);
      previousWasElementStart = true;
    }
    i = end + 1;
  }

  return root;
}

/** Assigns text to the element currently on top of the stack (if any). */
function setText(stack: XmlElement[], text: string): void {
  const current = stack[stack.length - 1];
  if (current) {
    current.text = text;
  }
}

/** Parses an element's name + attributes from the inside of a start tag. */
function parseStartTag(inner: string): XmlElement {
  const trimmed = inner.trim();
  let cursor = 0;
  while (cursor < trimmed.length && !isSpace(trimmed[cursor]!)) {
    cursor++;
  }
  const elementName = trimmed.slice(0, cursor);
  rejectNamespaced(elementName);

  const attributes: XmlAttribute[] = [];
  let nameAttribute: string | undefined;

  for (const [attrName, attrValue] of parseAttributes(trimmed.slice(cursor))) {
    if (attrName.toLowerCase() === NAME_ATTRIBUTE.toLowerCase()) {
      // The special "Name" attribute contributes to the prefix -- AND is still
      // emitted as an ordinary `<prefix>:Name` attribute pair. The reference
      // reads it twice: GetName pulls it for the prefix while ReadAttributes
      // adds *every* attribute (Name included) to element.Attributes, so keys
      // like `Data:DefaultConnection:Name` are produced alongside the prefix
      // contribution. Set nameAttribute but fall through to push it too.
      nameAttribute = attrValue;
    }
    rejectNamespaced(attrName);
    attributes.push({ name: attrName, value: attrValue });
  }

  return new XmlElement(elementName, nameAttribute, attributes);
}

/** Yields `[name, value]` for each `name="value"` (or single-quoted) attribute. */
function* parseAttributes(text: string): Generator<[name: string, value: string]> {
  let i = 0;
  while (i < text.length) {
    while (i < text.length && isSpace(text[i]!)) {
      i++;
    }
    if (i >= text.length) {
      return;
    }
    const nameStart = i;
    while (i < text.length && text[i] !== '=' && !isSpace(text[i]!)) {
      i++;
    }
    const name = text.slice(nameStart, i);
    while (i < text.length && isSpace(text[i]!)) {
      i++;
    }
    if (text[i] !== '=') {
      throw new FormatError(`Malformed attribute '${name}' in XML configuration.`);
    }
    i++;
    while (i < text.length && isSpace(text[i]!)) {
      i++;
    }
    const quote = text[i];
    if (quote !== '"' && quote !== "'") {
      throw new FormatError(`Attribute '${name}' value must be quoted in XML configuration.`);
    }
    i++;
    const valueStart = i;
    while (i < text.length && text[i] !== quote) {
      i++;
    }
    if (i >= text.length) {
      throw new FormatError(`Unterminated attribute '${name}' value in XML configuration.`);
    }
    const value = expandEntities(text.slice(valueStart, i));
    i++;
    yield [name, value];
  }
}

// -- walk the tree into configuration pairs --------------------------------

function provideConfig(root: XmlElement | undefined): Array<[key: string, value: string]> {
  const pairs: Array<[key: string, value: string]> = [];
  if (root === undefined) {
    return pairs;
  }

  const seen = new Set<string>();
  const prefix = new Prefix();

  // The root element contributes only its Name attribute to the prefix.
  if (root.nameAttribute) {
    prefix.push(root.nameAttribute);
  }
  processElement(prefix, root, pairs, seen);
  return pairs;
}

function processElement(
  prefix: Prefix,
  element: XmlElement,
  pairs: Array<[key: string, value: string]>,
  seen: Set<string>,
): void {
  for (const attribute of element.attributes) {
    prefix.push(attribute.name);
    addPair(prefix.value, attribute.value, pairs, seen);
    prefix.pop();
  }

  if (element.text !== undefined) {
    addPair(prefix.value, element.text, pairs, seen);
  }

  for (const group of groupChildren(element.children)) {
    if (group.length === 1) {
      processChild(prefix, group[0]!, undefined, pairs, seen);
    } else {
      group.forEach((child, index) => processChild(prefix, child, index, pairs, seen));
    }
  }
}

function processChild(
  prefix: Prefix,
  child: XmlElement,
  index: number | undefined,
  pairs: Array<[key: string, value: string]>,
  seen: Set<string>,
): void {
  prefix.push(child.elementName);
  if (child.nameAttribute) {
    prefix.push(child.nameAttribute);
  }
  if (index !== undefined) {
    prefix.push(String(index));
  }

  processElement(prefix, child, pairs, seen);

  if (index !== undefined) {
    prefix.pop();
  }
  if (child.nameAttribute) {
    prefix.pop();
  }
  prefix.pop();
}

/** Groups children by their (case-insensitive) sibling name, preserving first-seen order. */
function groupChildren(children: XmlElement[]): XmlElement[][] {
  const groups = new Map<string, XmlElement[]>();
  for (const child of children) {
    const key = child.siblingName.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.push(child);
    } else {
      groups.set(key, [child]);
    }
  }
  return [...groups.values()];
}

function addPair(
  key: string,
  value: string,
  pairs: Array<[key: string, value: string]>,
  seen: Set<string>,
): void {
  const folded = key.toLowerCase();
  if (seen.has(folded)) {
    throw new FormatError(`A duplicate key '${key}' was found.`);
  }
  seen.add(folded);
  pairs.push([key, value]);
}

/** Builds configuration keys with push/pop, mirroring the reference `Prefix` helper. */
class Prefix {
  #value = '';
  readonly #lengths: number[] = [];

  public get value(): string {
    return this.#value;
  }

  public push(segment: string): void {
    if (this.#value.length) {
      const added = configPath.KeyDelimiter + segment;
      this.#value += added;
      this.#lengths.push(added.length);
    } else {
      this.#value += segment;
      this.#lengths.push(segment.length);
    }
  }

  public pop(): void {
    const length = this.#lengths.pop() ?? 0;
    this.#value = this.#value.slice(0, this.#value.length - length);
  }
}

// -- small helpers ---------------------------------------------------------

function expandEntities(text: string): string {
  if (!text.includes('&')) {
    return text;
  }
  return text.replace(/&(#?[^;]*);/g, (match, body: string) => {
    if (body.startsWith('#')) {
      const codePoint = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (Number.isNaN(codePoint)) {
        throw new FormatError(`Invalid numeric character reference '${match}' in XML configuration.`);
      }
      return String.fromCodePoint(codePoint);
    }
    const replacement = PREDEFINED_ENTITIES[body];
    if (replacement === undefined) {
      throw new FormatError(`Undefined entity '${match}' in XML configuration.`);
    }
    return replacement;
  });
}

function rejectNamespaced(name: string): void {
  if (name.includes(':')) {
    throw new FormatError(`XML namespaces are not supported (in '${name}').`);
  }
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function startsWith(input: string, at: number, token: string): boolean {
  return input.startsWith(token, at);
}

function requireIndexOf(input: string, token: string, from: number, message: string): number {
  const index = input.indexOf(token, from);
  if (index < 0) {
    throw new FormatError(`${message} in XML configuration.`);
  }
  return index;
}
