import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

const MAX_REVIEWED_FILE_BYTES = BigInt(65_536);

export class OperatorReviewedFileError extends Error {
  constructor() {
    super("Operator reviewed file is invalid.");
    this.name = "OperatorReviewedFileError";
  }
}

export interface OperatorReviewedFileSnapshot {
  readonly ctimeNs: bigint;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mtimeNs: bigint;
  readonly size: bigint;
}

export function operatorReviewedFileSnapshotMatches(
  left: OperatorReviewedFileSnapshot,
  right: OperatorReviewedFileSnapshot,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function readExact(
  handle: Awaited<ReturnType<typeof open>>,
  size: number,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(size);
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.read(
      bytes,
      offset,
      bytes.length - offset,
      offset,
    );
    if (result.bytesRead === 0) throw new OperatorReviewedFileError();
    offset += result.bytesRead;
  }
  return bytes;
}

/**
 * Reads a small operator-reviewed UTF-8 artifact from one stable inode.
 * The second byte-for-byte read closes the gap left by metadata checks alone.
 */
export async function readOperatorReviewedFile(path: string): Promise<string> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    const before = await lstat(path, { bigint: true });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.size < BigInt(1) ||
      before.size > MAX_REVIEWED_FILE_BYTES
    ) {
      throw new OperatorReviewedFileError();
    }

    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile() ||
      !operatorReviewedFileSnapshotMatches(before, opened)
    ) {
      throw new OperatorReviewedFileError();
    }

    const bytes = await readExact(handle, Number(opened.size));
    const middle = await handle.stat({ bigint: true });
    if (!operatorReviewedFileSnapshotMatches(opened, middle)) {
      throw new OperatorReviewedFileError();
    }
    const verification = await readExact(handle, Number(opened.size));
    const after = await handle.stat({ bigint: true });
    if (
      !operatorReviewedFileSnapshotMatches(middle, after) ||
      Buffer.compare(bytes, verification) !== 0
    ) {
      throw new OperatorReviewedFileError();
    }

    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new OperatorReviewedFileError();
  } finally {
    try {
      await handle?.close();
    } catch {
      // Closing is best effort after a read failure; no artifact is returned.
    }
  }
}
