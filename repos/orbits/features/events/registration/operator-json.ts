export class UniqueJsonParseError extends Error {
  constructor() {
    super("Operator JSON is invalid.");
    this.name = "UniqueJsonParseError";
  }
}

function invalid(): never {
  throw new UniqueJsonParseError();
}

/**
 * Parses JSON while preserving the evidence that native JSON.parse discards:
 * duplicate object keys. The parser follows the JSON grammar at every nesting
 * level and never returns a partially parsed value.
 */
export function parseJsonWithUniqueObjectKeys(input: unknown): unknown {
  try {
    if (typeof input !== "string") invalid();
    let index = 0;

    const whitespace = () => {
      while (
        input[index] === " " || input[index] === "\t" ||
        input[index] === "\n" || input[index] === "\r"
      ) index += 1;
    };

    const string = (): string => {
      const start = index;
      if (input[index] !== '"') invalid();
      index += 1;
      let closed = false;
      while (index < input.length) {
        if (input[index] === "\\") {
          index += 2;
          continue;
        }
        if (input[index] === '"') {
          index += 1;
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) invalid();
      const value = JSON.parse(input.slice(start, index)) as unknown;
      if (typeof value !== "string") invalid();
      return value;
    };

    const value = (): unknown => {
      whitespace();
      const character = input[index];
      if (character === '"') return string();
      if (character === "{") {
        index += 1;
        whitespace();
        const output: Record<string, unknown> = {};
        const keys = new Set<string>();
        if (input[index] === "}") {
          index += 1;
          return output;
        }
        while (index < input.length) {
          const key = string();
          if (keys.has(key)) invalid();
          keys.add(key);
          whitespace();
          if (input[index] !== ":") invalid();
          index += 1;
          const item = value();
          Object.defineProperty(output, key, {
            configurable: true,
            enumerable: true,
            value: item,
            writable: true,
          });
          whitespace();
          if (input[index] === "}") {
            index += 1;
            return output;
          }
          if (input[index] !== ",") invalid();
          index += 1;
          whitespace();
        }
        invalid();
      }
      if (character === "[") {
        index += 1;
        whitespace();
        const output: unknown[] = [];
        if (input[index] === "]") {
          index += 1;
          return output;
        }
        while (index < input.length) {
          output.push(value());
          whitespace();
          if (input[index] === "]") {
            index += 1;
            return output;
          }
          if (input[index] !== ",") invalid();
          index += 1;
        }
        invalid();
      }
      for (const [token, result] of [
        ["true", true], ["false", false], ["null", null],
      ] as const) {
        if (input.startsWith(token, index)) {
          index += token.length;
          return result;
        }
      }
      const match = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/uy;
      match.lastIndex = index;
      const number = match.exec(input);
      if (!number) invalid();
      index = match.lastIndex;
      return JSON.parse(number[0]) as unknown;
    };

    const parsed = value();
    whitespace();
    if (index !== input.length) invalid();
    return parsed;
  } catch (error) {
    if (error instanceof UniqueJsonParseError) throw error;
    invalid();
  }
}
